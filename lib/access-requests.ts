import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getStore } from "./database";
import { AccessError, listClubs } from "./repository";
import { canAdmin } from "./users";
import { SECTION_KEYS, type SectionKey } from "./team-sections";
import { ACCESS_REQUEST_LEVELS, type AccessRequestLevel } from "./access-request-levels";

export type AccessRequest = {
  id: string;
  name: string;
  email: string;
  sections: SectionKey[];
  requestedLevels: AccessRequestLevel[];
  createdAt: string;
};

/** Additive and idempotent: pre-login "request access" submissions, reviewed by club admins. */
export function migrateAccessRequests(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT NOT NULL, sections TEXT NOT NULL,
      requested_levels TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function requireAdmin(userId: string, clubId: string) {
  const club = (await listClubs(userId)).find((c) => c.id === clubId);
  if (!club || !canAdmin(club.role))
    throw new AccessError(403, "Only club administrators can view access requests.");
  return club;
}

/** Public: submitted from the pre-login request-access form, so it only trusts a real club ID. */
export async function submitAccessRequest(
  clubId: string,
  name: string,
  email: string,
  sections: SectionKey[],
  requestedLevels: AccessRequestLevel[],
) {
  const db = getStore();
  if (!(await db.prepare("SELECT 1 FROM clubs WHERE id=?").get(clubId)))
    throw new AccessError(404, "Choose an existing club.");
  if (!sections.length || sections.some((s) => !SECTION_KEYS.includes(s)))
    throw new AccessError(400, "Choose at least one section.");
  if (!requestedLevels.length || requestedLevels.some((l) => !ACCESS_REQUEST_LEVELS.includes(l)))
    throw new AccessError(400, "Choose at least one level of access.");
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO access_requests(id,club_id,name,email,sections,requested_levels) VALUES(?,?,?,?,?,?)",
    )
    .run(id, clubId, name, email, JSON.stringify(sections), JSON.stringify(requestedLevels));
}

export async function listAccessRequests(userId: string, clubId: string): Promise<AccessRequest[]> {
  await requireAdmin(userId, clubId);
  const rows = (await getStore()
    .prepare(
      `SELECT id, name, email, sections, requested_levels AS "requestedLevels", created_at AS "createdAt"
       FROM access_requests WHERE club_id=? AND status='pending' ORDER BY created_at`,
    )
    .all(clubId)) as (Omit<AccessRequest, "sections" | "requestedLevels"> & { sections: string; requestedLevels: string })[];
  return rows.map((r) => ({ ...r, sections: JSON.parse(r.sections), requestedLevels: JSON.parse(r.requestedLevels) }));
}

export async function resolveAccessRequest(userId: string, clubId: string, id: string) {
  await requireAdmin(userId, clubId);
  const db = getStore();
  if (!(await db.prepare("SELECT 1 FROM access_requests WHERE club_id=? AND id=?").get(clubId, id)))
    throw new AccessError(404, "Choose an existing request.");
  await db.prepare("UPDATE access_requests SET status='done' WHERE club_id=? AND id=?").run(clubId, id);
  await db
    .prepare("INSERT INTO audit_events(user_id,club_id,action) VALUES(?,?,?)")
    .run(userId, clubId, `access-request-resolved:${id}`);
}
