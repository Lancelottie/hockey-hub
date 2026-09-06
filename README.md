# CoCaptain

A Next.js sports-management app with Better Auth sign-in, server-owned SQLite data and club-scoped access. Existing players, section assignments, fixtures, lineups, goalkeeper kits, captain checklists, post-match reviews and assessments are retained.

## Local setup

Requires Node.js 22.13+ (tested with Node 24), npm and a persistent writable disk.

```sh
npm install
npm run setup
npm run user:add
npm run dev
```

`setup` creates a private `.env.local` with a random authentication secret and migrates the database. It does not create a default account. `user:add` prompts for your email, name, club, role and a hidden password (at least 12 characters). For the first account, choose `club_admin`. Sign in at http://localhost:3000 using those details. The account can subsequently share its club with any number of separately provisioned users. Password hashing and session creation are handled by Better Auth.

Use the exact existing club name when provisioning another user into the same club. Public signup is disabled. New users who have not been granted an active application account and club membership cannot access the workspace.

Create teams in **Admin**, or import into an empty club before creating teams. **Home** summarises the active team, **My Team** shows player cards, **Players** retains section assignment/editing, **Fixtures** retains all three match workflows, and **Selection** opens the pitch editor. **Player assessments** remains available from the context bar.

## Existing browser data

Sign in using the same browser and origin that held the prototype. In **Admin**, back up the old browser data, review it, and explicitly import into an empty club. No legacy data is read automatically, seeded into accounts, reassigned or deleted. Original IDs, notes and lineup relationships are retained. Missing `umpires` checklist text is safely filled with an empty string.

A malformed/orphaned legacy record blocks import; repair a copy and import a validated workspace JSON export. The raw browser backup intentionally preserves every `hh_` key, including records no longer linked to fixtures; it is a recovery archive, not the workspace JSON format. The old browser store remains sensitive after migration; after verifying the import and retaining an appropriate backup, the operator can remove it through browser site-data controls. Do not use a shared device's legacy data for a different club.

## Architecture and access

- Better Auth owns users, authentication identities, password hashes, sessions, verification and rate-limit tables.
- `app_accounts` adds active/suspended status and last login; the auth user includes ID, name, email and creation date.
- `clubs` and `club_memberships` explicitly scope roles. `teams`, `players` and `fixtures` use composite club/record keys and foreign keys. Fixture documents and player assessments also have foreign keys.
- `lib/repository.ts` checks live account status and club membership on every operation. Database queries are parameterised. Client-supplied user IDs are never used for authorisation.
- Administrator, club administrator, manager and coach can manage records. Only administrator/club administrator can change teams. Player/read-only roles cannot write and do not receive assessments, captain notes or post-match feedback. Roles are club-scoped: there is no implicit global-admin bypass.
- Memberships can have **team-only access**. `npm run user:add` asks for an optional exact team name. Use `manager` for editing or `read_only` for viewing. The server filters every workspace response and fixture integration request, rejects out-of-scope writes and preserves other teams during saves. A `membership_team_access` row contains a JSON array of allowed team IDs; `[]` grants no teams, while no row grants club-wide access. Deleting a team never widens a user's access. Run the database migration before deploying this code.
- `proxy.ts` only provides early redirects. The authenticated layout checks a live session; `/api/workspace` independently checks it and membership on every request. Suspension takes effect without waiting for a cookie to expire.
- Business data is loaded into an in-memory client snapshot. Mutations are serialized and saved transactionally with a club revision. Concurrent stale saves receive HTTP 409. A failed save stops the queue and displays an error; export the draft before reloading. No failed draft is silently overwritten or saved to browser storage. This conservative whole-club snapshot approach is bounded to 2 MB/100 teams/3,000 players and fixtures and should evolve to record-level mutations as usage grows.
- The save-status strip is the authoritative persistence confirmation; editor “submitted” labels mean the change has entered the save queue. A reload may be needed to see another user's edits; live collaboration is not implemented.

Fixture-specific availability, captaincy, multi-team player memberships, fine-grained team roles, invitations and self-service password recovery are deferred. Assessment attendance is never presented as confirmed match availability. No player prices, budgets or transfer mechanics are included.

## Operations

Configure `BETTER_AUTH_SECRET` (32+ random characters), `BETTER_AUTH_URL` (exact public origin) and `DATABASE_PATH` in the environment; see `.env.example`. Keep environment files and database files out of version control. Production requires an HTTPS URL and sets Secure cookies; Better Auth also sets HttpOnly and SameSite=Lax, applies origin/CSRF controls, expires sessions after seven days and supports server-side revocation. Sign-in is limited to five requests per minute; other auth requests use a sixty-per-minute limit stored in SQL. Configure a reverse proxy to overwrite forwarded IP headers and apply an additional edge request/body-size limit.

For **Vercel**, configure a hosted PostgreSQL DATABASE_URL, BETTER_AUTH_SECRET and the HTTPS BETTER_AUTH_URL. Run npm run db:migrate, then npm run db:transfer to copy the existing SQLite data into an empty PostgreSQL database. See [the deployment guide](docs/DEPLOYMENT.md) for the verified transfer and rollback workflow. Database credentials and local recovery backups are excluded from Git.

Local development can continue using SQLite when DATABASE_URL is unset. For a standalone SQLite deployment, use one persistent Node server, run migrations before starting, then npm run build and npm start. Vercel deployments explicitly reject SQLite fallback.

Back up with SQLite's online backup facility (or stop the service before copying the database and its WAL). Test restoring backups. Do not copy only the main file while writes are occurring. `audit_events` records actor, club, action and timestamp without copying passwords, player feedback or request bodies. Define backup/audit retention with your club before deployment. Errors returned to the browser omit database details.

Operator SQL examples (use a private SQLite session against `DATABASE_PATH`; substitute actual IDs):

```sql
-- Find a user and their club memberships.
SELECT u.id, u.email, m.club_id, m.role FROM user u
LEFT JOIN club_memberships m ON m.user_id = u.id;
-- Suspend immediately, including their access through an existing cookie.
UPDATE app_accounts SET status = 'suspended' WHERE user_id = 'USER_ID';
DELETE FROM session WHERE userId = 'USER_ID';
-- Grant an existing user access to another existing club.
INSERT INTO club_memberships(user_id, club_id, role)
VALUES ('USER_ID', 'CLUB_ID', 'coach');
```

Do not edit password hashes manually. Self-service reset emails are not configured; an operator should add a verified reset workflow with Better Auth before offering public account recovery. The initial provisioning tool refuses to overwrite existing accounts.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm audit
```

Security tests use an isolated temporary database and real library sessions. Browser tests use installed Google Chrome, a dedicated server on port 3100 and `.test-data/e2e.sqlite`; no real club data is used. Screenshots/traces are in ignored `test-results/`. Browser tests cover sign-in, player filtering, saved lineup/checklist persistence, responsive navigation and logout. See [the pre-implementation audit](docs/AUDIT.md) for findings and architectural decisions.

England Hockey fixture import and synchronisation are available in **Fixtures** for each team. See [the integration guide](docs/ENGLAND_HOCKEY.md) for configuration, permissions, migration details, data-source investigation, tests and the `npm run fixtures:sync -- <club-id> <team-id>` server command.

### Named captain roles

Administration → People & access lists all available roles. The additional types are Ladies 1 Captain (`ladies_1s_captain`), Ladies 1s Vice Captain (`ladies_1s_vice_captain`), Ladies 2s Captain (`ladies_2s_captain`), Ladies 3s Captain (`ladies_3s_captain`) and Ladies 3s Vice Captain (`ladies_3s_vice_captain`). They can edit their team's players, fixtures, selections and notes, but cannot administer club teams. Adding role types does not create accounts or change existing memberships.

These roles resolve the corresponding exact team name within the user's club (Ladies 1s, Ladies 2s or Ladies 3s) and intersect any explicit team restriction. A missing, renamed or duplicate matching team grants no team access until corrected. The account setup script selects the required team automatically. Run `npm run setup` locally or `npm run db:migrate` for PostgreSQL before deploying to expand the membership role constraint; both preserve existing memberships and restrictions.
