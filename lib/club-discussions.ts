import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getStore } from "./database";
import { AccessError, requireClub } from "./repository";

export const SECTIONS = ["ladies", "mens", "juniors"] as const;
export type Section = (typeof SECTIONS)[number];
export function isSection(value: unknown): value is Section {
  return SECTIONS.includes(value as Section);
}

export const REACTIONS = ["thumbs_up", "thumbs_down", "hockey_stick", "celebrate"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];
export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return REACTIONS.includes(value as ReactionEmoji);
}
export type ReactionSummary = { emoji: ReactionEmoji; count: number; reactedByMe: boolean };

export type ClubDiscussionReply = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  reactions: ReactionSummary[];
};
export type ClubDiscussion = {
  id: string;
  section: Section;
  authorName: string;
  body: string;
  createdAt: string;
  reactions: ReactionSummary[];
  replies: ClubDiscussionReply[];
};

/** Additive and idempotent: a club-wide discussion board, tagged by section, replacing the
 * earlier per-team board (never had real data, so the old tables are simply dropped). Reactions
 * are a later addition — one row per (message, user, emoji), so toggling re-clicks the same
 * emoji off and a user may still stack several different emoji on one message. */
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
    CREATE TABLE IF NOT EXISTS club_discussion_reactions (
      discussion_id TEXT NOT NULL REFERENCES club_discussions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL CHECK(emoji IN ('thumbs_up','thumbs_down','hockey_stick','celebrate')),
      PRIMARY KEY(discussion_id,user_id,emoji)
    );
    CREATE TABLE IF NOT EXISTS club_discussion_reply_reactions (
      reply_id TEXT NOT NULL REFERENCES club_discussion_replies(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL CHECK(emoji IN ('thumbs_up','thumbs_down','hockey_stick','celebrate')),
      PRIMARY KEY(reply_id,user_id,emoji)
    );
    DROP TABLE IF EXISTS team_discussion_replies;
    DROP TABLE IF EXISTS team_discussions;
  `);
}

function groupReactions<Row extends { emoji: ReactionEmoji; count: number | bigint; reactedByMe: number }, K extends string>(
  rows: Row[],
  keyOf: (row: Row) => K,
): Map<K, ReactionSummary[]> {
  const byKey = new Map<K, ReactionSummary[]>();
  for (const row of rows) {
    const key = keyOf(row);
    byKey.set(key, [
      ...(byKey.get(key) ?? []),
      { emoji: row.emoji, count: Number(row.count), reactedByMe: !!row.reactedByMe },
    ]);
  }
  return byKey;
}

/** Every club member (any role, any team/section) may read, post, react, and reply — this is a
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
    .all(clubId)) as Omit<ClubDiscussion, "replies" | "reactions">[];
  if (!discussions.length) return [];
  const replies = (await db
    .prepare(
      `SELECT r.id, r.discussion_id AS "discussionId", r.author_id AS "authorId",
        r.author_name AS "authorName", r.body, r.created_at AS "createdAt"
       FROM club_discussion_replies r
       JOIN club_discussions d ON d.id = r.discussion_id
       WHERE d.club_id=? ORDER BY r.created_at ASC`,
    )
    .all(clubId)) as (Omit<ClubDiscussionReply, "reactions"> & { discussionId: string })[];

  const discussionReactionRows = (await db
    .prepare(
      `SELECT discussion_id AS "discussionId", emoji, COUNT(*) AS count,
        MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) AS "reactedByMe"
       FROM club_discussion_reactions r
       JOIN club_discussions d ON d.id = r.discussion_id
       WHERE d.club_id=? GROUP BY discussion_id, emoji`,
    )
    .all(userId, clubId)) as { discussionId: string; emoji: ReactionEmoji; count: number; reactedByMe: number }[];
  const reactionsByDiscussion = groupReactions(discussionReactionRows, (row) => row.discussionId);

  const replyReactionRows = (await db
    .prepare(
      `SELECT rr.reply_id AS "replyId", rr.emoji, COUNT(*) AS count,
        MAX(CASE WHEN rr.user_id=? THEN 1 ELSE 0 END) AS "reactedByMe"
       FROM club_discussion_reply_reactions rr
       JOIN club_discussion_replies r ON r.id = rr.reply_id
       JOIN club_discussions d ON d.id = r.discussion_id
       WHERE d.club_id=? GROUP BY rr.reply_id, rr.emoji`,
    )
    .all(userId, clubId)) as { replyId: string; emoji: ReactionEmoji; count: number; reactedByMe: number }[];
  const reactionsByReply = groupReactions(replyReactionRows, (row) => row.replyId);

  const repliesByDiscussion = new Map<string, ClubDiscussionReply[]>();
  for (const { discussionId, ...reply } of replies)
    repliesByDiscussion.set(discussionId, [
      ...(repliesByDiscussion.get(discussionId) ?? []),
      { ...reply, reactions: reactionsByReply.get(reply.id) ?? [] },
    ]);

  return discussions.map((discussion) => ({
    ...discussion,
    reactions: reactionsByDiscussion.get(discussion.id) ?? [],
    replies: repliesByDiscussion.get(discussion.id) ?? [],
  }));
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

/** Toggles the caller's own reaction: clicking the same emoji again removes it, clicking a
 * different one adds it alongside — any club member may react, same as posting and replying. */
export async function toggleDiscussionReaction(
  userId: string,
  clubId: string,
  discussionId: string,
  emoji: ReactionEmoji,
): Promise<void> {
  await requireClub(userId, clubId);
  await requireDiscussionInClub(clubId, discussionId);
  const db = getStore();
  const existing = await db
    .prepare("SELECT 1 FROM club_discussion_reactions WHERE discussion_id=? AND user_id=? AND emoji=?")
    .get(discussionId, userId, emoji);
  if (existing)
    await db.prepare("DELETE FROM club_discussion_reactions WHERE discussion_id=? AND user_id=? AND emoji=?").run(discussionId, userId, emoji);
  else
    await db.prepare("INSERT INTO club_discussion_reactions(discussion_id,user_id,emoji) VALUES(?,?,?)").run(discussionId, userId, emoji);
}

export async function toggleReplyReaction(
  userId: string,
  clubId: string,
  discussionId: string,
  replyId: string,
  emoji: ReactionEmoji,
): Promise<void> {
  await requireClub(userId, clubId);
  await requireDiscussionInClub(clubId, discussionId);
  const db = getStore();
  const reply = await db.prepare("SELECT 1 FROM club_discussion_replies WHERE id=? AND discussion_id=?").get(replyId, discussionId);
  if (!reply) throw new AccessError(404, "Choose an existing reply.");
  const existing = await db
    .prepare("SELECT 1 FROM club_discussion_reply_reactions WHERE reply_id=? AND user_id=? AND emoji=?")
    .get(replyId, userId, emoji);
  if (existing)
    await db.prepare("DELETE FROM club_discussion_reply_reactions WHERE reply_id=? AND user_id=? AND emoji=?").run(replyId, userId, emoji);
  else
    await db.prepare("INSERT INTO club_discussion_reply_reactions(reply_id,user_id,emoji) VALUES(?,?,?)").run(replyId, userId, emoji);
}
