import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrateMembershipRoles } from "../lib/db";
import { ROLES, canAdmin, canManage, roleTeamName } from "../lib/users";

test("expanding existing SQLite roles preserves memberships, scopes and foreign keys", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE clubs (id TEXT PRIMARY KEY);
      CREATE TABLE club_memberships (
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('administrator','club_admin','manager','coach','player','read_only')),
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
      INSERT INTO membership_team_access VALUES('existing','club','["second"]');
    `);
    migrateMembershipRoles(db);
    migrateMembershipRoles(db);
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    assert.deepEqual(db.prepare("SELECT * FROM club_memberships").all(), [{ user_id: "existing", club_id: "club", role: "manager" }]);
    assert.equal((db.prepare("SELECT team_ids FROM membership_team_access").get() as { team_ids: string }).team_ids, '["second"]');
    for (const role of ROLES.filter(role => roleTeamName(role))) {
      assert.equal(canManage(role), true);
      assert.equal(canAdmin(role), false);
      db.prepare("UPDATE club_memberships SET role=?").run(role);
    }
    assert.throws(() => db.prepare("UPDATE club_memberships SET role='unknown'").run());
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    db.exec("DELETE FROM user WHERE id='existing'");
    assert.equal(db.prepare("SELECT * FROM membership_team_access").all().length, 0);
  } finally { db.close(); }
});
