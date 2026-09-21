"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTeam } from "@/lib/team-context";
import { isNorthernHockeyAdmin } from "@/lib/users";
import {
  formatFixtureLabel,
  formatFixtureMonthLabel,
  formatMatchDateLong,
  getFixtureMonthKey,
  isUpcomingFixture,
} from "@/lib/match-format";
import {
  loadMatches,
  saveMatches,
  subscribeStorage,
  fixtureSyncInProgress,
} from "@/lib/storage";
import type { Match } from "@/lib/types";
import EnglandHockeySettings from "./england-hockey-settings";
import NewFixtureForm from "./new-fixture-form";

const ALL_FIXTURES = "all";
const UPCOMING_FIXTURES = "upcoming";

function pillClass(active: boolean) {
  return `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "bg-[var(--accent-primary)] text-white"
      : "bg-[var(--surface-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
  }`;
}

export default function FixturesPage() {
  const { activeTeam, canWrite, club } = useTeam();
  const syncing = useSyncExternalStore(
    subscribeStorage,
    fixtureSyncInProgress,
    () => false,
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Read the authenticated memory snapshot after mount — deliberately empty during SSR
  // so the server-rendered markup matches the client's first paint.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMatches(loadMatches());
    return subscribeStorage(() => setMatches(loadMatches()));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const fixtures = matches
    .filter((match) => match.teamId === activeTeam?.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const monthKeys = Array.from(
    new Set(fixtures.map((match) => getFixtureMonthKey(match.date))),
  ).sort();
  const activeMonthKey =
    selectedMonthKey === ALL_FIXTURES || selectedMonthKey === UPCOMING_FIXTURES
      ? selectedMonthKey
      : selectedMonthKey && monthKeys.includes(selectedMonthKey)
        ? selectedMonthKey
        : (monthKeys[0] ?? null);
  const visibleFixtures =
    activeMonthKey === UPCOMING_FIXTURES
      ? fixtures.filter((match) => isUpcomingFixture(match.date))
      : activeMonthKey && activeMonthKey !== ALL_FIXTURES
        ? fixtures.filter(
            (match) => getFixtureMonthKey(match.date) === activeMonthKey,
          )
        : fixtures;

  function persist(next: Match[]) {
    setMatches(next);
    saveMatches(next);
  }

  function handleCreate(fixture: Omit<Match, "id" | "teamId">) {
    if (!activeTeam) return;
    persist([
      ...matches,
      { ...fixture, id: crypto.randomUUID(), teamId: activeTeam.id },
    ]);
  }

  function handleDelete(matchId: string) {
    persist(matches.filter((match) => match.id !== matchId));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--text-primary)]">
          Fixtures
        </h1>
        <p className="text-[var(--text-secondary)]">
          {activeTeam ? `Managing ${activeTeam.name}` : "Select a team"}
        </p>
      </div>

      {isNorthernHockeyAdmin(club.role) && activeTeam && (
        <EnglandHockeySettings
          key={`${club.id}:${activeTeam.id}`}
          teamId={activeTeam.id}
        />
      )}
      {canWrite && (
        <NewFixtureForm
          onCreate={handleCreate}
          disabled={!activeTeam || syncing}
        />
      )}

      <div className="w-full overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-primary)]">
        {fixtures.length === 0 ? (
          <p className="px-4 py-6 text-center text-[var(--text-muted)]">
            No fixtures yet — add one above.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedMonthKey(ALL_FIXTURES)}
                className={pillClass(activeMonthKey === ALL_FIXTURES)}
              >
                All fixtures
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonthKey(UPCOMING_FIXTURES)}
                className={pillClass(activeMonthKey === UPCOMING_FIXTURES)}
              >
                Upcoming fixtures
              </button>
              {monthKeys.map((monthKey) => (
                <button
                  key={monthKey}
                  type="button"
                  onClick={() => setSelectedMonthKey(monthKey)}
                  className={pillClass(monthKey === activeMonthKey)}
                >
                  {formatFixtureMonthLabel(monthKey)}
                </button>
              ))}
            </div>
            <ul>
              {visibleFixtures.map((match) => (
                <li
                  key={match.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-primary)] px-4 py-3 first:border-t-0"
                >
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      {activeTeam
                        ? formatFixtureLabel(activeTeam.name, match)
                        : match.opponent}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {formatMatchDateLong(match.date)} ·{" "}
                      {match.externalSource &&
                        (!match.startTime || match.startTime === "00:00") &&
                        "Time TBC · "}
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 font-semibold ${match.isHome ? "bg-[var(--accent-primary)] text-white" : "bg-[var(--surface-muted)] text-[var(--text-primary)]"}`}
                      >
                        {match.isHome ? "HOME" : "AWAY"}
                      </span>
                    </p>
                    {match.externalSource && (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {[
                          match.venue,
                          match.competition,
                          match.status && match.status !== "Active"
                            ? match.status
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/fixtures/${match.id}`}
                      className="rounded-lg border border-[var(--border-primary)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                    >
                      Match management
                    </Link>
                    {canWrite && !match.externalSource && (
                      <button
                        type="button"
                        disabled={syncing}
                        onClick={() => handleDelete(match.id)}
                        className="text-xs text-[var(--status-critical)] hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
