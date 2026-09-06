"use client";

import { useRef, type DragEvent } from "react";
import type { PitchPlacement, Player } from "@/lib/types";
import PlayerShirt from "./player-shirt";

export default function Pitch({
  players,
  placements,
  isHome,
  onDrop,
  onDragStart,
  onRemove,
}: {
  players: Player[];
  placements: PitchPlacement[];
  isHome: boolean;
  onDrop: (playerId: string, x: number, y: number) => void;
  onDragStart: (event: DragEvent, playerId: string) => void;
  onRemove: (playerId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const playerId = event.dataTransfer.getData("text/plain");
    if (!playerId || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(
      97,
      Math.max(3, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.min(
      95,
      Math.max(5, ((event.clientY - rect.top) / rect.height) * 100),
    );
    onDrop(playerId, x, y);
  }

  function playerById(id: string): Player | undefined {
    return players.find((player) => player.id === id);
  }

  return (
    <div className="min-w-0 flex-1 pr-1">
      <div
        ref={containerRef}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="relative aspect-[842/502] w-full overflow-hidden rounded-[16px] border border-[var(--border-primary)] bg-[#4868ad] shadow-[0_18px_40px_rgba(0,0,0,0.12)]"
        style={{
          backgroundImage: 'url("/hockey-pitch-clean.png")',
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/90">
            Hockey pitch
          </span>
        </div>

        {placements.map((placement) => {
          const player = playerById(placement.playerId);
          if (!player) return null;
          return (
            <PlayerShirt
              key={placement.playerId}
              player={player}
              isHome={isHome}
              onDragStart={(event) => onDragStart(event, placement.playerId)}
              onRemove={() => onRemove(placement.playerId)}
              style={{
                position: "absolute",
                left: `${placement.x}%`,
                top: `${placement.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
