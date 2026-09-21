"use client";

import { useEffect, useMemo, useState } from "react";
import { useTeam } from "@/lib/team-context";
import {
  loadPlayerAssessments,
  loadPlayers,
  savePlayerAssessments,
} from "@/lib/storage";
import { sectionKey } from "@/lib/team-sections";
import type { Player, PlayerAssessment, SquadTier } from "@/lib/types";

type AssessmentMetricKey = Exclude<
  keyof PlayerAssessment,
  "attending" | "lastSeasonTeam"
>;
const SQUAD_TIERS: SquadTier[] = ["1s", "2s", "Development"];

const ASSESSMENT_GROUPS = [
  {
    title: "Fitness",
    fields: [{ key: "fitness", label: "Fitness" }],
  },
  {
    title: "Technical ability",
    fields: [
      { key: "passingBall", label: "Passing ball" },
      { key: "receivingBall", label: "Receiving ball" },
    ],
  },
  {
    title: "Tactical understanding",
    fields: [
      { key: "defending", label: "Defending" },
      { key: "attackingPlay", label: "Attacking play" },
      { key: "transition", label: "Transition" },
    ],
  },
  {
    title: "Attitude and commitment",
    fields: [{ key: "attitudeCommitment", label: "Attitude and commitment" }],
  },
  {
    title: "Teamwork and communication",
    fields: [
      { key: "teamworkCommunication", label: "Teamwork and communication" },
    ],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  fields: ReadonlyArray<{
    key: AssessmentMetricKey;
    label: string;
  }>;
}>;

function defaultAssessment(): PlayerAssessment {
  return {
    attending: false,
    fitness: 3,
    passingBall: 3,
    receivingBall: 3,
    defending: 3,
    attackingPlay: 3,
    transition: 3,
    attitudeCommitment: 3,
    teamworkCommunication: 3,
    lastSeasonTeam: "Development",
  };
}

function assessmentScore(assessment: PlayerAssessment): number {
  return (
    assessment.fitness +
    assessment.passingBall +
    assessment.receivingBall +
    assessment.defending +
    assessment.attackingPlay +
    assessment.transition +
    assessment.attitudeCommitment +
    assessment.teamworkCommunication
  );
}

function recommendedTeam(score: number): "1s" | "2s" | "Development" {
  if (score >= 32) return "1s";
  if (score >= 20) return "2s";
  return "Development";
}

function sectionLabel(teamName: string): string {
  const key = sectionKey(teamName);
  if (key === "ladies") return "Ladies section";
  if (key === "mens") return "Mens section";
  return teamName;
}

export default function SquadSelectionPage() {
  const { activeTeam, teams } = useTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [savedAssessments, setSavedAssessments] = useState<
    Record<string, PlayerAssessment>
  >({});
  const [draftAssessments, setDraftAssessments] = useState<
    Record<string, PlayerAssessment>
  >({});
  const [savedPlayerIds, setSavedPlayerIds] = useState<Record<string, number>>({});

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPlayers(loadPlayers());
    const loadedAssessments = loadPlayerAssessments();
    setSavedAssessments(loadedAssessments);
    setDraftAssessments(loadedAssessments);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const relevantTeamIds = useMemo(() => {
    if (!activeTeam) return [];
    const key = sectionKey(activeTeam.name);
    if (!key) return [activeTeam.id];
    return teams
      .filter((team) => sectionKey(team.name) === key)
      .map((team) => team.id);
  }, [activeTeam, teams]);

  const teamNameById = useMemo(
    () => Object.fromEntries(teams.map((team) => [team.id, team.name])),
    [teams],
  );

  const sectionPlayers = useMemo(
    () =>
      players
        .filter((player) => relevantTeamIds.includes(player.teamId))
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
    [players, relevantTeamIds, teamNameById],
  );

  function assessmentFor(playerId: string): PlayerAssessment {
    return draftAssessments[playerId] ?? defaultAssessment();
  }

  function updateAssessment(
    playerId: string,
    updater: (current: PlayerAssessment) => PlayerAssessment,
  ) {
    setDraftAssessments((prev) => ({
      ...prev,
      [playerId]: updater(prev[playerId] ?? savedAssessments[playerId] ?? defaultAssessment()),
    }));
  }

  function savePlayerAssessment(playerId: string) {
    const nextAssessment =
      draftAssessments[playerId] ?? savedAssessments[playerId] ?? defaultAssessment();
    const nextSavedAssessments = {
      ...savedAssessments,
      [playerId]: nextAssessment,
    };
    setSavedAssessments(nextSavedAssessments);
    savePlayerAssessments(nextSavedAssessments);
    setSavedPlayerIds((prev) => ({ ...prev, [playerId]: Date.now() }));
  }

  function isPlayerDirty(playerId: string): boolean {
    const saved = savedAssessments[playerId] ?? defaultAssessment();
    const draft = draftAssessments[playerId] ?? defaultAssessment();
    return JSON.stringify(saved) !== JSON.stringify(draft);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 pb-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-[var(--text-primary)]">
          Squad selection
        </h1>
        <p className="text-[var(--text-secondary)]">
          {activeTeam
            ? `Assessing players across the ${sectionLabel(activeTeam.name)}`
            : "Select a team"}
        </p>
      </div>

      <div className="rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
              Section players
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {activeTeam
                ? `Showing every player from the ${sectionLabel(activeTeam.name)}`
                : "Select a team"}
            </p>
          </div>

          {sectionPlayers.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              No players found in this section yet.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sectionPlayers.map((player) => {
                const assessment = assessmentFor(player.id);
                const isDirty = isPlayerDirty(player.id);
                const wasSaved = Boolean(savedPlayerIds[player.id] || savedAssessments[player.id]);
                const score = assessmentScore(assessment);
                const recommendation = assessment.attending
                  ? recommendedTeam(score)
                  : assessment.lastSeasonTeam;
                return (
                  <section
                    key={player.id}
                    className="rounded-[16px] border border-[var(--border-primary)] bg-[var(--surface-muted)] p-4"
                  >
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--surface-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-primary)]">
                            {player.number !== null ? `#${player.number}` : "No #"}
                          </span>
                          <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
                            {player.name}
                          </h3>
                          <span className="rounded-full bg-[var(--surface-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                            {assessment.attending
                              ? `Recommended: ${recommendation}`
                              : `Last season: ${recommendation}`}
                          </span>
                          {assessment.attending && (
                            <span className="rounded-full bg-[var(--surface-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-primary)]">
                              Score {score}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          {teamNameById[player.teamId]} · {player.position}
                        </p>
                        <div className="mt-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              isDirty
                                ? "bg-[var(--accent-primary-light)] text-[var(--accent-primary)]"
                                : wasSaved
                                  ? "bg-[var(--status-good-light)] text-[var(--status-good)]"
                                  : "bg-[var(--surface-primary)] text-[var(--text-secondary)]"
                            }`}
                          >
                            {isDirty
                              ? "Unsaved changes"
                              : wasSaved
                                ? "Submitted"
                                : "Not saved yet"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <div className="flex items-center gap-2 rounded-full bg-[var(--surface-primary)] p-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateAssessment(player.id, (current) => ({
                                ...current,
                                attending: true,
                              }))
                            }
                            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                              assessment.attending
                                ? "bg-[var(--accent-primary)] text-[var(--text-on-dark)]"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateAssessment(player.id, (current) => ({
                                ...current,
                                attending: false,
                              }))
                            }
                            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                              !assessment.attending
                                ? "bg-[var(--surface-sidebar)] text-[var(--text-on-dark)]"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            No
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => savePlayerAssessment(player.id)}
                          className="rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-on-dark)] transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-60"
                        >
                          Save player
                        </button>
                      </div>
                    </div>

                    {assessment.attending ? (
                      <div className="grid gap-4 xl:grid-cols-5">
                        {ASSESSMENT_GROUPS.map((group) => (
                          <div
                            key={group.title}
                            className="rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-4"
                          >
                            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                              {group.title}
                            </h4>
                            <div className="flex flex-col gap-4">
                              {group.fields.map((field) => (
                                <label
                                  key={field.key}
                                  className="flex flex-col gap-2"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-[var(--text-primary)]">
                                      {field.label}
                                    </span>
                                    <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-primary)]">
                                      {assessment[field.key]}
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={assessment[field.key]}
                                    onChange={(event) =>
                                      updateAssessment(player.id, (current) => ({
                                        ...current,
                                        [field.key]: Number(
                                          event.target.value,
                                        ),
                                      }))
                                    }
                                    className="w-full accent-[var(--accent-primary)]"
                                  />
                                  <div className="flex justify-between text-xs text-[var(--text-muted)]">
                                    <span>1</span>
                                    <span>2</span>
                                    <span>3</span>
                                    <span>4</span>
                                    <span>5</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-[var(--border-primary)] bg-[var(--surface-primary)] px-4 py-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <p className="text-sm text-[var(--text-secondary)]">
                            Marked unavailable for this session. Choose a manual
                            reference from last season instead.
                          </p>
                          <label className="flex items-center gap-3">
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              Last season
                            </span>
                            <select
                              value={assessment.lastSeasonTeam}
                              onChange={(event) =>
                                updateAssessment(player.id, (current) => ({
                                  ...current,
                                  lastSeasonTeam: event.target.value as SquadTier,
                                }))
                              }
                              className="rounded-xl border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                            >
                              {SQUAD_TIERS.map((tier) => (
                                <option key={tier} value={tier}>
                                  {tier}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
