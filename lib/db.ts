import { roleSqlValues } from "./users";
import Database from "better-sqlite3";
import { migrateEnglandHockey } from "./england-hockey/migration";
import { migrateSubmissions } from "./submissions";
import { migratePlayerTeams } from "./player-teams";
import { migrateAccessRequests } from "./access-requests";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

let connection: Database.Database | undefined;
export function getDb() {
  if (process.env.VERCEL) throw new Error("SQLite is unavailable on Vercel. Configure DATABASE_URL.");
  if (!connection) {
    const path = resolve(
      /* turbopackIgnore: true */ process.env.DATABASE_PATH ??
        "data/hockey-hub.sqlite",
    );
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    connection = new Database(path);
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
    connection.pragma("busy_timeout = 5000");
  }
  return connection;
}

export function migrateApp() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS app_accounts (
      user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS club_memberships (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN (${roleSqlValues})),
      PRIMARY KEY(user_id, club_id, role)
    );
    CREATE TABLE IF NOT EXISTS membership_team_access (
      user_id TEXT NOT NULL, club_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN (${roleSqlValues})), team_ids TEXT NOT NULL,
      PRIMARY KEY(user_id,club_id,role),
      FOREIGN KEY(user_id,club_id,role) REFERENCES club_memberships(user_id,club_id,role) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS teams (
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(club_id,id)
    );
    CREATE TABLE IF NOT EXISTS team_formation_presets (
      club_id TEXT NOT NULL, team_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(club_id,team_id),
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS players (
      club_id TEXT NOT NULL, id TEXT NOT NULL, team_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(club_id,id), FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id)
    );
    CREATE TABLE IF NOT EXISTS fixtures (
      club_id TEXT NOT NULL, id TEXT NOT NULL, team_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(club_id,id), FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id)
    );
    CREATE TABLE IF NOT EXISTS fixture_documents (
      club_id TEXT NOT NULL, fixture_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(club_id,fixture_id,kind),
      FOREIGN KEY(club_id,fixture_id) REFERENCES fixtures(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS assessments (
      club_id TEXT NOT NULL, player_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(club_id,player_id), FOREIGN KEY(club_id,player_id) REFERENCES players(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, club_id TEXT NOT NULL,
      action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migrateMembershipRoles(getDb());
  migrateMultiRole(getDb());
  migrateEnglandHockey(getDb());
  migrateSubmissions(getDb());
  migratePlayerTeams(getDb());
  migrateAccessRequests(getDb());
  // A member may hold several roles per club (e.g. club_admin and a team captaincy) and
  // switch which is active; requires club_memberships' PK to already include role (above).
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS active_roles (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN (${roleSqlValues})),
      PRIMARY KEY(user_id,club_id),
      FOREIGN KEY(user_id,club_id,role) REFERENCES club_memberships(user_id,club_id,role) ON DELETE CASCADE
    );
  `);
}

/** SQLite requires rebuilding a table to expand a CHECK constraint. Preserve child scopes. */
export function migrateMembershipRoles(db: Database.Database) {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='club_memberships'").get() as { sql: string };
  if (schema.sql.includes("'northern_hockey_admin'")) return;
  if (db.inTransaction) throw new Error("Run the role migration outside an existing transaction.");
  const foreignKeys = db.pragma("foreign_keys", { simple: true });
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE club_memberships_expanded (
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN (${roleSqlValues})),
          PRIMARY KEY(user_id,club_id)
        );
        INSERT INTO club_memberships_expanded SELECT user_id,club_id,role FROM club_memberships;
        DROP TABLE club_memberships;
        ALTER TABLE club_memberships_expanded RENAME TO club_memberships;
      `);
      const violations = db.pragma("foreign_key_check");
      if (!Array.isArray(violations) || violations.length) throw new Error("Role migration would break membership references.");
    })();
  } finally { db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`); }
}

/** Widens club_memberships/membership_team_access so a member may hold several roles per club. */
export function migrateMultiRole(db: Database.Database) {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='club_memberships'").get() as { sql: string };
  if (schema.sql.includes("PRIMARY KEY(user_id,club_id,role)")) return;
  if (db.inTransaction) throw new Error("Run the multi-role migration outside an existing transaction.");
  const foreignKeys = db.pragma("foreign_keys", { simple: true });
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE club_memberships_multi (
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN (${roleSqlValues})),
          PRIMARY KEY(user_id,club_id,role)
        );
        INSERT INTO club_memberships_multi SELECT user_id,club_id,role FROM club_memberships;
        CREATE TABLE membership_team_access_scoped (
          user_id TEXT NOT NULL, club_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN (${roleSqlValues})), team_ids TEXT NOT NULL,
          PRIMARY KEY(user_id,club_id,role),
          FOREIGN KEY(user_id,club_id,role) REFERENCES club_memberships_multi(user_id,club_id,role) ON DELETE CASCADE
        );
        INSERT INTO membership_team_access_scoped(user_id,club_id,role,team_ids)
          SELECT s.user_id, s.club_id, m.role, s.team_ids
          FROM membership_team_access s JOIN club_memberships m
            ON m.user_id = s.user_id AND m.club_id = s.club_id;
        DROP TABLE membership_team_access;
        DROP TABLE club_memberships;
        ALTER TABLE club_memberships_multi RENAME TO club_memberships;
        ALTER TABLE membership_team_access_scoped RENAME TO membership_team_access;
      `);
      const violations = db.pragma("foreign_key_check");
      if (!Array.isArray(violations) || violations.length) throw new Error("Multi-role migration would break membership references.");
    })();
  } finally { db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`); }
}
