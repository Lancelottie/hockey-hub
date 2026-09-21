import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp, migrateMultiRole } from "../lib/db";
import { AccessError, listClubs, readClub, writeClub } from "../lib/repository";
import { switchActiveRole } from "../lib/active-role";
import { listMembers } from "../lib/members";
import { ROLES, ROLE_PRIORITY, defaultActiveRole } from "../lib/users";
import { emptySnapshot } from "../lib/validation";

test("ROLE_PRIORITY contains every Role exactly once", () => {
  assert.deepEqual([...ROLE_PRIORITY].sort(), [...ROLES].sort());
  assert.equal(new Set(ROLE_PRIORITY).size, ROLES.length);
});

test("defaultActiveRole picks the highest-priority held role, and is a no-op for a single role", () => {
  assert.equal(defaultActiveRole(["read_only"]), "read_only");
  assert.equal(defaultActiveRole(["ladies_3s_captain", "club_admin"]), "club_admin");
  assert.equal(defaultActiveRole(["manager", "northern_hockey_admin"]), "northern_hockey_admin");
  for (const role of ROLES) assert.equal(defaultActiveRole([role]), role);
});

test("migrateMultiRole widens the PK, is idempotent, and preserves existing scopes with zero data loss", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE clubs (id TEXT PRIMARY KEY);
      CREATE TABLE club_memberships (
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        PRIMARY KEY(user_id,club_id)
      );
      CREATE TABLE membership_team_access (
        user_id TEXT NOT NULL, club_id TEXT NOT NULL, team_ids TEXT NOT NULL,
        PRIMARY KEY(user_id,club_id),
        FOREIGN KEY(user_id,club_id) REFERENCES club_memberships(user_id,club_id) ON DELETE CASCADE
      );
      INSERT INTO user VALUES('existing');
      INSERT INTO clubs VALUES('club');
      INSERT INTO club_memberships VALUES('existing','club','manager');
      INSERT INTO membership_team_access VALUES('existing','club','["team-a"]');
    `);
    migrateMultiRole(db);
    migrateMultiRole(db); // idempotent
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    assert.deepEqual(db.prepare("SELECT * FROM club_memberships").all(), [{ user_id: "existing", club_id: "club", role: "manager" }]);
    assert.deepEqual(
      db.prepare("SELECT * FROM membership_team_access").all(),
      [{ user_id: "existing", club_id: "club", role: "manager", team_ids: '["team-a"]' }],
    );
    // Can now hold a second role for the same club — impossible under the old PK.
    db.prepare("INSERT INTO club_memberships(user_id,club_id,role) VALUES(?,?,?)").run("existing", "club", "club_admin");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM club_memberships WHERE user_id='existing'").get() as { n: number }).n, 2);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    db.exec("DELETE FROM user WHERE id='existing'");
    assert.equal(db.prepare("SELECT * FROM club_memberships").all().length, 0);
    assert.equal(db.prepare("SELECT * FROM membership_team_access").all().length, 0);
  } finally { db.close(); }
});

const dir = mkdtempSync(join(tmpdir(), "cocaptain-multi-role-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("a member with two roles is genuinely restricted to whichever is active, and can switch safely", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const user = (await auth.api.signUpEmail({ body: { email: "dual@example.test", name: "Dual Role", password } })).user;
  db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  db.prepare(
    "INSERT INTO teams VALUES('club','one','Ladies 1s'),('club','two','Ladies 2s'),('club','three','Ladies 3s')",
  ).run();
  db.prepare("INSERT INTO club_memberships(user_id,club_id,role) VALUES(?,?,?)").run(user.id, "club", "club_admin");
  db.prepare("INSERT INTO club_memberships(user_id,club_id,role) VALUES(?,?,?)").run(user.id, "club", "ladies_3s_captain");
  const snapshot = emptySnapshot();
  snapshot.teams = [{ id: "one", name: "Ladies 1s" }, { id: "two", name: "Ladies 2s" }, { id: "three", name: "Ladies 3s" }];
  snapshot.players = [
    { id: "p1", teamId: "one", name: "P1", number: 1, position: "Forward" },
    { id: "p3", teamId: "three", name: "P3", number: 3, position: "Forward" },
  ];
  await writeClub(user.id, "club", 0, snapshot);

  await t.test("defaults to the highest-priority held role (club_admin): full access", async () => {
    const club = (await listClubs(user.id)).find((c) => c.id === "club")!;
    assert.equal(club.role, "club_admin");
    assert.deepEqual(club.availableRoles.sort(), ["club_admin", "ladies_3s_captain"]);
    assert.equal(club.teamIds, null);
    const workspace = await readClub(user.id, "club");
    assert.deepEqual(workspace.data.teams.map((t) => t.id).sort(), ["one", "three", "two"]);
  });

  await t.test("switching to ladies_3s_captain genuinely restricts access, even though club_admin is still held", async () => {
    await switchActiveRole(user.id, "club", "ladies_3s_captain");
    const club = (await listClubs(user.id)).find((c) => c.id === "club")!;
    assert.equal(club.role, "ladies_3s_captain");
    assert.deepEqual(club.teamIds, ["three"]);
    const workspace = await readClub(user.id, "club");
    assert.deepEqual(workspace.data.teams.map((t) => t.id), ["three"]);
    assert.deepEqual(workspace.data.players.map((p) => p.id), ["p3"]);
    assert.equal(JSON.stringify(workspace).includes("p1"), false);
    // Reaching for another team's records is rejected server-side, not just hidden client-side.
    const attempt = structuredClone(workspace.data);
    attempt.teams.push({ id: "one", name: "Ladies 1s" });
    await assert.rejects(writeClub(user.id, "club", workspace.revision, attempt), AccessError);
    // Admin-only actions are rejected while acting as captain, even for an account that also holds club_admin.
    await assert.rejects(listMembers(user.id, "club"), AccessError);
  });

  await t.test("switching back restores full access from the same account", async () => {
    await switchActiveRole(user.id, "club", "club_admin");
    const club = (await listClubs(user.id)).find((c) => c.id === "club")!;
    assert.equal(club.role, "club_admin");
    assert.equal(club.teamIds, null);
    const members = await listMembers(user.id, "club");
    assert.ok(members.find((m) => m.userId === user.id));
  });

  await t.test("switching to a role you don't hold is rejected", async () => {
    await assert.rejects(switchActiveRole(user.id, "club", "northern_hockey_admin"), AccessError);
  });
});
