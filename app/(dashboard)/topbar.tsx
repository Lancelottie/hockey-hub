"use client";
import Link from "next/link";
import { useTeam } from "@/lib/team-context";
export default function Topbar() {
  const { teams, activeTeam, setActiveTeamId, club } = useTeam();
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
        <span className="role-badge">{club.role.replaceAll("_", " ")}</span>
        <Link href="/teams">All teams</Link>
      </div>
    </div>
  );
}
