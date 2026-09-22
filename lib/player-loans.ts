import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getStore } from "./database";
import { AccessError, listClubs } from "./repository";
import { canAdmin, canManage } from "./users";

export type PlayerLoan = {
  id: string;
  playerId: string;
  playerName: string;
  fromTeamId: string;
  fromTeamName: string;
  toTeamId: string;
  toTeamName: string;
  matchId: string;
  opponent: string;
  createdAt: string;
};

/** Additive and idempotent: records an ad-hoc (not pre-pooled) player loan, surfaced to managers/admins. */
export function migratePlayerLoans(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_loans (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      from_team_id TEXT NOT NULL, from_team_name TEXT NOT NULL,
      to_team_id TEXT NOT NULL, to_team_name TEXT NOT NULL,
      match_id TEXT NOT NULL, opponent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','acknowledged')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/** Visible to whoever manages either team involved (the lending or the borrowing side), plus club admins. */
async function requireVisibility(userId: string, clubId: string, fromTeamId: string, toTeamId: string) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  const visible =
    !!club &&
    (canAdmin(club.role) ||
      (canManage(club.role) &&
        (club.teamIds === null || club.teamIds.includes(fromTeamId) || club.teamIds.includes(toTeamId))));
  if (!visible) throw new AccessError(403, "You do not have permission to view this loan.");
  return club!;
}

/** Called by whoever manages the borrowing team, at the moment a non-pooled section player is actually assigned. */
export async function recordPlayerLoan(
  userId: string,
  clubId: string,
  input: {
    playerId: string;
    playerName: string;
    fromTeamId: string;
    fromTeamName: string;
    toTeamId: string;
    toTeamName: string;
    matchId: string;
    opponent: string;
  },
) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club || !canManage(club.role) || (club.teamIds !== null && !club.teamIds.includes(input.toTeamId)))
    throw new AccessError(403, "You do not have permission for this team.");
  const id = randomUUID();
  await getStore()
    .prepare(
      `INSERT INTO player_loans(id,club_id,player_id,player_name,from_team_id,from_team_name,to_team_id,to_team_name,match_id,opponent)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      clubId,
      input.playerId,
      input.playerName,
      input.fromTeamId,
      input.fromTeamName,
      input.toTeamId,
      input.toTeamName,
      input.matchId,
      input.opponent,
    );
}

export async function listPlayerLoans(userId: string, clubId: string): Promise<PlayerLoan[]> {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club) throw new AccessError(403, "You do not have permission for this club.");
  const rows = (await getStore()
    .prepare(
      `SELECT id, player_id AS "playerId", player_name AS "playerName",
        from_team_id AS "fromTeamId", from_team_name AS "fromTeamName",
        to_team_id AS "toTeamId", to_team_name AS "toTeamName",
        match_id AS "matchId", opponent, created_at AS "createdAt"
       FROM player_loans WHERE club_id=? AND status='pending' ORDER BY created_at`,
    )
    .all(clubId)) as PlayerLoan[];
  if (canAdmin(club.role)) return rows;
  if (!canManage(club.role)) return [];
  if (club.teamIds === null) return rows;
  const allowed = new Set(club.teamIds);
  return rows.filter((r) => allowed.has(r.fromTeamId) || allowed.has(r.toTeamId));
}

export async function acknowledgePlayerLoan(userId: string, clubId: string, id: string) {
  const db = getStore();
  const row = (await db
    .prepare("SELECT from_team_id AS \"fromTeamId\", to_team_id AS \"toTeamId\" FROM player_loans WHERE club_id=? AND id=?")
    .get(clubId, id)) as { fromTeamId: string; toTeamId: string } | undefined;
  if (!row) throw new AccessError(404, "Choose an existing loan notice.");
  await requireVisibility(userId, clubId, row.fromTeamId, row.toTeamId);
  await db.prepare("UPDATE player_loans SET status='acknowledged' WHERE club_id=? AND id=?").run(clubId, id);
}
