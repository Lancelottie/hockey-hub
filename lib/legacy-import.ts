import { emptySnapshot, snapshotSchema, type Snapshot } from "./validation";
// Read only: never clear, seed or reassign records in the old browser store.
export function readLegacy(storage: Pick<Storage, "getItem">): Snapshot {
  const read = (key: string, fallback: unknown) => {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  };
  const data = emptySnapshot();
  data.teams = read("hh_teams", []) as Snapshot["teams"];
  data.players = read("hh_players", []) as Snapshot["players"];
  data.matches = read("hh_matches", []) as Snapshot["matches"];
  data.assessments = read(
    "hh_player_assessments",
    {},
  ) as Snapshot["assessments"];
  for (const fixture of data.matches) {
    for (const [key, prefix] of [
      ["lineups", "hh_lineup_"],
      ["captainTasks", "hh_captain_tasks_"],
      ["reviews", "hh_post_match_"],
    ] as const) {
      const value = read(prefix + fixture.id, null);
      if (value !== null)
        data[key][fixture.id] = (
          key === "captainTasks" ? { umpires: "", ...(value as object) } : value
        ) as never;
    }
  }
  return snapshotSchema.parse(data);
}
