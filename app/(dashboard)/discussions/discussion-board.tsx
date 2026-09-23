"use client";
import { useEffect, useState, type FormEvent } from "react";

type Reply = { id: string; authorId: string; authorName: string; body: string; createdAt: string };
type Discussion = { id: string; authorName: string; body: string; createdAt: string; replies: Reply[] };

function formatPostedAt(value: string) {
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DiscussionBoard({
  clubId,
  teamId,
  currentUserId,
  canManage,
}: {
  clubId: string;
  teamId: string;
  currentUserId: string;
  canManage: boolean;
}) {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [postingReplyTo, setPostingReplyTo] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/team-discussions?clubId=${encodeURIComponent(clubId)}&teamId=${encodeURIComponent(teamId)}`, {
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
  }, [clubId, teamId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function postDiscussion(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    setError("");
    try {
      const response = await fetch("/api/team-discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, teamId, body: draft }),
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
      const response = await fetch("/api/team-discussions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, teamId, id }),
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
      const response = await fetch("/api/team-discussions/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, teamId, discussionId, body }),
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
      const response = await fetch("/api/team-discussions/replies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, teamId, discussionId, id: replyId }),
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

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Discussion board</h2>
      </div>
      <form onSubmit={postDiscussion} className="mt-4 space-y-2">
        <label className="sr-only" htmlFor="discussion-draft">
          Start a discussion
        </label>
        <textarea
          id="discussion-draft"
          className="w-full rounded-lg border border-[var(--border-primary)] p-3 text-sm"
          rows={3}
          maxLength={2000}
          placeholder="Raise a discussion point for the team…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="primary-button" disabled={posting || !draft.trim()}>
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
          {discussions.map((discussion) => (
            <li key={discussion.id} className="rounded-lg bg-[var(--surface-muted)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{discussion.body}</p>
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
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {discussion.authorName} · {formatPostedAt(discussion.createdAt)}
              </p>
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
          ))}
        </ul>
      )}
    </section>
  );
}
