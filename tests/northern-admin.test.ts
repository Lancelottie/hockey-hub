import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import {
  AccessError,
  listClubs,
  readClub,
  requireNorthernAdmin,
  requireTeamManageAccess,
  writeClub,
} from "../lib/repository";
import { listTeamSubmissions, setTeamSubmissionStatus } from "../lib/submissions";
import { addPlayerToTeam, listPlayerTeamMemberships, removePlayerFromTeam } from "../lib/player-teams";
import { addMemberRole, listMembers, removeMemberRole } from "../lib/members";
import { canAdmin, canManage, isNorthernHockeyAdmin } from "../lib/users";
import { emptySnapshot } from "../lib/validation";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-northern-admin-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("Northern Hockey Admin: scope, England Hockey gating, submissions and cross-team pooling", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  for (const role of ["club_admin", "manager", "coach", "northern_hockey_admin"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role);
  }
  db.prepare(
    "INSERT INTO teams VALUES('club','one','Ladies 1s'),('club','two','Ladies 2s'),('club','three','Ladies 3s')",
  ).run();
  // Scope managers to their own team so cross-team behaviour is meaningfully tested.
  db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(users.manager, "club", "manager", '["one"]');
  db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(users.coach, "club", "coach", '["two"]');
  const snapshot = emptySnapshot();
  snapshot.teams = [{ id: "one", name: "Ladies 1s" }, { id: "two", name: "Ladies 2s" }, { id: "three", name: "Ladies 3s" }];
  snapshot.players = [{ id: "p1", teamId: "one", name: "Player One", number: 1, position: "Forward" }];
  await writeClub(users.club_admin, "club", 0, snapshot);

  await t.test("role scope: not canManage/canAdmin, but sees every team", async () => {
    assert.equal(canManage("northern_hockey_admin"), false);
    assert.equal(canAdmin("northern_hockey_admin"), false);
    assert.equal(isNorthernHockeyAdmin("northern_hockey_admin"), true);
    const club = (await listClubs(users.northern_hockey_admin)).find((c) => c.id === "club")!;
    assert.equal(club.teamIds, null);
    const workspace = await readClub(users.northern_hockey_admin, "club");
    assert.deepEqual(workspace.data.teams.map((t) => t.id).sort(), ["one", "three", "two"]);
  });

  await t.test("requireNorthernAdmin rejects every other role", async () => {
    await requireNorthernAdmin(users.northern_hockey_admin, "club");
    for (const role of ["club_admin", "manager", "coach"])
      await assert.rejects(requireNorthernAdmin(users[role], "club"), AccessError);
  });

  await t.test("requireTeamManageAccess: a team's own manager, or Northern Hockey Admin for any team", async () => {
    await requireTeamManageAccess(users.manager, "club", "one");
    await assert.rejects(requireTeamManageAccess(users.manager, "club", "two"), AccessError);
    await requireTeamManageAccess(users.northern_hockey_admin, "club", "one");
    await requireTeamManageAccess(users.northern_hockey_admin, "club", "three");
  });

  await t.test("submissions: only Northern Hockey Admin views the cross-team dashboard", async () => {
    await assert.rejects(listTeamSubmissions(users.club_admin, "club"), AccessError);
    const initial = await listTeamSubmissions(users.northern_hockey_admin, "club");
    assert.deepEqual(initial.map((s) => s.status), ["not_started", "not_started", "not_started"]);
    // A team's own manager can update their own team's status...
    await setTeamSubmissionStatus(users.manager, "club", "one", "in_progress");
    // ...but not another team's.
    await assert.rejects(setTeamSubmissionStatus(users.manager, "club", "two", "in_progress"), AccessError);
    // Northern Hockey Admin can update any team.
    await setTeamSubmissionStatus(users.northern_hockey_admin, "club", "three", "submitted");
    const after = await listTeamSubmissions(users.northern_hockey_admin, "club");
    const byId = Object.fromEntries(after.map((s) => [s.teamId, s]));
    assert.equal(byId.one.status, "in_progress");
    assert.equal(byId.one.submittedByName, "manager");
    assert.equal(byId.three.status, "submitted");
    assert.equal(byId.two.status, "not_started");
  });

  await t.test("cross-team player pooling: adds an additional team without changing the home team", async () => {
    // p1's home team is "one". A manager scoped to a different team ("three") cannot pool them in.
    await assert.rejects(addPlayerToTeam(users.manager, "club", "p1", "three"), AccessError);
    // The destination team's own manager/coach can pool a player from elsewhere into their team.
    await addPlayerToTeam(users.coach, "club", "p1", "two");
    // Northern Hockey Admin can pool across any team pairing.
    await addPlayerToTeam(users.northern_hockey_admin, "club", "p1", "three");
    // Adding the player's existing home team as an "additional" team is a no-op, not a duplicate.
    await assert.rejects(addPlayerToTeam(users.coach, "club", "p1", "one"), AccessError);
    const memberships = await listPlayerTeamMemberships(users.club_admin, "club");
    assert.deepEqual(
      memberships.filter((m) => m.playerId === "p1").map((m) => m.teamId).sort(),
      ["three", "two"],
    );
    // The home team (players.team_id) is unchanged by pooling.
    const workspace = await readClub(users.club_admin, "club");
    assert.equal(workspace.data.players.find((p) => p.id === "p1")?.teamId, "one");
    // A team's own manager can remove a pooled player from their team.
    await removePlayerFromTeam(users.coach, "club", "p1", "two");
    const afterRemoval = await listPlayerTeamMemberships(users.club_admin, "club");
    assert.deepEqual(afterRemoval.filter((m) => m.playerId === "p1").map((m) => m.teamId), ["three"]);
  });

  await t.test("admin role management: add/remove, self-add allowed, self-remove blocked, last role removable", async () => {
    await assert.rejects(addMemberRole(users.manager, "club", users.coach, "read_only"), AccessError);
    await assert.rejects(removeMemberRole(users.manager, "club", users.coach, "coach"), AccessError);
    // Self-add cannot escalate beyond existing admin access, so it's allowed...
    await addMemberRole(users.club_admin, "club", users.club_admin, "ladies_1s_captain");
    const self = (await listMembers(users.club_admin, "club")).find((m) => m.userId === users.club_admin)!;
    assert.deepEqual(self.roles.sort(), ["club_admin", "ladies_1s_captain"]);
    // ...but self-remove is always blocked, even for a role that isn't your only one.
    await assert.rejects(removeMemberRole(users.club_admin, "club", users.club_admin, "ladies_1s_captain"), AccessError);
    // Granting someone else a second role, then removing their original one, works and cascades its scope.
    await addMemberRole(users.club_admin, "club", users.coach, "northern_hockey_admin");
    const withSecondRole = (await listMembers(users.club_admin, "club")).find((m) => m.userId === users.coach)!;
    assert.deepEqual(withSecondRole.roles.sort(), ["coach", "northern_hockey_admin"]);
    await removeMemberRole(users.club_admin, "club", users.coach, "coach");
    const afterRemoval = (await listMembers(users.club_admin, "club")).find((m) => m.userId === users.coach)!;
    assert.deepEqual(afterRemoval.roles, ["northern_hockey_admin"]);
    // The removed role's membership_team_access scope is gone too (ON DELETE CASCADE), not left stale.
    assert.equal(
      db.prepare("SELECT 1 FROM membership_team_access WHERE user_id=? AND club_id='club' AND role='coach'").get(users.coach),
      undefined,
    );
    // Removing a member's last role is allowed: it revokes their access to this club,
    // same as never having been granted it, rather than being blocked outright.
    await removeMemberRole(users.club_admin, "club", users.coach, "northern_hockey_admin");
    assert.equal((await listMembers(users.club_admin, "club")).find((m) => m.userId === users.coach), undefined);
    assert.equal((await listClubs(users.coach)).find((c) => c.id === "club"), undefined);
  });
});
