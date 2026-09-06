import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth, getAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import { getActiveSession } from "../lib/session";
import { readClub, writeClub, AccessError } from "../lib/repository";
import { emptySnapshot, snapshotSchema } from "../lib/validation";
import { readLegacy } from "../lib/legacy-import";
import { GET, PUT } from "../app/api/workspace/route";
const dir = mkdtempSync(join(tmpdir(), "hockey-security-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});
test("authentication, tenant boundaries, validation, concurrency and legacy migration", async (t) => {
  const provisioning = createAuth(true);
  await (await getMigrations(provisioning.options)).runMigrations();
  migrateApp();
  const password = randomBytes(24).toString("base64url");
  const alice = await provisioning.api.signUpEmail({
    body: { email: "alice@example.test", name: "Alice", password },
  });
  const bob = await provisioning.api.signUpEmail({
    body: { email: "bob@example.test", name: "Bob", password },
  });
  const reader = await provisioning.api.signUpEmail({
    body: { email: "reader@example.test", name: "Reader", password },
  });
  const db = getDb();
  for (const user of [alice.user, bob.user, reader.user])
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
  db.prepare(
    "INSERT INTO clubs(id,name) VALUES('a','Club A'),('b','Club B')",
  ).run();
  db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(
    alice.user.id,
    "a",
    "club_admin",
  );
  db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(
    bob.user.id,
    "b",
    "club_admin",
  );
  db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(
    reader.user.id,
    "a",
    "read_only",
  );
  const data = emptySnapshot();
  data.teams = [{ id: "team-a", name: "First XI" }];
  data.players = [
    {
      id: "player-a",
      teamId: "team-a",
      name: "Alex",
      position: "Forward",
      number: 7,
    },
  ];
  data.matches = [
    {
      id: "fixture-a",
      teamId: "team-a",
      opponent: "Visitors",
      date: "2026-10-10T12:00",
      isHome: true,
    },
  ];
  data.lineups = {
    "fixture-a": {
      placements: [{ playerId: "player-a", x: 50, y: 50 }],
      subs: [null, null, null, null],
    },
  };
  await t.test("public signup is disabled", async () => {
    await assert.rejects(
      getAuth().api.signUpEmail({
        body: { email: "outsider@example.test", name: "Outsider", password },
      }),
    );
  });
  await t.test("unauthenticated API cannot read or write", async () => {
    assert.equal(
      (await GET(new Request("http://localhost:3000/api/workspace"))).status,
      401,
    );
    assert.equal(
      (
        await PUT(
          new Request("http://localhost:3000/api/workspace", {
            method: "PUT",
            headers: { origin: "http://localhost:3000" },
          }),
        )
      ).status,
      401,
    );
  });
  await t.test("membership is mandatory, even with a known club ID", () => {
    assert.throws(() => readClub(bob.user.id, "a"), AccessError);
    assert.throws(() => writeClub(bob.user.id, "a", 0, data), AccessError);
  });
  await t.test("read-only member cannot mutate", () => {
    assert.throws(() => writeClub(reader.user.id, "a", 0, data), AccessError);
  });
  await t.test(
    "transaction round-trips selection; stale writer gets conflict",
    () => {
      assert.equal(writeClub(alice.user.id, "a", 0, data), 1);
      assert.deepEqual(readClub(alice.user.id, "a").data, data);
      assert.throws(
        () => writeClub(alice.user.id, "a", 0, data),
        (error: unknown) =>
          error instanceof AccessError && error.status === 409,
      );
    },
  );
  await t.test(
    "duplicate, cross-team and orphan references are rejected",
    () => {
      const duplicate = structuredClone(data);
      duplicate.players.push(duplicate.players[0]);
      assert.equal(snapshotSchema.safeParse(duplicate).success, false);
      const cross = structuredClone(data);
      cross.teams.push({ id: "other", name: "Second XI" });
      cross.players[0].teamId = "other";
      assert.equal(snapshotSchema.safeParse(cross).success, false);
      const orphan = structuredClone(data);
      orphan.players[0].teamId = "missing";
      assert.equal(snapshotSchema.safeParse(orphan).success, false);
      const twice = structuredClone(data);
      twice.lineups["fixture-a"].subs[0] = "player-a";
      assert.equal(snapshotSchema.safeParse(twice).success, false);
      const malicious = structuredClone(data);
      malicious.players[0].id = "'; DROP TABLE user; --";
      assert.equal(snapshotSchema.safeParse(malicious).success, false);
    },
  );
  await t.test(
    "management roles cannot grant themselves team administration",
    () => {
      db.prepare(
        "UPDATE club_memberships SET role='manager' WHERE user_id=?",
      ).run(alice.user.id);
      const changed = structuredClone(data);
      changed.teams.push({ id: "new-team", name: "New team" });
      assert.throws(
        () => writeClub(alice.user.id, "a", 1, changed),
        (error: unknown) =>
          error instanceof AccessError && error.status === 403,
      );
      db.prepare(
        "UPDATE club_memberships SET role='club_admin' WHERE user_id=?",
      ).run(alice.user.id);
    },
  );
  await t.test(
    "read-only responses exclude private feedback and assessments",
    () => {
      const privateData = structuredClone(data);
      privateData.reviews["fixture-a"] = {
        ourScore: "1",
        oppositionScore: "0",
        goalscorers: "Alex",
        assists: "",
        summary: "Private coach notes",
        womanOfTheMatchPlayerId: "player-a",
        playerFeedback: { "player-a": "Private feedback" },
      };
      privateData.assessments["player-a"] = {
        attending: true,
        fitness: 3,
        passingBall: 3,
        receivingBall: 3,
        defending: 3,
        attackingPlay: 3,
        transition: 3,
        attitudeCommitment: 3,
        teamworkCommunication: 3,
        lastSeasonTeam: "1s",
      };
      assert.equal(writeClub(alice.user.id, "a", 1, privateData), 2);
      const visible = readClub(reader.user.id, "a").data;
      assert.deepEqual(visible.reviews, {});
      assert.deepEqual(visible.assessments, {});
      assert.equal(visible.players.length, 1);
      assert.equal(Object.keys(visible.lineups).length, 1);
    },
  );
  let cookie = "";
  await t.test(
    "library sign-in issues HttpOnly SameSite session and wrong password fails",
    async () => {
      await assert.rejects(
        getAuth().api.signInEmail({
          body: { email: alice.user.email, password: "invalid-password" },
        }),
      );
      const response = await getAuth().api.signInEmail({
        body: { email: alice.user.email, password },
        asResponse: true,
      });
      assert.equal(response.status, 200);
      const setCookie = response.headers.get("set-cookie")!;
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      cookie = setCookie.split(";")[0];
      assert.equal(
        (await getActiveSession(new Headers({ cookie })))?.user.id,
        alice.user.id,
      );
      assert.ok(
        (
          db
            .prepare("SELECT last_login FROM app_accounts WHERE user_id=?")
            .get(alice.user.id) as { last_login: string }
        ).last_login,
      );
    },
  );
  await t.test(
    "HTTP rejects IDOR, CSRF, invalid bodies and oversized writes",
    async () => {
      assert.equal(
        (
          await GET(
            new Request("http://localhost:3000/api/workspace?clubId=b", {
              headers: { cookie },
            }),
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await PUT(
            new Request("http://localhost:3000/api/workspace", {
              method: "PUT",
              headers: { cookie, origin: "https://evil.example" },
            }),
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await PUT(
            new Request("http://localhost:3000/api/workspace", {
              method: "PUT",
              headers: {
                cookie,
                origin: "http://localhost:3000",
                "content-type": "application/json",
              },
              body: '{"broken":true}',
            }),
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await PUT(
            new Request("http://localhost:3000/api/workspace", {
              method: "PUT",
              headers: {
                cookie,
                origin: "http://localhost:3000",
                "content-type": "application/json",
              },
              body: "x".repeat(2_000_001),
            }),
          )
        ).status,
        413,
      );
    },
  );
  await t.test(
    "account suspension invalidates access without waiting for expiry",
    async () => {
      db.prepare(
        "UPDATE app_accounts SET status='suspended' WHERE user_id=?",
      ).run(alice.user.id);
      assert.equal(await getActiveSession(new Headers({ cookie })), null);
      assert.throws(() => readClub(alice.user.id, "a"), AccessError);
      db.prepare("UPDATE app_accounts SET status='active' WHERE user_id=?").run(
        alice.user.id,
      );
    },
  );
  await t.test("logout revokes a replayed session cookie", async () => {
    await getAuth().api.signOut({ headers: new Headers({ cookie }) });
    assert.equal(await getActiveSession(new Headers({ cookie })), null);
  });
  await t.test(
    "legacy import keeps original IDs and does not mutate source",
    () => {
      const values: Record<string, string> = {
        hh_teams: JSON.stringify(data.teams),
        hh_players: JSON.stringify(data.players),
        hh_matches: JSON.stringify(data.matches),
        hh_lineup_fixture_a: "",
      };
      values["hh_lineup_fixture-a"] = JSON.stringify(data.lineups["fixture-a"]);
      const before = JSON.stringify(values);
      assert.deepEqual(
        readLegacy({ getItem: (key) => values[key] ?? null }),
        data,
      );
      assert.equal(JSON.stringify(values), before);
    },
  );
});
