# England Hockey fixture integration

Implemented and investigated on 6 September 2026.

## Existing architecture audited before implementation

- Next.js App Router, React/TypeScript, Node route handlers, Tailwind and shared navy/teal/white styling. The installed Next.js route-handler guide was consulted.
- Better Auth provides database sessions. Active account status and live club membership are checked server-side. Existing management roles are `administrator`, `club_admin`, `manager`, and `coach`; `player` and `read_only` can view fixtures but cannot configure or sync them. There is no separate captain role: captains should use an existing management role. Membership permissions currently apply across a club, not to an individual team.
- SQLite (`better-sqlite3`) has clubs, club memberships, teams, players, fixtures, fixture documents (lineups, captain tasks and reviews), assessments and audit events. Fixtures already have stable internal IDs and team IDs. They store their `Match` data as JSON, so imported information extends that model without a duplicate fixture table.
- The frontend has an authenticated in-memory workspace, serialised saves and a club revision to prevent stale writes. Fixture imports participate in that same revision mechanism. There is no existing scheduler or player-availability model.
- Integration parsing/fetching belongs in a server-side service called by authenticated API routes, independently of the React fixture UI.

## Verified data source

The public [Northern Development team page](https://www.englandhockey.co.uk/teams/northern-development-womens) contains a `competitions-team-fixtures` module with `data-url` and `data-url-key` attributes. The initial HTML contains a loading placeholder, not the fixture records.

The public [fixture JavaScript module inspected](https://www.englandhockey.co.uk/assets/js/competitions-team-fixtures-370c56.js) makes a GET request with an `x-api-key` header to:

```text
https://ehdwapi.englandhockey.co.uk/api/teams/{externalTeamId}/fixturesandresults
```

The header value is published on the public team page. The adapter discovers it on each fetch; it is not hard-coded, persisted, logged, or sent to our frontend. This is the site's underlying public data source, not a documented/versioned integration contract.

The response is an array of competition groups containing `fixtures`. Observed fields include `id`, `sourceId`, `homeTeamId`, `awayTeamId`, nested `homeTeam`/`awayTeam`, `fixtureDate`, `fixtureTime`, `statusDescription`, competition and season IDs. Venue is optional and was absent from the example response.

A read-only check through the implemented adapter returned **22 fixtures: 11 home, 11 away**. The first was Northern Development vs Neston Development on 19 September 2026, at 15:15. No example fixtures were inserted into a real application team as part of that check. Normal tests use recorded/mocked responses and do not contact England Hockey.

## Configuration and use

1. Sign in with an existing management role and select the intended club/team.
2. Open **Fixtures**.
3. Paste that team's HTTPS England Hockey `/teams/…` URL into **England Hockey fixtures URL**.
4. Select **Save & Import Fixtures**. The detected England Hockey team name and last successful sync time appear below the form.
5. Use **Sync Fixtures** for subsequent checks. The result reports checked, added, updated and unchanged fixtures, plus skipped byes if present.

Each internal team has its own configuration. No team name is hard-coded. A URL is saved only after a successful import. Changing the URL to a different external team after importing fixtures is rejected to avoid mixing teams; configure the other external team on a separate internal team. A changed slug resolving to the same external ID is allowed.

The main Fixtures list shows home-team versus away-team order, pushback, a HOME/AWAY badge, venue/competition when supplied and non-active status. Imported fixtures are managed by the sync service; their match-management links still open the existing lineup, tasks and review features. Manual fixtures remain supported.

## Data and migration

`lib/england-hockey/migration.ts`, called by the existing `migrateApp()`, adds:

- `team_fixture_sources`: one configuration per `(club_id, team_id)`, with URL, external team ID, detected name and last successful sync timestamp. Composite foreign key to the existing team, with deletion cascade.
- `fixtures_england_hockey_key`: a unique partial index on `(club_id, team_id, JSON externalKey)` for England Hockey fixtures.

The existing `Match` JSON model is extended with external source/key/fixture ID/team ID, start time, both team names, optional venue/competition/status, source URL and sync/creation/update timestamps. Existing manual fixtures need no backfill. `date` remains compatible with existing display helpers: local date/time where confirmed, date-only where time is unconfirmed.

Apply on another installation with `npm run setup` before starting the updated app. The migration is additive/idempotent and has already been applied in this workspace. There are no credentials or real club records in test fixtures.

Workspace saves now upsert retained teams rather than deleting and recreating them; this preserves integration settings. Imported fixture fields cannot be forged, edited or removed via a workspace snapshot. Administrators can still delete a whole team, which cleans up its source configuration.

## Matching, changes and home/away

1. Prefer the provider's fixture `id` as `externalKey`.
2. If absent, use the provider's source system and `sourceId`.
3. If both are absent, hash season ID, competition ID, home team ID and away team ID. Dates/times are deliberately excluded so rescheduling can update the existing record. Missing identity information or duplicate/ambiguous keys in a response abort the import safely.

Keys are scoped to the internal club and team by a database unique index. New fixtures get a UUID; subsequent syncs retain it. Saved lineups, captain tasks and reviews remain attached because updates modify the fixture in place. Existing manual fixtures are not automatically merged with remote fixtures: there is insufficient external identity on manual fixtures to do that safely.

The configured external team ID is compared to `homeTeamId` and `awayTeamId` (or nested team IDs if those top-level fields are absent). A match on the home side means HOME and the away team is the opponent; a match on the away side means AWAY and the home team is the opponent. A record matching neither or both is rejected rather than guessed from a similar name.

Changed dates, times, venues, opponents, competition and status update the same fixture. `updatedAt` changes only with fixture content; a successful check refreshes `lastSyncedAt` even for unchanged fixtures. Postponement/cancellation labels come from the provider. Absent remote fixtures are retained: disappearance is not treated as cancellation or deletion. Failed or malformed imports change neither fixtures nor the saved URL. A valid empty response is allowed.

The sync commits atomically and checks the club revision and live permissions again after network work. A concurrent save/sync causes a clear conflict and no partial import. The UI waits for local saves and prevents editing fixtures while a sync is in progress; the returned snapshot/revision updates the list without reloading.

## Security and failure handling

- Only HTTPS `englandhockey.co.uk` or `www.englandhockey.co.uk` team paths are accepted, canonicalised to `www`. Credentials, non-default ports, query strings, fragments, arbitrary paths and encoded path payloads are rejected.
- Discovered API URLs must exactly match the fixed `ehdwapi.englandhockey.co.uk` host and expected UUID route. The final request URL is rebuilt from that ID. No arbitrary response links are followed and redirects are disabled on both fetches.
- Both requests are server-side, with 15-second timeouts and streamed body limits (2 MB page, 5 MB JSON). Input bodies are capped at 4 KB; group/fixture counts and field lengths are bounded. Existing club limit: 3,000 fixtures.
- Session, active account, membership and management permission are enforced independently on the route and service. POST requires the configured same origin. Browser input cannot opt into a scheduler/system actor.
- Users receive plain errors; upstream/internal exception messages and stack traces are not returned. Existing fixtures remain on fetch, parse or transaction failures.

## Future scheduled sync

There is no new scheduler infrastructure and no unauthenticated cron endpoint. A trusted server job can call:

```ts
await syncEnglandHockeyFixtures(teamId, {
  clubId,
  actor: { system: true },
});
```

A manual server invocation is available now:

```sh
npm run fixtures:sync -- <club-id> <team-id>
```

Run from the application directory with its database configuration and normal process account. The URL must already be configured via the UI. The CLI and future jobs use the same service and transactions. A job enumerating configurations should process them sequentially per club and retry revision conflicts later. No recurring schedule has been enabled.

## Limitations and assumptions

- England Hockey can change this undocumented endpoint, module attributes or public header. Those dependencies are contained in `source.ts`.
- The endpoint currently returns its available competition groups/season; the integration does not invent pagination or import previous seasons that the endpoint omits.
- `00:00` is treated as an unconfirmed pushback time in the UI, while preserving the raw value. Dates/times are England Hockey wall-clock values and are not converted based on the viewer's timezone. A real midnight fixture would need review.
- Byes are skipped with a count. Missing optional venue/competition/status is accepted. A malformed required fixture aborts the whole import to avoid silently omitting real matches.
- Fixture IDs are the reliable path. Without either provider ID, the fallback assumes at most one home/away pairing per competition and season; ambiguous repeated pairings are rejected. Opponent changes cannot be reliably matched without an external ID. Provider identity changes may require reconciliation.
- Fixtures removed from England Hockey are retained locally; status changes are picked up only when returned by the provider.
- Per-team captain permissions, availability, results and recurring scheduling remain future features. Existing club management permissions are reused.

## File manifest

Created:

- `lib/england-hockey/source.ts` — URL validation, bounded server fetches, page discovery and normalisation.
- `lib/england-hockey/sync.ts` — authorised atomic sync and configuration reads.
- `lib/england-hockey/migration.ts` — additive configuration table and unique fixture index.
- `app/api/england-hockey/route.ts` — authenticated settings GET and import/sync POST.
- `app/(dashboard)/fixtures/england-hockey-settings.tsx` — per-team configuration, actions and feedback.
- `scripts/sync-england-hockey.mts` — trusted CLI entry point for later scheduling.
- `tests/england-hockey.test.ts` — parser, security, API, persistence and concurrency checks.
- `tests/fixtures/england-hockey.json` — trimmed public response sample for offline tests.
- `docs/ENGLAND_HOCKEY.md` — this audit, operation and implementation report.

Modified:

- `lib/db.ts` — runs the integration migration.
- `lib/types.ts`, `lib/validation.ts` — extends the existing fixture model/schema.
- `lib/repository.ts` — preserves source settings and protects imported fixture metadata during ordinary saves.
- `lib/storage.ts` — coordinated remote sync and refreshed workspace revision.
- `lib/match-format.ts` — displays imported home/away team names in source order.
- `app/(dashboard)/fixtures/page.tsx` — integrates settings, live refresh, imported status/time and home/away badges.
- `tests/browser/workflows.spec.ts` — desktop/mobile import and update workflow with a mocked application API.
- `package.json` — adds `fixtures:sync`.
- `README.md` — links this integration guide.

## Verification

- `npm test`: 30 checks passed, covering the existing security suite plus home/away/opponent/time parsing, optional fields, stable IDs, duplicate sync, amendments, statuses, malformed/unavailable upstream, URL/redirect validation, multiple teams, source persistence, concurrency, role restrictions, CSRF and API behaviour.
- `npm run lint` and `npm run typecheck`: passed. The changed fixture page was linted again after correcting its missing state-helper import.
- `npm run test:e2e`: **10 passed**, including existing workflow regression checks and an England Hockey import/update desktop/mobile check. Remote services are mocked for the new browser workflow; database/API behaviour is independently covered by the integration tests.
- Live adapter check: 22 fixtures, 11 home and 11 away, through the real public page and API, without real-club writes.

- `npm run build -- --webpack`: passed, including production TypeScript checking and generation of all routes. The default Turbopack build could not complete in this environment because its CSS worker was denied permission to bind a local port, including on the escalated retry; no build-script change was made.
