"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck,
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
import { loadCaptainTasks, saveCaptainTasks } from "@/lib/storage";
import type { CaptainTaskChecklist, Match } from "@/lib/types";

const EMPTY_TASKS: CaptainTaskChecklist = {
  pushback: "",
  warmupStart: "",
  northernKit: "",
  oppositionKit: "",
  teas: "",
  lifts: "",
  notable: "",
  keepersKit: "",
  firstAidKit: "",
  awayBalls: "",
  umpires: "",
};

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
}: {
  match: Match | null;
  teamName: string;
}) {
  const [tasks, setTasks] = useState<CaptainTaskChecklist>(EMPTY_TASKS);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!match) {
      setTasks(EMPTY_TASKS);
      return;
    }
    setTasks(loadCaptainTasks(match.id));
  }, [match]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleChange(key: keyof CaptainTaskChecklist, value: string) {
    const next = { ...tasks, [key]: value };
    setTasks(next);
    if (match) saveCaptainTasks(match.id, next);
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
                  ? "Captain task notes save automatically to this fixture."
                  : "Pick a fixture first to start saving notes."}
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
              const isDisabled =
                !match ||
                (task.key === "awayBalls" && match.isHome) ||
                (task.key === "umpires" && !match.isHome);
              const value =
                task.key === "awayBalls" && match?.isHome
                  ? "Not needed for home fixtures"
                  : task.key === "umpires" && match && !match.isHome
                    ? "Only needed for home fixtures"
                    : tasks[task.key];

              return (
                <div
                  key={task.key}
                  className="rounded-[14px] border border-[var(--border-primary)] bg-[var(--surface-muted)] p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-primary-light)] text-[var(--accent-primary)]">
                      <Icon size={18} />
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {task.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    {task.description}
                  </p>
                  {"multiline" in task && task.multiline ? (
                    <textarea
                      value={value}
                      onChange={(event) =>
                        handleChange(task.key, event.target.value)
                      }
                      placeholder={task.placeholder}
                      disabled={isDisabled}
                      rows={4}
                      className="mt-4 w-full resize-none rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  ) : (
                    <input
                      value={value}
                      onChange={(event) =>
                        handleChange(task.key, event.target.value)
                      }
                      placeholder={task.placeholder}
                      disabled={isDisabled}
                      className="mt-4 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--surface-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    />
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
