"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { GripVertical, Plus, Shirt, Trash2 } from "lucide-react";
import { GOALKEEPER_COLORS, GOALKEEPER_KITS } from "@/lib/kit-colors";
import type { GoalkeeperKit, Player, PlayerPosition } from "@/lib/types";

const POSITIONS: PlayerPosition[] = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
];

function statusLabel(status: "pitch" | "sub" | "unassigned"): string {
  if (status === "pitch") return "On pitch";
  if (status === "sub") return "Sub";
  return "Not selected";
}

export default function RosterList({
  players,
  statusFor,
  onDragStart,
  onCreate,
  onRemove,
  disabled,
}: {
  players: Player[];
  statusFor: (playerId: string) => "pitch" | "sub" | "unassigned";
  onDragStart: (event: DragEvent, playerId: string) => void;
  onCreate: (player: Omit<Player, "id" | "teamId">) => void;
  onRemove: (playerId: string) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState<PlayerPosition>("Midfielder");
  const [goalkeeperKit, setGoalkeeperKit] = useState<GoalkeeperKit>("yellow");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedNumber = number.trim();
    const parsedNumber =
      trimmedNumber === "" ? null : Number.parseInt(trimmedNumber, 10);
    if (
      !trimmedName ||
      (trimmedNumber !== "" && !Number.isFinite(parsedNumber))
    ) {
      return;
    }

    onCreate({
      name: trimmedName,
      number: parsedNumber,
      position,
      goalkeeperKit: position === "Goalkeeper" ? goalkeeperKit : undefined,
    });
    setName("");
    setNumber("");
    setPosition("Midfielder");
    setGoalkeeperKit("yellow");
  }

  return (
    <section
      className="min-w-0 overflow-hidden rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] shadow-sm"
      aria-label="Squad players"
    >
      <div className="border-b border-[var(--border-primary)] bg-[var(--surface-muted)] px-5 py-4">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--text-primary)]">
          Players
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Add players below, then drag them onto the pitch or choose them using
          the selection controls.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 border-b border-[var(--border-primary)] p-4"
      >
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          New player
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-3">
          <label className="min-w-0 text-xs text-[var(--text-secondary)]">
            Player name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Player name"
              disabled={disabled}
              className="mt-1 block w-full min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />
          </label>
          <label className="min-w-0 text-xs text-[var(--text-secondary)]">
            Shirt no.
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="7"
              inputMode="numeric"
              disabled={disabled}
              className="mt-1 block w-full min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />
          </label>
        </div>
        <div className="grid items-end gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
          <label className="min-w-0 text-xs text-[var(--text-secondary)]">
            Position
            <select
              value={position}
              onChange={(event) =>
                setPosition(event.target.value as PlayerPosition)
              }
              disabled={disabled}
              className="mt-1 block w-full min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            >
              {POSITIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--text-on-dark)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
          >
            <Plus size={16} className="shrink-0" /> Add player
          </button>
        </div>
        {position === "Goalkeeper" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">
              Keeper top
            </span>
            {GOALKEEPER_KITS.map((kit) => (
              <button
                key={kit}
                type="button"
                disabled={disabled}
                onClick={() => setGoalkeeperKit(kit)}
                aria-label={`${kit} keeper top`}
                aria-pressed={goalkeeperKit === kit}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 transition-colors"
                style={{
                  backgroundColor: "var(--surface-primary)",
                  borderColor:
                    goalkeeperKit === kit
                      ? "var(--accent-primary)"
                      : "var(--border-primary)",
                }}
              >
                <Shirt
                  size={20}
                  color={GOALKEEPER_COLORS[kit]}
                  fill={GOALKEEPER_COLORS[kit]}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
        )}
      </form>

      <ul className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--border-primary)]">
        {players.map((player) => (
          <li
            key={player.id}
            draggable
            onDragStart={(event) => onDragStart(event, player.id)}
            className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--surface-muted)]"
          >
            <GripVertical
              size={16}
              aria-hidden="true"
              className="shrink-0 cursor-grab text-[var(--text-muted)]"
            />
            <div className="min-w-0 flex-1 basis-36">
              <p className="break-words text-sm font-semibold text-[var(--text-primary)]">
                <span className="mr-2 text-[var(--accent-primary)]">
                  {player.number ?? "—"}
                </span>
                {player.name}
              </p>
              <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                {player.position}
                {player.position === "Goalkeeper" && player.goalkeeperKit && (
                  <Shirt
                    size={14}
                    aria-hidden="true"
                    color={GOALKEEPER_COLORS[player.goalkeeperKit]}
                    fill={GOALKEEPER_COLORS[player.goalkeeperKit]}
                    className="shrink-0"
                  />
                )}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="whitespace-nowrap rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
                {statusLabel(statusFor(player.id))}
              </span>
              <button
                type="button"
                onClick={() => onRemove(player.id)}
                aria-label={`Remove ${player.name}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--status-critical-light)] hover:text-[var(--status-critical)]"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {players.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          No players added yet.
        </p>
      )}
    </section>
  );
}
