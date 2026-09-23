"use client";

import { useEffect, useMemo, useState } from "react";
import { formatFixtureLabel, formatMatchDateLong } from "@/lib/match-format";
import { useTeam } from "@/lib/team-context";
import {
  loadLineup,
  loadPlayers,
  loadPostMatchReview,
  savePostMatchReview,
} from "@/lib/storage";
import type { Match, Player, PostMatchReview } from "@/lib/types";

const EMPTY_REVIEW: PostMatchReview = {
  ourScore: "",
  oppositionScore: "",
  goalscorers: "",
  assists: "",
  summary: "",
  womanOfTheMatchPlayerId: "",
  playerFeedback: {},
};

export default function PostMatch({
  match,
  teamName,
}: {
  match: Match | null;
  teamName: string;
}) {
  const { club } = useTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [sectionPlayers, setSectionPlayers] = useState<Player[]>([]);
  const [review, setReview] = useState<PostMatchReview>(EMPTY_REVIEW);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPlayers(loadPlayers());
    if (!match) {
      setReview(EMPTY_REVIEW);
      return;
    }
    setReview(loadPostMatchReview(match.id));
  }, [match]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A team-scoped role's own player list (loadPlayers) never includes a player loaned in from
  // a sibling section team — see selectTeams in lib/repository.ts — so without this, a loaned
  // player who took part would silently disappear from the feedback list for that caller.
  useEffect(() => {
    if (!match) return;
    const controller = new AbortController();
    fetch(`/api/section-roster?clubId=${encodeURIComponent(club.id)}&teamId=${encodeURIComponent(match.teamId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((result) => {
        if (!controller.signal.aborted) setSectionPlayers(result.players ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [club.id, match]);

  const playersWhoPlayed = useMemo(() => {
    if (!match) return [];
    const lineup = loadLineup(match.id);
    const selectedPlayerIds = Array.from(
      new Set([
        ...lineup.placements.map((placement) => placement.playerId),
        ...lineup.subs.filter((playerId): playerId is string =>
          Boolean(playerId),
        ),
      ]),
    );
    const allPlayers = [...players, ...sectionPlayers.filter((p) => !players.some((lp) => lp.id === p.id))];

    return selectedPlayerIds
      .map(
        (playerId) => allPlayers.find((player) => player.id === playerId) ?? null,
      )
      .filter((player): player is Player => Boolean(player));
  }, [match, players, sectionPlayers]);

  function updateReview(
    updater: (current: PostMatchReview) => PostMatchReview,
  ) {
    const next = updater(review);
    setReview(next);
    if (match) savePostMatchReview(match.id, next);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 shadow-sm">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
            Post-match overview
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {match
              ? formatFixtureLabel(teamName, match)
              : "Select a fixture to add post-match notes."}
          </p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Date
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                {match ? formatMatchDateLong(match.date) : "No date set"}
              </p>
            </div>
            <div className="rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Woman of the match
              </p>
              <select
                value={review.womanOfTheMatchPlayerId}
                onChange={(event) =>
                  updateReview((current) => ({
                    ...current,
                    womanOfTheMatchPlayerId: event.target.value,
                  }))
                }
                disabled={!match || playersWhoPlayed.length === 0}
                className="mt-2 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select player</option>
                {playersWhoPlayed.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Players who played
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                {playersWhoPlayed.length}
              </p>
            </div>
            <div className="rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Score
              </p>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <span className="text-center">
                  {match?.isHome ? "Home" : "Away"}
                </span>
                <span />
                <span className="text-center">
                  {match?.isHome ? "Away" : "Home"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <input
                  value={review.ourScore}
                  onChange={(event) =>
                    updateReview((current) => ({
                      ...current,
                      ourScore: event.target.value,
                    }))
                  }
                  disabled={!match}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-center text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  -
                </span>
                <input
                  value={review.oppositionScore}
                  onChange={(event) =>
                    updateReview((current) => ({
                      ...current,
                      oppositionScore: event.target.value,
                    }))
                  }
                  disabled={!match}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-center text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 shadow-sm">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
            Game summary
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Capture the overall story of the game and the main takeaways.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">
                Goalscorers
              </label>
              <textarea
                value={review.goalscorers}
                onChange={(event) =>
                  updateReview((current) => ({
                    ...current,
                    goalscorers: event.target.value,
                  }))
                }
                disabled={!match}
                rows={4}
                placeholder="Who scored, and optionally how many"
                className="mt-2 w-full resize-none rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">
                Assists
              </label>
              <textarea
                value={review.assists}
                onChange={(event) =>
                  updateReview((current) => ({
                    ...current,
                    assists: event.target.value,
                  }))
                }
                disabled={!match}
                rows={4}
                placeholder="Who created the goals"
                className="mt-2 w-full resize-none rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>
          <textarea
            value={review.summary}
            onChange={(event) =>
              updateReview((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
            disabled={!match}
            rows={10}
            placeholder="Summary of the game, key moments, patterns, and overall reflections"
            className="mt-4 w-full resize-none rounded-[16px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      <div className="rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 shadow-sm">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
          Player feedback
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Add development points, strengths, and whether the position worked for
          each player who took part.
        </p>

        {playersWhoPlayed.length === 0 ? (
          <div className="mt-4 rounded-[14px] border border-dashed border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            Save a lineup first, then the players who featured will appear here.
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {playersWhoPlayed.map((player) => (
              <div
                key={player.id}
                className="grid gap-3 rounded-[16px] border border-[var(--border-primary)] bg-[var(--surface-muted)] p-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--surface-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-primary)]">
                      {player.number !== null ? `#${player.number}` : "No #"}
                    </span>
                    <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[var(--text-primary)]">
                      {player.name}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {player.position}
                  </p>
                </div>

                <textarea
                  value={review.playerFeedback[player.id] ?? ""}
                  onChange={(event) =>
                    updateReview((current) => ({
                      ...current,
                      playerFeedback: {
                        ...current.playerFeedback,
                        [player.id]: event.target.value,
                      },
                    }))
                  }
                  rows={4}
                  placeholder="Development points, positives, position feedback, and anything else notable"
                  className="w-full resize-none rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
