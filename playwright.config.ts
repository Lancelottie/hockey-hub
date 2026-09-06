import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
const password =
  process.env.E2E_PASSWORD ?? randomBytes(24).toString("base64url");
process.env.E2E_PASSWORD = password;
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --import tsx scripts/e2e-seed.mts && npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      DATABASE_PATH: ".test-data/e2e.sqlite",
      NEXT_DIST_DIR: ".next-e2e",
      E2E_PASSWORD: password,
    },
  },
});
