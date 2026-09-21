import type { CaptainTask, CaptainTaskChecklist } from "./types";

export const CAPTAIN_TASK_KEYS = [
  "pushback",
  "warmupStart",
  "northernKit",
  "oppositionKit",
  "teas",
  "lifts",
  "notable",
  "keepersKit",
  "firstAidKit",
  "awayBalls",
  "umpires",
  "gmsUpdated",
] as const satisfies readonly (keyof CaptainTaskChecklist)[];

export const CAPTAIN_TASK_LABELS: Record<keyof CaptainTaskChecklist, string> = {
  pushback: "Confirm pushback",
  warmupStart: "Warm-up start time",
  northernKit: "Confirm Northern kit",
  oppositionKit: "Confirm opposition kit",
  teas: "Confirm teas",
  lifts: "Confirm lifts",
  notable: "Anything notable",
  keepersKit: "Keeper's kit",
  firstAidKit: "First aid kit",
  awayBalls: "Match balls",
  umpires: "Umpires",
  gmsUpdated: "Update GMS",
};

/** Match balls only apply away from home; umpires only apply at home. */
export function isCaptainTaskApplicable(key: keyof CaptainTaskChecklist, isHome: boolean): boolean {
  if (key === "awayBalls") return !isHome;
  if (key === "umpires") return isHome;
  return true;
}

function emptyTask(): CaptainTask {
  return { done: false, answer: "" };
}

export function emptyCaptainTaskChecklist(): CaptainTaskChecklist {
  return Object.fromEntries(
    CAPTAIN_TASK_KEYS.map((key) => [key, emptyTask()]),
  ) as CaptainTaskChecklist;
}

/**
 * Accepts both the current { done, answer } shape and the older flat-string shape
 * (still present in saved fixtures from before the checklist, and in legacy browser imports).
 * A non-empty old-style string is treated as already submitted/done.
 */
export function normalizeCaptainTasks(raw: unknown): CaptainTaskChecklist {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = emptyCaptainTaskChecklist();
  for (const key of CAPTAIN_TASK_KEYS) {
    const value = source[key];
    if (typeof value === "string") {
      result[key] = { done: value.trim() !== "", answer: value };
    } else if (value && typeof value === "object") {
      const answer = typeof (value as { answer?: unknown }).answer === "string" ? (value as { answer: string }).answer : "";
      const done = typeof (value as { done?: unknown }).done === "boolean" ? (value as { done: boolean }).done : answer.trim() !== "";
      result[key] = { done, answer };
    }
  }
  return result;
}
