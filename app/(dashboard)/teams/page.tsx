"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useTeam } from "@/lib/team-context";
import { loadMatches, loadPlayers } from "@/lib/storage";

export default function TeamsPage() {
  const { teams, activeTeamId, setActiveTeamId } = useTeam();
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [fixtureCounts, setFixtureCounts] = useState<Record<string, number>>(
    {},
  );

  // Read the authenticated memory snapshot after mount — deliberately empty during SSR
  // so the server-rendered markup matches the client's first paint.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const players = loadPlayers();
    const matches = loadMatches();

    const nextPlayerCounts: Record<string, number> = {};
    for (const player of players) {
      nextPlayerCounts[player.teamId] = (nextPlayerCounts[player.teamId] ?? 0) + 1;
    }

    const nextFixtureCounts: Record<string, number> = {};
    for (const match of matches) {
      nextFixtureCounts[match.teamId] = (nextFixtureCounts[match.teamId] ?? 0) + 1;
    }

    setPlayerCounts(nextPlayerCounts);
    setFixtureCounts(nextFixtureCounts);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--text-primary)]">
          Teams
        </h1>
        <p className="text-[var(--text-secondary)]">
          Pick a team to make it active across Fixtures, Squads, and Squad
          selection.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const isActive = team.id === activeTeamId;
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => setActiveTeamId(team.id)}
              className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors ${
                isActive
                  ? "border-[var(--accent-primary)] bg-[var(--accent-primary-light)]"
                  : "border-[var(--border-primary)] bg-[var(--surface-primary)] hover:bg-[var(--surface-muted)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
                  {team.name}
                </span>
                {isActive && (
                  <Check size={18} className="text-[var(--accent-primary)]" />
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                {playerCounts[team.id] ?? 0} players ·{" "}
                {fixtureCounts[team.id] ?? 0} fixtures
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
