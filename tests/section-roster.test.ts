import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import { AccessError, readClub, writeClub } from "../lib/repository";
import { emptySnapshot } from "../lib/validation";
import { listSectionRoster } from "../lib/section-roster";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-section-roster-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("section roster: visible to a team-scoped role, even though their own snapshot hides sibling teams", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  for (const role of ["club_admin", "ladies_3s_captain"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role);
  }

  const snapshot = emptySnapshot();
  snapshot.teams = [
    { id: "ladies1", name: "Ladies 1s" },
    { id: "ladies2", name: "Ladies 2s" },
    { id: "ladies3", name: "Ladies 3s" },
    { id: "mens1", name: "Mens 1s" },
  ];
  snapshot.players = [
    { id: "p1", teamId: "ladies1", name: "Alex Ladies1", number: 1, position: "Forward" },
    { id: "p2", teamId: "ladies2", name: "Sam Ladies2", number: 2, position: "Forward" },
    { id: "p3", teamId: "ladies3", name: "Jo Ladies3", number: 3, position: "Forward" },
    { id: "p4", teamId: "mens1", name: "Chris Mens1", number: 4, position: "Forward" },
  ];
  await writeClub(users.club_admin, "club", 0, snapshot);

  await t.test("a captain scoped to Ladies 3s only sees Ladies section teams/players, not Mens", async () => {
    const roster = await listSectionRoster(users.ladies_3s_captain, "club", "ladies3");
    assert.deepEqual(roster.teams.map((t) => t.id).sort(), ["ladies1", "ladies2", "ladies3"]);
    assert.deepEqual(roster.players.map((p) => p.id).sort(), ["p1", "p2", "p3"]);
  });

  await t.test("club admin sees the same section roster for the same team", async () => {
    const roster = await listSectionRoster(users.club_admin, "club", "ladies3");
    assert.deepEqual(roster.teams.map((t) => t.id).sort(), ["ladies1", "ladies2", "ladies3"]);
  });

  await t.test("rejects a team the caller has no access to", async () => {
    await assert.rejects(listSectionRoster(users.ladies_3s_captain, "club", "mens1"), AccessError);
  });

  await t.test("a team-scoped captain can save a lineup/review for a player loaned in from a sibling team", async () => {
    const before = await readClub(users.ladies_3s_captain, "club");
    const own = before.data;
    own.matches = [{ id: "fixture", teamId: "ladies3", opponent: "Rivals", date: "", isHome: true }];
    // Mirror exactly what the browser sends: only the captain's own team/players, plus a
    // lineup/review referencing a player loaned in from a sibling section team (p2, Ladies 2s) —
    // never that player's team stub or record, which their restricted workspace never held.
    own.lineups.fixture = {
      placements: [{ playerId: "p3", x: 50, y: 50 }, { playerId: "p2", x: 40, y: 50 }],
      subs: [null, null, null, null],
    };
    own.reviews.fixture = {
      ourScore: "2", oppositionScore: "1", goalscorers: "", assists: "", summary: "",
      womanOfTheMatchPlayerId: "p2", playerFeedback: { p2: "Great composure up front." },
    };
    await writeClub(users.ladies_3s_captain, "club", before.revision, own);

    const after = await readClub(users.club_admin, "club");
    assert.deepEqual(
      after.data.lineups.fixture.placements.map((p) => p.playerId).sort(),
      ["p2", "p3"],
    );
    assert.equal(after.data.reviews.fixture.playerFeedback.p2, "Great composure up front.");
  });
});
