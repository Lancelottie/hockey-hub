import { test, expect } from "@playwright/test";

for (const role of ["club_admin", "northern_hockey_admin"]) test(`${role} can see fixture controls, import and check for changes`, async ({
  page,
  context,
}) => {
  const login = await context.request.post("/api/auth/sign-in/email", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { email: "captain@example.test", password: process.env.E2E_PASSWORD! },
  });
  expect(login.ok()).toBe(true);
  const workspace = await (await context.request.get("/api/workspace")).json();
  // Exercise UI permissions for both active roles; real API authorization is covered by service tests.
  workspace.club.role = role;
  workspace.club.availableRoles = [role];
  await page.route("**/api/workspace", route => route.fulfill({ json: workspace }));
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
    path: `test-results/england-hockey-${role}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/england-hockey-${role}-mobile.png`,
    fullPage: true,
  });
});
