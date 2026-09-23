export const ACCESS_REQUEST_LEVELS = ["coach", "captain", "vice_captain", "admin"] as const;
export type AccessRequestLevel = (typeof ACCESS_REQUEST_LEVELS)[number];
export const ACCESS_REQUEST_LEVEL_LABELS: Record<AccessRequestLevel, string> = {
  coach: "Coach",
  captain: "Captain",
  vice_captain: "Vice Captain",
  admin: "Admin",
};
