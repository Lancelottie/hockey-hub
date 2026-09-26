import { test } from "node:test";
import assert from "node:assert/strict";
import { AWAY_COLOR, HOME_COLOR, resolveKitColor } from "../lib/kit-colors";

test("resolveKitColor defaults to home-blue/away-red, but an explicit kitColor overrides either", () => {
  assert.equal(resolveKitColor(true), HOME_COLOR);
  assert.equal(resolveKitColor(false), AWAY_COLOR);
  assert.equal(resolveKitColor(true, "red"), AWAY_COLOR);
  assert.equal(resolveKitColor(false, "blue"), HOME_COLOR);
});
