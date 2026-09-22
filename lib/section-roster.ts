import { getStore } from "./database";
import { requireTeamAccess } from "./repository";
import { sectionKey } from "./team-sections";
import type { Player, Team } from "./types";

/**
 * Read-only, deliberately outside the bulk club snapshot/writeClub round-trip: a team-scoped
 * role's workspace snapshot only ever contains their own team(s) (see selectTeams in
 * repository.ts), so sibling section teams and their rosters are otherwise invisible to them —
 * breaking cross-team borrowing/loaning for exactly the captain/manager roles that most need it.
 * Folding this into the main snapshot would mean the client round-trips team stubs it doesn't
 * own on every save, which writeClub's team-ownership check would then reject.
 */
export async function listSectionRoster(userId: string, clubId: string, teamId: string) {
  await requireTeamAccess(userId, clubId, teamId);
  const db = getStore();
  const teamRows = (await db.prepare("SELECT id, name FROM teams WHERE club_id=?").all(clubId)) as Team[];
  const key = sectionKey(teamRows.find((t) => t.id === teamId)?.name ?? "");
  const teams = key ? teamRows.filter((t) => sectionKey(t.name) === key) : teamRows.filter((t) => t.id === teamId);
  const sectionTeamIds = new Set(teams.map((t) => t.id));
  const playerRows = (await db.prepare("SELECT team_id AS \"teamId\", data FROM players WHERE club_id=?").all(clubId)) as {
    teamId: string;
    data: string;
  }[];
  const players: Player[] = playerRows.filter((r) => sectionTeamIds.has(r.teamId)).map((r) => JSON.parse(r.data));
  return { teams, players };
}
