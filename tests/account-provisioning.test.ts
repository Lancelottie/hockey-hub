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
import { listMembers } from "../lib/members";
import { submitAccessRequest, listAccessRequests } from "../lib/access-requests";
import { createMemberAccount } from "../lib/account-provisioning";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-account-provisioning-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("account provisioning: admin-only, grants the chosen roles, resolves the triggering request", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  for (const role of ["club_admin", "coach"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role);
  }

  await t.test("only a club admin may create an account", async () => {
    await assert.rejects(
      createMemberAccount(users.coach, "club", { name: "Jo Ellis", email: "jo@example.test", roles: ["player"] }),
      AccessError,
    );
  });

  await t.test("requires at least one valid role", async () => {
    await assert.rejects(
      createMemberAccount(users.club_admin, "club", { name: "Jo Ellis", email: "jo@example.test", roles: [] }),
      AccessError,
    );
  });

  await t.test("creates the account, grants the chosen roles, and resolves the linked request", async () => {
    await submitAccessRequest("club", "Jo Ellis", "jo@example.test", ["ladies"], ["coach"]);
    const [request] = await listAccessRequests(users.club_admin, "club");
    const result = await createMemberAccount(users.club_admin, "club", {
      name: "Jo Ellis",
      email: "jo@example.test",
      roles: ["coach", "read_only"],
      accessRequestId: request.id,
    });
    assert.ok(result.userId);
    assert.ok(result.password.length >= 12);
    const members = await listMembers(users.club_admin, "club");
    const created = members.find((m) => m.userId === result.userId);
    assert.deepEqual(created?.roles.sort(), ["coach", "read_only"]);
    assert.deepEqual(await listAccessRequests(users.club_admin, "club"), []);
  });

  await t.test("rejects an email that's already registered", async () => {
    await assert.rejects(
      createMemberAccount(users.club_admin, "club", { name: "Jo Again", email: "jo@example.test", roles: ["player"] }),
      AccessError,
    );
  });
});
