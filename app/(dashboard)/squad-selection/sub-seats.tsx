"use client";

import type { DragEvent } from "react";
import type { Player } from "@/lib/types";
import PlayerChip from "./player-chip";

export default function SubSeats({
  players,
  subs,
  onDrop,
  onDragStart,
  onRemove,
}: {
  players: Player[];
  subs: (string | null)[];
  onDrop: (playerId: string, seatIndex: number) => void;
  onDragStart: (event: DragEvent, playerId: string) => void;
  onRemove: (playerId: string) => void;
}) {
  function playerById(id: string): Player | undefined {
    return players.find((player) => player.id === id);
  }

  function handleDrop(event: DragEvent, seatIndex: number) {
    event.preventDefault();
    const playerId = event.dataTransfer.getData("text/plain");
    if (playerId) onDrop(playerId, seatIndex);
  }

  return (
    <div className="flex min-w-0 w-full flex-col gap-3">
      <div>
        <h3 className="font-[family-name:var(--font-heading)] text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Subs
        </h3>
        <p className="text-xs text-[var(--text-muted)]">4 seats</p>
      </div>
      <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
        {subs.map((playerId, index) => {
          const player = playerId ? playerById(playerId) : undefined;
          return (
            <div
              key={index}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, index)}
              className="flex min-w-0 h-[4.35rem] items-center justify-center rounded-[14px] border border-dashed border-[var(--border-primary)] bg-[var(--surface-muted)] px-3"
            >
              {player ? (
                <PlayerChip
                  player={player}
                  onDragStart={(event) => onDragStart(event, player.id)}
                  onRemove={() => onRemove(player.id)}
                />
              ) : (
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  Sub {index + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
