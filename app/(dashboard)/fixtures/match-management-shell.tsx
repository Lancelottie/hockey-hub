"use client";

import { useEffect, useMemo, useState } from "react";
import { useTeam } from "@/lib/team-context";
import { formatFixtureLabel } from "@/lib/match-format";
import { loadMatches } from "@/lib/storage";
import type { Match } from "@/lib/types";
import CaptainTasks from "./captain-tasks";
import LineupBuilder from "./lineup-builder";
import PostMatch from "./post-match";

type TabKey = "lineup" | "captain-tasks" | "post-match";

export default function MatchManagementShell({
  matchId,
  initialTab = "lineup",
  highlightOutstanding = false,
}: {
  matchId: string;
  initialTab?: TabKey;
  highlightOutstanding?: boolean;
}) {
  const { activeTeam, teams, setActiveTeamId } = useTeam();
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMatches(loadMatches());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedMatch = useMemo(
    () =>
      matches.find(
        (match) => match.id === matchId && match.teamId === activeTeam?.id,
      ) ?? null,
    [matchId, matches, activeTeam?.id],
  );

  const heading =
    activeTeam && selectedMatch
      ? formatFixtureLabel(activeTeam.name, selectedMatch)
      : "Match management";

  const fixtureTeamId = matches.find((match) => match.id === matchId)?.teamId;
  if (fixtureTeamId && fixtureTeamId !== activeTeam?.id) {
    return (
      <section className="panel space-y-4">
        <h1 className="text-2xl font-bold">
          Switch team to manage this fixture
        </h1>
        <p>
          This fixture belongs to{" "}
          {teams.find((team) => team.id === fixtureTeamId)?.name ??
            "another team"}
          .
        </p>
        <button
          className="primary-button"
          onClick={() => setActiveTeamId(fixtureTeamId)}
        >
          Switch to fixture team
        </button>
      </section>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 pb-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--text-primary)]">
          Match management
        </h1>
        <p className="text-[var(--text-secondary)]">{heading}</p>
      </div>

      <div className="rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("lineup")}
            className={`rounded-[14px] px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "lineup"
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Build lineup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("captain-tasks")}
            className={`rounded-[14px] px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "captain-tasks"
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Captain tasks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("post-match")}
            className={`rounded-[14px] px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "post-match"
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Post-match
          </button>
        </div>
      </div>

      {activeTab === "lineup" ? (
        <LineupBuilder initialMatchId={matchId} embedded />
      ) : activeTab === "captain-tasks" ? (
        <CaptainTasks
          match={selectedMatch}
          teamName={activeTeam?.name ?? "Team"}
          highlightOutstanding={highlightOutstanding}
        />
      ) : (
        <PostMatch
          match={selectedMatch}
          teamName={activeTeam?.name ?? "Team"}
        />
      )}
    </div>
  );
}
