import { randomBytes } from "node:crypto";
import { createAuth } from "./auth";
import { getStore } from "./database";
import { AccessError, listClubs } from "./repository";
import { resolveAccessRequest } from "./access-requests";
import { canAdmin, ROLES, type Role } from "./users";

async function requireAdmin(userId: string, clubId: string) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club || !canAdmin(club.role))
    throw new AccessError(403, "Only club administrators can create accounts.");
  return club;
}

/**
 * Bypasses the public sign-up restriction deliberately: getAuth()'s shared instance always has
 * disableSignUp on (see lib/auth.ts), so admin-initiated provisioning uses its own instance, the
 * same way scripts/add-user.mts and the e2e seed script do. Only reachable after requireAdmin.
 */
export async function createMemberAccount(
  userId: string,
  clubId: string,
  input: { name: string; email: string; roles: Role[]; accessRequestId?: string },
) {
  await requireAdmin(userId, clubId);
  if (!input.roles.length) throw new AccessError(400, "Choose at least one role.");
  if (input.roles.some((r) => !ROLES.includes(r))) throw new AccessError(400, "Choose a valid role.");
  const password = randomBytes(18).toString("base64url");
  let created;
  try {
    created = await createAuth(true).api.signUpEmail({ body: { email: input.email, name: input.name, password } });
  } catch {
    throw new AccessError(409, "An account with this email may already exist.");
  }
  const db = getStore();
  await db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(created.user.id);
  for (const role of input.roles)
    await db
      .prepare("INSERT INTO club_memberships(user_id,club_id,role) VALUES(?,?,?) ON CONFLICT(user_id,club_id,role) DO NOTHING")
      .run(created.user.id, clubId, role);
  await db
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `account-created:${created.user.id}:${input.roles.join("+")}`);
  if (input.accessRequestId)
    await resolveAccessRequest(userId, clubId, input.accessRequestId).catch(() => {});
  return { userId: created.user.id, password };
}
