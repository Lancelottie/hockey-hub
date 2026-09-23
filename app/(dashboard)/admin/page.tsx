"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/lib/team-context";
import { canAdmin, canManage, isNorthernHockeyAdmin, ROLES, roleLabel, roleTeamName, type Role } from "@/lib/users";
import {
  getSnapshot,
  hasUnsavedChanges,
  loadCaptainTasks,
  loadMatches,
  replaceSnapshot,
  saveTeams,
  exportDraft,
} from "@/lib/storage";
import { CAPTAIN_TASK_KEYS, isCaptainTaskApplicable } from "@/lib/captain-tasks";
import { formatFixtureLabel, formatMatchDateLong, isUpcomingFixture } from "@/lib/match-format";
import { readLegacy } from "@/lib/legacy-import";
import { snapshotSchema, type Snapshot } from "@/lib/validation";
import { ACCESS_REQUEST_LEVEL_LABELS, type AccessRequestLevel } from "@/lib/access-request-levels";
import { SECTION_LABELS, type SectionKey } from "@/lib/team-sections";
import CreateAccountModal from "./create-account-modal";
import EditRolesModal from "./edit-roles-modal";
type Member = { userId: string; name: string; email: string; roles: Role[] };
type AccessRequest = {
  id: string;
  name: string;
  email: string;
  sections: SectionKey[];
  requestedLevels: AccessRequestLevel[];
  createdAt: string;
};
type PlayerLoan = {
  id: string;
  playerName: string;
  fromTeamName: string;
  toTeamName: string;
  opponent: string;
  createdAt: string;
};
export default function AdminPage() {
  const { club, teams, userId } = useTeam();
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [accessRequestsError, setAccessRequestsError] = useState("");
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [creatingAccountFor, setCreatingAccountFor] = useState<AccessRequest | null>(null);
  const [playerLoans, setPlayerLoans] = useState<PlayerLoan[]>([]);
  const [playerLoansError, setPlayerLoansError] = useState("");
  const [acknowledgingLoanId, setAcknowledgingLoanId] = useState<string | null>(null);
  useEffect(() => {
    if (!canAdmin(club.role)) return;
    const controller = new AbortController();
    fetch(`/api/player-loans?clubId=${encodeURIComponent(club.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        setPlayerLoans(result.loans);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setPlayerLoansError(e instanceof Error ? e.message : "Unable to load player loans.");
      });
    return () => controller.abort();
  }, [club.id, club.role]);
  async function acknowledgeLoan(id: string) {
    setAcknowledgingLoanId(id);
    setPlayerLoansError("");
    try {
      const response = await fetch("/api/player-loans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: club.id, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update the loan notice.");
      setPlayerLoans(result.loans);
    } catch (e) {
      setPlayerLoansError(e instanceof Error ? e.message : "Unable to update the loan notice.");
    } finally {
      setAcknowledgingLoanId(null);
    }
  }
  useEffect(() => {
    if (!canAdmin(club.role)) return;
    const controller = new AbortController();
    fetch(`/api/access-requests?clubId=${encodeURIComponent(club.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        setAccessRequests(result.requests);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setAccessRequestsError(e instanceof Error ? e.message : "Unable to load access requests.");
      });
    return () => controller.abort();
  }, [club.id, club.role]);
  async function resolveRequest(id: string) {
    setResolvingRequestId(id);
    setAccessRequestsError("");
    try {
      const response = await fetch("/api/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: club.id, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update the request.");
      setAccessRequests(result.requests);
    } catch (e) {
      setAccessRequestsError(e instanceof Error ? e.message : "Unable to update the request.");
    } finally {
      setResolvingRequestId(null);
    }
  }
  useEffect(() => {
    if (!canAdmin(club.role)) return;
    const controller = new AbortController();
    fetch(`/api/admin/members?clubId=${encodeURIComponent(club.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        setMembers(result.members);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setMembersError(e instanceof Error ? e.message : "Unable to load members.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMembersLoading(false);
      });
    return () => controller.abort();
  }, [club.id, club.role]);
  if (!canAdmin(club.role))
    return (
      <div className="panel">
        <h1 className="text-2xl font-bold">Administration</h1>
        <p>Only club administrators can manage teams and import data.</p>
      </div>
    );
  const teamNameById = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  // Only each team's next scheduled fixture is checked, not every fixture further out.
  const nextMatchByTeam = new Map<string, ReturnType<typeof loadMatches>[number]>();
  for (const match of loadMatches()
    .filter((match) => isUpcomingFixture(match.date))
    .sort((a, b) => a.date.localeCompare(b.date)))
    if (!nextMatchByTeam.has(match.teamId)) nextMatchByTeam.set(match.teamId, match);
  const outstandingByFixture = Array.from(nextMatchByTeam.values())
    .map((match) => ({
      match,
      outstanding: CAPTAIN_TASK_KEYS.filter(
        (key) => isCaptainTaskApplicable(key, match.isHome) && !loadCaptainTasks(match.id)[key].done,
      ),
    }))
    .filter((entry) => entry.outstanding.length > 0)
    .sort((a, b) => a.match.date.localeCompare(b.match.date));
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
      {outstandingByFixture.length > 0 && (
        <section className="rounded-[20px] border border-[var(--status-warning)] bg-[var(--status-warning-light)] p-5">
          <h2 className="text-lg font-bold text-[var(--status-warning)]">
            Outstanding captain tasks
          </h2>
          <p className="mt-1 text-sm text-[var(--status-warning)]">
            These upcoming fixtures still have captain tasks that haven&apos;t been marked done.
          </p>
          <ul className="mt-4 space-y-3">
            {outstandingByFixture.map(({ match, outstanding }) => (
              <li
                key={match.id}
                className="rounded-lg bg-[var(--surface-primary)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {teamNameById[match.teamId] ?? "Unknown team"} ·{" "}
                    {formatFixtureLabel(teamNameById[match.teamId] ?? "Team", match)}
                  </p>
                  <Link
                    href={`/fixtures/${match.id}?tab=captain-tasks&highlight=outstanding`}
                    className="text-sm underline"
                  >
                    Open captain tasks →
                  </Link>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {formatMatchDateLong(match.date)}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {outstanding.length} outstanding {outstanding.length === 1 ? "task" : "tasks"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {accessRequests.length > 0 && (
        <section className="rounded-[20px] border border-[var(--status-warning)] bg-[var(--status-warning-light)] p-5">
          <h2 className="text-lg font-bold text-[var(--status-warning)]">
            Access requests
          </h2>
          <p className="mt-1 text-sm text-[var(--status-warning)]">
            These people have asked to join {club.name}. Create their account, then mark the request done.
          </p>
          <ul className="mt-4 space-y-3">
            {accessRequests.map((request) => (
              <li
                key={request.id}
                className="rounded-lg bg-[var(--surface-primary)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {request.name} · {request.email}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      className="text-sm underline disabled:opacity-55"
                      disabled={resolvingRequestId === request.id}
                      onClick={() => void resolveRequest(request.id)}
                    >
                      Already created? Mark done
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => setCreatingAccountFor(request)}
                    >
                      Create account →
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {request.sections.map((s) => SECTION_LABELS[s]).join(", ")} ·{" "}
                  {request.requestedLevels.map((l) => ACCESS_REQUEST_LEVEL_LABELS[l]).join(", ")}
                </p>
              </li>
            ))}
          </ul>
          {accessRequestsError && (
            <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
              {accessRequestsError}
            </p>
          )}
        </section>
      )}
      {playerLoans.length > 0 && (
        <section className="rounded-[20px] border border-[var(--status-warning)] bg-[var(--status-warning-light)] p-5">
          <h2 className="text-lg font-bold text-[var(--status-warning)]">
            Player loans
          </h2>
          <p className="mt-1 text-sm text-[var(--status-warning)]">
            These players were borrowed from another team for a fixture, outside any pre-arranged pooling.
          </p>
          <ul className="mt-4 space-y-3">
            {playerLoans.map((loan) => (
              <li
                key={loan.id}
                className="rounded-lg bg-[var(--surface-primary)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {loan.playerName} · {loan.fromTeamName} → {loan.toTeamName}
                  </p>
                  <button
                    className="text-sm underline disabled:opacity-55"
                    disabled={acknowledgingLoanId === loan.id}
                    onClick={() => void acknowledgeLoan(loan.id)}
                  >
                    Acknowledge →
                  </button>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  For the fixture vs {loan.opponent}
                </p>
              </li>
            ))}
          </ul>
          {playerLoansError && (
            <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
              {playerLoansError}
            </p>
          )}
        </section>
      )}
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
          Account creation is managed by the deployment operator; contact them
          to add or suspend a member. Your current role is {roleLabel(club.role)}.
        </p>
        <h3 className="mt-5 mb-3 font-semibold">Manage roles</h3>
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          A member may hold more than one role (e.g. a club admin who is also a team
          captain) and switch which is active from the topbar. Edit permissions to
          grant yourself an extra role, but not remove your own. Removing someone&apos;s
          last role removes their access to this club.
        </p>
        {membersLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading members…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-primary)] text-left text-[var(--text-secondary)]">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Current permissions</th>
                  <th className="py-2 pr-0 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b border-[var(--border-primary)] last:border-b-0">
                    <td className="py-3 pr-4 align-top">
                      <p className="font-semibold">
                        {member.name}
                        {member.userId === userId && (
                          <span className="text-[var(--text-secondary)]"> (you)</span>
                        )}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">{member.email}</p>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {member.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--text-primary)]"
                          >
                            {roleLabel(role)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-0 text-right align-top">
                      <button
                        className="text-sm underline"
                        onClick={() => setEditingMember(member)}
                      >
                        Edit permissions →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {membersError && (
          <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
            {membersError}
          </p>
        )}
        <h3 className="mt-5 mb-3 font-semibold">Available roles</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ROLES.map(role => <li key={role} className="rounded-lg border border-[var(--border-primary)] p-3">
            <p className="font-semibold">{roleLabel(role)}</p>
            <p className="text-sm text-[var(--text-secondary)]">{roleTeamName(role)
              ? `Edit players, fixtures, selections and notes for ${roleTeamName(role)} only.`
              : isNorthernHockeyAdmin(role) ? "View all teams; manage England Hockey submissions, registration status and cross-team squad pooling."
              : canAdmin(role) ? "Manage club teams, data and selections."
              : canManage(role) ? "Edit players, fixtures, selections and notes within assigned access."
              : "View team data and published selections within assigned access."}</p>
          </li>)}
        </ul>
      </section>
      {creatingAccountFor && (
        <CreateAccountModal
          clubId={club.id}
          request={creatingAccountFor}
          onClose={() => setCreatingAccountFor(null)}
          onCreated={() => {
            setAccessRequests((current) => current.filter((r) => r.id !== creatingAccountFor.id));
            setCreatingAccountFor(null);
          }}
        />
      )}
      {editingMember && (
        <EditRolesModal
          clubId={club.id}
          member={editingMember}
          currentUserId={userId}
          onClose={() => setEditingMember(null)}
          onSaved={(updatedMembers) => {
            setMembers(updatedMembers);
            setEditingMember(null);
          }}
        />
      )}
    </div>
  );
}
