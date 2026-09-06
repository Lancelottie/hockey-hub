"use client";
import { useState } from "react";
import { useTeam } from "@/lib/team-context";
import { canAdmin, canManage, ROLES, roleLabel, roleTeamName } from "@/lib/users";
import {
  getSnapshot,
  hasUnsavedChanges,
  replaceSnapshot,
  saveTeams,
  exportDraft,
} from "@/lib/storage";
import { readLegacy } from "@/lib/legacy-import";
import { snapshotSchema, type Snapshot } from "@/lib/validation";
export default function AdminPage() {
  const { club, teams } = useTeam();
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  if (!canAdmin(club.role))
    return (
      <div className="panel">
        <h1 className="text-2xl font-bold">Administration</h1>
        <p>Only club administrators can manage teams and import data.</p>
      </div>
    );
  function addTeam(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTeams([...teams, { id: crypto.randomUUID(), name: trimmed }]);
    setName("");
  }
  function previewLegacy() {
    try {
      setPreview(readLegacy(window.localStorage));
      setMessage("");
    } catch {
      setMessage(
        "Legacy data contains invalid or orphaned records. It has not been changed. Export a backup and correct the references before importing.",
      );
    }
  }
  function backupLegacy() {
    const raw: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("hh_")) raw[key] = localStorage.getItem(key);
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cocaptain-legacy-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importData() {
    const current = getSnapshot();
    if (
      current.teams.length ||
      current.players.length ||
      current.matches.length ||
      hasUnsavedChanges()
    ) {
      setMessage(
        "Import requires an empty club with no pending changes. Create a separate club using the operator command to preserve existing records.",
      );
      return;
    }
    if (preview) {
      replaceSnapshot(preview);
      setPreview(null);
      setMessage(
        "Import submitted. Check the save status above for confirmation.",
      );
    }
  }
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLUB OPERATIONS</p>
          <h1>Administration</h1>
          <p>{club.name}</p>
        </div>
        <button className="primary-button" onClick={exportDraft}>
          Export workspace
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel">
          <h2 className="mb-4 text-xl font-bold">Your teams</h2>
          <ul className="space-y-2">
            {teams.map((t) => (
              <li
                className="rounded-lg bg-[var(--surface-muted)] p-3"
                key={t.id}
              >
                {t.name}
              </li>
            ))}
          </ul>
          <form className="mt-5 flex flex-wrap gap-3" onSubmit={addTeam}>
            <label className="grow">
              <span className="mb-2 block text-sm">New team name</span>
              <input
                className="w-full rounded-lg border border-[var(--border-primary)] p-3"
                maxLength={120}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ladies 1s"
              />
            </label>
            <button className="primary-button self-end">Add team</button>
          </form>
        </section>
        <section className="panel space-y-4">
          <h2 className="text-xl font-bold">Bring your squad with you</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Import into an empty club. Review the contents before assigning them
            to {club.name}. Your original browser data stays untouched.
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="primary-button" onClick={previewLegacy}>
              Review browser data
            </button>
            <button
              className="rounded-lg border p-3 text-sm"
              onClick={backupLegacy}
            >
              Back up browser data
            </button>
          </div>
          <label className="block text-sm">
            Or review a workspace JSON export
            <input
              className="mt-2 block w-full"
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 2_000_000) throw new Error();
                  setPreview(
                    snapshotSchema.parse(JSON.parse(await file.text())),
                  );
                  setMessage("");
                } catch {
                  setPreview(null);
                  setMessage(
                    "The file is invalid or exceeds 2 MB. Nothing was imported.",
                  );
                }
              }}
            />
          </label>
          {preview && (
            <div className="rounded-lg bg-[var(--surface-muted)] p-4">
              <h3 className="font-bold">Import preview</h3>
              <p className="my-3 text-sm">
                {preview.teams.length} teams · {preview.players.length} players
                · {preview.matches.length} fixtures ·{" "}
                {Object.keys(preview.lineups).length} lineups ·{" "}
                {Object.keys(preview.assessments).length} assessments ·{" "}
                {Object.keys(preview.captainTasks).length} checklists ·{" "}
                {Object.keys(preview.reviews).length} reviews
              </p>
              <p className="my-3 text-sm">
                Teams: {preview.teams.map((t) => t.name).join(", ") || "None"}
              </p>
              <button className="primary-button" onClick={importData}>
                Import into {club.name}
              </button>
            </div>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <h2 className="mb-3 text-xl font-bold">People & access</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Account creation and club membership changes are managed by the
          deployment operator. Contact them to add or suspend a member. Your
          current role is {roleLabel(club.role)}.
        </p>
        <h3 className="mt-5 mb-3 font-semibold">Available roles</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ROLES.map(role => <li key={role} className="rounded-lg border border-[var(--border-primary)] p-3">
            <p className="font-semibold">{roleLabel(role)}</p>
            <p className="text-sm text-[var(--text-secondary)]">{roleTeamName(role)
              ? `Edit players, fixtures, selections and notes for ${roleTeamName(role)} only.`
              : canAdmin(role) ? "Manage club teams, data and selections."
              : canManage(role) ? "Edit players, fixtures, selections and notes within assigned access."
              : "View team data and published selections within assigned access."}</p>
          </li>)}
        </ul>
      </section>
    </div>
  );
}
