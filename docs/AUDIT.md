# Repository audit — 6 September 2026

## Existing architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind 4 and Lucide. Client pages use React state and a team context; synchronous localStorage functions persist all business data. Server functionality consists of login/logout handlers and a proxy. There is no database, tenancy, RBAC, deployment guide or test suite (the test command discovers zero tests). Baseline ESLint passes. The working tree is entirely untracked before this iteration.

Retain players/section assignment, goalkeeper kits, fixtures, pitch/substitute selection, captain checklists, post-match scores/feedback and assessment workflows. The original /squad-selection page is assessments, not match selection; retain it under a correctly labelled navigation link.

## Findings

| Severity    | Evidence / impact                                                                                                                            | Recommendation                                                                                          | Before further development? |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| Critical    | lib/auth.ts has a known fallback HMAC key: sessions can be forged when SESSION_SECRET is missing.                                            | Remove custom tokens; maintained auth library, required secret, database sessions.                      | Yes                         |
| Critical    | lib/users.ts supplies a plaintext default password and one hardcoded user.                                                                   | Library password hashing, provision real users, no default credentials or public signup.                | Yes                         |
| High        | lib/storage.ts shares all team/player/assessment/feedback data across browser users. Authentication does not protect already-stored records. | Server database, memberships and authorisation for every read/write; explicit legacy import.            | Yes                         |
| High        | proxy.ts is the sole protection, excludes all APIs, and validates no live user/account status.                                               | Server layout and data access session/status checks; endpoint authorisation independent of proxy.       | Yes                         |
| Medium      | app/login/page.tsx passes unchecked from to router.push; login lacks throttling; logout only clears a replayable token.                      | Fixed internal destination; library rate limiting and session revocation.                               | Yes                         |
| Medium      | localStorage JSON casts lack validation; mutations have no concurrency protection or robust failure states.                                  | Bounded schemas, relationship validation, transactions, optimistic revisions and visible save failures. | Yes                         |
| Medium      | loadPlayers seeds names and migrates assignments on reads; default teams reappear.                                                           | Stop implicit mutations. Preserve legacy storage for explicit import/export.                            | Yes                         |
| Medium      | Sidebar stays 288px wide on phones; pitch uses HTML drag/drop without equivalent selection controls.                                         | Responsive navigation, skip link, focus styles, keyboard/touch selection.                               | This iteration              |
| Low         | Toolbar search/bookmarks/notification controls do nothing; notification button is unnamed.                                                   | Replace with useful context/navigation.                                                                 | This iteration              |
| Improvement | No tests, deployment/environment guide, backups, migration tooling or logging policy.                                                        | Boundary/integration tests and operational instructions.                                                | This iteration              |

React escaping is used; no dangerouslySetInnerHTML, eval, interpolated SQL, external API permissions or external redirect handler was found. Existing cookies set HttpOnly, SameSite=Lax and production Secure, but custom session validation can throw on malformed base64 and lacks strict payload validation. No CSRF origin validation exists on login/logout. Basic anti-framing/nosniff/referrer headers are present and should remain. No tracked environment secrets were found; default credentials are themselves the issue. npm audit initially failed due to sandbox DNS; retry after network access. Do not interpret that failure as a clean vulnerability report.

## Target and incremental sequence

1. Better Auth email/password, database sessions and rate limits. Disable public signup; provision users through an operator CLI that invokes the library's password handling. Required secret and explicit origin. Account status checked on every protected data request.
2. SQL users/auth identities plus application accounts, clubs, club memberships, teams, players, fixtures and fixture documents. Roles are membership scoped; this iteration gives management access to administrator/club administrator/manager/coach and rejects writes from player/read-only roles. Team-restricted membership is reserved for a subsequent iteration; provision only club-wide members now.
3. A single repository layer enforces membership; never accept a client user ID as authority. Existing synchronous UI reads can use a memory snapshot hydrated from an authenticated endpoint. Writes go to the server with a revision; stale saves fail visibly rather than overwrite other users. The database is authoritative, never browser localStorage.
4. Retain original IDs during explicit import into an empty club. Validate all player/team/fixture references. Preserve captain notes, reviews, lineup and assessments. Never automatically attach shared browser data to a newly signed-in user.
5. Add responsive shell, Home dashboard and visual My Team; retain original routes/workflows. Do not invent availability or captaincy records from assessment attendance.
6. Run lint/type/build, test two-user authorisation/invalid references/conflicts/session revocation, and exercise HTTP routes and responsive UI where tooling permits.

SQLite assumes one persistent Node deployment with a private local disk and backups. It must not be deployed to ephemeral serverless storage. The repository boundary allows a subsequent PostgreSQL adapter without changing the UI. Future player-team memberships, fixture availability and captaincy should become explicit relational records when their workflows are implemented.

## Implementation follow-through

The first iteration replaces the critical authentication/storage paths, adds club-scoped SQL access and optimistic revision checks, and retains the existing workflows behind a new responsive shell. The original checklist also had two TypeScript defects (missing `umpires` default and unsafe optional-property access); both are fixed. The dependency advisory affecting the original PostCSS override was resolved; the installed dependency audit reports zero known vulnerabilities. See README.md for setup, supported roles, deployment constraints and explicitly deferred capabilities.
