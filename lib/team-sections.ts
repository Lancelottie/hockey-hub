import type { Team } from "./types";

export const SECTION_KEYS = ["ladies", "mens", "juniors"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_LABELS: Record<SectionKey, string> = {
  ladies: "Ladies",
  mens: "Mens",
  juniors: "Juniors",
};

export function sectionKey(teamName: string): SectionKey | null {
  if (/^ladies/i.test(teamName)) return "ladies";
  if (/^mens/i.test(teamName)) return "mens";
  if (/^juniors/i.test(teamName)) return "juniors";
  return null;
}

/** All team IDs sharing teamId's section (e.g. every "Ladies" team), including itself. */
export function sectionTeamIds(teams: Pick<Team, "id" | "name">[], teamId: string): string[] {
  const key = sectionKey(teams.find((t) => t.id === teamId)?.name ?? "");
  if (!key) return [teamId];
  return teams.filter((t) => sectionKey(t.name) === key).map((t) => t.id);
}

export function sameSection(teams: Pick<Team, "id" | "name">[], teamIdA: string, teamIdB: string): boolean {
  return teamIdA === teamIdB || sectionTeamIds(teams, teamIdA).includes(teamIdB);
}
