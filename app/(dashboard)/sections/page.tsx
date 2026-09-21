"use client";
import { useRouter } from "next/navigation";
import type { Team } from "@/lib/types";
import { useTeam } from "@/lib/team-context";
import { SECTION_KEYS, SECTION_LABELS, sectionKey, type SectionKey } from "@/lib/team-sections";
import { currentSeasonLabel } from "@/lib/season";

export default function SectionsPage() {
  const router = useRouter();
  const { teams, setActiveTeamId, club } = useTeam();

  const teamsBySection = new Map<SectionKey, Team[]>();
  for (const team of teams) {
    const key = sectionKey(team.name);
    if (!key) continue;
    const list = teamsBySection.get(key) ?? [];
    list.push(team);
    teamsBySection.set(key, list);
  }
  const anyEligible = SECTION_KEYS.some(
    (key) => (teamsBySection.get(key)?.length ?? 0) > 0,
  );

  function openSection(sectionTeams: Team[]) {
    const first = sectionTeams[0];
    if (!first) return;
    setActiveTeamId(first.id);
    router.push("/home");
  }

  return (
    <div className="space-y-7">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {club.name.toUpperCase()} / {currentSeasonLabel()} SEASON
          </p>
          <h1>Choose your section</h1>
          <p>Pick the section you want to manage or follow.</p>
        </div>
      </div>
      {!anyEligible && (
        <div className="panel empty-state">
          <h2>You haven&apos;t been assigned to a team yet</h2>
          <p>
            Once a club administrator adds you to a team, its section will
            appear here as selectable.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {SECTION_KEYS.map((key) => {
          const sectionTeams = teamsBySection.get(key) ?? [];
          const eligible = sectionTeams.length > 0;
          return (
            <button
              key={key}
              type="button"
              className="section-card"
              disabled={!eligible}
              title={eligible ? undefined : "Not a member of this section"}
              onClick={() => openSection(sectionTeams)}
            >
              <strong>{SECTION_LABELS[key]}</strong>
              <span>
                {eligible
                  ? `${sectionTeams.length} ${sectionTeams.length === 1 ? "team" : "teams"}`
                  : "Not a member of this section"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
