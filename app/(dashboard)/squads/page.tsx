"use client";

import { useEffect, useMemo, useState } from "react";
import { Shirt, Trash2 } from "lucide-react";
import { useTeam } from "@/lib/team-context";
import { GOALKEEPER_COLORS, GOALKEEPER_KITS } from "@/lib/kit-colors";
import { loadPlayers, savePlayers } from "@/lib/storage";
import type { Player, PlayerPosition } from "@/lib/types";
import NewPlayerForm from "./new-player-form";

const POSITIONS: PlayerPosition[] = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
];

function sectionKey(teamName: string): "ladies" | "mens" | null {
  if (/^ladies/i.test(teamName)) return "ladies";
  if (/^mens/i.test(teamName)) return "mens";
  return null;
}

function sectionLabel(teamName: string): string {
  const key = sectionKey(teamName);
  if (key === "ladies") return "Ladies section";
  if (key === "mens") return "Mens section";
  return teamName;
}

function squadLabel(teamName: string): string {
  if (/^Ladies /i.test(teamName)) {
    return teamName.replace(/^Ladies\s+/i, "");
  }
  if (/^Mens /i.test(teamName)) {
    return teamName.replace(/^Mens\s+/i, "");
  }
  return teamName;
}

export default function SquadsPage() {
  const { activeTeam, teams } = useTeam();
  const [players, setPlayers] = useState<Player[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPlayers(loadPlayers());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sectionTeams = useMemo(() => {
    if (!activeTeam) return [];
    const key = sectionKey(activeTeam.name);
    if (!key) return teams.filter((team) => team.id === activeTeam.id);
    return teams.filter((team) => sectionKey(team.name) === key);
  }, [activeTeam, teams]);

  const sectionTeamIds = sectionTeams.map((team) => team.id);
  const teamNameById = useMemo(
    () => Object.fromEntries(teams.map((team) => [team.id, team.name])),
    [teams],
  );

  const sectionPlayers = useMemo(
    () =>
      players
        .filter((player) => sectionTeamIds.includes(player.teamId))
        .sort((a, b) => {
          const teamCompare = (teamNameById[a.teamId] ?? "").localeCompare(
            teamNameById[b.teamId] ?? "",
          );
          if (teamCompare !== 0) return teamCompare;

          const numberA = a.number ?? Number.MAX_SAFE_INTEGER;
          const numberB = b.number ?? Number.MAX_SAFE_INTEGER;
          if (numberA !== numberB) return numberA - numberB;

          return a.name.localeCompare(b.name);
        }),
    [players, sectionTeamIds, teamNameById],
  );
  const defaultSectionTeamId = useMemo(() => {
    if (!activeTeam) return null;
    if (sectionKey(activeTeam.name) === "ladies") {
      return (
        sectionTeams.find((team) => team.name === "Ladies Unassigned")?.id ??
        sectionTeams[0]?.id ??
        null
      );
    }
    return activeTeam.id;
  }, [activeTeam, sectionTeams]);

  function persist(next: Player[]) {
    setPlayers(next);
    savePlayers(next);
  }

  function handleCreate(player: Omit<Player, "id">) {
    persist([...players, { ...player, id: crypto.randomUUID() }]);
  }

  function handleUpdate(playerId: string, updates: Partial<Player>) {
    persist(
      players.map((player) =>
        player.id === playerId ? { ...player, ...updates } : player,
      ),
    );
  }

  function handleRemove(playerId: string) {
    persist(players.filter((player) => player.id !== playerId));
  }

  function renderKeeperKitButtons(player: Player) {
    if (player.position !== "Goalkeeper") {
      return <span className="text-xs text-[var(--text-muted)]">—</span>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {GOALKEEPER_KITS.map((kit) => (
          <button
            key={kit}
            type="button"
            onClick={() => handleUpdate(player.id, { goalkeeperKit: kit })}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-colors"
            style={{
              backgroundColor: "var(--surface-primary)",
              borderColor:
                (player.goalkeeperKit ?? "yellow") === kit
                  ? "var(--accent-primary)"
                  : "var(--border-primary)",
            }}
          >
            <Shirt
              size={18}
              color={GOALKEEPER_COLORS[kit]}
              fill={GOALKEEPER_COLORS[kit]}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--text-primary)]">
          Squads
        </h1>
        <p className="text-[var(--text-secondary)]">
          {activeTeam
            ? `Managing players across the ${sectionLabel(activeTeam.name)}`
            : "Select a team"}
        </p>
      </div>

      <div className="w-full min-w-0 rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 shadow-sm">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
          Add player
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Add more players to this section and assign them to a squad for the
          season.
        </p>
        <div className="mt-4">
          <NewPlayerForm
            key={activeTeam?.id ?? "no-team"}
            disabled={!activeTeam}
            onCreate={handleCreate}
            teamOptions={sectionTeams}
            defaultTeamId={defaultSectionTeamId}
            teamLabel={(team) => squadLabel(team.name)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] shadow-sm">
        <div className="border-b border-[var(--border-primary)] bg-[var(--surface-muted)] px-5 py-4">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
            Section player pool
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Edit names, shirt numbers, positions, and assign each player to the
            right squad for the season.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem] table-fixed text-sm">
            <thead className="bg-[var(--surface-primary)] text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border-primary)]">
                <th className="w-20 px-4 py-3 text-left font-medium">No.</th>
                <th className="w-[24%] px-4 py-3 text-left font-medium">
                  Name
                </th>
                <th className="w-[18%] px-4 py-3 text-left font-medium">
                  Position
                </th>
                <th className="w-[20%] px-4 py-3 text-left font-medium">
                  Season team
                </th>
                <th className="w-[20%] px-4 py-3 text-left font-medium">
                  Keeper top
                </th>
                <th className="w-20 px-4 py-3 text-right font-medium">
                  Remove
                </th>
              </tr>
            </thead>
            <tbody>
              {sectionPlayers.map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-[var(--border-primary)] align-top last:border-b-0"
                >
                  <td className="px-4 py-4">
                    <input
                      value={player.number ?? ""}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        handleUpdate(player.id, {
                          number:
                            value === ""
                              ? null
                              : Number.parseInt(value, 10) || null,
                        });
                      }}
                      inputMode="numeric"
                      placeholder="—"
                      className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <input
                      value={player.name}
                      onChange={(event) =>
                        handleUpdate(player.id, { name: event.target.value })
                      }
                      className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={player.position}
                      onChange={(event) => {
                        const nextPosition = event.target
                          .value as PlayerPosition;
                        handleUpdate(player.id, {
                          position: nextPosition,
                          goalkeeperKit:
                            nextPosition === "Goalkeeper"
                              ? (player.goalkeeperKit ?? "yellow")
                              : undefined,
                        });
                      }}
                      className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    >
                      {POSITIONS.map((position) => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={player.teamId}
                      onChange={(event) =>
                        handleUpdate(player.id, { teamId: event.target.value })
                      }
                      className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    >
                      {sectionTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {squadLabel(team.name)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">{renderKeeperKitButtons(player)}</td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(player.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--status-critical-light)] hover:text-[var(--status-critical)]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {sectionPlayers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-[var(--text-muted)]"
                  >
                    No players in this section yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
