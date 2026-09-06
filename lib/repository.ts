import { isDeepStrictEqual } from "node:util";
import { withFormation } from "./formation";
import { getDb } from "./db";
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
export function listClubs(userId: string): ClubAccess[] {
  return getDb()
    .prepare(
      `SELECT c.id,c.name,m.role FROM clubs c JOIN club_memberships m ON m.club_id=c.id JOIN app_accounts a ON a.user_id=m.user_id WHERE m.user_id=? AND a.status='active' ORDER BY c.name`,
    )
    .all(userId) as ClubAccess[];
}
export function requireClub(userId: string, clubId: string, write = false) {
  const club = listClubs(userId).find((c) => c.id === clubId);
  if (!club || (write && !canManage(club.role)))
    throw new AccessError(403, "You do not have permission for this club.");
  return club;
}
export function readClub(userId: string, clubId: string) {
  const club = requireClub(userId, clubId);
  const db = getDb();
  return db.transaction(() => {
    const data = emptySnapshot();
    data.teams = db
      .prepare("SELECT id,name FROM teams WHERE club_id=? ORDER BY rowid")
      .all(clubId) as Snapshot["teams"];
    for (const row of db.prepare("SELECT team_id,data FROM team_formation_presets WHERE club_id=?").all(clubId) as {team_id: string; data: string}[]) {
      const team = data.teams.find(t => t.id === row.team_id);
      if (team) team.formationPresets = JSON.parse(row.data);
    }
    for (const [table, key] of [
      ["players", "players"],
      ["fixtures", "matches"],
    ] as const) {
      data[key] = (
        db
          .prepare(`SELECT data FROM ${table} WHERE club_id=? ORDER BY rowid`)
          .all(clubId) as { data: string }[]
      ).map((r) => JSON.parse(r.data));
    }
    const docs = db
      .prepare(
        "SELECT fixture_id,kind,data FROM fixture_documents WHERE club_id=?",
      )
      .all(clubId) as {
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
      for (const row of db
        .prepare("SELECT player_id,data FROM assessments WHERE club_id=?")
        .all(clubId) as { player_id: string; data: string }[])
        data.assessments[row.player_id] = JSON.parse(row.data);
    const { revision } = db
      .prepare("SELECT revision FROM clubs WHERE id=?")
      .get(clubId) as { revision: number };
    return { club, data, revision };
  })();
}
export function writeClub(
  userId: string,
  clubId: string,
  revision: number,
  input: unknown,
) {
  const data = snapshotSchema.parse(input);
  const db = getDb();
  return db
    .transaction(() => {
      const club = requireClub(userId, clubId, true);
      const current = readClub(userId, clubId);
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
      db.prepare("DELETE FROM fixture_documents WHERE club_id=?").run(clubId);
      db.prepare("DELETE FROM assessments WHERE club_id=?").run(clubId);
      db.prepare("DELETE FROM players WHERE club_id=?").run(clubId);
      db.prepare("DELETE FROM fixtures WHERE club_id=?").run(clubId);
      for (const t of data.teams)
        db.prepare(
          "INSERT INTO teams(club_id,id,name) VALUES(?,?,?) ON CONFLICT(club_id,id) DO UPDATE SET name=excluded.name",
        ).run(clubId, t.id, t.name);
      db.prepare("DELETE FROM team_formation_presets WHERE club_id=?").run(clubId);
      for (const t of data.teams)
        if (t.formationPresets)
          db.prepare("INSERT INTO team_formation_presets VALUES(?,?,?)").run(clubId, t.id, JSON.stringify(t.formationPresets));
      for (const previous of current.data.teams)
        if (!keptTeams.has(previous.id))
          db.prepare("DELETE FROM teams WHERE club_id=? AND id=?").run(
            clubId,
            previous.id,
          );
      for (const p of data.players)
        db.prepare(
          "INSERT INTO players(club_id,id,team_id,data) VALUES(?,?,?,?)",
        ).run(clubId, p.id, p.teamId, JSON.stringify(p));
      for (const m of data.matches)
        db.prepare(
          "INSERT INTO fixtures(club_id,id,team_id,data) VALUES(?,?,?,?)",
        ).run(clubId, m.id, m.teamId, JSON.stringify(m));
      for (const kind of ["lineups", "captainTasks", "reviews"] as const)
        for (const [id, value] of Object.entries(data[kind]))
          db.prepare("INSERT INTO fixture_documents VALUES(?,?,?,?)").run(
            clubId,
            id,
            kind,
            JSON.stringify(value),
          );
      for (const [id, value] of Object.entries(data.assessments))
        db.prepare("INSERT INTO assessments VALUES(?,?,?)").run(
          clubId,
          id,
          JSON.stringify(value),
        );
      db.prepare("UPDATE clubs SET revision=revision+1 WHERE id=?").run(clubId);
      db.prepare(
        "INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)",
      ).run(userId, clubId, "save");
      return revision + 1;
    })
    .immediate();
}
