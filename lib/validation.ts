import { z } from "zod";
import { generateSlots, requiredSlots, validLines, withFormation } from "./formation";
import { sameSection } from "./team-sections";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().max(10000);
const record = <T extends z.ZodType>(schema: T) => z.record(id, schema);
const player = z
  .object({
    id,
    teamId: id,
    name: z.string().trim().min(1).max(120),
    number: z.number().int().min(0).max(999).nullable(),
    position: z.enum(["Goalkeeper", "Defender", "Midfielder", "Forward"]),
    goalkeeperKit: z.enum(["yellow", "black", "purple"]).optional(),
  })
  .strict();
const match = z
  .object({
    id,
    teamId: id,
    opponent: z.string().trim().min(1).max(120),
    date: z
      .string()
      .max(40)
      .refine(
        (v) =>
          v === "" ||
          (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(v) &&
            Number.isFinite(Date.parse(v))),
      ),
    isHome: z.boolean(),
    externalSource: z.literal("england-hockey").optional(),
    externalKey: z.string().max(1200).optional(),
    externalFixtureId: z.string().max(1000).optional(),
    externalTeamId: z.string().max(1000).optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    homeTeam: z.string().max(120).optional(),
    awayTeam: z.string().max(120).optional(),
    venue: z.string().max(1000).optional(),
    competition: z.string().max(1000).optional(),
    status: z.string().max(1000).optional(),
    sourceUrl: z.string().max(500).optional(),
    lastSyncedAt: z.iso.datetime().optional(),
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  })
  .strict();
const lineStructure = z.array(z.number().int().min(1).max(10)).min(1).max(10).refine(validLines, "Maximum 10 outfield positions");
const preset = z.object({ name: z.string().trim().min(1).max(80), lines: lineStructure }).strict();
const formation = z.object({
  name: z.string().max(80),
  lines: lineStructure,
  status: z.enum(["draft", "published"]),
  assignments: record(id),
  noKeeper: z.boolean().optional(),
}).strict();
const lineup = z
  .object({
    formation: formation.optional(),
    placements: z
      .array(
        z
          .object({
            playerId: id,
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
          })
          .strict(),
      )
      .max(11),
    subs: z.array(id.nullable()).max(4),
  })
  .strict();
const captainTask = z.object({ done: z.boolean(), answer: text }).strict();
const tasks = z
  .object({
    pushback: captainTask,
    warmupStart: captainTask,
    northernKit: captainTask,
    oppositionKit: captainTask,
    teas: captainTask,
    lifts: captainTask,
    notable: captainTask,
    keepersKit: captainTask,
    firstAidKit: captainTask,
    awayBalls: captainTask,
    umpires: captainTask,
    gmsUpdated: captainTask,
  })
  .strict();
const review = z
  .object({
    ourScore: text,
    oppositionScore: text,
    goalscorers: text,
    assists: text,
    summary: text,
    womanOfTheMatchPlayerId: z.union([id, z.literal("")]),
    playerFeedback: record(text),
  })
  .strict();
const score = z.number().int().min(1).max(5);
const assessment = z
  .object({
    attending: z.boolean(),
    fitness: score,
    passingBall: score,
    receivingBall: score,
    defending: score,
    attackingPlay: score,
    transition: score,
    attitudeCommitment: score,
    teamworkCommunication: score,
    lastSeasonTeam: z.enum(["1s", "2s", "Development"]),
  })
  .strict();
// Shape-only: field types and per-record constraints, without the cross-record referential
// checks below. Used to parse a team-scoped member's own-team-only submission before it has
// been merged with the other teams' server-held data (see writeClub) — at that point players
// loaned in from another team aren't resolvable yet, so the full schema would reject it.
export const snapshotShape = z
  .object({
    teams: z
      .array(z.object({ id, name: z.string().trim().min(1).max(120), formationPresets: z.array(preset).max(50).optional() }).strict())
      .max(100),
    players: z.array(player).max(3000),
    matches: z.array(match).max(3000),
    lineups: record(lineup),
    captainTasks: record(tasks),
    reviews: record(review),
    assessments: record(assessment),
  })
  .strict();
export const snapshotSchema = snapshotShape
  .superRefine((data, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    for (const rows of [data.teams, data.players, data.matches])
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        fail("Duplicate record ID");
    const teams = new Set(data.teams.map((t) => t.id));
    const players = new Map(data.players.map((p) => [p.id, p]));
    const matches = new Map(data.matches.map((m) => [m.id, m]));
    for (const row of [...data.players, ...data.matches])
      if (!teams.has(row.teamId)) fail("Unknown team");
    for (const key of Object.keys(data.assessments))
      if (!players.has(key)) fail("Unknown assessed player");
    for (const docs of [data.lineups, data.captainTasks, data.reviews])
      for (const key of Object.keys(docs))
        if (!matches.has(key)) fail("Unknown fixture");
    for (const [key, value] of Object.entries(data.lineups)) {
      if (value.formation && validLines(value.formation.lines)) {
        const slots = generateSlots(value.formation.lines);
        if (Object.keys(value.formation.assignments).some(id => !slots.some(slot => slot.id === id)))
          fail("Unknown formation position");
        if (JSON.stringify(value.placements) !== JSON.stringify(withFormation(value, value.formation).placements))
          fail("Formation assignments and placements disagree");
        const required = requiredSlots(slots, value.formation.noKeeper);
        if (value.formation.status === "published" && (slots.length !== 11 || required.some((slot) => !value.formation!.assignments[slot.id])))
          fail(`Fill all ${required.length} starting positions before publishing`);
      }
      const ids = [
        ...value.placements.map((p) => p.playerId),
        ...value.subs.filter((p): p is string => p !== null),
      ];
      if (new Set(ids).size !== ids.length)
        fail("Player selected more than once");
      for (const pid of ids) {
        const player = players.get(pid);
        const matchTeamId = matches.get(key)?.teamId;
        if (!player || !matchTeamId || !sameSection(data.teams, player.teamId, matchTeamId))
          fail("Selected player belongs to another team");
      }
    }
    for (const [key, value] of Object.entries(data.reviews)) {
      for (const pid of [
        ...Object.keys(value.playerFeedback),
        ...(value.womanOfTheMatchPlayerId
          ? [value.womanOfTheMatchPlayerId]
          : []),
      ]) {
        const player = players.get(pid);
        const matchTeamId = matches.get(key)?.teamId;
        if (!player || !matchTeamId || !sameSection(data.teams, player.teamId, matchTeamId))
          fail("Reviewed player belongs to another team");
      }
    }
  });
export type Snapshot = z.infer<typeof snapshotSchema>;
export const emptySnapshot = (): Snapshot => ({
  teams: [],
  players: [],
  matches: [],
  lineups: {},
  captainTasks: {},
  reviews: {},
  assessments: {},
});
// Shape only, like snapshotShape above: a team-scoped member's submission is only their own
// team's slice, so the full cross-reference schema can't run until writeClub has merged it with
// the server's other-team data. writeClub performs that full validation itself once merged.
export const saveSchema = z
  .object({
    clubId: id,
    revision: z.number().int().nonnegative(),
    data: snapshotShape,
  })
  .strict();
