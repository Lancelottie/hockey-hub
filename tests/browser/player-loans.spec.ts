import { test, expect } from "@playwright/test";

test("loaned players stay visible after changing slots and reloading", async ({ page, context }) => {
  const response = await context.request.post("/api/auth/sign-in/email", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { email: "captain@example.test", password: process.env.E2E_PASSWORD! },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/fixtures/opening-match");
  await page.getByRole("button", { name: "Build formation", exact: true }).click();
  const slot = page.locator('[data-slot="line-0-1"]');
  const bench = page.locator('[data-slot="sub-3"]');
  await slot.click();
  await page.getByLabel(/Loan a player from/).check();
  await page.locator("#lineup-player").selectOption("casey");
  await expect(slot).toHaveAttribute("aria-label", /Casey Green.*borrowed from Ladies 2s/);
  await page.getByLabel(/Loan a player from/).uncheck();
  await expect(slot).toContainText("Casey G*");
  await page.keyboard.press("Escape");
  await slot.click();
  await expect(page.getByLabel(/Loan a player from/)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Remove player", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move / swap", exact: true }).click();
  await bench.click();
  await expect(bench).toContainText("Casey G*");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(bench).toHaveAttribute("aria-label", /Casey Green.*borrowed from Ladies 2s/);
  await bench.click();
  await expect(page.getByLabel(/Loan a player from/)).not.toBeChecked();
  await page.getByRole("button", { name: "Remove player", exact: true }).click();
  await expect(bench).toContainText("Select");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
});

