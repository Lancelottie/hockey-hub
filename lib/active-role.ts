import { getStore } from "./database";
import { AccessError } from "./repository";
import type { Role } from "./users";

/** Self-service: a user may switch to any role they already hold, never one they don't. */
export async function switchActiveRole(userId: string, clubId: string, role: Role) {
  const held = await getStore()
    .prepare("SELECT 1 FROM club_memberships WHERE user_id=? AND club_id=? AND role=?")
    .get(userId, clubId, role);
  if (!held) throw new AccessError(403, "You do not hold that role for this club.");
  await getStore()
    .prepare(
      "INSERT INTO active_roles(user_id,club_id,role) VALUES(?,?,?) ON CONFLICT(user_id,club_id) DO UPDATE SET role=excluded.role",
    )
    .run(userId, clubId, role);
  await getStore()
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `role-switch:${role}`);
}
