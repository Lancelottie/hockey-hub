"use client";
import Link from "next/link";
import { roleLabel, type Role } from "@/lib/users";
import { useTeam } from "@/lib/team-context";
export default function Topbar() {
  const { teams, activeTeam, setActiveTeamId, club, switchRole } = useTeam();
  return (
    <div className="team-bar">
      <div>
        <span className="context-label">YOUR TEAM</span>
        <label>
          <span className="sr-only">Active team</span>
          <select
            value={activeTeam?.id ?? ""}
            onChange={(e) => setActiveTeamId(e.target.value)}
          >
            {teams.length ? (
              teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            ) : (
              <option value="">No teams yet</option>
            )}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {club.availableRoles.length > 1 ? (
          <label>
            <span className="sr-only">Acting as</span>
            <select
              className="role-badge"
              value={club.role}
              onChange={(e) => switchRole(e.target.value as Role)}
            >
              {club.availableRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="role-badge">{roleLabel(club.role)}</span>
        )}
        <Link href="/teams">All teams</Link>
      </div>
    </div>
  );
}
