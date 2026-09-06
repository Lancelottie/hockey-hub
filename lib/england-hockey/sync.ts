import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getStore, lockClub } from "../database";
import { AccessError, requireTeamAccess } from "../repository";
import type { Match } from "../types";
import {
  EnglandHockeyError,
  fetchEnglandHockeyFixtures,
  type RemoteFetch,
} from "./source";

export type FixtureSource = {
  sourceUrl: string;
  externalTeamId: string;
  teamName: string;
  lastSyncedAt: string;
};
export async function getFixtureSource(
  clubId: string,
  teamId: string,
): Promise<FixtureSource | null> {
  return (
    ((await getStore()
      .prepare(
        `SELECT source_url AS "sourceUrl", external_team_id AS "externalTeamId",
    team_name AS "teamName", last_synced_at AS "lastSyncedAt" FROM team_fixture_sources WHERE club_id=? AND team_id=?`,
      )
      .get(clubId, teamId)) as FixtureSource | undefined) ?? null
  );
}
async function requireTeam(clubId: string, teamId: string) {
  if (
    !(await getStore()
      .prepare("SELECT 1 FROM teams WHERE club_id=? AND id=?")
      .get(clubId, teamId))
  )
    throw new AccessError(
      404,
      "Choose an existing team before importing fixtures.",
    );
}
export async function readFixtureSource(
  userId: string,
  clubId: string,
  teamId: string,
) {
  (await requireTeamAccess(userId, clubId, teamId, true));
  (await requireTeam(clubId, teamId));
  return (await getFixtureSource(clubId, teamId));
}
export type SyncOptions = {
  clubId: string;
  /** A scheduler must explicitly opt in. HTTP callers always supply an authenticated user. */
  actor: { userId: string } | { system: true };
  sourceUrl?: string;
  expectedRevision?: number;
  fetcher?: RemoteFetch;
};
/** Trusted server entry point for both manual imports and future scheduled jobs. */
export async function syncEnglandHockeyFixtures(
  teamId: string,
  options: SyncOptions,
) {
  const { clubId, actor } = options;
  const authorize = async () => {
    if ("userId" in actor) (await requireTeamAccess(actor.userId, clubId, teamId, true));
    (await requireTeam(clubId, teamId));
  };
  (await authorize());
  const db = getStore();
  const { revision } = (await db
    .prepare("SELECT revision FROM clubs WHERE id=?")
    .get(clubId)) as { revision: number };
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== revision
  )
    throw new AccessError(
      409,
      "Your club has changed. Reload before syncing fixtures.",
    );
  const previousSource = (await getFixtureSource(clubId, teamId));
  const url = options.sourceUrl ?? previousSource?.sourceUrl;
  if (!url)
    throw new EnglandHockeyError("Enter this team's England Hockey URL first.");
  const remote = await fetchEnglandHockeyFixtures(url, options.fetcher);
  const now = new Date().toISOString();
  return db
    .transaction(async () => {
      await lockClub(clubId);
      (await authorize()); // Membership or team may have changed while the remote request was running.
      const current = (await db
        .prepare("SELECT revision FROM clubs WHERE id=?")
        .get(clubId)) as { revision: number };
      if (current.revision !== revision)
        throw new AccessError(
          409,
          "Someone saved club changes during the import. Reload and try syncing again. No fixtures were changed.",
        );
      const existing = (
        (await db
          .prepare("SELECT data FROM fixtures WHERE club_id=? AND team_id=?")
          .all(clubId, teamId)) as { data: string }[]
      ).map((r) => JSON.parse(r.data) as Match);
      if (
        existing.some(
          (m) =>
            m.externalSource === "england-hockey" &&
            m.externalTeamId !== remote.externalTeamId,
        )
      )
        throw new EnglandHockeyError(
          "This team already has fixtures from a different England Hockey team. Configure the new URL on a different application team.",
        );
      const imported = new Map(
        existing
          .filter((m) => m.externalSource === "england-hockey")
          .map((m) => [m.externalKey, m]),
      );
      let added = 0,
        updated = 0,
        unchanged = 0;
      for (const fixture of remote.fixtures) {
        const old = imported.get(fixture.externalKey);
        const next: Match = JSON.parse(
          JSON.stringify({
            ...fixture,
            id: old?.id ?? randomUUID(),
            teamId,
            createdAt: old?.createdAt ?? now,
            updatedAt: old?.updatedAt ?? now,
            lastSyncedAt: old?.lastSyncedAt ?? now,
          }),
        );
        if (!old) added++;
        else if (isDeepStrictEqual(old, next)) unchanged++;
        else {
          updated++;
          next.updatedAt = now;
        }
        next.lastSyncedAt = now;
        (await db.prepare(
          `INSERT INTO fixtures(club_id,id,team_id,data) VALUES(?,?,?,?)
        ON CONFLICT(club_id,id) DO UPDATE SET data=excluded.data`,
        ).run(clubId, next.id, teamId, JSON.stringify(next)));
      }
      const total = (await db
        .prepare("SELECT count(*) AS n FROM fixtures WHERE club_id=?")
        .get(clubId)) as { n: number };
      if (total.n > 3000)
        throw new EnglandHockeyError(
          "This import would exceed the club's 3,000-fixture limit. No fixtures were changed.",
        );
      (await db.prepare(
        `INSERT INTO team_fixture_sources VALUES(?,?,?,?,?,?) ON CONFLICT(club_id,team_id)
      DO UPDATE SET source_url=excluded.source_url,external_team_id=excluded.external_team_id,team_name=excluded.team_name,last_synced_at=excluded.last_synced_at`,
      ).run(
        clubId,
        teamId,
        remote.sourceUrl,
        remote.externalTeamId,
        remote.teamName,
        now,
      ));
      (await db.prepare("UPDATE clubs SET revision=revision+1 WHERE id=?").run(clubId));
      (await db.prepare(
        "INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)",
      ).run(
        "userId" in actor ? actor.userId : "system:england-hockey",
        clubId,
        `england-hockey-sync:${teamId}:${added}/${updated}/${unchanged}`,
      ));
      return {
        checked: remote.fixtures.length,
        added,
        updated,
        unchanged,
        skipped: remote.skipped,
        source: {
          sourceUrl: remote.sourceUrl,
          externalTeamId: remote.externalTeamId,
          teamName: remote.teamName,
          lastSyncedAt: now,
        },
      };
    })
    .immediate();
}
