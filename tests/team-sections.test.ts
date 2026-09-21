import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSection, sectionKey, sectionTeamIds } from "../lib/team-sections";
import { emptySnapshot, snapshotSchema } from "../lib/validation";

test("sectionKey groups by the Ladies/Mens name prefix only", () => {
  assert.equal(sectionKey("Ladies 1s"), "ladies");
  assert.equal(sectionKey("ladies 3s"), "ladies");
  assert.equal(sectionKey("Mens 1s"), "mens");
  assert.equal(sectionKey("First XI"), null);
});

test("sectionTeamIds returns every team sharing a section, falling back to itself alone", () => {
  const teams = [
    { id: "l1", name: "Ladies 1s" },
    { id: "l2", name: "Ladies 2s" },
    { id: "m1", name: "Mens 1s" },
    { id: "x", name: "First XI" },
  ];
  assert.deepEqual(sectionTeamIds(teams, "l1").sort(), ["l1", "l2"]);
  assert.deepEqual(sectionTeamIds(teams, "m1"), ["m1"]);
  assert.deepEqual(sectionTeamIds(teams, "x"), ["x"]);
  assert.deepEqual(sectionTeamIds(teams, "missing"), ["missing"]);
});

test("sameSection is symmetric and does not cross Ladies/Mens or unprefixed teams", () => {
  const teams = [
    { id: "l1", name: "Ladies 1s" },
    { id: "l2", name: "Ladies 2s" },
    { id: "m1", name: "Mens 1s" },
    { id: "x", name: "First XI" },
    { id: "y", name: "Second XI" },
  ];
  assert.equal(sameSection(teams, "l1", "l2"), true);
  assert.equal(sameSection(teams, "l2", "l1"), true);
  assert.equal(sameSection(teams, "l1", "l1"), true);
  assert.equal(sameSection(teams, "l1", "m1"), false);
  assert.equal(sameSection(teams, "x", "y"), false);
});

test("a lineup/review may include a player borrowed from another team in the same section", () => {
  const data = emptySnapshot();
  data.teams = [
    { id: "l1", name: "Ladies 1s" },
    { id: "l3", name: "Ladies 3s" },
  ];
  data.players = [
    { id: "home", teamId: "l3", name: "Home Player", number: 1, position: "Forward" },
    { id: "borrowed", teamId: "l1", name: "Borrowed Player", number: 2, position: "Forward" },
  ];
  data.matches = [{ id: "fixture", teamId: "l3", opponent: "Opponent", date: "", isHome: true }];
  data.lineups.fixture = {
    placements: [{ playerId: "home", x: 50, y: 50 }, { playerId: "borrowed", x: 40, y: 50 }],
    subs: [null, null, null, null],
  };
  data.reviews.fixture = {
    ourScore: "", oppositionScore: "", goalscorers: "", assists: "", summary: "",
    womanOfTheMatchPlayerId: "borrowed", playerFeedback: { borrowed: "Great game" },
  };
  assert.equal(snapshotSchema.safeParse(data).success, true);
});

test("a lineup/review still rejects a player from a different section (Mens vs Ladies)", () => {
  const data = emptySnapshot();
  data.teams = [
    { id: "l3", name: "Ladies 3s" },
    { id: "m1", name: "Mens 1s" },
  ];
  data.players = [
    { id: "mens-player", teamId: "m1", name: "Mens Player", number: 1, position: "Forward" },
  ];
  data.matches = [{ id: "fixture", teamId: "l3", opponent: "Opponent", date: "", isHome: true }];
  data.lineups.fixture = {
    placements: [{ playerId: "mens-player", x: 50, y: 50 }],
    subs: [null, null, null, null],
  };
  assert.equal(snapshotSchema.safeParse(data).success, false);
});
