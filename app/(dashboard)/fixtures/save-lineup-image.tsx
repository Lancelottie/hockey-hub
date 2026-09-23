"use client";
import { useState } from "react";
import { renderLineupImage } from "@/lib/lineup-image";
import type { Formation, Lineup, Match, Player } from "@/lib/types";

export default function SaveLineupImage({
  teamName,
  match,
  formation,
  lineup,
  players,
}: {
  teamName: string;
  match: Match;
  formation: Formation;
  lineup: Lineup;
  players: Player[];
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setBusy(true);
    setError("");
    try {
      setImageUrl(await renderLineupImage({ teamName, match, formation, lineup, players }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="rounded border border-[var(--border-primary)] px-4 py-2 text-sm font-medium" onClick={() => void open()} disabled={busy}>
        {busy ? "Preparing image…" : "Save image"}
      </button>
      {error && <p role="alert" className="text-sm text-[var(--status-critical)]">{error}</p>}
      {imageUrl && (
        <div className="modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setImageUrl(null); }}>
          <div className="modal-panel" role="dialog" aria-label="Lineup image" aria-modal="true">
            <h2 className="text-xl font-bold">Lineup image</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              On your phone, press and hold the image below and choose “Save to Photos”.
            </p>
            {/* A real <img>, not the canvas, so mobile browsers offer their native save-to-photos action on long-press. */}
            <img src={imageUrl} alt={`${teamName} lineup`} className="mt-4 w-full rounded-lg border border-[var(--border-primary)]" />
            <div className="mt-4 flex flex-wrap gap-3">
              <a className="primary-button" href={imageUrl} download={`${teamName}-lineup.png`}>
                Download
              </a>
              <button type="button" className="rounded border border-[var(--border-primary)] px-4 py-2 text-sm" onClick={() => setImageUrl(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
