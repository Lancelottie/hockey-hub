import type { Formation, Lineup, Player, PlayerPosition } from "./types";

export const MAX_STARTERS = 11;
export const MAX_SUBS = 4;
export const DEFAULT_LINES = [3, 4, 3];
export const BUILTIN_PRESETS: { name: string; lines: number[] }[] = [
  { name: "4-3-3", lines: [4, 3, 3] },
  { name: "3-4-3", lines: [3, 4, 3] },
  { name: "3-3-4", lines: [3, 3, 4] },
  { name: "4-4-2", lines: [4, 4, 2] },
  { name: "4-1-4-1", lines: [4, 1, 4, 1] },
  { name: "Legend", lines: [3, 2, 2, 1, 2] },
];
export type FormationSlot = { id: string; label: string; role: PlayerPosition; x: number; y: number };

export function validLines(lines: number[]) {
  return lines.length >= 1 && lines.length <= 10 &&
    lines.every(n => Number.isInteger(n) && n >= 1) &&
    lines.reduce((a, b) => a + b, 0) < MAX_STARTERS;
}
export function lineRole(lineIndex: number, lineCount: number): PlayerPosition {
  if (lineCount === 1) return "Midfielder";
  if (lineIndex === 0) return "Defender";
  if (lineIndex === lineCount - 1) return "Forward";
  return "Midfielder";
}
export function lineLabel(lineIndex: number, lineCount: number) {
  const role = lineRole(lineIndex, lineCount);
  if (role === "Defender") return "Defence";
  if (role === "Forward") return "Forward";
  return lineCount > 3 ? `Midfield ${lineIndex}` : "Midfield";
}
export function playersForSlot(players: Player[], slots: FormationSlot[], slotId: string | null) {
  const role = slots.find(slot => slot.id === slotId)?.role;
  return role ? players.filter(player => player.position === role) : players;
}

export function generateSlots(lines: number[]): FormationSlot[] {
  if (!validLines(lines)) throw new Error("Use 1–10 lines with 1–10 outfield players in total.");
  return [
    ...lines.flatMap((count, line) => Array.from({ length: count }, (_, position) => ({
      id: `line-${line}-${position}`,
      label: `${lineLabel(line, lines.length)}, position ${position + 1}`,
      role: lineRole(line, lines.length),
      x: 5 + 90 * (position + 1) / (count + 1),
      y: lines.length === 1 ? 45 : 74 - 60 * line / (lines.length - 1),
    }))),
    { id: "gk", label: "Goalkeeper", role: "Goalkeeper", x: 50, y: 89 },
  ];
}
// Keep the existing placements representation for existing consumers and exports.
export function withFormation(lineup: Lineup, formation: Formation): Lineup {
  return {
    ...lineup, formation,
    placements: generateSlots(formation.lines).flatMap(slot => {
      const playerId = formation.assignments[slot.id];
      return playerId ? [{ playerId, x: slot.x, y: slot.y }] : [];
    }),
  };
}
export function eligiblePlayers(players: Player[], teamId: string, squadIds?: string[], availableIds?: string[], extraTeamIds?: string[]) {
  const restriction = squadIds ?? availableIds;
  const teamIds = new Set([teamId, ...(extraTeamIds ?? [])]);
  return players.filter(p => teamIds.has(p.teamId) && (!restriction || restriction.includes(p.id)));
}
export function shirtMatches(players: Player[], value: string) {
  return /^\d{1,3}$/.test(value.trim())
    ? players.filter(p => p.number === Number(value.trim())) : [];
}
export function playerAt(lineup: Lineup, slot: string): string | undefined {
  return slot.startsWith("sub-") ? lineup.subs[Number(slot.slice(4))] ?? undefined : lineup.formation?.assignments[slot];
}
export function assignPlayer(lineup: Lineup, slot: string, playerId?: string): Lineup {
  if (!lineup.formation) throw new Error("Build a formation first.");
  const slots = [...generateSlots(lineup.formation.lines).map(s => s.id), ...Array.from({ length: MAX_SUBS }, (_, i) => `sub-${i}`)];
  if (!slots.includes(slot)) throw new Error("Unknown position.");
  const occupied = playerId && slots.find(s => s !== slot && playerAt(lineup, s) === playerId);
  if (occupied) throw new Error(`Player is already selected at ${occupied}. Use Move / swap.`);
  const next = structuredClone(lineup);
  if (slot.startsWith("sub-")) next.subs[Number(slot.slice(4))] = playerId ?? null;
  else if (playerId) next.formation!.assignments[slot] = playerId;
  else delete next.formation!.assignments[slot];
  return withFormation(next, { ...next.formation!, status: "draft" });
}
export function swapPlayers(lineup: Lineup, from: string, to: string) {
  const first = playerAt(lineup, from), second = playerAt(lineup, to);
  let next = assignPlayer(assignPlayer(lineup, from), to);
  next = assignPlayer(next, from, second);
  return assignPlayer(next, to, first);
}
