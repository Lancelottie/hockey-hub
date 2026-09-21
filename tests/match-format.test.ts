import { test } from "node:test";
import assert from "node:assert/strict";
import { isUpcomingFixture } from "../lib/match-format";

const today = new Date(2026, 8, 20); // 2026-09-20

test("isUpcomingFixture treats today and future dates as upcoming, past dates as not", () => {
  assert.equal(isUpcomingFixture("2026-09-20", today), true);
  assert.equal(isUpcomingFixture("2026-09-21", today), true);
  assert.equal(isUpcomingFixture("2026-10-01", today), true);
  assert.equal(isUpcomingFixture("2026-09-19", today), false);
  assert.equal(isUpcomingFixture("2025-01-01", today), false);
});

test("isUpcomingFixture ignores time-of-day for the match's own day", () => {
  assert.equal(isUpcomingFixture("2026-09-20T00:00", today), true);
  assert.equal(isUpcomingFixture("2026-09-20T23:59", today), true);
});

test("isUpcomingFixture treats empty or malformed dates as not upcoming", () => {
  assert.equal(isUpcomingFixture("", today), false);
  assert.equal(isUpcomingFixture("not-a-date", today), false);
});
