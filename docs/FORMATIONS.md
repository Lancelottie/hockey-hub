# Fixture formations

Open **Selection** or **Fixtures → a match → Build lineup**. Build a custom structure or choose a preset, select a pitch position, then choose a player or enter a shirt number and press Enter. Each successful assignment selects the next empty position, including the bench. Use **Move / swap**, then select any pitch or bench destination. Changes autosave; the existing workspace status reports saving, success, or failure.

## Existing architecture and integration

The app uses Next.js App Router, React client components, Tailwind/CSS variables, Better Auth, and either hosted PostgreSQL through pg or local SQLite through better-sqlite3. Teams and players belong to clubs; each player and fixture has a team ID. Existing fixture documents contain lineup placements and four substitute seats. The workspace API loads and saves a validated club snapshot transactionally, with a revision check to reject concurrent overwrites.

The squad-selection page contains training assessments and session attendance, not a fixture squad or match availability. The formation selector therefore uses team players. The eligiblePlayers function accepts optional squad IDs and available-player IDs for future integration, in that priority order. An explicitly empty squad remains empty.

Player administration stays in the existing Players screen, linked from the editor. Existing home, team and post-match screens continue to consume the same lineup placements and substitutes.

## Files

Created:

- lib/formation.ts: shared formation geometry, eligibility, number matching and assignment operations.
- app/(dashboard)/fixtures/formation-editor.tsx: pitch, configuration, selectors, publishing and presets.
- tests/formation.test.ts: geometry, assignment, validation, SQLite and access tests.
- docs/FORMATIONS.md: this guide.

Modified:

- lib/types.ts: optional structured formation and team presets.
- lib/validation.ts: structures, assignments, coordinate consistency and publication rules.
- lib/db.ts: additive preset-table migration.
- lib/repository.ts: team preset persistence and draft filtering.
- lib/storage.ts: prune structured assignments when players are removed or moved.
- app/(dashboard)/fixtures/lineup-builder.tsx: fixture controls and editor integration.
- app/globals.css: scoped responsive formation styling.
- tests/browser/workflows.spec.ts: updated selection workflow and added formation interactions.

## Schema and persistence

A lineup's optional formation contains lines, name, status, and assignments. Assignment keys are line-{lineIndex}-{positionIndex} and gk; values are player IDs. Existing placements are regenerated deterministically for compatibility, and the server rejects disagreements between these representations.

Lineups continue to use fixture_documents, keyed by club, fixture and document kind. Team identity comes from the fixture, not a second independent client-supplied team field. Existing workspace audit events and revision checking are reused.

The additive team_formation_presets table stores JSON presets by (club_id, team_id), with a foreign key and cascading deletion. Run npm run setup before deploying this version. This migration was applied to the local workspace database. No existing lineups require a migration.

All assignment, removal, swap, build and publish actions enter the existing autosave queue immediately. Failed saves preserve the in-memory draft, display an error and offer the existing draft export. Refresh warns while saves are pending. Another captain sees saved work after loading the fixture; there is no live multi-user subscription.

Configuration fields take effect when **Build formation** is pressed. Unapplied configuration displays a notice and warns on page refresh. In-app navigation retains saved assignments, but unapplied configuration fields are not persisted.

## Generation and coordinates

A structure can contain 1–10 positive integer lines, totalling at most 10 outfield positions. The name defaults to the numbers joined by hyphens; an optional name can replace it.

For zero-based position j in a line containing n players:

- x = 5 + 90 × (j + 1) / (n + 1) percent.
- For zero-based line i among L > 1 lines, y = 74 - 60 × i / (L - 1) percent.
- A single outfield line uses y = 45.
- The separate goalkeeper always uses (50, 89).

Line 1 is Defence, nearest our goalkeeper; the final line is Forward, nearest the opposition goal. Every intervening line is Midfield, numbered when there is more than one. A single outfield line is Midfield; two lines are Defence and Forward. Position keys and percentages reconstruct the layout; arbitrary coordinates are not the source of truth. The pitch uses a relative container and percentage placement. The existing hockey-pitch-clean.png artwork is rotated into portrait orientation without distortion or cropping. Home/away shirt markers and a separate goalkeeper kit overlay the pitch. Formation controls use an aligned grid, and the player panel sits beside the pitch on tablet/desktop and below it on mobile. Dense formations with more than five outfield lines can scroll horizontally inside the pitch area to keep their rows readable. Full names remain in accessible button labels and the selected-position panel.

Rebuilding places existing starters into slots matching their recorded positions first. Any remaining starters are retained in empty slots, with a notice to review those tactical exceptions. It refuses a shape too small for the existing starters. Legacy free-position lineups remain visible, with their substitutes, until an editor explicitly builds a structured formation.

## Selection, duplicates and substitutes

The dropdown assigns a player immediately. Both dropdown and shirt-number matching default to players whose recorded position matches the slot. Show all positions allows an explicit tactical exception; substitutes accept every role. Players assigned elsewhere are disabled, with the occupied position identified. Shirt entry resolves within the same eligible team list: a unique match assigns on Enter; zero matches displays an error; multiple matches show named choices and never guess. Zero is a valid shirt number.

Assignment operations reject duplicate IDs across all starting and substitute positions. Server validation independently checks duplicates, fixture/team membership, slot IDs, and derived placements. Removing clears an assignment. Move/swap exchanges the two assignments, including empty destinations and bench seats, without delete-and-recreate steps for the user.

The existing four substitute positions use the same panel, dropdown and number entry. They are outside the starting-player count.

## Presets and permissions

Built-in presets include 4-3-3, 3-4-3 and 3-3-4. **Save team preset** saves the configured lines with the custom name or generated name; saving the same name replaces it. Presets persist per team and are limited to 50. Selecting one builds it immediately, retaining selected players as described above.

The existing canManage roles—administrator, club_admin, manager and coach—can edit formations and presets. Captains use an existing management role; no new captain role or permissions system was introduced. Team creation and renaming remain restricted to administrators. The API enforces access even if the UI is bypassed.

New structured formations start as drafts. Player/read-only workspace responses omit drafts server-side. Publishing requires all 11 starting slots filled. Any assignment or structure edit returns the selection to draft, hiding it until republished. Unpublish is also available. Legacy lineups retain their previous visibility until converted.

## Validation results

- npm run typecheck: passed.
- npm run lint: passed.
- npm run build: passed (production compilation and static generation).
- npm test: 41 tests passed, including 11 formation tests.
- npm run test:e2e: 11 browser tests passed.

Unit/server coverage includes both standard formations, four-line and extreme custom shapes, separate goalkeeper, deterministic bounded coordinates, assignment, number lookup (unknown/invalid/ambiguous/zero), duplicate prevention, removal, swap/move, substitutes, squad-priority eligibility, database round trips, fixture isolation, team membership, preset persistence/reuse, stale-save conflicts, edit authorization and publication privacy.

Browser coverage includes dropdown assignment and reload, repeated shirt-number/Enter assignment with retained focus, unknown and duplicate numbers, swaps, bench moves/removal, custom formation building, saved preset reuse after reload, and actual position bounds at 390, 768 and 1280 pixels.

## Assumptions and limits

The existing model assumes standard 11-player hockey with four substitutes. Those limits are centralized for formation operations; supporting a different competition size also requires updating the existing server schema/publication rules. Short formations can be saved as drafts, with a warning. Oversized formations cannot be built or submitted.

Training-session attendance is deliberately not treated as match availability. Goalkeepers can be any eligible player; the system does not require a goalkeeper profile. There is one current selection per fixture, so editing a published selection hides it rather than maintaining a separate published snapshot. Drag/drop editing is not implemented for generated slots; click/tap and keyboard move/swap are supported. Presets contain structure and name, not player assignments.
