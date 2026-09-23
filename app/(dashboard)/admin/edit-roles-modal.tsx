"use client";
import { useState } from "react";
import { ROLES, roleLabel, type Role } from "@/lib/users";

type MemberSummary = { userId: string; name: string; email: string; roles: Role[] };

export default function EditRolesModal({
  clubId,
  member,
  currentUserId,
  onClose,
  onSaved,
}: {
  clubId: string;
  member: MemberSummary;
  currentUserId: string;
  onClose: () => void;
  onSaved: (members: MemberSummary[]) => void;
}) {
  const [roles, setRoles] = useState<Role[]>(member.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSelf = member.userId === currentUserId;
  const changed = roles.length !== member.roles.length || roles.some((r) => !member.roles.includes(r));

  function toggleRole(role: Role) {
    setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]));
  }

  async function save() {
    setBusy(true);
    setError("");
    const toAdd = roles.filter((r) => !member.roles.includes(r));
    const toRemove = member.roles.filter((r) => !roles.includes(r));
    const changes = [
      ...toAdd.map((role) => ({ role, action: "add" as const })),
      ...toRemove.map((role) => ({ role, action: "remove" as const })),
    ];
    let latestMembers: MemberSummary[] | null = null;
    try {
      for (const change of changes) {
        const response = await fetch("/api/admin/members", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clubId, userId: member.userId, role: change.role, action: change.action }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to update permissions.");
        latestMembers = result.members;
      }
      onSaved(latestMembers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update permissions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-panel" role="dialog" aria-label={`Edit permissions for ${member.name}`} aria-modal="true">
        <h2 className="text-xl font-bold">Edit permissions</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {member.name} · {member.email}
        </p>
        {isSelf && (
          <p className="mt-2 text-sm text-[var(--status-warning)]">
            You can grant yourself an extra role here, but not remove one you already hold.
          </p>
        )}
        <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-primary)] p-3">
          {ROLES.map((role) => {
            const disabled = isSelf && member.roles.includes(role);
            return (
              <li key={role}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent-primary)]"
                    checked={roles.includes(role)}
                    disabled={disabled}
                    onChange={() => toggleRole(role)}
                  />
                  {roleLabel(role)}
                </label>
              </li>
            );
          })}
        </ul>
        {roles.length === 0 && (
          <p className="mt-2 text-sm text-[var(--status-warning)]">
            Saving with no roles selected removes {member.name}&apos;s access to this club.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="rounded border border-[var(--border-primary)] px-4 py-2 text-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button flex-1"
            onClick={() => void save()}
            disabled={busy || !changed}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
