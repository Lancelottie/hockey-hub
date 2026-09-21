import type Database from "better-sqlite3";
import { getStore } from "./database";
import { AccessError, requireClub, requireTeamManageAccess } from "./repository";

export type PlayerTeamMembership = { playerId: string; teamId: string };

/** Additive and idempotent: pooled memberships sit alongside each player's home team (players.team_id). */
export function migratePlayerTeams(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_team_memberships (
      club_id TEXT NOT NULL, player_id TEXT NOT NULL, team_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(club_id,player_id,team_id),
      FOREIGN KEY(club_id,player_id) REFERENCES players(club_id,id) ON DELETE CASCADE,
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
  `);
}

export async function listPlayerTeamMemberships(
  userId: string,
  clubId: string,
): Promise<PlayerTeamMembership[]> {
  await requireClub(userId, clubId);
  return (await getStore()
    .prepare(`SELECT player_id AS "playerId", team_id AS "teamId" FROM player_team_memberships WHERE club_id=?`)
    .all(clubId)) as PlayerTeamMembership[];
}

async function requirePlayerInClub(clubId: string, playerId: string) {
  const player = (await getStore()
    .prepare(`SELECT team_id AS "teamId" FROM players WHERE club_id=? AND id=?`)
    .get(clubId, playerId)) as { teamId: string } | undefined;
  if (!player) throw new AccessError(404, "Choose an existing player.");
  return player;
}

export async function addPlayerToTeam(userId: string, clubId: string, playerId: string, teamId: string) {
  await requireTeamManageAccess(userId, clubId, teamId);
  const player = await requirePlayerInClub(clubId, playerId);
  if (player.teamId === teamId)
    throw new AccessError(400, "This player is already assigned to that team.");
  const db = getStore();
  await db
    .prepare(
      "INSERT INTO player_team_memberships(club_id,player_id,team_id) VALUES(?,?,?) ON CONFLICT(club_id,player_id,team_id) DO NOTHING",
    )
    .run(clubId, playerId, teamId);
  await db
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `player-team-add:${playerId}:${teamId}`);
}

export async function removePlayerFromTeam(userId: string, clubId: string, playerId: string, teamId: string) {
  await requireTeamManageAccess(userId, clubId, teamId);
  const db = getStore();
  await db
    .prepare("DELETE FROM player_team_memberships WHERE club_id=? AND player_id=? AND team_id=?")
    .run(clubId, playerId, teamId);
  await db
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `player-team-remove:${playerId}:${teamId}`);
}
