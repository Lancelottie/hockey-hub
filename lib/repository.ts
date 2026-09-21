import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { withFormation } from "./formation";
import { normalizeCaptainTasks } from "./captain-tasks";
import { getStore, lockClub } from "./database";
import { canAdmin, canManage, defaultActiveRole, isNorthernHockeyAdmin, roleTeamName, type Role } from "./users";
import { emptySnapshot, snapshotSchema, type Snapshot } from "./validation";
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ClubAccess = { id: string; name: string; role: Role; teamIds: string[] | null; availableRoles: Role[] };
/**
 * A member may hold several roles for the same club (e.g. club_admin and a team captaincy).
 * Exactly one is "active" at a time (see active_roles / switchActiveRole), and every
 * authorization check in this file keys off that single active role — the member's other,
 * unselected roles grant nothing until they explicitly switch to one of them.
 */
export async function listClubs(userId: string): Promise<ClubAccess[]> {
  const rows = (await getStore()
    .prepare(
      `SELECT c.id,c.name,m.role,s.team_ids FROM clubs c JOIN club_memberships m ON m.club_id=c.id JOIN app_accounts a ON a.user_id=m.user_id LEFT JOIN membership_team_access s ON s.user_id=m.user_id AND s.club_id=m.club_id AND s.role=m.role WHERE m.user_id=? AND a.status='active' ORDER BY c.name,m.role`,
    )
    .all(userId)) as { id: string; name: string; role: Role; team_ids: string | null }[];
  const activeRows = (await getStore()
    .prepare("SELECT club_id,role FROM active_roles WHERE user_id=?")
    .all(userId)) as { club_id: string; role: Role }[];
  const activeByClub = new Map(activeRows.map((r) => [r.club_id, r.role]));

  const byClub = new Map<string, { id: string; name: string; roles: { role: Role; team_ids: string | null }[] }>();
  for (const { id, name, role, team_ids } of rows) {
    const entry = byClub.get(id) ?? { id, name, roles: [] };
    entry.roles.push({ role, team_ids });
    byClub.set(id, entry);
  }
  return Promise.all(Array.from(byClub.values()).map(async ({ id, name, roles }) => {
    const availableRoles = roles.map((r) => r.role);
    const requested = activeByClub.get(id);
    const role = requested && availableRoles.includes(requested) ? requested : defaultActiveRole(availableRoles);
    const { team_ids } = roles.find((r) => r.role === role)!;
    let teamIds = team_ids === null ? null : z.array(z.string()).parse(JSON.parse(team_ids));
    const teamName = roleTeamName(role);
    if (teamName) {
      const teams = await getStore().prepare("SELECT id FROM teams WHERE club_id=? AND name=?")
        .all(id, teamName) as { id: string }[];
      // Named roles never become club-wide, even if a scope row is absent or misconfigured.
      // A missing, renamed or ambiguous team grants no access until corrected.
      teamIds = teams.length === 1 && (teamIds === null || teamIds.includes(teams[0].id)) ? [teams[0].id] : [];
    }
    return { id, name, role, teamIds, availableRoles };
  }));
}
export async function requireClub(userId: string, clubId: string, write = false) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club || (write && (!canManage(club.role) || club.teamIds?.length === 0)))
    throw new AccessError(403, "You do not have permission for this club.");
  return club;
}
export async function requireTeamAccess(userId: string, clubId: string, teamId: string, write = false) {
  const club = await requireClub(userId, clubId, write);
  if (club.teamIds !== null && !club.teamIds.includes(teamId))
    throw new AccessError(403, "You do not have permission for this team.");
  return club;
}
/** Restricted to the Northern Hockey Admin role, regardless of canManage/canAdmin. */
export async function requireNorthernAdmin(userId: string, clubId: string) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club || !isNorthernHockeyAdmin(club.role))
    throw new AccessError(403, "This feature is restricted to Northern Hockey Admins.");
  return club;
}
/** A team's own manager/coach/captain, or a club-wide Northern Hockey Admin acting across teams. */
export async function requireTeamManageAccess(userId: string, clubId: string, teamId: string) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club) throw new AccessError(403, "You do not have permission for this club.");
  if (isNorthernHockeyAdmin(club.role)) return club;
  if (!canManage(club.role) || (club.teamIds !== null && !club.teamIds.includes(teamId)))
    throw new AccessError(403, "You do not have permission for this team.");
  return club;
}

function selectTeams(data: Snapshot, teamIds: Set<string>): Snapshot {
  const players = data.players.filter(p => teamIds.has(p.teamId));
  const matches = data.matches.filter(m => teamIds.has(m.teamId));
  const playerIds = new Set(players.map(p => p.id));
  const matchIds = new Set(matches.map(m => m.id));
  return {
    teams: data.teams.filter(t => teamIds.has(t.id)), players, matches,
    lineups: Object.fromEntries(Object.entries(data.lineups).filter(([id]) => matchIds.has(id))),
    captainTasks: Object.fromEntries(Object.entries(data.captainTasks).filter(([id]) => matchIds.has(id))),
    reviews: Object.fromEntries(Object.entries(data.reviews).filter(([id]) => matchIds.has(id))),
    assessments: Object.fromEntries(Object.entries(data.assessments).filter(([id]) => playerIds.has(id))),
  };
}

export async function readClub(userId: string, clubId: string) {
  return getStore().transaction(async () => {
    const club = await requireClub(userId, clubId);
    const result = await readClubData(club);
    if (club.teamIds !== null) result.data = selectTeams(result.data, new Set(club.teamIds));
    return result;
  })();
}

// Internal full snapshot used only after authorization; never return this to a scoped member.
async function readClubData(club: ClubAccess) {
  const clubId = club.id;
  const db = getStore();
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
  // Normalizes the pre-checklist flat-string shape still present in older saved documents.
  for (const [id, tasks] of Object.entries(data.captainTasks))
    data.captainTasks[id] = normalizeCaptainTasks(tasks);
  if (canManage(club.role))
    for (const row of (await db
      .prepare("SELECT player_id,data FROM assessments WHERE club_id=?")
      .all(clubId)) as { player_id: string; data: string }[])
      data.assessments[row.player_id] = JSON.parse(row.data);
  const { revision } = (await db
    .prepare("SELECT revision FROM clubs WHERE id=?")
    .get(clubId)) as { revision: number };
  return { club, data, revision };
}
export async function writeClub(
  userId: string,
  clubId: string,
  revision: number,
  input: unknown,
) {
  let data = snapshotSchema.parse(input);
  const db = getStore();
  return db
    .transaction(async () => {
      await lockClub(clubId);
      const club = (await requireClub(userId, clubId, true));
      const current = await readClubData(club);
      const visible = club.teamIds === null ? current.data : selectTeams(current.data, new Set(club.teamIds));
      if (current.revision !== revision)
        throw new AccessError(
          409,
          "Another user has saved changes. Export your draft, then reload before editing.",
        );
      if (
        (!canAdmin(club.role) || club.teamIds !== null) &&
        JSON.stringify(visible.teams.map(t => ({ id: t.id, name: t.name }))) !== JSON.stringify(data.teams.map(t => ({ id: t.id, name: t.name })))
      )
        throw new AccessError(
          403,
          "Only club administrators can change teams.",
        );
      if (club.teamIds !== null) {
        const allowed = new Set(club.teamIds);
        if (data.teams.some(t => !allowed.has(t.id)))
          throw new AccessError(403, "You do not have permission for this team.");
        const hidden = selectTeams(current.data, new Set(current.data.teams.filter(t => !allowed.has(t.id)).map(t => t.id)));
        const hiddenPlayerIds = new Set(hidden.players.map(p => p.id));
        const hiddenMatchIds = new Set(hidden.matches.map(m => m.id));
        if (data.players.some(p => hiddenPlayerIds.has(p.id)) || data.matches.some(m => hiddenMatchIds.has(m.id)))
          throw new AccessError(403, "You do not have permission for these records.");
        // Preserve all other teams and their documents when the client saves its partial workspace.
        const editedTeams = new Map(data.teams.map(t => [t.id, t]));
        data = snapshotSchema.parse({
          teams: current.data.teams.map(t => editedTeams.get(t.id) ?? t),
          players: [...hidden.players, ...data.players], matches: [...hidden.matches, ...data.matches],
          lineups: { ...hidden.lineups, ...data.lineups },
          captainTasks: { ...hidden.captainTasks, ...data.captainTasks },
          reviews: { ...hidden.reviews, ...data.reviews },
          assessments: { ...hidden.assessments, ...data.assessments },
        });
      }
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
