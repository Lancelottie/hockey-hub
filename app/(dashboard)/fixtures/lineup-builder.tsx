"use client";

import { useState } from "react";
import { useTeam } from "@/lib/team-context";
import { loadMatches, saveMatches } from "@/lib/storage";
import type { Match } from "@/lib/types";
import { formatFixtureLabel } from "@/lib/match-format";
import NewFixtureForm from "./new-fixture-form";
import FormationEditor from "./formation-editor";

export default function LineupBuilder({ initialMatchId = null, embedded = false }: {
  initialMatchId?: string | null; embedded?: boolean;
}) {
  const { activeTeam, canWrite } = useTeam();
  const [matches, setMatches] = useState(loadMatches);
  const [chosen, setChosen] = useState(initialMatchId);
  const fixtures = matches.filter(m => m.teamId === activeTeam?.id);
  const match = fixtures.find(m => m.id === chosen) ?? fixtures[0];
  function create(fixture: Omit<Match, "id" | "teamId">) {
    if (!activeTeam || !canWrite) return;
    const next = { ...fixture, id: crypto.randomUUID(), teamId: activeTeam.id };
    saveMatches([...matches, next]);
    setMatches([...matches, next]);
    setChosen(next.id);
  }
  return <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 pb-6">
    {!embedded && <h1 className="text-2xl font-semibold">Build lineup</h1>}
    {(!embedded || !match) && <section className="panel space-y-3">
      <label className="block">Fixture
        <select className="mt-2 block w-full rounded border p-2" value={match?.id ?? ""} onChange={e => setChosen(e.target.value)}>
          {!fixtures.length && <option value="">No fixtures</option>}
          {fixtures.map(m => <option key={m.id} value={m.id}>{formatFixtureLabel(activeTeam?.name ?? "Team", m)}</option>)}
        </select>
      </label>
      {canWrite && <details open={!fixtures.length}><summary>Add a fixture</summary><NewFixtureForm compact disabled={!activeTeam} onCreate={create} /></details>}
    </section>}
    {match && <FormationEditor key={match.id} match={match} />}
  </div>;
}
