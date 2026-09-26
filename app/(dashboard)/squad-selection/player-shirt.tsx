"use client";

import { Shirt, X } from "lucide-react";
import type { Player } from "@/lib/types";
import { GOALKEEPER_COLORS } from "@/lib/kit-colors";

export default function PlayerShirt({
  player,
  outfieldColor,
  onDragStart,
  onRemove,
  style,
}: {
  player: Player;
  outfieldColor: string;
  onDragStart: (event: React.DragEvent) => void;
  onRemove: () => void;
  style?: React.CSSProperties;
}) {
  const shirtColor =
    player.position === "Goalkeeper" && player.goalkeeperKit
      ? GOALKEEPER_COLORS[player.goalkeeperKit]
      : outfieldColor;

  const numberColor = shirtColor === GOALKEEPER_COLORS.yellow ? "#111827" : "#ffffff";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={style}
      className="group flex w-[5.25rem] cursor-grab flex-col items-center gap-1 active:cursor-grabbing"
    >
      <div className="relative flex h-[3.375rem] w-[3.375rem] items-center justify-center">
        <Shirt
          size={54}
          color={shirtColor}
          fill={shirtColor}
          strokeWidth={1.5}
          className="drop-shadow-md"
        />
        {player.number !== null && (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center pt-1.5 text-xs font-bold"
            style={{ color: numberColor }}
          >
            {player.number}
          </span>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--surface-primary)] text-[var(--text-muted)] hover:text-[var(--status-critical)] group-hover:block"
        >
          <X size={12} />
        </button>
      </div>
      <span className="max-w-[5.25rem] truncate text-xs font-bold text-[var(--text-on-dark)] drop-shadow">
        {player.name}
      </span>
    </div>
  );
}
