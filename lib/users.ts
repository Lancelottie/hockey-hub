export const ROLES = [
  "administrator",
  "club_admin",
  "manager",
  "coach",
  "player",
  "read_only",
  "northern_hockey_admin",
  "ladies_1s_captain",
  "ladies_1s_vice_captain",
  "ladies_2s_captain",
  "ladies_3s_captain",
  "ladies_3s_vice_captain",
] as const;
export type Role = (typeof ROLES)[number];
const TEAM_ROLES = {
  ladies_1s_captain: { label: "Ladies 1 Captain", team: "Ladies 1s" },
  ladies_1s_vice_captain: { label: "Ladies 1s Vice Captain", team: "Ladies 1s" },
  ladies_2s_captain: { label: "Ladies 2s Captain", team: "Ladies 2s" },
  ladies_3s_captain: { label: "Ladies 3s Captain", team: "Ladies 3s" },
  ladies_3s_vice_captain: { label: "Ladies 3s Vice Captain", team: "Ladies 3s" },
} satisfies Partial<Record<Role, { label: string; team: string }>>;
export function roleTeamName(role: Role): string | null {
  return Object.hasOwn(TEAM_ROLES, role) ? TEAM_ROLES[role as keyof typeof TEAM_ROLES].team : null;
}
export function roleLabel(role: Role) {
  return Object.hasOwn(TEAM_ROLES, role) ? TEAM_ROLES[role as keyof typeof TEAM_ROLES].label : role.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}
export function canManage(role: Role) {
  return ["administrator", "club_admin", "manager", "coach"].includes(role) || roleTeamName(role) !== null;
}
export function canAdmin(role: Role) {
  return role === "administrator" || role === "club_admin";
}
// Deliberately excluded from canManage/canAdmin: club-wide visibility across all teams,
// scoped only to England Hockey submissions and cross-team squad pooling.
export function isNorthernHockeyAdmin(role: Role) {
  return role === "northern_hockey_admin";
}
// Values are a fixed application-owned allowlist, never user input.
export const roleSqlValues = ROLES.map(role => `'${role}'`).join(",");

// Every Role exactly once, most-privileged first. Determines which held role becomes
// active by default for a member who hasn't explicitly switched (see lib/repository.ts).
export const ROLE_PRIORITY: readonly Role[] = [
  "administrator",
  "club_admin",
  "northern_hockey_admin",
  "manager",
  "coach",
  "ladies_1s_captain",
  "ladies_1s_vice_captain",
  "ladies_2s_captain",
  "ladies_3s_captain",
  "ladies_3s_vice_captain",
  "player",
  "read_only",
] as const satisfies readonly Role[];

export function defaultActiveRole(roles: Role[]): Role {
  return ROLE_PRIORITY.find(role => roles.includes(role)) ?? roles[0];
}
