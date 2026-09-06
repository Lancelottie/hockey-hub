# PostgreSQL and Vercel deployment

The app supports PostgreSQL for hosted deployments and SQLite for local development. DATABASE_URL selects PostgreSQL. Vercel deployments refuse to fall back to a local database file.

## Production setup

1. Import Lancelottie/hockey-hub into Vercel. Use the Next.js defaults and the repository root.
2. Add a Neon PostgreSQL integration on the Free plan in London (lhr1), connected to production. Leave Neon Auth disabled: Better Auth already manages accounts.
3. Configure production environment variables:
   - DATABASE_URL: the pooled PostgreSQL connection string supplied by Neon.
   - BETTER_AUTH_SECRET: a cryptographically random secret, at least 32 characters.
   - BETTER_AUTH_URL: the exact HTTPS public origin, currently https://hockey-hub-nine.vercel.app.
4. Run npm run db:migrate with those variables in the environment. It creates Better Auth's tables and the application tables. Migrations are idempotent; they are not run in request handlers or during every build.
5. Run npm run db:transfer with DATABASE_URL pointing at the empty production database and DATABASE_PATH pointing at the existing SQLite file.
6. Deploy the reviewed commit. Verify sign-in and workspace persistence before distributing the site.

Environment variables must be entered in Vercel or loaded from an ignored private file. Never put a connection string, auth secret or SQLite database in Git. The production database is not automatically connected to preview deployments. Configure an isolated database and matching auth URL before using previews.

## Transfer guarantees

The transfer first creates a consistent online SQLite backup under .vercel/backups with private file permissions. It reads that snapshot and transfers users, password hashes, memberships, clubs, teams, players, fixtures, fixture documents, assessments, formation presets, fixture integration settings and audit events.

Every returned field and every table count is checked before the PostgreSQL transaction commits. IDs, record order, fixture/team links and password hashes are preserved. Authentication booleans and timestamps are converted to PostgreSQL types. Existing local sessions, verification tokens and rate-limit counters are not transferred; users sign in again using their existing credentials.

The destination must be empty. The migration takes an advisory lock and table locks, records a source digest and refuses to overwrite an existing database. Repeating the same completed import is a no-op; a different source is rejected. The source SQLite file is not modified or deleted.

Avoid editing the local app during the final transfer. After successful cutover, use the hosted app for live data; the local SQLite copy does not synchronise with PostgreSQL. Retain the private backup separately from GitHub.

## Database architecture

lib/database.ts provides asynchronous parameterised queries using pg and a small connection pool. Transactions use one checked-out connection through AsyncLocalStorage; nested repository operations share that connection. Workspace writes and fixture syncs lock the club row before checking revisions, preventing two concurrent writers from overwriting each other. Snapshot reads use repeatable-read transactions. Players, fixtures and fixture documents are inserted in batches to avoid a network round trip per player.

The application retains its existing tables and JSON document format. PostgreSQL has explicit generated row-order columns and an equivalent partial unique index for imported England Hockey fixtures. Better Auth owns its own PostgreSQL schema and handles the existing password hashing and session flows. Local SQLite development and the original test suite remain supported.

## Verification

- npm test: existing unit, repository, authentication, HTTP and integration tests against isolated SQLite databases.
- npm run test:postgres: real PostgreSQL test using a random isolated schema; covers source transfer, preserved password login, workspace reads, preset/formation persistence, parallel revision conflicts, rollback, draft privacy, access revocation and repeat-import protection. It drops only its generated test schema afterward.
- npm run test:e2e: browser workflows, including sign-in, formation selection and reload persistence.
- npm run typecheck, npm run lint, npm run build: static and production build checks.

For PostgreSQL tests, provide DATABASE_URL via the environment. The test creates its own users and clubs and never uses production records.

## Backups and recovery

GitHub stores the source code, not production data. Use the database provider's backup/export facilities for ongoing data backups. The private pre-migration SQLite snapshot is a recovery point for the cutover only. Restoring that old snapshot after accepting new production changes would discard those newer changes; export production data before any rollback.
