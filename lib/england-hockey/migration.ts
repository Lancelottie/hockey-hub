import type Database from "better-sqlite3";

/** Additive and idempotent: fixtures remain in the existing JSON-backed table. */
export function migrateEnglandHockey(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_fixture_sources (
      club_id TEXT NOT NULL, team_id TEXT NOT NULL,
      source_url TEXT NOT NULL, external_team_id TEXT NOT NULL, team_name TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY(club_id,team_id),
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fixtures_england_hockey_key
      ON fixtures(club_id,team_id,json_extract(data,'$.externalKey'))
      WHERE json_extract(data,'$.externalSource')='england-hockey';
  `);
}
