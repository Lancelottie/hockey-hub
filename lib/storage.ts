"use client";
import type {
  CaptainTaskChecklist,
  Lineup,
  Match,
  PostMatchReview,
  Player,
  PlayerAssessment,
  Team,
} from "./types";
import { withFormation } from "./formation";
import { emptySnapshot, type Snapshot } from "./validation";
let snapshot = emptySnapshot();
let clubId = "";
let revision = 0;
let activeTeamId: string | null = null;
let writable = false;
let saving = false;
let syncing = false;
let dirty = false;
let blocked = false;
let saveMessage = "All changes saved";
const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}
export function subscribeStorage(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function storageStatus() {
  return saveMessage;
}
export function fixtureSyncInProgress() {
  return syncing;
}
export function hasUnsavedChanges() {
  return dirty || saving || blocked || syncing;
}
export function getSnapshot() {
  return structuredClone(snapshot);
}
export function initializeStorage(
  data: Snapshot,
  id: string,
  version: number,
  canWrite: boolean,
) {
  snapshot = structuredClone(data);
  clubId = id;
  revision = version;
  writable = canWrite;
  dirty = false;
  blocked = false;
  saving = false;
  activeTeamId = data.teams[0]?.id ?? null;
  saveMessage = canWrite ? "All changes saved" : "Read-only access";
  notify();
}
export function clearStorage() {
  initializeStorage(emptySnapshot(), "", 0, false);
}
export function replaceSnapshot(data: Snapshot) {
  if (syncing) return;
  if (!writable) return;
  snapshot = structuredClone(data);
  changed();
}
function changed() {
  if (!writable) {
    saveMessage = "You have read-only access.";
    notify();
    return;
  }
  dirty = true;
  saveMessage = blocked
    ? "Changes remain unsaved. Export your draft before reloading."
    : "Saving changes…";
  notify();
  void flush();
}
export async function flush() {
  if (saving || blocked || !dirty) return;
  saving = true;
  dirty = false;
  try {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, revision, data: snapshot }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Save failed.");
    revision = result.revision;
    saveMessage = "All changes saved";
  } catch (error) {
    blocked = true;
    dirty = true;
    saveMessage =
      error instanceof Error
        ? error.message
        : "Save failed. Export your draft before reloading.";
  } finally {
    saving = false;
    notify();
    if (dirty && !blocked) void flush();
  }
}
export function exportDraft() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "cocaptain-draft.json";
  a.click();
  URL.revokeObjectURL(url);
}
function update(fn: () => void) {
  if (syncing) {
    saveMessage = "Wait for fixture synchronisation to finish before editing.";
    notify();
    return;
  }
  if (!writable) {
    saveMessage = "You have read-only access.";
    notify();
    return;
  }
  fn();
  changed();
}
function pruneReferences() {
  const players = new Map(snapshot.players.map((p) => [p.id, p]));
  const matches = new Map(snapshot.matches.map((m) => [m.id, m]));
  for (const docs of [
    snapshot.lineups,
    snapshot.captainTasks,
    snapshot.reviews,
  ])
    for (const id of Object.keys(docs)) if (!matches.has(id)) delete docs[id];
  for (const id of Object.keys(snapshot.assessments))
    if (!players.has(id)) delete snapshot.assessments[id];
  for (const [id, lineup] of Object.entries(snapshot.lineups)) {
    const valid = (pid: string) =>
      players.has(pid) && players.get(pid)?.teamId === matches.get(id)?.teamId;
    if (lineup.formation) {
      const removed = Object.values(lineup.formation.assignments).some(pid => !valid(pid));
      lineup.formation.assignments = Object.fromEntries(Object.entries(lineup.formation.assignments).filter(([, pid]) => valid(pid)));
      if (removed) lineup.formation.status = "draft";
      lineup.placements = withFormation(lineup, lineup.formation).placements;
    }
    lineup.placements = lineup.placements.filter((p) => valid(p.playerId));
    lineup.subs = lineup.subs.map((p) => (p && valid(p) ? p : null));
  }
  for (const [id, review] of Object.entries(snapshot.reviews)) {
    const valid = (pid: string) =>
      players.has(pid) && players.get(pid)?.teamId === matches.get(id)?.teamId;
    for (const pid of Object.keys(review.playerFeedback))
      if (!valid(pid)) delete review.playerFeedback[pid];
    if (!valid(review.womanOfTheMatchPlayerId))
      review.womanOfTheMatchPlayerId = "";
  }
}
export function loadPlayers(): Player[] {
  return structuredClone(snapshot.players);
}
export function savePlayers(players: Player[]) {
  update(() => {
    snapshot.players = structuredClone(players);
    pruneReferences();
  });
}
export function loadMatches(): Match[] {
  return structuredClone(snapshot.matches);
}
export function saveMatches(matches: Match[]) {
  update(() => {
    snapshot.matches = structuredClone(matches);
    pruneReferences();
  });
}
export function loadTeams(): Team[] {
  return structuredClone(snapshot.teams);
}
export function saveTeams(teams: Team[]) {
  update(() => {
    snapshot.teams = structuredClone(teams);
  });
}
export function loadActiveTeamId() {
  return activeTeamId;
}
export function saveActiveTeamId(id: string) {
  activeTeamId = id;
}
export function loadLineup(id: string): Lineup {
  return structuredClone(
    snapshot.lineups[id] ?? { placements: [], subs: [null, null, null, null] },
  );
}
export function saveLineup(id: string, value: Lineup) {
  update(() => {
    snapshot.lineups[id] = structuredClone(value);
  });
}
export function loadCaptainTasks(id: string): CaptainTaskChecklist {
  return structuredClone(
    snapshot.captainTasks[id] ?? {
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
    },
  );
}
export function saveCaptainTasks(id: string, value: CaptainTaskChecklist) {
  update(() => {
    snapshot.captainTasks[id] = structuredClone(value);
  });
}
export function loadPostMatchReview(id: string): PostMatchReview {
  return structuredClone(
    snapshot.reviews[id] ?? {
      ourScore: "",
      oppositionScore: "",
      goalscorers: "",
      assists: "",
      summary: "",
      womanOfTheMatchPlayerId: "",
      playerFeedback: {},
    },
  );
}
export function savePostMatchReview(id: string, value: PostMatchReview) {
  update(() => {
    snapshot.reviews[id] = structuredClone(value);
  });
}
export function loadPlayerAssessments(): Record<string, PlayerAssessment> {
  return structuredClone(snapshot.assessments);
}
export function savePlayerAssessments(value: Record<string, PlayerAssessment>) {
  update(() => {
    snapshot.assessments = structuredClone(value);
  });
}

/** Keep a remote sync and the in-memory revision together; never overwrite an unsaved draft. */
export async function syncTeamFixtures(teamId: string, sourceUrl?: string) {
  if (!writable)
    throw new Error("You do not have permission to sync fixtures.");
  if (hasUnsavedChanges())
    throw new Error(
      "Wait for your changes to save before syncing. If saving failed, export your draft and reload.",
    );
  const startingClub = clubId;
  syncing = true;
  saveMessage = "Syncing England Hockey fixtures…";
  notify();
  try {
    const response = await fetch("/api/england-hockey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId, teamId, sourceUrl, revision }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Fixture sync failed.");
    if (clubId !== startingClub)
      throw new Error("The active club changed. Reload to see your fixtures.");
    snapshot = structuredClone(result.workspace.data);
    revision = result.workspace.revision;
    return result as {
      checked: number;
      added: number;
      updated: number;
      unchanged: number;
      skipped: number;
      source: { sourceUrl: string; teamName: string; lastSyncedAt: string };
    };
  } finally {
    syncing = false;
    saveMessage = writable ? "All changes saved" : "Read-only access";
    notify();
  }
}
