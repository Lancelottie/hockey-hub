export const ROLES = [
  "administrator",
  "club_admin",
  "manager",
  "coach",
  "player",
  "read_only",
] as const;
export type Role = (typeof ROLES)[number];
export function canManage(role: Role) {
  return ["administrator", "club_admin", "manager", "coach"].includes(role);
}
export function canAdmin(role: Role) {
  return role === "administrator" || role === "club_admin";
}
