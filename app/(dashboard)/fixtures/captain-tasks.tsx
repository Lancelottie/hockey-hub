"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Database,
  Flag,
  MessageSquare,
  ShieldCheck,
  Shirt,
  Stethoscope,
  TimerReset,
  Car,
  PackageCheck,
  CircleDot,
} from "lucide-react";
import { formatFixtureLabel, formatMatchDateLong } from "@/lib/match-format";
import { emptyCaptainTaskChecklist, isCaptainTaskApplicable } from "@/lib/captain-tasks";
import { loadCaptainTasks, saveCaptainTasks } from "@/lib/storage";
import type { CaptainTaskChecklist, Match } from "@/lib/types";

const TASKS = [
  {
    key: "pushback",
    title: "Confirm pushback",
    description: "Double-check the official pushback time with the squad.",
    placeholder: "13:45 confirmed",
    icon: ShieldCheck,
  },
  {
    key: "warmupStart",
    title: "Warm-up start time",
    description: "Set the exact time warm-up begins and who is leading it.",
    placeholder: "12:55, led by captain",
    icon: TimerReset,
  },
  {
    key: "northernKit",
    title: "Confirm Northern kit",
    description: "Make sure the team kit is sorted and being brought.",
    placeholder: "Blue shirts, white socks, Alice bringing bibs",
    icon: Shirt,
  },
  {
    key: "oppositionKit",
    title: "Confirm opposition kit",
    description: "Check what the opposition are wearing to avoid a clash.",
    placeholder: "Opposition in yellow tops",
    icon: Flag,
  },
  {
    key: "teas",
    title: "Confirm teas",
    description: "Check post-match teas or refreshments are arranged.",
    placeholder: "Teas booked for 16 people",
    icon: ClipboardCheck,
  },
  {
    key: "lifts",
    title: "Confirm lifts",
    description: "Make sure travel and lift-sharing is covered for everyone.",
    placeholder: "3 cars arranged, meet 12:00 at club",
    icon: Car,
  },
  {
    key: "notable",
    title: "Anything notable",
    description:
      "Capture any key notes such as injuries, late arrivals, or venue issues.",
    placeholder: "Any extra notes for match day",
    multiline: true,
    icon: MessageSquare,
  },
  {
    key: "keepersKit",
    title: "Keeper's kit",
    description: "Confirm who is responsible for taking the goalkeeper's kit.",
    placeholder: "Jess bringing keeper's kit",
    icon: PackageCheck,
  },
  {
    key: "firstAidKit",
    title: "First aid kit",
    description: "Confirm who is bringing the first aid kit.",
    placeholder: "Megan bringing first aid kit",
    icon: Stethoscope,
  },
  {
    key: "awayBalls",
    title: "Match balls",
    description:
      "For away games, confirm who is responsible for bringing the balls.",
    placeholder: "Tom bringing match balls",
    icon: CircleDot,
  },
  {
    key: "umpires",
    title: "Umpires",
    description: "For home games, confirm which umpires are attending.",
    placeholder: "Home umpires confirmed",
    icon: ClipboardCheck,
  },
  {
    key: "gmsUpdated",
    title: "Update GMS",
    description:
      "Update the Game Management System with every player who played, including subs and any borrowed players.",
    placeholder: "GMS updated with full team sheet",
    icon: Database,
  },
] as const satisfies ReadonlyArray<{
  key: keyof CaptainTaskChecklist;
  title: string;
  description: string;
  placeholder: string;
  multiline?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}>;

export default function CaptainTasks({
  match,
  teamName,
  highlightOutstanding = false,
}: {
  match: Match | null;
  teamName: string;
  highlightOutstanding?: boolean;
}) {
  const [tasks, setTasks] = useState<CaptainTaskChecklist>(emptyCaptainTaskChecklist);
  const [draftAnswers, setDraftAnswers] = useState<Partial<Record<keyof CaptainTaskChecklist, string>>>({});

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraftAnswers({});
    if (!match) {
      setTasks(emptyCaptainTaskChecklist());
      return;
    }
    setTasks(loadCaptainTasks(match.id));
  }, [match]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleDone(key: keyof CaptainTaskChecklist) {
    if (!match) return;
    const next = { ...tasks, [key]: { ...tasks[key], done: !tasks[key].done } };
    setTasks(next);
    saveCaptainTasks(match.id, next);
  }

  function submitAnswer(key: keyof CaptainTaskChecklist) {
    if (!match) return;
    const answer = draftAnswers[key] ?? tasks[key].answer;
    const next = { ...tasks, [key]: { ...tasks[key], answer } };
    setTasks(next);
    saveCaptainTasks(match.id, next);
    setDraftAnswers((prev) => {
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 shadow-sm">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
            Match overview
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {match
              ? formatFixtureLabel(teamName, match)
              : "Select a fixture to manage captain tasks."}
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
                Venue status
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                {match ? (match.isHome ? "Home fixture" : "Away fixture") : "—"}
              </p>
            </div>
            <div className="rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Task saving
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                {match
                  ? "Tick each task off as it's done, and submit an answer to save its details."
                  : "Pick a fixture first to start."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] p-5 shadow-sm">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
            Captain tasks
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Keep the off-pitch jobs together in one place before match day.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {TASKS.map((task) => {
              const Icon = task.icon;
              const notApplicable = !!match && !isCaptainTaskApplicable(task.key, match.isHome);
              const forcedMessage = notApplicable
                ? task.key === "awayBalls"
                  ? "Not needed for home fixtures"
                  : "Only needed for home fixtures"
                : null;
              const isDisabled = !match || notApplicable;
              const saved = tasks[task.key];
              const draft = draftAnswers[task.key] ?? saved.answer;
              const isDirty = draftAnswers[task.key] !== undefined && draftAnswers[task.key] !== saved.answer;
              const hasAnswer = saved.answer.trim() !== "";
              const outstanding = highlightOutstanding && !isDisabled && !saved.done;

              return (
                <div
                  key={task.key}
                  className={`rounded-[14px] border p-4 ${
                    outstanding
                      ? "border-[var(--status-warning)] bg-[var(--status-warning-light)]"
                      : "border-[var(--border-primary)] bg-[var(--surface-muted)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          outstanding
                            ? "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
                            : "bg-[var(--accent-primary-light)] text-[var(--accent-primary)]"
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {task.title}
                      </h3>
                      {outstanding && (
                        <span className="rounded-full bg-[var(--status-warning)] px-2 py-0.5 text-xs font-semibold text-white">
                          Outstanding
                        </span>
                      )}
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={saved.done}
                        onChange={() => toggleDone(task.key)}
                        disabled={isDisabled}
                        className="h-4 w-4 accent-[var(--accent-primary)]"
                      />
                      Done
                    </label>
                  </div>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    {task.description}
                  </p>
                  {forcedMessage ? (
                    <p className="mt-4 text-sm text-[var(--text-muted)]">{forcedMessage}</p>
                  ) : (
                    <>
                      {"multiline" in task && task.multiline ? (
                        <textarea
                          value={draft}
                          onChange={(event) =>
                            setDraftAnswers((prev) => ({ ...prev, [task.key]: event.target.value }))
                          }
                          placeholder={task.placeholder}
                          disabled={isDisabled}
                          rows={4}
                          className="mt-4 w-full resize-none rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      ) : (
                        <input
                          value={draft}
                          onChange={(event) =>
                            setDraftAnswers((prev) => ({ ...prev, [task.key]: event.target.value }))
                          }
                          placeholder={task.placeholder}
                          disabled={isDisabled}
                          className="mt-4 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => submitAnswer(task.key)}
                          disabled={isDisabled || !isDirty}
                          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-on-dark)] transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
                        >
                          Submit answer
                        </button>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            isDirty
                              ? "bg-[var(--accent-primary-light)] text-[var(--accent-primary)]"
                              : hasAnswer
                                ? "bg-[var(--status-good-light)] text-[var(--status-good)]"
                                : "bg-[var(--surface-primary)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {isDirty ? "Unsaved answer" : hasAnswer ? "Submitted" : "No answer yet"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
