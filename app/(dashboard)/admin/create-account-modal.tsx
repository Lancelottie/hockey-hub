"use client";
import { useState, type FormEvent } from "react";
import { ROLES, roleLabel, type Role } from "@/lib/users";
import { SECTION_LABELS, type SectionKey } from "@/lib/team-sections";
import { ACCESS_REQUEST_LEVEL_LABELS, type AccessRequestLevel } from "@/lib/access-request-levels";

type AccessRequestSummary = {
  id: string;
  name: string;
  email: string;
  sections: SectionKey[];
  requestedLevels: AccessRequestLevel[];
};

// "coach"/"admin" map cleanly onto a single role; "captain"/"vice_captain" don't, since the
// request only records a section (Ladies/Mens/Juniors), not which specific team within it —
// those are left for the admin to hand-pick from the full role list below.
function suggestedRoles(levels: AccessRequestLevel[]): Role[] {
  const roles: Role[] = [];
  if (levels.includes("admin")) roles.push("club_admin");
  if (levels.includes("coach")) roles.push("coach");
  return roles;
}

export default function CreateAccountModal({
  clubId,
  request,
  onClose,
  onCreated,
}: {
  clubId: string;
  request: AccessRequestSummary;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(request.name);
  const [email, setEmail] = useState(request.email);
  const [roles, setRoles] = useState<Role[]>(() => suggestedRoles(request.requestedLevels));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleRole(role: Role) {
    setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, name, email, roles, accessRequestId: request.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create the account.");
      setPassword(result.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create the account.");
    } finally {
      setBusy(false);
    }
  }

  const needsManualPick = request.requestedLevels.filter((l) => l === "captain" || l === "vice_captain");

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !password) onClose();
      }}
    >
      <div className="modal-panel" role="dialog" aria-label="Create account" aria-modal="true">
        {password ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Account created</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Share this password with {name} some other way — there&apos;s no email sending set
              up, and it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
                {password}
              </code>
              <button
                type="button"
                className="rounded border border-[var(--border-primary)] px-3 py-2 text-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(password);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button type="button" className="primary-button w-full" onClick={onCreated}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-xl font-bold">Create account</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              They asked for: {request.sections.map((s) => SECTION_LABELS[s]).join(", ")} ·{" "}
              {request.requestedLevels.map((l) => ACCESS_REQUEST_LEVEL_LABELS[l]).join(", ")}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Name</span>
              <input
                className="w-full rounded-lg border border-[var(--border-primary)] px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Email</span>
              <input
                type="email"
                className="w-full rounded-lg border border-[var(--border-primary)] px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </label>
            <div>
              <span className="mb-2 block text-sm font-semibold">Roles to grant</span>
              {needsManualPick.length > 0 && (
                <p className="mb-2 text-sm text-[var(--status-warning)]">
                  They also asked to be{" "}
                  {needsManualPick.map((l) => ACCESS_REQUEST_LEVEL_LABELS[l]).join(" / ")} — pick
                  the specific team role below (e.g. Ladies 1 Captain). It can&apos;t be guessed
                  from the section alone.
                </p>
              )}
              <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-primary)] p-3">
                {ROLES.map((role) => (
                  <li key={role}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent-primary)]"
                        checked={roles.includes(role)}
                        onChange={() => toggleRole(role)}
                      />
                      {roleLabel(role)}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            {error && (
              <p role="alert" className="text-sm text-[var(--status-critical)]">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                className="rounded border border-[var(--border-primary)] px-4 py-2 text-sm"
                onClick={onClose}
              >
                Cancel
              </button>
              <button className="primary-button flex-1" disabled={busy || roles.length === 0}>
                {busy ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
