"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Match } from "@/lib/types";

export default function NewFixtureForm({
  onCreate,
  disabled,
  compact = false,
}: {
  onCreate: (fixture: Omit<Match, "id" | "teamId">) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [isHome, setIsHome] = useState(true);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!opponent.trim()) return;
    onCreate({ opponent: opponent.trim(), date, isHome });
    setOpponent("");
    setDate("");
    setIsHome(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        compact
          ? "grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
          : "flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-primary)] p-4"
      }
    >
      <input
        value={opponent}
        onChange={(event) => setOpponent(event.target.value)}
        placeholder="Opponent"
        aria-label="Opponent"
        maxLength={120}
        className="min-w-0 rounded-xl border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
      />
      <input
        type="datetime-local"
        aria-label="Fixture date and time"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="min-w-0 rounded-xl border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
      />
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm text-[var(--text-primary)]">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={isHome}
            onChange={() => setIsHome(true)}
          />
          Home
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={!isHome}
            onChange={() => setIsHome(false)}
          />
          Away
        </label>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="flex items-center justify-center gap-1 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-on-dark)] transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 md:col-span-2"
      >
        <Plus size={16} />
        Add fixture
      </button>
    </form>
  );
}
