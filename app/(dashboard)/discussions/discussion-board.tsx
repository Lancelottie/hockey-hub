"use client";
import { useEffect, useState, type FormEvent } from "react";

type Section = "ladies" | "mens" | "juniors";
type Reply = { id: string; authorId: string; authorName: string; body: string; createdAt: string };
type Discussion = { id: string; section: Section; authorName: string; body: string; createdAt: string; replies: Reply[] };

const SECTION_META: Record<Section, { label: string; border: string; bg: string; text: string; button: string }> = {
  ladies: { label: "Ladies", border: "#dc2626", bg: "#fef2f2", text: "#b91c1c", button: "#dc2626" },
  mens: { label: "Mens", border: "#6cabdd", bg: "#eff8ff", text: "#1d6fa5", button: "#4a9bd6" },
  juniors: { label: "Juniors", border: "#9333ea", bg: "#faf5ff", text: "#7e22ce", button: "#9333ea" },
};
const SECTIONS: Section[] = ["ladies", "mens", "juniors"];

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
  const [drafts, setDrafts] = useState<Record<Section, string>>({ ladies: "", mens: "", juniors: "" });
  const [postingSection, setPostingSection] = useState<Section | null>(null);
  const [error, setError] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [postingReplyTo, setPostingReplyTo] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  async function postDiscussion(event: FormEvent, section: Section) {
    event.preventDefault();
    const body = drafts[section];
    if (!body.trim()) return;
    setPostingSection(section);
    setError("");
    try {
      const response = await fetch("/api/club-discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, section, body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to post.");
      setDiscussions(result.discussions);
      setDrafts((current) => ({ ...current, [section]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to post.");
    } finally {
      setPostingSection(null);
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

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Discussion board</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Open to the whole club — post or reply in any section, whichever team you&apos;re on.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {SECTIONS.map((section) => {
          const meta = SECTION_META[section];
          return (
            <form
              key={section}
              onSubmit={(event) => void postDiscussion(event, section)}
              className="space-y-2 rounded-lg border-2 p-3"
              style={{ borderColor: meta.border, background: meta.bg }}
            >
              <label className="text-sm font-semibold" style={{ color: meta.text }} htmlFor={`discussion-draft-${section}`}>
                {meta.label}
              </label>
              <textarea
                id={`discussion-draft-${section}`}
                className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--surface-primary)] p-2 text-sm"
                rows={3}
                maxLength={2000}
                placeholder={`Raise a point for ${meta.label}…`}
                value={drafts[section]}
                onChange={(e) => setDrafts((current) => ({ ...current, [section]: e.target.value }))}
              />
              <button
                className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-55"
                style={{ background: meta.button }}
                disabled={postingSection === section || !drafts[section].trim()}
              >
                {postingSection === section ? "Posting…" : "Post"}
              </button>
            </form>
          );
        })}
      </div>
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
