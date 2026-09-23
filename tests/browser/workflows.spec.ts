import { test, expect, type BrowserContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });
let signedInState:
  Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
let browserErrors: string[];
test.beforeEach(async ({ page, context }) => {
  browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      browserErrors.push(`${message.text()} ${message.location().url}`);
  });
  if (signedInState) await context.addCookies(signedInState.cookies);
});
test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});

test("protected routes, sign-in and player filtering", async ({
  page,
  context,
}) => {
  await page.goto("/fixtures");
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get("/api/workspace")).status()).toBe(401);
  await page.getByLabel("Email address").fill("captain@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your section" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mens" })).toHaveCount(0);
  await expect(
    page.getByText("Not a member of this section").first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/sections-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ladies" }).click();
  await expect(page.getByRole("heading", { name: /Your team/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "My Team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Alex Morgan" }),
  ).toBeVisible();
  await page.getByLabel("Search players").fill("Sam");
  await expect(page.getByRole("heading", { name: "Sam Taylor" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Alex Morgan" }),
  ).not.toBeVisible();
  await page.getByLabel("Search players").fill("");
  await page.screenshot({
    path: "test-results/my-team-desktop.png",
    fullPage: true,
  });
  signedInState = await context.storageState();
});

test("lineup and checklist persistence, with mobile navigation", async ({
  page,
}) => {
  await page.goto("/fixtures/opening-match");
  await page.getByRole("button", { name: "Build formation", exact: true }).click();
  await page.locator('[data-slot="line-0-0"]').click();
  await page.getByLabel("Show all positions", { exact: true }).check();
  await page.locator("#lineup-player").selectOption("alex");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-slot="line-0-0"]')).toContainText("Alex");
  await page.screenshot({
    path: "test-results/lineup-desktop.png",
    fullPage: true,
  });
  await page.goto("/fixtures/opening-match");
  await page
    .getByRole("button", { name: "Captain tasks", exact: true })
    .click();
  await page.getByPlaceholder("13:45 confirmed").fill("12:00 confirmed");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Captain tasks", exact: true })
    .click();
  await expect(page.getByPlaceholder("13:45 confirmed")).toHaveValue(
    "12:00 confirmed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "My Team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Alex Morgan" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/my-team-mobile.png",
    fullPage: true,
  });
});

for (const route of [
  "/squads",
  "/fixtures",
  "/fixtures/opening-match",
  "/squad-selection",
  "/admin",
  "/teams",
]) {
  test(`mobile layout ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await expect(page.locator("#main")).toBeVisible();
    if (route === "/fixtures/opening-match")
      await page.screenshot({
        path: "test-results/lineup-mobile.png",
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("England Hockey settings import and refresh fixtures without a page reload", async ({
  page,
  context,
}) => {
  const workspace = await (await context.request.get("/api/workspace")).json();
  const teamId = workspace.data.teams[0].id;
  const sourceUrl =
    "https://www.englandhockey.co.uk/teams/northern-development-womens";
  let syncs = 0;
  // Browser test mocks our own API boundary; the service/HTTP tests exercise the real database with upstream mocks.
  await page.route("**/api/england-hockey**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { source: null } });
      return;
    }
    const body = route.request().postDataJSON();
    expect(body.teamId).toBe(teamId);
    expect(body.clubId).toBe(workspace.club.id);
    if (syncs === 0) expect(body.sourceUrl).toBe(sourceUrl);
    else expect(body.sourceUrl).toBeUndefined();
    syncs++;
    const time = syncs === 1 ? "15:15" : "13:30";
    const fixture = {
      id: "eh-browser-fixture",
      teamId,
      opponent: "Liverpool Sefton 3",
      isHome: true,
      date: `2026-09-19T${time}`,
      startTime: time,
      homeTeam: "Northern Development",
      awayTeam: "Liverpool Sefton 3",
      externalSource: "england-hockey",
      externalKey: "id:browser",
      externalTeamId: "eh-team",
      sourceUrl,
    };
    await route.fulfill({
      json: {
        checked: 1,
        added: syncs === 1 ? 1 : 0,
        updated: syncs === 1 ? 0 : 1,
        unchanged: 0,
        skipped: 0,
        source: {
          sourceUrl,
          teamName: "Northern Development",
          lastSyncedAt: "2026-09-06T10:00:00Z",
        },
        workspace: {
          ...workspace,
          revision: workspace.revision + syncs,
          data: {
            ...workspace.data,
            matches: [...workspace.data.matches, fixture],
          },
        },
      },
    });
  });
  await page.goto("/fixtures");
  await page.getByLabel("England Hockey fixtures URL").fill(sourceUrl);
  await page
    .getByRole("button", { name: "Save & Import Fixtures", exact: true })
    .click();
  await expect(page.getByText(/1 checked · 1 added · 0 updated/)).toBeVisible();
  await expect(
    page.getByText("Northern Development vs Liverpool Sefton 3", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(page.getByText(/15:15 pushback/)).toBeVisible();
  await expect(page.getByText("HOME", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Sync Fixtures", exact: true })
    .click();
  await expect(page.getByText(/1 checked · 0 added · 1 updated/)).toBeVisible();
  await expect(page.getByText(/13:30 pushback/)).toBeVisible();
  await expect(
    page.getByText("Northern Development vs Liverpool Sefton 3", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "test-results/england-hockey-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/england-hockey-mobile.png",
    fullPage: true,
  });
});

test("formation keyboard workflow, swap, bench, presets and responsive custom slots", async ({ page }) => {
  await page.goto("/fixtures/opening-match");
  await page.locator('[data-slot="gk"]').click();
  await expect(page.locator('#lineup-player option[value="sam"]')).toHaveCount(1);
  await expect(page.locator('#lineup-player option[value="jo"]')).toHaveCount(0);
  await page.locator('[data-slot="line-0-1"]').click();
  await expect(page.locator('#lineup-player option[value="jo"]')).toHaveCount(1);
  await expect(page.locator('#lineup-player option[value="sam"]')).toHaveCount(0);
  await page.getByLabel("Shirt number", { exact: true }).fill("999");
  await page.getByRole("button", { name: "Assign number" }).click();
  await expect(page.getByText(/No matching player in this position has that shirt number/)).toBeVisible();
  await page.getByLabel("Shirt number", { exact: true }).fill("4");
  await page.getByLabel("Shirt number", { exact: true }).press("Enter");
  await expect(page.locator('[data-slot="line-0-1"]')).toContainText("Jo");
  await expect(page.getByLabel("Shirt number", { exact: true })).toBeFocused();
  await page.getByLabel("Show all positions", { exact: true }).check();
  await page.getByLabel("Shirt number", { exact: true }).fill("8");
  await page.getByLabel("Shirt number", { exact: true }).press("Enter");
  await expect(page.locator('[data-slot="line-0-2"]')).toContainText("Riley");
  await page.getByLabel("Show all positions", { exact: true }).check();
  await page.getByLabel("Shirt number", { exact: true }).fill("7");
  await page.getByLabel("Shirt number", { exact: true }).press("Enter");
  await expect(page.getByText(/Player is already selected/)).toBeVisible();
  await page.locator('[data-slot="line-0-0"]').click();
  await page.getByRole("button", { name: "Move / swap", exact: true }).click();
  await page.locator('[data-slot="line-0-1"]').click();
  await expect(page.locator('[data-slot="line-0-0"]')).toContainText("Jo");
  await expect(page.locator('[data-slot="line-0-1"]')).toContainText("Alex");
  await page.locator('[data-slot="line-0-1"]').click();
  await page.getByRole("button", { name: "Move / swap", exact: true }).click();
  await page.locator('[data-slot="sub-0"]').click();
  await expect(page.locator('[data-slot="sub-0"]')).toContainText("Alex");
  await page.locator('[data-slot="sub-0"]').click();
  await page.getByRole("button", { name: "Remove player", exact: true }).click();
  await expect(page.locator('[data-slot="sub-0"]')).toContainText("Select");
  await page.getByText("Formation builder", { exact: true }).click();
  await page.getByLabel("Outfield lines", { exact: true }).fill("4");
  for (const [i, n] of [3, 3, 2, 2].entries()) await page.getByLabel(`Line ${i + 1} players`, { exact: true }).fill(String(n));
  await page.getByLabel("Custom name", { exact: true }).fill("High press");
  await page.getByRole("button", { name: "Build formation", exact: true }).click();
  await page.getByRole("button", { name: "Save team preset", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/High press · Draft/)).toBeVisible();
  await page.getByText("Formation builder", { exact: true }).click();
  await page.getByLabel("Formation preset", { exact: true }).selectOption({ label: "4-3-3" });
  await page.getByLabel("Formation preset", { exact: true }).selectOption({ label: "High press (team)" });
  await expect(page.locator('[data-slot^="line-"]')).toHaveCount(10);
  await expect(page.locator('[data-slot="line-1-0"]')).toHaveAttribute("aria-label", /Midfield 1/);
  await expect(page.locator('[data-slot="line-2-0"]')).toHaveAttribute("aria-label", /Midfield 2/);
  await expect(page.locator('[data-slot="line-3-0"]')).toHaveAttribute("aria-label", /Forward/);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId("formation-pitch").locator("image")).toHaveAttribute("href", "/hockey-pitch-clean.png");
    const pitch = await page.getByTestId("formation-pitch").boundingBox();
    expect(pitch!.width / pitch!.height).toBeCloseTo(978 / 1608, 2);
    for (const button of await page.getByTestId("formation-pitch").locator("button").all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(pitch!.x);
      expect(rect.y).toBeGreaterThanOrEqual(pitch!.y);
      expect(rect.x + rect.width).toBeLessThanOrEqual(pitch!.x + pitch!.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(pitch!.y + pitch!.height);
    }
    const goalkeeper = page.locator('[data-slot="gk"]');
    await goalkeeper.click();
    const picker = page.getByRole("dialog", { name: "Choose player for position" });
    await expect(picker).toBeVisible();
    const pickerBox = (await picker.boundingBox())!;
    const shirtBox = (await goalkeeper.boundingBox())!;
    expect(pickerBox.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(width);
    expect(pickerBox.y).toBeGreaterThanOrEqual(0);
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(900);
    expect(Math.min(Math.abs(pickerBox.y - shirtBox.y - shirtBox.height), Math.abs(shirtBox.y - pickerBox.y - pickerBox.height))).toBeLessThanOrEqual(9);
    await page.screenshot({ path: `test-results/position-picker-${width}.png`, fullPage: false });
    await page.keyboard.press("Escape");
    await expect(picker).not.toBeVisible();
    await expect(goalkeeper).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByText("Formation builder", { exact: true }).click();
  await page.screenshot({ path: "test-results/formation-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/formation-mobile.png", fullPage: true });
});

test("logout, forged cookies, CSRF and sign-in rate limiting", async ({
  page,
  context,
}) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get("/api/workspace")).status()).toBe(401);
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "forged",
      url: "http://127.0.0.1:3100",
    },
  ]);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
  const csrf = await context.request.post("/api/auth/sign-in/email", {
    headers: { origin: "https://evil.example" },
    data: { email: "captain@example.test", password: "invalid-password" },
  });
  expect(csrf.status()).toBe(403);
  const statuses = [];
  for (let i = 0; i < 6; i++)
    statuses.push(
      (
        await context.request.post("/api/auth/sign-in/email", {
          headers: { origin: "http://127.0.0.1:3100" },
          data: { email: "captain@example.test", password: "invalid-password" },
        })
      ).status(),
    );
  expect(statuses).toContain(429);
});
