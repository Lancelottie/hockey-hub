import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getStore } from "./database";
import { AccessError, requireClub } from "./repository";

export const SECTIONS = ["ladies", "mens", "juniors"] as const;
export type Section = (typeof SECTIONS)[number];
export function isSection(value: unknown): value is Section {
  return SECTIONS.includes(value as Section);
}

export type ClubDiscussionReply = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
export type ClubDiscussion = {
  id: string;
  section: Section;
  authorName: string;
  body: string;
  createdAt: string;
  replies: ClubDiscussionReply[];
};

/** Additive and idempotent: a club-wide discussion board, tagged by section, replacing the
 * earlier per-team board (never had real data, so the old tables are simply dropped). */
export function migrateClubDiscussions(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS club_discussions (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      section TEXT NOT NULL CHECK(section IN ('ladies','mens','juniors')),
      author_id TEXT NOT NULL, author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS club_discussion_replies (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL REFERENCES club_discussions(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL, author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    DROP TABLE IF EXISTS team_discussion_replies;
    DROP TABLE IF EXISTS team_discussions;
  `);
}

/** Every club member (any role, any team/section) may read, post, and reply — this is a
 * club-wide noticeboard, not scoped to the caller's own section. Anyone may delete their own
 * reply; only a manage-capable role may delete someone else's reply or a whole discussion. */
export async function listClubDiscussions(userId: string, clubId: string): Promise<ClubDiscussion[]> {
  await requireClub(userId, clubId);
  const db = getStore();
  const discussions = (await db
    .prepare(
      `SELECT id, section, author_name AS "authorName", body, created_at AS "createdAt"
       FROM club_discussions WHERE club_id=? ORDER BY created_at DESC`,
    )
    .all(clubId)) as Omit<ClubDiscussion, "replies">[];
  if (!discussions.length) return [];
  const replies = (await db
    .prepare(
      `SELECT r.id, r.discussion_id AS "discussionId", r.author_id AS "authorId",
        r.author_name AS "authorName", r.body, r.created_at AS "createdAt"
       FROM club_discussion_replies r
       JOIN club_discussions d ON d.id = r.discussion_id
       WHERE d.club_id=? ORDER BY r.created_at ASC`,
    )
    .all(clubId)) as (ClubDiscussionReply & { discussionId: string })[];
  const repliesByDiscussion = new Map<string, ClubDiscussionReply[]>();
  for (const { discussionId, ...reply } of replies)
    repliesByDiscussion.set(discussionId, [...(repliesByDiscussion.get(discussionId) ?? []), reply]);
  return discussions.map((discussion) => ({ ...discussion, replies: repliesByDiscussion.get(discussion.id) ?? [] }));
}

export async function postClubDiscussion(
  userId: string,
  clubId: string,
  section: Section,
  authorName: string,
  body: string,
): Promise<void> {
  await requireClub(userId, clubId);
  if (!body.trim()) throw new AccessError(400, "Write something before posting.");
  await getStore()
    .prepare("INSERT INTO club_discussions(id,club_id,section,author_id,author_name,body) VALUES(?,?,?,?,?,?)")
    .run(randomUUID(), clubId, section, userId, authorName, body.trim());
}

export async function deleteClubDiscussion(userId: string, clubId: string, id: string): Promise<void> {
  await requireClub(userId, clubId, true);
  const result = (await getStore()
    .prepare("DELETE FROM club_discussions WHERE club_id=? AND id=?")
    .run(clubId, id)) as { changes: number };
  if (!result.changes) throw new AccessError(404, "Choose an existing discussion.");
}

async function requireDiscussionInClub(clubId: string, discussionId: string) {
  const found = await getStore()
    .prepare("SELECT 1 FROM club_discussions WHERE club_id=? AND id=?")
    .get(clubId, discussionId);
  if (!found) throw new AccessError(404, "Choose an existing discussion.");
}

export async function postClubDiscussionReply(
  userId: string,
  clubId: string,
  discussionId: string,
  authorName: string,
  body: string,
): Promise<void> {
  await requireClub(userId, clubId);
  await requireDiscussionInClub(clubId, discussionId);
  if (!body.trim()) throw new AccessError(400, "Write something before replying.");
  await getStore()
    .prepare("INSERT INTO club_discussion_replies(id,discussion_id,author_id,author_name,body) VALUES(?,?,?,?,?)")
    .run(randomUUID(), discussionId, userId, authorName, body.trim());
}

export async function deleteClubDiscussionReply(
  userId: string,
  clubId: string,
  discussionId: string,
  replyId: string,
): Promise<void> {
  await requireClub(userId, clubId);
  await requireDiscussionInClub(clubId, discussionId);
  const db = getStore();
  const reply = (await db
    .prepare("SELECT author_id AS \"authorId\" FROM club_discussion_replies WHERE id=? AND discussion_id=?")
    .get(replyId, discussionId)) as { authorId: string } | undefined;
  if (!reply) throw new AccessError(404, "Choose an existing reply.");
  if (reply.authorId !== userId) await requireClub(userId, clubId, true);
  await db.prepare("DELETE FROM club_discussion_replies WHERE id=? AND discussion_id=?").run(replyId, discussionId);
}
