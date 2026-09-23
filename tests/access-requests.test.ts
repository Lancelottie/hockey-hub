import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import { AccessError } from "../lib/repository";
import {
  listAccessRequests,
  resolveAccessRequest,
  submitAccessRequest,
} from "../lib/access-requests";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-access-requests-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("access requests: public submission, admin-only review, resolution", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  for (const role of ["club_admin", "player"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role);
  }

  await t.test("rejects an unknown club, empty section list, and empty level list", async () => {
    await assert.rejects(
      submitAccessRequest("missing-club", "Jo Ellis", "jo@example.test", ["ladies"], ["coach"]),
      AccessError,
    );
    await assert.rejects(
      submitAccessRequest("club", "Jo Ellis", "jo@example.test", [], ["coach"]),
      AccessError,
    );
    await assert.rejects(
      submitAccessRequest("club", "Jo Ellis", "jo@example.test", ["ladies"], []),
      AccessError,
    );
  });

  await t.test("a public submission is queued and only visible to a club admin", async () => {
    await submitAccessRequest("club", "Jo Ellis", "jo@example.test", ["ladies", "mens"], ["vice_captain", "coach"]);
    await assert.rejects(listAccessRequests(users.player, "club"), AccessError);
    const requests = await listAccessRequests(users.club_admin, "club");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].name, "Jo Ellis");
    assert.deepEqual(requests[0].sections, ["ladies", "mens"]);
    assert.deepEqual(requests[0].requestedLevels, ["vice_captain", "coach"]);
  });

  await t.test("resolving a request removes it from the pending list; only an admin may resolve", async () => {
    const [request] = await listAccessRequests(users.club_admin, "club");
    await assert.rejects(resolveAccessRequest(users.player, "club", request.id), AccessError);
    await assert.rejects(resolveAccessRequest(users.club_admin, "club", "missing-id"), AccessError);
    await resolveAccessRequest(users.club_admin, "club", request.id);
    assert.deepEqual(await listAccessRequests(users.club_admin, "club"), []);
  });
});
