import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import { AccessError, writeClub } from "../lib/repository";
import { emptySnapshot } from "../lib/validation";
import { deleteTeamNotice, listTeamNotices, postTeamNotice } from "../lib/team-notices";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-team-notices-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("team notices: viewable by anyone with team access, postable/removable only by managers", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  for (const role of ["club_admin", "read_only"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role);
  }
  const snapshot = emptySnapshot();
  snapshot.teams = [{ id: "team", name: "Ladies 1s" }];
  await writeClub(users.club_admin, "club", 0, snapshot);

  await t.test("a read-only member can't post, but can see what's posted", async () => {
    await assert.rejects(postTeamNotice(users.read_only, "club", "team", "Read Only", "Hello"), AccessError);
    assert.deepEqual(await listTeamNotices(users.read_only, "club", "team"), []);
  });

  await t.test("rejects an empty or whitespace-only post", async () => {
    await assert.rejects(postTeamNotice(users.club_admin, "club", "team", "Admin", "   "), AccessError);
  });

  await t.test("a manager can post, and it's visible to everyone with team access", async () => {
    await postTeamNotice(users.club_admin, "club", "team", "Admin", "Training moved to Tuesday");
    const forAdmin = await listTeamNotices(users.club_admin, "club", "team");
    assert.equal(forAdmin.length, 1);
    assert.equal(forAdmin[0].body, "Training moved to Tuesday");
    assert.equal(forAdmin[0].authorName, "Admin");
    const forReadOnly = await listTeamNotices(users.read_only, "club", "team");
    assert.equal(forReadOnly.length, 1);
  });

  await t.test("a read-only member can't remove a notice; a manager can", async () => {
    const [notice] = await listTeamNotices(users.club_admin, "club", "team");
    await assert.rejects(deleteTeamNotice(users.read_only, "club", "team", notice.id), AccessError);
    await assert.rejects(deleteTeamNotice(users.club_admin, "club", "team", "missing-id"), AccessError);
    await deleteTeamNotice(users.club_admin, "club", "team", notice.id);
    assert.deepEqual(await listTeamNotices(users.club_admin, "club", "team"), []);
  });
});
