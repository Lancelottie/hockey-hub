import type { GoalkeeperKit } from "./types";

export const GOALKEEPER_KITS: GoalkeeperKit[] = ["yellow", "black", "purple"];

export const GOALKEEPER_COLORS: Record<GoalkeeperKit, string> = {
  yellow: "#eab308",
  black: "#18181b",
  purple: "#7c3aed",
};

export const HOME_COLOR = "#6cabdd";
export const AWAY_COLOR = "#dc2626";

export const KIT_COLORS = { blue: HOME_COLOR, red: AWAY_COLOR } as const;
export type KitColor = keyof typeof KIT_COLORS;
/** Defaults to the usual home-blue/away-red convention, unless the lineup's kit colour was
 * chosen explicitly (e.g. because the opposition also wears blue). Kept on the formation, not
 * the match, since imported (England Hockey) fixtures can't otherwise be edited at all. */
export function resolveKitColor(isHome: boolean, kitColor?: KitColor): string {
  return KIT_COLORS[kitColor ?? (isHome ? "blue" : "red")];
}
