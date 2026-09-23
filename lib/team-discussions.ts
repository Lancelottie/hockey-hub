import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getStore } from "./database";
import { AccessError, requireTeamAccess, requireTeamManageAccess } from "./repository";

export type TeamDiscussionReply = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
export type TeamDiscussion = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  replies: TeamDiscussionReply[];
};

/** Additive and idempotent: a small per-team discussion board. */
export function migrateTeamDiscussions(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_discussions (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL, team_id TEXT NOT NULL,
      author_id TEXT NOT NULL, author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS team_discussion_replies (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL REFERENCES team_discussions(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL, author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/** Everyone with team access (any role) may read, start a discussion, and reply — unlike
 * editing fixtures/squads, this doesn't need manage access. Anyone may delete their own reply;
 * only a manager may delete someone else's reply or a whole discussion. */
export async function listTeamDiscussions(userId: string, clubId: string, teamId: string): Promise<TeamDiscussion[]> {
  await requireTeamAccess(userId, clubId, teamId);
  const db = getStore();
  const discussions = (await db
    .prepare(
      `SELECT id, author_name AS "authorName", body, created_at AS "createdAt"
       FROM team_discussions WHERE club_id=? AND team_id=? ORDER BY created_at DESC`,
    )
    .all(clubId, teamId)) as Omit<TeamDiscussion, "replies">[];
  if (!discussions.length) return [];
  const replies = (await db
    .prepare(
      `SELECT r.id, r.discussion_id AS "discussionId", r.author_id AS "authorId",
        r.author_name AS "authorName", r.body, r.created_at AS "createdAt"
       FROM team_discussion_replies r
       JOIN team_discussions d ON d.id = r.discussion_id
       WHERE d.club_id=? AND d.team_id=? ORDER BY r.created_at ASC`,
    )
    .all(clubId, teamId)) as (TeamDiscussionReply & { discussionId: string })[];
  const repliesByDiscussion = new Map<string, TeamDiscussionReply[]>();
  for (const { discussionId, ...reply } of replies)
    repliesByDiscussion.set(discussionId, [...(repliesByDiscussion.get(discussionId) ?? []), reply]);
  return discussions.map((discussion) => ({ ...discussion, replies: repliesByDiscussion.get(discussion.id) ?? [] }));
}

export async function postTeamDiscussion(
  userId: string,
  clubId: string,
  teamId: string,
  authorName: string,
  body: string,
): Promise<void> {
  await requireTeamAccess(userId, clubId, teamId);
  if (!body.trim()) throw new AccessError(400, "Write something before posting.");
  await getStore()
    .prepare("INSERT INTO team_discussions(id,club_id,team_id,author_id,author_name,body) VALUES(?,?,?,?,?,?)")
    .run(randomUUID(), clubId, teamId, userId, authorName, body.trim());
}

export async function deleteTeamDiscussion(userId: string, clubId: string, teamId: string, id: string): Promise<void> {
  await requireTeamManageAccess(userId, clubId, teamId);
  const result = (await getStore()
    .prepare("DELETE FROM team_discussions WHERE club_id=? AND team_id=? AND id=?")
    .run(clubId, teamId, id)) as { changes: number };
  if (!result.changes) throw new AccessError(404, "Choose an existing discussion.");
}

async function requireDiscussionInTeam(clubId: string, teamId: string, discussionId: string) {
  const found = await getStore()
    .prepare("SELECT 1 FROM team_discussions WHERE club_id=? AND team_id=? AND id=?")
    .get(clubId, teamId, discussionId);
  if (!found) throw new AccessError(404, "Choose an existing discussion.");
}

export async function postTeamDiscussionReply(
  userId: string,
  clubId: string,
  teamId: string,
  discussionId: string,
  authorName: string,
  body: string,
): Promise<void> {
  await requireTeamAccess(userId, clubId, teamId);
  await requireDiscussionInTeam(clubId, teamId, discussionId);
  if (!body.trim()) throw new AccessError(400, "Write something before replying.");
  await getStore()
    .prepare("INSERT INTO team_discussion_replies(id,discussion_id,author_id,author_name,body) VALUES(?,?,?,?,?)")
    .run(randomUUID(), discussionId, userId, authorName, body.trim());
}

export async function deleteTeamDiscussionReply(
  userId: string,
  clubId: string,
  teamId: string,
  discussionId: string,
  replyId: string,
): Promise<void> {
  await requireTeamAccess(userId, clubId, teamId);
  await requireDiscussionInTeam(clubId, teamId, discussionId);
  const db = getStore();
  const reply = (await db
    .prepare("SELECT author_id AS \"authorId\" FROM team_discussion_replies WHERE id=? AND discussion_id=?")
    .get(replyId, discussionId)) as { authorId: string } | undefined;
  if (!reply) throw new AccessError(404, "Choose an existing reply.");
  if (reply.authorId !== userId) await requireTeamManageAccess(userId, clubId, teamId);
  await db.prepare("DELETE FROM team_discussion_replies WHERE id=? AND discussion_id=?").run(replyId, discussionId);
}
