import { isDeepStrictEqual } from "node:util";
import { withFormation } from "./formation";
import { getStore, lockClub } from "./database";
import { canAdmin, canManage, type Role } from "./users";
import { emptySnapshot, snapshotSchema, type Snapshot } from "./validation";
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ClubAccess = { id: string; name: string; role: Role };
export async function listClubs(userId: string): Promise<ClubAccess[]> {
  return (await getStore()
    .prepare(
      `SELECT c.id,c.name,m.role FROM clubs c JOIN club_memberships m ON m.club_id=c.id JOIN app_accounts a ON a.user_id=m.user_id WHERE m.user_id=? AND a.status='active' ORDER BY c.name`,
    )
    .all(userId)) as ClubAccess[];
}
export async function requireClub(userId: string, clubId: string, write = false) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club || (write && !canManage(club.role)))
    throw new AccessError(403, "You do not have permission for this club.");
  return club;
}
export async function readClub(userId: string, clubId: string) {
  const club = (await requireClub(userId, clubId));
  const db = getStore();
  return (await db.transaction(async () => {
    const data = emptySnapshot();
    data.teams = (await db
      .prepare("SELECT id,name FROM teams WHERE club_id=? ORDER BY rowid")
      .all(clubId)) as Snapshot["teams"];
    for (const row of (await db.prepare("SELECT team_id,data FROM team_formation_presets WHERE club_id=?").all(clubId)) as {team_id: string; data: string}[]) {
      const team = data.teams.find(t => t.id === row.team_id);
      if (team) team.formationPresets = JSON.parse(row.data);
    }
    for (const [table, key] of [
      ["players", "players"],
      ["fixtures", "matches"],
    ] as const) {
      data[key] = (
        (await db
          .prepare(`SELECT data FROM ${table} WHERE club_id=? ORDER BY rowid`)
          .all(clubId)) as { data: string }[]
      ).map((r) => JSON.parse(r.data));
    }
    const docs = (await db
      .prepare(
        "SELECT fixture_id,kind,data FROM fixture_documents WHERE club_id=?",
      )
      .all(clubId)) as {
      fixture_id: string;
      kind: "lineups" | "captainTasks" | "reviews";
      data: string;
    }[];
    for (const row of docs)
      if (canManage(club.role) || (row.kind === "lineups" && JSON.parse(row.data).formation?.status !== "draft"))
        data[row.kind][row.fixture_id] = JSON.parse(row.data);
    // Coordinates are derived, including line orientation updates in existing documents.
    for (const [id, lineup] of Object.entries(data.lineups))
      if (lineup.formation) data.lineups[id] = withFormation(lineup, lineup.formation);
    if (canManage(club.role))
      for (const row of (await db
        .prepare("SELECT player_id,data FROM assessments WHERE club_id=?")
        .all(clubId)) as { player_id: string; data: string }[])
        data.assessments[row.player_id] = JSON.parse(row.data);
    const { revision } = (await db
      .prepare("SELECT revision FROM clubs WHERE id=?")
      .get(clubId)) as { revision: number };
    return { club, data, revision };
  })());
}
export async function writeClub(
  userId: string,
  clubId: string,
  revision: number,
  input: unknown,
) {
  const data = snapshotSchema.parse(input);
  const db = getStore();
  return db
    .transaction(async () => {
      await lockClub(clubId);
      const club = (await requireClub(userId, clubId, true));
      const current = (await readClub(userId, clubId));
      if (current.revision !== revision)
        throw new AccessError(
          409,
          "Another user has saved changes. Export your draft, then reload before editing.",
        );
      if (
        !canAdmin(club.role) &&
        JSON.stringify(current.data.teams.map(t => ({ id: t.id, name: t.name }))) !== JSON.stringify(data.teams.map(t => ({ id: t.id, name: t.name })))
      )
        throw new AccessError(
          403,
          "Only club administrators can change teams.",
        );
      // Integration-owned fixtures may only be changed by the sync service.
      // Removing their whole team is still available to club administrators.
      const keptTeams = new Set(data.teams.map((t) => t.id));
      const imported = new Map(
        current.data.matches
          .filter((m) => m.externalSource)
          .map((m) => [m.id, m]),
      );
      for (const previous of imported.values()) {
        if (!keptTeams.has(previous.teamId)) continue;
        const next = data.matches.find((m) => m.id === previous.id);
        if (!next || !isDeepStrictEqual(next, previous))
          throw new AccessError(
            409,
            "Imported fixtures are managed by England Hockey. Reload and use Sync Fixtures to update them.",
          );
      }
      for (const next of data.matches)
        if (next.externalSource && !imported.has(next.id))
          throw new AccessError(
            403,
            "Use the England Hockey integration to import fixtures.",
          );
      (await db.prepare("DELETE FROM fixture_documents WHERE club_id=?").run(clubId));
      (await db.prepare("DELETE FROM assessments WHERE club_id=?").run(clubId));
      (await db.prepare("DELETE FROM players WHERE club_id=?").run(clubId));
      (await db.prepare("DELETE FROM fixtures WHERE club_id=?").run(clubId));
      for (const t of data.teams)
        (await db.prepare(
          "INSERT INTO teams(club_id,id,name) VALUES(?,?,?) ON CONFLICT(club_id,id) DO UPDATE SET name=excluded.name",
        ).run(clubId, t.id, t.name));
      (await db.prepare("DELETE FROM team_formation_presets WHERE club_id=?").run(clubId));
      for (const t of data.teams)
        if (t.formationPresets)
          (await db.prepare("INSERT INTO team_formation_presets VALUES(?,?,?)").run(clubId, t.id, JSON.stringify(t.formationPresets)));
      for (const previous of current.data.teams)
        if (!keptTeams.has(previous.id))
          (await db.prepare("DELETE FROM teams WHERE club_id=? AND id=?").run(
            clubId,
            previous.id,
          ));
      await db.insertRows("players", ["club_id", "id", "team_id", "data"],
        data.players.map(p => [clubId, p.id, p.teamId, JSON.stringify(p)]));
      await db.insertRows("fixtures", ["club_id", "id", "team_id", "data"],
        data.matches.map(m => [clubId, m.id, m.teamId, JSON.stringify(m)]));
      await db.insertRows("fixture_documents", ["club_id", "fixture_id", "kind", "data"],
        (["lineups", "captainTasks", "reviews"] as const).flatMap(kind =>
          Object.entries(data[kind]).map(([id, value]) => [clubId, id, kind, JSON.stringify(value)])));
      await db.insertRows("assessments", ["club_id", "player_id", "data"],
        Object.entries(data.assessments).map(([id, value]) => [clubId, id, JSON.stringify(value)]));
      (await db.prepare("UPDATE clubs SET revision=revision+1 WHERE id=?").run(clubId));
      (await db.prepare(
        "INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)",
      ).run(userId, clubId, "save"));
      return revision + 1;
    })
    .immediate();
}
