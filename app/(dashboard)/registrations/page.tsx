"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/lib/team-context";
import { isNorthernHockeyAdmin } from "@/lib/users";

type SubmissionStatus = "not_started" | "in_progress" | "submitted";
type TeamSubmission = {
  teamId: string;
  teamName: string;
  status: SubmissionStatus;
  updatedAt: string | null;
  submittedByName: string | null;
};

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
};

export default function RegistrationsPage() {
  const { club } = useTeam();
  const [submissions, setSubmissions] = useState<TeamSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const allowed = isNorthernHockeyAdmin(club.role);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    fetch(`/api/submissions?clubId=${encodeURIComponent(club.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        setSubmissions(result.submissions);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Unable to load submissions.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [club.id, allowed]);

  if (!allowed)
    return (
      <div className="panel">
        <h1 className="text-2xl font-bold">Registrations</h1>
        <p>Only Northern Hockey Admins can view cross-team submission status.</p>
      </div>
    );

  async function updateStatus(teamId: string, status: SubmissionStatus) {
    setBusyTeamId(teamId);
    setError("");
    const previous = submissions;
    setSubmissions((current) => current.map((s) => (s.teamId === teamId ? { ...s, status } : s)));
    try {
      const response = await fetch("/api/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: club.id, teamId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save status.");
    } catch (e) {
      setSubmissions(previous);
      setError(e instanceof Error ? e.message : "Unable to save status.");
    } finally {
      setBusyTeamId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">NORTHERN HOCKEY ADMIN</p>
          <h1>Registrations</h1>
          <p>Hockey England submission status across all teams in {club.name}.</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-[20px] border border-[var(--border-primary)] bg-[var(--surface-primary)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border-primary)]">
                <th className="px-4 py-3 text-left font-medium">Team</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Last updated</th>
                <th className="px-4 py-3 text-left font-medium">Submitted by</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr
                  key={submission.teamId}
                  className="border-b border-[var(--border-primary)] last:border-b-0"
                >
                  <td className="px-4 py-4 font-medium text-[var(--text-primary)]">
                    {submission.teamName}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={submission.status}
                      disabled={busyTeamId === submission.teamId}
                      onChange={(event) =>
                        void updateStatus(submission.teamId, event.target.value as SubmissionStatus)
                      }
                      className="rounded-lg border border-[var(--border-primary)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    >
                      {(Object.keys(STATUS_LABELS) as SubmissionStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4 text-[var(--text-secondary)]">
                    {submission.updatedAt
                      ? new Date(submission.updatedAt).toLocaleString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-4 text-[var(--text-secondary)]">
                    {submission.submittedByName ?? "—"}
                  </td>
                </tr>
              ))}
              {!loading && submissions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                    No teams yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}
