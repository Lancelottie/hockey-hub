import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTAIN_TASK_KEYS, emptyCaptainTaskChecklist, normalizeCaptainTasks } from "../lib/captain-tasks";
import { readLegacy } from "../lib/legacy-import";

test("emptyCaptainTaskChecklist has every key, undone and unanswered", () => {
  const empty = emptyCaptainTaskChecklist();
  for (const key of CAPTAIN_TASK_KEYS) assert.deepEqual(empty[key], { done: false, answer: "" });
});

test("normalizeCaptainTasks converts the pre-checklist flat-string shape, treating non-empty text as done", () => {
  const legacy = { pushback: "13:45 confirmed", teas: "", northernKit: "Blue shirts" };
  const normalized = normalizeCaptainTasks(legacy);
  assert.deepEqual(normalized.pushback, { done: true, answer: "13:45 confirmed" });
  assert.deepEqual(normalized.teas, { done: false, answer: "" });
  assert.deepEqual(normalized.northernKit, { done: true, answer: "Blue shirts" });
  // Keys absent from the legacy record (e.g. the new gmsUpdated task) default cleanly.
  assert.deepEqual(normalized.gmsUpdated, { done: false, answer: "" });
});

test("normalizeCaptainTasks passes through the current { done, answer } shape unchanged", () => {
  const current = { pushback: { done: true, answer: "Sorted" }, umpires: { done: false, answer: "" } };
  const normalized = normalizeCaptainTasks(current);
  assert.deepEqual(normalized.pushback, { done: true, answer: "Sorted" });
  assert.deepEqual(normalized.umpires, { done: false, answer: "" });
});

test("normalizeCaptainTasks tolerates null, missing and malformed input", () => {
  assert.deepEqual(normalizeCaptainTasks(null), emptyCaptainTaskChecklist());
  assert.deepEqual(normalizeCaptainTasks(undefined), emptyCaptainTaskChecklist());
  assert.deepEqual(normalizeCaptainTasks({ pushback: 42 }).pushback, { done: false, answer: "" });
});

test("legacy browser import normalizes old flat-string captain tasks into the checklist shape", () => {
  const store = new Map<string, string>([
    ["hh_teams", JSON.stringify([{ id: "t1", name: "First XI" }])],
    ["hh_players", "[]"],
    ["hh_matches", JSON.stringify([{ id: "m1", teamId: "t1", opponent: "Rivals", date: "2026-01-01", isHome: true }])],
    ["hh_captain_tasks_m1", JSON.stringify({ pushback: "10:00", teas: "" })],
  ]);
  const storage = { getItem: (key: string) => store.get(key) ?? null };
  const result = readLegacy(storage);
  assert.deepEqual(result.captainTasks.m1.pushback, { done: true, answer: "10:00" });
  assert.deepEqual(result.captainTasks.m1.gmsUpdated, { done: false, answer: "" });
});
