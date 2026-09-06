"use client";

import { useState, type FormEvent } from "react";
import { Plus, Shirt } from "lucide-react";
import { GOALKEEPER_COLORS, GOALKEEPER_KITS } from "@/lib/kit-colors";
import type { GoalkeeperKit, Player, PlayerPosition, Team } from "@/lib/types";

const POSITIONS: PlayerPosition[] = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
];

export default function NewPlayerForm({
  disabled,
  onCreate,
  compact = false,
  teamOptions = [],
  defaultTeamId = null,
  teamLabel = (team) => team.name,
}: {
  disabled: boolean;
  onCreate: (player: Omit<Player, "id">) => void;
  compact?: boolean;
  teamOptions?: Team[];
  defaultTeamId?: string | null;
  teamLabel?: (team: Team) => string;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState<PlayerPosition>("Midfielder");
  const [goalkeeperKit, setGoalkeeperKit] = useState<GoalkeeperKit>("yellow");
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedNumber = number.trim();
    const parsedNumber =
      trimmedNumber === "" ? null : Number.parseInt(trimmedNumber, 10);
    const resolvedTeamId = teamOptions.length > 0 ? teamId : defaultTeamId;
    if (
      !trimmedName ||
      (trimmedNumber !== "" && !Number.isFinite(parsedNumber)) ||
      !resolvedTeamId
    ) {
      return;
    }

    onCreate({
      teamId: resolvedTeamId,
      name: trimmedName,
      number: parsedNumber,
      position,
      goalkeeperKit: position === "Goalkeeper" ? goalkeeperKit : undefined,
    });
    setName("");
    setNumber("");
    setPosition("Midfielder");
    setGoalkeeperKit("yellow");
    setTeamId(defaultTeamId ?? teamOptions[0]?.id ?? "");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <div className="flex min-w-0 gap-2 md:flex-[2_1_240px]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
        <input
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="No."
          inputMode="numeric"
          className="w-16 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>
      {teamOptions.length > 0 && (
        <select
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          className="min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] md:flex-[1_1_140px]"
        >
          {teamOptions.map((team) => (
            <option key={team.id} value={team.id}>
              {teamLabel(team)}
            </option>
          ))}
        </select>
      )}
      <div className="flex min-w-0 gap-2 md:flex-[1_1_240px]">
        <select
          value={position}
          onChange={(event) =>
            setPosition(event.target.value as PlayerPosition)
          }
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        >
          {POSITIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={disabled}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-sm font-medium text-[var(--text-on-dark)] transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
        >
          <Plus size={16} />
          {compact ? "Add player" : "Add"}
        </button>
      </div>

      {position === "Goalkeeper" && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2">
          <span className="text-xs text-[var(--text-secondary)]">
            Keeper top
          </span>
          {GOALKEEPER_KITS.map((kit) => (
            <button
              key={kit}
              type="button"
              onClick={() => setGoalkeeperKit(kit)}
              aria-label={`${kit} kit`}
              aria-pressed={goalkeeperKit === kit}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-colors"
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
  );
}
