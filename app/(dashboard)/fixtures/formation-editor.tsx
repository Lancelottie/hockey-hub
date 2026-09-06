"use client";

import Link from "next/link";
import { Shirt } from "lucide-react";
import { AWAY_COLOR, GOALKEEPER_COLORS, HOME_COLOR } from "@/lib/kit-colors";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTeam } from "@/lib/team-context";
import { loadLineup, loadPlayers, loadTeams, saveLineup, saveTeams, subscribeStorage, fixtureSyncInProgress } from "@/lib/storage";
import { assignPlayer, BUILTIN_PRESETS, DEFAULT_LINES, eligiblePlayers, generateSlots, lineLabel, playersForSlot, MAX_STARTERS, MAX_SUBS, playerAt, shirtMatches, swapPlayers, validLines, withFormation } from "@/lib/formation";
import type { Lineup, Match } from "@/lib/types";
import Pitch from "../squad-selection/pitch";

export default function FormationEditor({ match }: { match: Match }) {
  const { canWrite } = useTeam();
  const syncing = useSyncExternalStore(subscribeStorage, fixtureSyncInProgress, () => false);
  const editable = canWrite && !syncing;
  const [lineup, setLineup] = useState(() => loadLineup(match.id));
  const [lines, setLines] = useState(lineup.formation?.lines ?? DEFAULT_LINES);
  const [name, setName] = useState(lineup.formation?.name ?? "");
  const [presets, setPresets] = useState(() => loadTeams().find(t => t.id === match.teamId)?.formationPresets ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const numberInput = useRef<HTMLInputElement>(null);
  const players = eligiblePlayers(loadPlayers(), match.teamId);
  const formation = lineup.formation;
  const slots = formation ? generateSlots(formation.lines) : [];
  const allSlots = [...slots, ...Array.from({ length: MAX_SUBS }, (_, i) => ({ id: `sub-${i}`, label: `Substitute ${i + 1}`, x: 0, y: 0 }))];
  const selectedPlayer = players.find(p => p.id === (selected ? playerAt(lineup, selected) : undefined));
  const positionPlayers = showAllPlayers ? players : playersForSlot(players, slots, selected);
  const matches = number ? shirtMatches(positionPlayers, number) : [];
  const count = lines.reduce((a, b) => a + b, 1);
  const configChanged = name !== (formation?.name ?? "") || lines.join() !== (formation?.lines ?? DEFAULT_LINES).join();
  useEffect(() => {
    if (!configChanged) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [configChanged]);

  function persist(next: Lineup) {
    if (!editable) return;
    saveLineup(match.id, next);
    setLineup(next);
  }
  function build(nextLines = lines, nextName = name) {
    if (!editable) return;
    if (!validLines(nextLines)) { setMessage("Use positive whole numbers, with no more than 10 outfield positions."); return; }
    // Preserve all existing starters. Refuse a smaller shape rather than silently dropping players.
    if (lineup.placements.length > nextLines.reduce((a, b) => a + b, 1)) {
      setMessage("Remove starters before reducing the formation below your selected player count."); return;
    }
    const nextSlots = generateSlots(nextLines);
    const assignments: Record<string, string> = {};
    const remaining = lineup.placements.map(p => p.playerId);
    // Match existing starters to their recorded roles before retaining any tactical overrides.
    for (const slot of nextSlots) {
      const index = remaining.findIndex(id => players.find(p => p.id === id)?.position === slot.role);
      if (index >= 0) assignments[slot.id] = remaining.splice(index, 1)[0];
    }
    const emptySlots = nextSlots.filter(slot => !assignments[slot.id]);
    remaining.forEach((id, i) => { assignments[emptySlots[i].id] = id; });
    persist(withFormation(lineup, { lines: nextLines, name: nextName, status: "draft", assignments }));
    setLines(nextLines); setName(nextName); setSelected(null); setSwapFrom(null); setShowAllPlayers(false);
    setMessage(remaining.length ? "Formation built. Some existing players are outside their recorded position; review their slots." : "Formation built. Select a position to start.");
  }
  function choose(slot: string) {
    if (!editable) return;
    if (swapFrom) {
      persist(swapPlayers(lineup, swapFrom, slot));
      setSwapFrom(null); setMessage("Positions exchanged."); return;
    }
    setSelected(slot); setShowAllPlayers(false); setNumber(""); setMessage("");
    requestAnimationFrame(() => numberInput.current?.focus());
  }
  function assign(id: string) {
    if (!selected || !editable || !positionPlayers.some(p => p.id === id)) return;
    try {
      const next = assignPlayer(lineup, selected, id);
      persist(next);
      const index = allSlots.findIndex(s => s.id === selected);
      const following = [...allSlots.slice(index + 1), ...allSlots.slice(0, index)].find(s => !playerAt(next, s.id));
      if (following) { setSelected(following.id); setShowAllPlayers(false); }
      setNumber(""); setMessage(`${players.find(p => p.id === id)?.name} assigned.`);
      requestAnimationFrame(() => numberInput.current?.focus());
    } catch (error) { setMessage((error as Error).message); }
  }
  function savePreset() {
    if (!editable || !validLines(lines)) return;
    const presetName = name.trim() || lines.join("-");
    const next = [...presets.filter(p => p.name !== presetName), { name: presetName, lines }];
    if (next.length > 50) { setMessage("This team already has 50 presets."); return; }
    saveTeams(loadTeams().map(t => t.id === match.teamId ? { ...t, formationPresets: next } : t));
    setPresets(next); setMessage(`Preset “${presetName}” saved for this team.`);
  }
  function slotButton(slot: { id: string; label: string }, onPitch: boolean) {
    const player = players.find(p => p.id === playerAt(lineup, slot.id));
    const shirtColor = slot.id === "gk" ? GOALKEEPER_COLORS[player?.goalkeeperKit ?? "yellow"] : match.isHome ? HOME_COLOR : AWAY_COLOR;
    return <button type="button" data-slot={slot.id} disabled={!editable}
      aria-label={`${slot.label}: ${player ? `${player.name}, number ${player.number ?? "unset"}` : "Empty"}`}
      aria-pressed={selected === slot.id} onClick={() => choose(slot.id)}
      className={`formation-slot ${selected === slot.id || swapFrom === slot.id ? "is-selected" : ""} ${onPitch ? "" : "bench-slot"}`}>
      <span className="formation-number" style={{ color: shirtColor }}><Shirt aria-hidden="true" fill="currentColor" strokeWidth={1.2} /><span style={{ color: shirtColor === GOALKEEPER_COLORS.yellow ? "#142b3f" : "white" }}>{player ? player.number ?? "•" : "+"}</span></span>
      <span className="formation-player">{player ? player.name.split(" ")[0] : slot.id === "gk" ? "GK" : slots.find(s => s.id === slot.id)?.role === "Defender" ? "Defence" : slots.find(s => s.id === slot.id)?.role === "Midfielder" ? "Mid" : slots.find(s => s.id === slot.id)?.role === "Forward" ? "Forward" : "Select"}</span>
    </button>;
  }
  return <section aria-label="Team formation" className="panel min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Team selection · {match.opponent}</h2>
        <p className="text-sm">{formation ? `${formation.name || formation.lines.join("-")} · ${formation.status === "draft" ? "Draft — visible to managers only" : "Published"}` : canWrite ? "Choose your formation" : "No published formation yet."}</p>
      </div>
      {editable && formation && <button className="primary-button" disabled={slots.length !== MAX_STARTERS || lineup.placements.length !== slots.length}
        onClick={() => { persist(withFormation(lineup, { ...formation, status: formation.status === "published" ? "draft" : "published" })); setMessage(""); }}>
        {formation.status === "published" ? "Unpublish team" : "Publish team"}
      </button>}
    </div>
    {editable && <details open={!formation} className="rounded-xl border border-[var(--border-primary)] p-3">
      <summary className="cursor-pointer font-semibold">Formation builder</summary>
      <div className="formation-config">
        <label>Formation preset<select aria-label="Formation preset" className="formation-input" value="" onChange={e => {
          const index = Number(e.target.value);
          const preset = [...BUILTIN_PRESETS.map(lines => ({ lines, name: lines.join("-") })), ...presets][index];
          if (preset) build(preset.lines, preset.name);
        }}><option value="">Custom / choose preset</option>{[...BUILTIN_PRESETS.map(lines => ({ lines, name: lines.join("-") })), ...presets].map((p, i) => <option key={i} value={i}>{p.name}{i >= BUILTIN_PRESETS.length ? " (team)" : ""}</option>)}</select></label>
        <label>Custom name<input maxLength={80} className="formation-input" value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Outfield lines<input type="number" min={1} max={10} className="formation-input w-24" value={lines.length} onChange={e => {
          const count = Number(e.target.value);
          if (Number.isInteger(count) && count >= 1 && count <= 10) setLines(Array.from({ length: count }, (_, i) => lines[i] ?? 1));
        }} /></label>
        {lines.map((n, i) => <label key={i}>{lineLabel(i, lines.length)}<input aria-label={`Line ${i + 1} players`} type="number" min={1} max={10} className="formation-input w-20" value={n || ""} onChange={e => setLines(lines.map((v, j) => i === j ? Number(e.target.value) : v))} /></label>)}
      </div>
      <p className="my-3 text-sm">1 goalkeeper + {count - 1} outfield = {count} starting positions. Read presets from our goal: Defence → Midfield → Forward. Additional lines are midfield lines.</p>
      {count !== MAX_STARTERS && <p role="alert" className="my-2 text-sm">This formation contains {count} positions; standard hockey expects {MAX_STARTERS}. Publishing requires 11 filled positions.</p>}
      <div className="flex flex-wrap gap-3"><button className="primary-button" onClick={() => build()}>Build formation</button><button className="rounded border px-3 py-2" onClick={savePreset}>Save team preset</button></div>
      {configChanged && <p className="mt-2 text-sm">Configuration not applied. Build formation to save these changes to the fixture.</p>}
    </details>}
    {!formation && lineup.placements.length > 0 && <><p>Existing free-position lineup. Build a formation to convert it, keeping selected players.</p><p>Substitutes: {lineup.subs.filter(Boolean).map(id => players.find(p => p.id === id)?.name).join(", ") || "None"}</p><Pitch players={players} placements={lineup.placements} isHome={match.isHome} onDrop={() => {}} onDragStart={e => e.preventDefault()} onRemove={() => {}} /></>}
    {formation && <div className="formation-workspace">
      <div className="min-w-0">
        <div className="formation-direction">Opposition goal ↑</div>
        <div className="formation-pitch-scroll">
        <div className="formation-pitch" data-testid="formation-pitch" style={{ minWidth: formation.lines.length > 5 ? formation.lines.length * 55 : undefined }}>
          <svg viewBox="0 0 978 1608" aria-hidden="true" className="formation-pitch-art">
            <image href="/hockey-pitch-clean.png" width="1608" height="978" transform="translate(0 1608) rotate(-90)" />
          </svg>
          {slots.map(slot => <div key={slot.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.id === "gk" ? 24 : Math.min(24, 85 / formation.lines[Number(slot.id.split("-")[1])])}%` }}>{slotButton(slot, true)}</div>)}
        </div>
        </div>
        <div className="formation-direction">Our goal</div>
        <h3 className="mb-2 mt-4 font-semibold">Substitutes · {lineup.subs.filter(Boolean).length}/{MAX_SUBS}</h3>
        <div className="grid grid-cols-4 gap-2">{allSlots.filter(s => s.id.startsWith("sub-")).map(s => <div key={s.id}>{slotButton(s, false)}</div>)}</div>
      </div>
      <div className="formation-selection-panel space-y-3">
        <h3 className="font-semibold">Choose your players</h3>
        <p className="text-sm">{lineup.placements.length}/{slots.length} starters assigned. Team players · fixture availability has not been recorded.</p>
        {editable && <Link href="/squads" className="block text-sm underline">Manage team players</Link>}
        {editable && <p className="text-sm">Select a pitch or bench position, type a shirt number and press Enter. The next empty position is selected automatically. Editing a published team returns it to draft.</p>}
        {swapFrom && <div role="status">Select a destination to move or swap.<button className="ml-2 underline" onClick={() => setSwapFrom(null)}>Cancel swap</button></div>}
        {selected && editable && <div className="space-y-3 rounded-xl bg-[var(--surface-muted)] p-3">
          <h3 className="font-semibold">{allSlots.find(s => s.id === selected)?.label}</h3>
          {slots.some(s => s.id === selected) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAllPlayers} onChange={e => { setShowAllPlayers(e.target.checked); setMessage(""); }} />Show all positions</label>}
          {!positionPlayers.length && <p className="text-sm">No team players are recorded in this position. Update a player’s position or enable Show all positions.</p>}
          {selectedPlayer && <p>{selectedPlayer.name} · #{selectedPlayer.number ?? "—"}</p>}
          <form onSubmit={e => { e.preventDefault(); if (matches.length === 1) assign(matches[0].id); else setMessage(matches.length ? "Multiple players have this number. Choose a matching player below." : "No matching player in this position has that shirt number. Enable Show all positions to select outside their recorded role."); }}>
            <label>Shirt number<input ref={numberInput} className="formation-input w-full" inputMode="numeric" autoComplete="off" maxLength={3} value={number} onChange={e => setNumber(e.target.value)} /></label>
            <button className="mt-2 rounded border px-3 py-2" type="submit">Assign number</button>
          </form>
          {matches.length > 1 && <div><p className="text-sm">Matching players — select one:</p>{matches.map(p => <button key={p.id} className="block py-2 underline" onClick={() => assign(p.id)}>{p.name} · #{p.number}</button>)}</div>}
          <label>Select player<select id="lineup-player" className="formation-input w-full" value="" onChange={e => assign(e.target.value)}><option value="">Choose a player</option>{positionPlayers.map(p => {
            const occupied = allSlots.find(s => s.id !== selected && playerAt(lineup, s.id) === p.id);
            return <option key={p.id} value={p.id} disabled={!!occupied}>{p.name} · #{p.number ?? "—"}{occupied ? ` — ${occupied.label}` : ""}</option>;
          })}</select></label>
          {selectedPlayer && <div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-2" onClick={() => { persist(assignPlayer(lineup, selected)); setMessage("Player removed."); }}>Remove player</button><button className="rounded border px-3 py-2" onClick={() => setSwapFrom(selected)}>Move / swap</button></div>}
        </div>}
        <p role="status" aria-live="polite" className="text-sm">{message}</p>
      </div>
    </div>}
    {!formation && message && <p role="status">{message}</p>}
  </section>;
}
