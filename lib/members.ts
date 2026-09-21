import { getStore } from "./database";
import { AccessError, listClubs } from "./repository";
import { canAdmin, ROLES, type Role } from "./users";

export type ClubMember = { userId: string; name: string; email: string; roles: Role[] };

async function requireAdmin(userId: string, clubId: string) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club || !canAdmin(club.role))
    throw new AccessError(403, "Only club administrators can manage members.");
  return club;
}

export async function listMembers(userId: string, clubId: string): Promise<ClubMember[]> {
  await requireAdmin(userId, clubId);
  const rows = (await getStore()
    .prepare(
      `SELECT u.id AS "userId", u.name AS name, u.email AS email, m.role AS role
       FROM club_memberships m JOIN "user" u ON u.id=m.user_id
       WHERE m.club_id=? ORDER BY u.name, m.role`,
    )
    .all(clubId)) as { userId: string; name: string; email: string; role: Role }[];
  // Aggregated in JS rather than with GROUP_CONCAT/array_agg, which aren't portable
  // between SQLite and Postgres (this query runs unmodified on either).
  const byUser = new Map<string, ClubMember>();
  for (const { userId: id, name, email, role } of rows) {
    const member = byUser.get(id) ?? { userId: id, name, email, roles: [] };
    member.roles.push(role);
    byUser.set(id, member);
  }
  return Array.from(byUser.values());
}

/** Self-add cannot escalate privilege: requireAdmin already limits callers to canAdmin,
 * the highest tier in this app, so granting yourself another role only adds a parallel,
 * narrower capability (e.g. an admin who is also a team captain). */
export async function addMemberRole(userId: string, clubId: string, targetUserId: string, role: Role) {
  await requireAdmin(userId, clubId);
  if (!ROLES.includes(role)) throw new AccessError(400, "Choose a valid role.");
  const db = getStore();
  const target = await db
    .prepare("SELECT 1 FROM club_memberships WHERE user_id=? AND club_id=?")
    .get(targetUserId, clubId);
  if (!target) throw new AccessError(404, "Choose an existing club member.");
  await db
    .prepare("INSERT INTO club_memberships(user_id,club_id,role) VALUES(?,?,?) ON CONFLICT(user_id,club_id,role) DO NOTHING")
    .run(targetUserId, clubId, role);
  await db
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `role-add:${targetUserId}:${role}`);
}

export async function removeMemberRole(userId: string, clubId: string, targetUserId: string, role: Role) {
  await requireAdmin(userId, clubId);
  if (targetUserId === userId) throw new AccessError(400, "You cannot remove your own role.");
  const db = getStore();
  const count = (await db
    .prepare("SELECT COUNT(*) AS n FROM club_memberships WHERE user_id=? AND club_id=?")
    .get(targetUserId, clubId)) as { n: number | string };
  if (Number(count.n) <= 1) throw new AccessError(400, "A member must keep at least one role.");
  await db.prepare("DELETE FROM club_memberships WHERE user_id=? AND club_id=? AND role=?").run(targetUserId, clubId, role);
  // The role's own membership_team_access scope is removed automatically via ON DELETE CASCADE.
  await db
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `role-remove:${targetUserId}:${role}`);
}
