"use client";

import { X } from "lucide-react";
import type { Player } from "@/lib/types";

export default function PlayerChip({
  player,
  onDragStart,
  onRemove,
  style,
}: {
  player: Player;
  onDragStart: (event: React.DragEvent) => void;
  onRemove: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={style}
      className="group flex min-w-0 max-w-full cursor-grab items-center gap-1 whitespace-nowrap rounded-full border border-[var(--border-primary)] bg-[var(--surface-primary)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] shadow-sm active:cursor-grabbing"
    >
      <span className="text-[var(--accent-primary)]">
        {player.number ?? "—"}
      </span>
      <span className="min-w-0 truncate" title={player.name}>
        {player.name}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${player.name} from substitutes`}
        className="ml-1 shrink-0 text-[var(--text-muted)] hover:text-[var(--status-critical)]"
      >
        <X size={12} />
      </button>
    </div>
  );
}
