import type Database from "better-sqlite3";
import { getStore } from "./database";
import { AccessError, requireNorthernAdmin, requireTeamManageAccess } from "./repository";

export const SUBMISSION_STATUSES = ["not_started", "in_progress", "submitted"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type TeamSubmission = {
  teamId: string;
  teamName: string;
  status: SubmissionStatus;
  updatedAt: string | null;
  submittedByName: string | null;
};

/** Additive and idempotent: submission status lives in its own table alongside the JSON-backed snapshot. */
export function migrateSubmissions(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_submissions (
      club_id TEXT NOT NULL, team_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','submitted')),
      submitted_by TEXT REFERENCES user(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(club_id,team_id),
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
  `);
}

export async function listTeamSubmissions(userId: string, clubId: string): Promise<TeamSubmission[]> {
  await requireNorthernAdmin(userId, clubId);
  return (await getStore()
    .prepare(
      `SELECT t.id AS "teamId", t.name AS "teamName", COALESCE(s.status,'not_started') AS status,
        s.updated_at AS "updatedAt", u.name AS "submittedByName"
       FROM teams t
       LEFT JOIN team_submissions s ON s.club_id=t.club_id AND s.team_id=t.id
       LEFT JOIN "user" u ON u.id=s.submitted_by
       WHERE t.club_id=? ORDER BY t.name`,
    )
    .all(clubId)) as TeamSubmission[];
}

export async function setTeamSubmissionStatus(
  userId: string,
  clubId: string,
  teamId: string,
  status: SubmissionStatus,
) {
  await requireTeamManageAccess(userId, clubId, teamId);
  const db = getStore();
  if (!(await db.prepare("SELECT 1 FROM teams WHERE club_id=? AND id=?").get(clubId, teamId)))
    throw new AccessError(404, "Choose an existing team.");
  await db
    .prepare(
      `INSERT INTO team_submissions(club_id,team_id,status,submitted_by,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(club_id,team_id) DO UPDATE SET status=excluded.status,submitted_by=excluded.submitted_by,updated_at=excluded.updated_at`,
    )
    .run(clubId, teamId, status, userId);
  await db
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `submission-status:${teamId}:${status}`);
}
