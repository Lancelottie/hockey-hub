import { roleSqlValues } from "./users";
export const postgresSchema = `
    CREATE TABLE IF NOT EXISTS app_accounts (
      user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      last_login TEXT
    );
    ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS must_change_password TEXT NOT NULL DEFAULT 'false';
    ALTER TABLE app_accounts DROP CONSTRAINT IF EXISTS app_accounts_must_change_password_check;
    ALTER TABLE app_accounts ADD CONSTRAINT app_accounts_must_change_password_check CHECK(must_change_password IN ('true','false'));
    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS club_memberships (
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN (${roleSqlValues})),
      PRIMARY KEY(user_id, club_id, role)
    );
    ALTER TABLE club_memberships DROP CONSTRAINT IF EXISTS club_memberships_role_check;
    ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_role_check CHECK(role IN (${roleSqlValues}));
    CREATE TABLE IF NOT EXISTS membership_team_access (
      user_id TEXT NOT NULL, club_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN (${roleSqlValues})), team_ids TEXT NOT NULL,
      PRIMARY KEY(user_id,club_id,role),
      FOREIGN KEY(user_id,club_id,role) REFERENCES club_memberships(user_id,club_id,role) ON DELETE CASCADE
    );
    -- One role per user per club used to be enforced by the PK; a member may now hold several roles
    -- (e.g. club_admin and a team captaincy) and switch which is active. Widen existing installs in place.
    ALTER TABLE membership_team_access ADD COLUMN IF NOT EXISTS role TEXT;
    UPDATE membership_team_access s SET role = m.role
      FROM club_memberships m
      WHERE m.user_id = s.user_id AND m.club_id = s.club_id AND s.role IS NULL;
    ALTER TABLE membership_team_access ALTER COLUMN role SET NOT NULL;
    ALTER TABLE membership_team_access DROP CONSTRAINT IF EXISTS membership_team_access_role_check;
    ALTER TABLE membership_team_access ADD CONSTRAINT membership_team_access_role_check CHECK(role IN (${roleSqlValues}));
    -- Re-running this script is otherwise a no-op, but once active_roles/membership_team_access's
    -- foreign keys already depend on the widened club_memberships_pkey, unconditionally dropping and
    -- recreating it fails with "other objects depend on it". Only widen it the first time it's needed.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'club_memberships'::regclass AND contype = 'p' AND array_length(conkey, 1) = 3
      ) THEN
        ALTER TABLE membership_team_access DROP CONSTRAINT IF EXISTS membership_team_access_user_id_club_id_fkey;
        ALTER TABLE membership_team_access DROP CONSTRAINT IF EXISTS membership_team_access_pkey;
        ALTER TABLE club_memberships DROP CONSTRAINT IF EXISTS club_memberships_pkey;
        ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_pkey PRIMARY KEY(user_id,club_id,role);
        ALTER TABLE membership_team_access ADD CONSTRAINT membership_team_access_pkey PRIMARY KEY(user_id,club_id,role);
        ALTER TABLE membership_team_access ADD CONSTRAINT membership_team_access_user_id_club_id_fkey
          FOREIGN KEY(user_id,club_id,role) REFERENCES club_memberships(user_id,club_id,role) ON DELETE CASCADE;
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS active_roles (
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN (${roleSqlValues})),
      PRIMARY KEY(user_id,club_id),
      FOREIGN KEY(user_id,club_id,role) REFERENCES club_memberships(user_id,club_id,role) ON DELETE CASCADE
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
    CREATE TABLE IF NOT EXISTS team_submissions (
      club_id TEXT NOT NULL, team_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','submitted')),
      submitted_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(club_id,team_id),
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS player_team_memberships (
      club_id TEXT NOT NULL, player_id TEXT NOT NULL, team_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(club_id,player_id,team_id),
      FOREIGN KEY(club_id,player_id) REFERENCES players(club_id,id) ON DELETE CASCADE,
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT NOT NULL, sections TEXT NOT NULL,
      requested_levels TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS player_loans (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      from_team_id TEXT NOT NULL, from_team_name TEXT NOT NULL,
      to_team_id TEXT NOT NULL, to_team_name TEXT NOT NULL,
      match_id TEXT NOT NULL, opponent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','acknowledged')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS team_notices (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL, team_id TEXT NOT NULL,
      author_id TEXT NOT NULL, author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(club_id,team_id) REFERENCES teams(club_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS data_migrations (
      id TEXT PRIMARY KEY, source_digest TEXT NOT NULL, counts TEXT NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`;
