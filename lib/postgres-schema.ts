import { roleSqlValues } from "./users";
export const postgresSchema = `
    CREATE TABLE IF NOT EXISTS app_accounts (
      user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS club_memberships (
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN (${roleSqlValues})),
      PRIMARY KEY(user_id, club_id)
    );
    ALTER TABLE club_memberships DROP CONSTRAINT IF EXISTS club_memberships_role_check;
    ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_role_check CHECK(role IN (${roleSqlValues}));
    CREATE TABLE IF NOT EXISTS membership_team_access (
      user_id TEXT NOT NULL, club_id TEXT NOT NULL, team_ids TEXT NOT NULL,
      PRIMARY KEY(user_id,club_id),
      FOREIGN KEY(user_id,club_id) REFERENCES club_memberships(user_id,club_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS teams (
      rowid BIGSERIAL UNIQUE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(club_id,id)
    );
    CREATE TABLE IF NOT EXISTS team_formation_presets (
      club_id TEXT NOT NULL, team_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(club_id,team_id),
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS players (
      rowid BIGSERIAL UNIQUE,
      club_id TEXT NOT NULL, id TEXT NOT NULL, team_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(club_id,id), FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id)
    );
    CREATE TABLE IF NOT EXISTS fixtures (
      rowid BIGSERIAL UNIQUE,
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
      id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, club_id TEXT NOT NULL,
      action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_fixture_sources (
      club_id TEXT NOT NULL, team_id TEXT NOT NULL,
      source_url TEXT NOT NULL, external_team_id TEXT NOT NULL, team_name TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY(club_id,team_id),
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fixtures_england_hockey_key
      ON fixtures(club_id,team_id,(data::jsonb ->> 'externalKey'))
      WHERE data::jsonb ->> 'externalSource' = 'england-hockey';
    CREATE TABLE IF NOT EXISTS data_migrations (
      id TEXT PRIMARY KEY, source_digest TEXT NOT NULL, counts TEXT NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`;
