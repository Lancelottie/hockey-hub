import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getStore } from "./database";
import { AccessError, requireTeamAccess, requireTeamManageAccess } from "./repository";

export type TeamNotice = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

/** Additive and idempotent: a small per-team notice board for discussion points. */
export function migrateTeamNotices(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_notices (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL, team_id TEXT NOT NULL,
      author_id TEXT NOT NULL, author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
  `);
}

export async function listTeamNotices(userId: string, clubId: string, teamId: string): Promise<TeamNotice[]> {
  await requireTeamAccess(userId, clubId, teamId);
  return (await getStore()
    .prepare(
      `SELECT id, author_name AS "authorName", body, created_at AS "createdAt"
       FROM team_notices WHERE club_id=? AND team_id=? ORDER BY created_at DESC`,
    )
    .all(clubId, teamId)) as TeamNotice[];
}

export async function postTeamNotice(
  userId: string,
  clubId: string,
  teamId: string,
  authorName: string,
  body: string,
): Promise<void> {
  await requireTeamManageAccess(userId, clubId, teamId);
  if (!body.trim()) throw new AccessError(400, "Write something before posting.");
  const id = randomUUID();
  await getStore()
    .prepare("INSERT INTO team_notices(id,club_id,team_id,author_id,author_name,body) VALUES(?,?,?,?,?,?)")
    .run(id, clubId, teamId, userId, authorName, body.trim());
}

export async function deleteTeamNotice(userId: string, clubId: string, teamId: string, id: string): Promise<void> {
  await requireTeamManageAccess(userId, clubId, teamId);
  const result = (await getStore()
    .prepare("DELETE FROM team_notices WHERE club_id=? AND team_id=? AND id=?")
    .run(clubId, teamId, id)) as { changes: number };
  if (!result.changes) throw new AccessError(404, "Choose an existing notice.");
}
