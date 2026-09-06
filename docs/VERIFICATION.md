# Verification — 6 September 2026

- `npm test`: 14 passing checks using real Better Auth sessions and an isolated SQL database. Covers public signup rejection, unauthenticated access, cross-club reads/writes, read-only writes, private-feedback filtering, team-administration permissions, duplicate/orphan/cross-team references, optimistic conflicts, CSRF origin checks, bounded request bodies, account suspension, session revocation and legacy import preservation.
- `npm run test:e2e`: 9 passing browser tests in installed Chrome. Covers sign-in, player filtering, persistent lineups/checklists, mobile navigation and overflow checks for Players, Fixtures, Selection, Assessments, Admin and Teams; also logout, forged cookies, auth CSRF and sign-in rate limiting. No unexpected browser errors. Screenshots are in ignored `test-results/`.
- `npm run typecheck`: passes.
- `npm run lint`: passes.
- `npm run build`: production compilation, type checking and route generation pass. Database file tracing warning resolved.
- Dependency audit after installation/patching: zero known vulnerabilities.

Only synthetic accounts and clubs were used for automated testing. Local setup created a private authentication secret and empty application database; no real account was created. The original browser data remains untouched. Run `npm run user:add` to provision the first account, then review/import legacy data through Admin.

Deployment has not been performed. This iteration assumes persistent Node/SQLite hosting, club-wide memberships and a conservative whole-club revision for concurrent writes. Fixture availability, captaincy, team-restricted permissions and self-service account recovery remain future work, as documented in README.md.
