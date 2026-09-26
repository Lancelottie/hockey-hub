import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSlots, assignPlayer, swapPlayers, withFormation, shirtMatches, eligiblePlayers, lineRole, playersForSlot, playerShirtLabel, requiredSlots } from "../lib/formation";
import { emptySnapshot, snapshotSchema } from "../lib/validation";
import { getDb, migrateApp } from "../lib/db";
import { readClub, writeClub, AccessError } from "../lib/repository";
import type { Lineup, Player } from "../lib/types";

const empty = (): Lineup => withFormation({ placements: [], subs: [null, null, null, null] }, { lines: [3, 4, 3], name: "", status: "draft", assignments: {} });
const players: Player[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, teamId: "team", name: `Player ${i}`, number: i, position: i === 10 ? "Goalkeeper" : "Forward" }));
for (const lines of [[3, 4, 3], [4, 3, 3], [3, 3, 2, 2], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [10]]) {
  test(`${lines.join("-")} creates deterministic, bounded positions and a separate goalkeeper`, () => {
    const slots = generateSlots(lines);
    assert.equal(slots.length, 11);
    assert.equal(slots.filter(s => s.id !== "gk").length, 10);
    assert.deepEqual(slots, generateSlots(lines));
    assert.equal(slots.at(-1)?.id, "gk");
    assert.equal(slots.at(-1)?.y, 89);
    assert.ok(slots.every(s => s.x > 5 && s.x < 95 && s.y > 0 && s.y < 100));
    assert.equal(new Set(slots.map(s => s.id)).size, 11);
  });
}
test("assignment, duplicate prevention, removal, swapping and substitutes", () => {
  let value = assignPlayer(empty(), "line-0-0", "p1");
  assert.equal(value.placements[0].playerId, "p1");
  assert.throws(() => assignPlayer(value, "gk", "p1"), /already selected/);
  assert.throws(() => assignPlayer(value, "sub-0", "p1"), /already selected/);
  value = assignPlayer(value, "gk", "p2");
  value = swapPlayers(value, "line-0-0", "gk");
  assert.equal(value.formation?.assignments.gk, "p1");
  assert.equal(value.formation?.assignments["line-0-0"], "p2");
  value = swapPlayers(value, "gk", "sub-0");
  assert.equal(value.subs[0], "p1");
  assert.equal(value.formation?.assignments.gk, undefined);
  value = assignPlayer(value, "sub-0");
  assert.equal(value.subs[0], null);
  assert.throws(() => assignPlayer(value, "unknown", "p1"), /Unknown position/);
});
test("shirt labels show a first name plus the surname's initial, falling back for a single name", () => {
  assert.equal(playerShirtLabel("Jaimie Becks"), "Jaimie B");
  assert.equal(playerShirtLabel("Mary Anne Smith-Jones"), "Mary S");
  assert.equal(playerShirtLabel("  Laura   Palmer  "), "Laura P");
  assert.equal(playerShirtLabel("Cher"), "Cher");
  assert.equal(playerShirtLabel(""), "");
});
test("shirt lookup handles zero, invalid, unknown and ambiguous numbers", () => {
  assert.equal(shirtMatches(players, "0")[0].id, "p0");
  assert.equal(shirtMatches(players, "7")[0].id, "p7");
  for (const value of ["", "999", "-1", "1e0", "abc"]) assert.deepEqual(shirtMatches(players, value), []);
  assert.equal(shirtMatches([...players, { ...players[0], id: "duplicate" }], "0").length, 2);
});
test("eligibility prioritises squad then availability then team, including empty squads", () => {
  assert.equal(eligiblePlayers(players, "other").length, 0);
  assert.equal(eligiblePlayers(players, "team").length, 12);
  assert.deepEqual(eligiblePlayers(players, "team", ["p1"], ["p2"]).map(p => p.id), ["p1"]);
  assert.deepEqual(eligiblePlayers(players, "team", undefined, ["p2"]).map(p => p.id), ["p2"]);
  assert.deepEqual(eligiblePlayers(players, "team", []), []);
});
test("eligibility can temporarily widen to other teams (borrowed players)", () => {
  const borrowed: Player = { id: "b1", teamId: "other", name: "Borrowed", number: 99, position: "Forward" };
  const pool = [...players, borrowed];
  assert.equal(eligiblePlayers(pool, "team").length, 12);
  const widened = eligiblePlayers(pool, "team", undefined, undefined, ["other"]);
  assert.equal(widened.length, 13);
  assert.ok(widened.some(p => p.id === "b1"));
  // Restriction (squad/availability) still applies across the widened pool.
  assert.deepEqual(eligiblePlayers(pool, "team", ["b1"], undefined, ["other"]).map(p => p.id), ["b1"]);
});
const dir = mkdtempSync(join(tmpdir(), "hockey-formation-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
after(() => { getDb().close(); rmSync(dir, { recursive: true, force: true }); });
test("SQLite persistence, correct fixture/team, presets, permissions and publication", async () => {
  const db = getDb();
  db.exec("CREATE TABLE user (id TEXT PRIMARY KEY)");
  migrateApp();
  db.exec("INSERT INTO user VALUES ('captain'),('reader'),('other'); INSERT INTO app_accounts(user_id) VALUES ('captain'),('reader'),('other'); INSERT INTO clubs(id,name) VALUES ('club','Club'),('other','Other'); INSERT INTO club_memberships VALUES ('captain','club','manager'),('reader','club','player'),('other','other','manager')");
  const data = emptySnapshot();
  data.teams = [{ id: "team", name: "Team" }];
  data.players = players;
  data.matches = ["fixture", "second"].map(id => ({ id, teamId: "team", opponent: "Opposition", date: "", isHome: true }));
  // Managers can save presets but cannot create teams.
  db.prepare("UPDATE club_memberships SET role='club_admin' WHERE user_id='captain'").run();
  (await writeClub("captain", "club", 0, data));
  db.prepare("UPDATE club_memberships SET role='manager' WHERE user_id='captain'").run();
  data.teams[0].formationPresets = [{ name: "High press", lines: [3, 3, 2, 2] }];
  data.lineups.fixture = assignPlayer(empty(), "gk", "p10");
  (await writeClub("captain", "club", 1, data));
  const reload = (await readClub("captain", "club"));
  assert.deepEqual(reload.data.lineups.fixture, data.lineups.fixture);
  assert.equal(reload.data.lineups.second, undefined);
  assert.deepEqual(reload.data.teams[0].formationPresets, data.teams[0].formationPresets);
  assert.equal(generateSlots(reload.data.teams[0].formationPresets![0].lines).length, 11);
  assert.deepEqual((await readClub("reader", "club")).data.lineups, {});
  await assert.rejects(async () => (await writeClub("reader", "club", 2, data)), AccessError);
  await assert.rejects(async () => (await readClub("other", "club")), AccessError);
  await assert.rejects(async () => (await writeClub("captain", "club", 1, data)), /Another user/);
  let filled = empty();
  generateSlots([3, 4, 3]).forEach((slot, i) => { filled = assignPlayer(filled, slot.id, `p${i}`); });
  filled.formation!.status = "published";
  data.lineups.fixture = filled;
  (await writeClub("captain", "club", 2, data));
  assert.deepEqual((await readClub("reader", "club")).data.lineups.fixture, filled);
  const invalid = structuredClone(data);
  invalid.lineups.fixture.subs[0] = "p0";
  assert.equal(snapshotSchema.safeParse(invalid).success, false);
  invalid.lineups.fixture = assignPlayer(empty(), "gk", "p10");
  invalid.lineups.fixture.formation!.status = "published";
  assert.equal(snapshotSchema.safeParse(invalid).success, false);
  invalid.lineups.fixture = empty();
  invalid.lineups.fixture.formation!.assignments.unknown = "p1";
  assert.equal(snapshotSchema.safeParse(invalid).success, false);
  invalid.lineups.fixture = assignPlayer(empty(), "gk", "p10");
  invalid.players[10].teamId = "other-team";
  invalid.teams.push({ id: "other-team", name: "Other" });
  assert.equal(snapshotSchema.safeParse(invalid).success, false);
  invalid.players[10].teamId = "team";
  invalid.lineups.missing = invalid.lineups.fixture;
  assert.equal(snapshotSchema.safeParse(invalid).success, false);
});

test("requiredSlots drops only the goalkeeper when noKeeper is set; publish accepts a GK-less fixture", () => {
  const slots = generateSlots([3, 4, 3]);
  assert.equal(requiredSlots(slots, false).length, 11);
  assert.equal(requiredSlots(slots, true).length, 10);
  assert.ok(!requiredSlots(slots, true).some(s => s.id === "gk"));

  let filled = empty();
  generateSlots([3, 4, 3]).filter(s => s.id !== "gk").forEach((slot, i) => { filled = assignPlayer(filled, slot.id, `p${i}`); });
  filled.formation!.noKeeper = true;
  filled.formation!.status = "published";
  const data = emptySnapshot();
  data.teams = [{ id: "team", name: "Team" }];
  data.players = players;
  data.matches = [{ id: "fixture", teamId: "team", opponent: "Opposition", date: "", isHome: true }];
  data.lineups.fixture = filled;
  assert.equal(snapshotSchema.safeParse(data).success, true);

  // The very same GK-less lineup can't publish once noKeeper is turned back off.
  const withoutFlag = structuredClone(data);
  withoutFlag.lineups.fixture.formation!.noKeeper = false;
  assert.equal(snapshotSchema.safeParse(withoutFlag).success, false);
});
test("kitColor lives on the formation, so it can change even on an England-Hockey-imported fixture", async () => {
  // Imported match records may only be changed by the sync service (writeClub rejects any other
  // edit to them, and even creating one this way is refused) — kitColor must live on the
  // formation/lineup document instead, or this feature would be unusable for every synced fixture.
  const db = getDb();
  db.exec("INSERT INTO clubs(id,name) VALUES ('kit-club','Kit Club'); INSERT INTO club_memberships VALUES ('captain','kit-club','club_admin')");
  const data = emptySnapshot();
  data.teams = [{ id: "team", name: "Team" }];
  data.players = players;
  await writeClub("captain", "kit-club", 0, data);
  // Simulate the England Hockey sync service writing the imported fixture directly.
  const importedMatch = {
    id: "imported-fixture", teamId: "team", opponent: "Opposition", date: "",
    isHome: true, externalSource: "england-hockey" as const, externalKey: "ext-1",
  };
  db.prepare("INSERT INTO fixtures(club_id,id,team_id,data) VALUES(?,?,?,?)")
    .run("kit-club", importedMatch.id, importedMatch.teamId, JSON.stringify(importedMatch));

  const withLineup = structuredClone(data);
  withLineup.matches = [importedMatch];
  withLineup.lineups["imported-fixture"] = assignPlayer(empty(), "gk", "p10");
  await writeClub("captain", "kit-club", 1, withLineup);

  const withKit = structuredClone(withLineup);
  withKit.lineups["imported-fixture"].formation!.kitColor = "red";
  const revision = await writeClub("captain", "kit-club", 2, withKit);
  assert.equal(revision, 3);
  const reloaded = await readClub("captain", "kit-club");
  assert.equal(reloaded.data.lineups["imported-fixture"].formation!.kitColor, "red");
});
test("presets map defence to our goal, forwards to attack, and extra lines to midfield", () => {
  const slots = generateSlots([4, 3, 3]);
  assert.equal(slots.filter(s => s.role === "Defender").length, 4);
  assert.equal(slots.filter(s => s.role === "Midfielder").length, 3);
  assert.equal(slots.filter(s => s.role === "Forward").length, 3);
  assert.equal(slots.filter(s => s.role === "Goalkeeper").length, 1);
  assert.ok(slots[0].y > slots[7].y);
  for (const count of [4, 5, 6]) {
    assert.equal(lineRole(0, count), "Defender");
    assert.equal(lineRole(count - 1, count), "Forward");
    for (let i = 1; i < count - 1; i++) assert.equal(lineRole(i, count), "Midfielder");
  }
  assert.equal(lineRole(0, 1), "Midfielder");
  assert.equal(lineRole(0, 2), "Defender");
  assert.equal(lineRole(1, 2), "Forward");
});
test("slot dropdown and shirt lookup share positional filtering; bench allows every role", () => {
  const squad: Player[] = [
    { ...players[0], position: "Defender" },
    { ...players[1], position: "Midfielder" },
    { ...players[2], position: "Forward" },
    { ...players[3], position: "Goalkeeper" },
  ];
  const slots = generateSlots([4, 3, 3]);
  for (const [slot, id] of [["line-0-0", "p0"], ["line-1-0", "p1"], ["line-2-0", "p2"], ["gk", "p3"]]) {
    const eligible = playersForSlot(squad, slots, slot);
    assert.deepEqual(eligible.map(p => p.id), [id]);
    assert.equal(shirtMatches(eligible, String(eligible[0].number))[0].id, id);
  }
  assert.deepEqual(shirtMatches(playersForSlot(squad, slots, "gk"), "0"), []);
  assert.deepEqual(playersForSlot(squad, slots, "sub-0"), squad);
});
