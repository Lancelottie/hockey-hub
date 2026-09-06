"use client";

import { formatFixtureLabel, formatMatchDateLong } from "@/lib/match-format";
import type { Match } from "@/lib/types";
import { AWAY_COLOR, HOME_COLOR } from "@/lib/kit-colors";

export default function FixturePicker({
  fixtures,
  teamName,
  selectedMatchId,
  onSelect,
  onSave,
  savedAt,
}: {
  fixtures: Match[];
  teamName: string;
  selectedMatchId: string | null;
  onSelect: (matchId: string) => void;
  onSave: () => void;
  savedAt: number | null;
}) {
  const selectedMatch = fixtures.find((match) => match.id === selectedMatchId);

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-muted)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <select
        value={selectedMatchId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        className="min-w-0 rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
      >
        {fixtures.length === 0 && <option value="">No fixtures yet</option>}
        {fixtures.map((match) => (
          <option key={match.id} value={match.id}>
            {formatFixtureLabel(teamName, match)}
            {match.date ? ` — ${formatMatchDateLong(match.date)}` : ""} (
            {match.isHome ? "Home" : "Away"})
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        {selectedMatch && (
          <span
            className="flex items-center gap-1.5 rounded-full bg-[var(--surface-primary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]"
            title={selectedMatch.isHome ? "Home — blue kit" : "Away — red kit"}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: selectedMatch.isHome ? HOME_COLOR : AWAY_COLOR,
              }}
            />
            {selectedMatch.isHome ? "Home" : "Away"}
          </span>
        )}
        {savedAt && (
          <span className="rounded-full bg-[var(--surface-primary)] px-3 py-2 text-xs text-[var(--status-good)]">
            Submitted
          </span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!selectedMatchId}
          className="rounded-xl bg-[var(--accent-terracotta)] px-4 py-2.5 text-sm font-medium text-[var(--text-on-dark)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Save lineup
        </button>
      </div>
    </div>
  );
}
