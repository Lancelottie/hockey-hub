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
import { acknowledgePlayerLoan, listPlayerLoans, recordPlayerLoan } from "../lib/player-loans";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-player-loans-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

const loanInput = {
  playerId: "p1",
  playerName: "Jo Ellis",
  fromTeamId: "ladies2",
  fromTeamName: "Ladies 2s",
  toTeamId: "ladies1",
  toTeamName: "Ladies 1s",
  matchId: "m1",
  opponent: "Oxton",
};

test("player loans: recorded by the borrowing team's manager, visible to both sides and admins, acknowledged once", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  db.prepare(
    "INSERT INTO teams VALUES('club','ladies1','Ladies 1s'),('club','ladies2','Ladies 2s'),('club','ladies3','Ladies 3s')",
  ).run();
  for (const role of ["club_admin", "manager1", "manager2", "manager3"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role === "club_admin" ? "club_admin" : "manager");
  }
  // Scope each manager to their own team so cross-team visibility is meaningfully tested.
  db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(users.manager1, "club", "manager", '["ladies1"]');
  db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(users.manager2, "club", "manager", '["ladies2"]');
  db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(users.manager3, "club", "manager", '["ladies3"]');

  await t.test("only the borrowing team's manager (or an admin) may record a loan", async () => {
    await assert.rejects(recordPlayerLoan(users.manager2, "club", loanInput), AccessError);
    await assert.rejects(recordPlayerLoan(users.manager3, "club", loanInput), AccessError);
    await recordPlayerLoan(users.manager1, "club", loanInput);
  });

  await t.test("visible to both teams' managers and admins, not to an unrelated team's manager", async () => {
    const [forAdmin] = await listPlayerLoans(users.club_admin, "club");
    assert.equal(forAdmin.playerName, "Jo Ellis");
    assert.equal(forAdmin.fromTeamName, "Ladies 2s");
    assert.equal(forAdmin.toTeamName, "Ladies 1s");
    assert.equal((await listPlayerLoans(users.manager1, "club")).length, 1);
    assert.equal((await listPlayerLoans(users.manager2, "club")).length, 1);
    assert.equal((await listPlayerLoans(users.manager3, "club")).length, 0);
  });

  await t.test("acknowledging removes it from the pending list; only a visible caller may acknowledge", async () => {
    const [loan] = await listPlayerLoans(users.club_admin, "club");
    await assert.rejects(acknowledgePlayerLoan(users.manager3, "club", loan.id), AccessError);
    await assert.rejects(acknowledgePlayerLoan(users.club_admin, "club", "missing-id"), AccessError);
    await acknowledgePlayerLoan(users.manager2, "club", loan.id);
    assert.deepEqual(await listPlayerLoans(users.club_admin, "club"), []);
  });
});
