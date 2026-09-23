"use client";
import { useEffect, useState, type FormEvent } from "react";

type Section = "ladies" | "mens" | "juniors";
type ReactionEmoji = "thumbs_up" | "thumbs_down" | "hockey_stick" | "celebrate";
type Reaction = { emoji: ReactionEmoji; count: number; reactedByMe: boolean };
type Reply = { id: string; authorId: string; authorName: string; body: string; createdAt: string; reactions: Reaction[] };
type Discussion = {
  id: string;
  section: Section;
  authorName: string;
  body: string;
  createdAt: string;
  reactions: Reaction[];
  replies: Reply[];
};

const SECTION_META: Record<Section, { label: string; border: string; bg: string; text: string; button: string }> = {
  ladies: { label: "Ladies", border: "#dc2626", bg: "#fef2f2", text: "#b91c1c", button: "#dc2626" },
  mens: { label: "Mens", border: "#6cabdd", bg: "#eff8ff", text: "#1d6fa5", button: "#4a9bd6" },
  juniors: { label: "Juniors", border: "#9333ea", bg: "#faf5ff", text: "#7e22ce", button: "#9333ea" },
};
const SECTIONS: Section[] = ["ladies", "mens", "juniors"];
const REACTION_META: Record<ReactionEmoji, { glyph: string; label: string }> = {
  thumbs_up: { glyph: "👍", label: "Thumbs up" },
  thumbs_down: { glyph: "👎", label: "Thumbs down" },
  hockey_stick: { glyph: "🏑", label: "Hockey stick" },
  celebrate: { glyph: "🎉", label: "Celebrate" },
};
const REACTION_EMOJIS: ReactionEmoji[] = ["thumbs_up", "thumbs_down", "hockey_stick", "celebrate"];

function formatPostedAt(value: string) {
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DiscussionBoard({
  clubId,
  currentUserId,
  canManage,
}: {
  clubId: string;
  currentUserId: string;
  canManage: boolean;
}) {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [postingReplyTo, setPostingReplyTo] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reacting, setReacting] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/club-discussions?clubId=${encodeURIComponent(clubId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((result) => {
        if (!controller.signal.aborted) setDiscussions(result.discussions ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clubId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function postDiscussion(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !selectedSection) return;
    setPosting(true);
    setError("");
    try {
      const response = await fetch("/api/club-discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, section: selectedSection, body: draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to post.");
      setDiscussions(result.discussions);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to post.");
    } finally {
      setPosting(false);
    }
  }

  async function removeDiscussion(id: string) {
    setRemovingId(id);
    setError("");
    try {
      const response = await fetch("/api/club-discussions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to remove.");
      setDiscussions(result.discussions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove.");
    } finally {
      setRemovingId(null);
    }
  }

  async function postReply(discussionId: string) {
    const body = (replyDrafts[discussionId] ?? "").trim();
    if (!body) return;
    setPostingReplyTo(discussionId);
    setError("");
    try {
      const response = await fetch("/api/club-discussions/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, discussionId, body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to reply.");
      setDiscussions(result.discussions);
      setReplyDrafts((current) => ({ ...current, [discussionId]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reply.");
    } finally {
      setPostingReplyTo(null);
    }
  }

  async function removeReply(discussionId: string, replyId: string) {
    setRemovingId(replyId);
    setError("");
    try {
      const response = await fetch("/api/club-discussions/replies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, discussionId, id: replyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to remove.");
      setDiscussions(result.discussions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove.");
    } finally {
      setRemovingId(null);
    }
  }

  async function toggleReaction(discussionId: string, replyId: string | null, emoji: ReactionEmoji) {
    const key = `${discussionId}:${replyId ?? ""}:${emoji}`;
    setReacting(key);
    setError("");
    try {
      const response = await fetch("/api/club-discussions/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, discussionId, ...(replyId ? { replyId } : {}), emoji }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to react.");
      setDiscussions(result.discussions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to react.");
    } finally {
      setReacting(null);
    }
  }

  function ReactionBar({ discussionId, replyId, reactions }: { discussionId: string; replyId: string | null; reactions: Reaction[] }) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REACTION_EMOJIS.map((emoji) => {
          const found = reactions.find((r) => r.emoji === emoji);
          const count = found?.count ?? 0;
          const mine = found?.reactedByMe ?? false;
          const key = `${discussionId}:${replyId ?? ""}:${emoji}`;
          return (
            <button
              key={emoji}
              type="button"
              title={REACTION_META[emoji].label}
              aria-label={`${REACTION_META[emoji].label}${count ? `, ${count}` : ""}`}
              aria-pressed={mine}
              disabled={reacting === key}
              onClick={() => void toggleReaction(discussionId, replyId, emoji)}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs disabled:opacity-55"
              style={
                mine
                  ? { borderColor: "var(--accent-primary)", background: "var(--accent-primary-light)" }
                  : { borderColor: "var(--border-primary)", background: "transparent" }
              }
            >
              <span aria-hidden="true">{REACTION_META[emoji].glyph}</span>
              {count > 0 && <span className="font-medium text-[var(--text-primary)]">{count}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Discussion board</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Open to the whole club — post or reply in any section, whichever team you&apos;re on.
      </p>
      <form onSubmit={postDiscussion} className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => {
            const meta = SECTION_META[section];
            const active = selectedSection === section;
            return (
              <button
                key={section}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedSection(section)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
                style={
                  active
                    ? { background: meta.button, borderStyle: "solid", borderWidth: 1, borderColor: meta.button, color: "#fff" }
                    : { background: "transparent", borderStyle: "solid", borderWidth: 1, borderColor: meta.border, color: meta.text }
                }
              >
                {meta.label}
              </button>
            );
          })}
        </div>
        <label className="sr-only" htmlFor="discussion-draft">
          Start a discussion
        </label>
        <textarea
          id="discussion-draft"
          className="w-full rounded-lg border border-[var(--border-primary)] p-3 text-sm"
          rows={3}
          maxLength={2000}
          placeholder={selectedSection ? `Raise a point for ${SECTION_META[selectedSection].label}…` : "Choose a section above, then write your post…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="primary-button" disabled={posting || !draft.trim() || !selectedSection}>
          {posting ? "Posting…" : "Post"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Loading…</p>
      ) : discussions.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          Nothing posted yet — be the first to raise a discussion point.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {discussions.map((discussion) => {
            const meta = SECTION_META[discussion.section];
            return (
              <li key={discussion.id} className="rounded-lg bg-[var(--surface-muted)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}
                  >
                    {meta.label}
                  </span>
                  {canManage && (
                    <button
                      className="shrink-0 text-sm underline disabled:opacity-55"
                      disabled={removingId === discussion.id}
                      onClick={() => void removeDiscussion(discussion.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{discussion.body}</p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {discussion.authorName} · {formatPostedAt(discussion.createdAt)}
                </p>
                <ReactionBar discussionId={discussion.id} replyId={null} reactions={discussion.reactions} />
                {discussion.replies.length > 0 && (
                  <ul className="mt-3 space-y-2 border-l-2 border-[var(--border-primary)] pl-3">
                    {discussion.replies.map((reply) => (
                      <li key={reply.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{reply.body}</p>
                          {(reply.authorId === currentUserId || canManage) && (
                            <button
                              className="shrink-0 text-xs underline disabled:opacity-55"
                              disabled={removingId === reply.id}
                              onClick={() => void removeReply(discussion.id, reply.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {reply.authorName} · {formatPostedAt(reply.createdAt)}
                        </p>
                        <ReactionBar discussionId={discussion.id} replyId={reply.id} reactions={reply.reactions} />
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="mt-3 flex flex-wrap gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void postReply(discussion.id);
                  }}
                >
                  <label className="sr-only" htmlFor={`reply-${discussion.id}`}>
                    Reply
                  </label>
                  <input
                    id={`reply-${discussion.id}`}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border-primary)] p-2 text-sm"
                    maxLength={2000}
                    placeholder="Write a reply…"
                    value={replyDrafts[discussion.id] ?? ""}
                    onChange={(e) =>
                      setReplyDrafts((current) => ({ ...current, [discussion.id]: e.target.value }))
                    }
                  />
                  <button
                    className="rounded border border-[var(--border-primary)] px-3 py-2 text-sm disabled:opacity-55"
                    disabled={postingReplyTo === discussion.id || !(replyDrafts[discussion.id] ?? "").trim()}
                  >
                    {postingReplyTo === discussion.id ? "Replying…" : "Reply"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
