"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/lib/team-context";
import { syncTeamFixtures } from "@/lib/storage";

type Source = { sourceUrl: string; teamName: string; lastSyncedAt: string };
export default function EnglandHockeySettings({ teamId }: { teamId: string }) {
  const { club } = useTeam();
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/england-hockey?clubId=${encodeURIComponent(club.id)}&teamId=${encodeURIComponent(teamId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        setSource(result.source);
        setUrl(result.source?.sourceUrl ?? "");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load fixture settings.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [club.id, teamId]);
  async function sync(saveUrl: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await syncTeamFixtures(
        teamId,
        saveUrl ? url.trim() : undefined,
      );
      setSource(result.source);
      setUrl(result.source.sourceUrl);
      setMessage(
        `Fixtures synced successfully. ${result.checked} checked · ${result.added} added · ${result.updated} updated · ${result.unchanged} unchanged${result.skipped ? ` · ${result.skipped} byes skipped` : ""}.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to sync fixtures. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void sync(true);
  }
  const button =
    "rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
  return (
    <section
      className="rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5"
      aria-label="England Hockey fixtures"
      aria-busy={busy || loading}
    >
      <h2 className="text-lg font-semibold">England Hockey fixtures</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Connect this team to import fixtures and keep dates, times and venues up
        to date.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-[1_1_300px] text-sm font-medium">
          England Hockey fixtures URL
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy || loading}
            placeholder="https://www.englandhockey.co.uk/teams/your-team"
            className="mt-2 w-full min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 font-normal"
          />
        </label>
        <button className={button} disabled={busy || loading || !url.trim()}>
          {busy ? "Syncing…" : "Save & Import Fixtures"}
        </button>
        {source && (
          <button
            type="button"
            className={button}
            disabled={busy || loading}
            onClick={() => void sync(false)}
          >
            Sync Fixtures
          </button>
        )}
      </form>
      {source && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Connected to {source.teamName} · Last synced{" "}
          {new Date(source.lastSyncedAt).toLocaleString("en-GB")}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-[var(--accent-primary)]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}
    </section>
  );
}
