"use client";
import { useEffect, useState, type FormEvent } from "react";

type TeamNotice = { id: string; authorName: string; body: string; createdAt: string };

function formatPostedAt(value: string) {
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function NoticeBoard({
  clubId,
  teamId,
  canPost,
}: {
  clubId: string;
  teamId: string;
  canPost: boolean;
}) {
  const [notices, setNotices] = useState<TeamNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/team-notices?clubId=${encodeURIComponent(clubId)}&teamId=${encodeURIComponent(teamId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((result) => {
        if (!controller.signal.aborted) setNotices(result.notices ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clubId, teamId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function post(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    setError("");
    try {
      const response = await fetch("/api/team-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, teamId, body: draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to post.");
      setNotices(result.notices);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to post.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    setError("");
    try {
      const response = await fetch("/api/team-notices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, teamId, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to remove.");
      setNotices(result.notices);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Notice board</h2>
      </div>
      {canPost && (
        <form onSubmit={post} className="mt-4 space-y-2">
          <label className="sr-only" htmlFor="notice-draft">
            Post a discussion point
          </label>
          <textarea
            id="notice-draft"
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
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Loading…</p>
      ) : notices.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Nothing posted yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notices.map((notice) => (
            <li key={notice.id} className="rounded-lg bg-[var(--surface-muted)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{notice.body}</p>
                {canPost && (
                  <button
                    className="shrink-0 text-sm underline disabled:opacity-55"
                    disabled={removingId === notice.id}
                    onClick={() => void remove(notice.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {notice.authorName} · {formatPostedAt(notice.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
