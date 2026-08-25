import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, expectConsoleShell, loginAs } from "./helpers";

/**
 * Menu clicks must be client-side transitions. The marker survives only if
 * the page never fully reloaded — the exact "URL changed but the screen
 * needed a refresh" failure this suite exists to catch.
 */
async function markDocument(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    (window as unknown as { __e2eMarker?: number }).__e2eMarker = 1;
  });
}

async function expectNoFullReload(page: import("@playwright/test").Page) {
  const marker = await page.evaluate(
    () => (window as unknown as { __e2eMarker?: number }).__e2eMarker,
  );
  expect(marker).toBe(1);
}

test("contractor sidebar navigates without a full page reload", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.waitForLoadState("networkidle");
  await markDocument(page);

  const projectsLink = page.locator('a[href="/modules/projects"]').first();
  await expect(projectsLink).toBeVisible({ timeout: 20_000 });
  await projectsLink.click();
  await page.waitForURL(/\/modules\/projects/, { timeout: 20_000 });
  await expectNoFullReload(page);
});

test("recycler sidebar reaches the order book without a reload", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  await page.waitForLoadState("networkidle");
  await markDocument(page);

  // The order book lives under the "Waste orders" group; /incoming is one
  // of its sub-tabs, so the sidebar's top-level link is what a user clicks.
  const ordersLink = page.locator('a[href="/waste-orders"]').first();
  await expect(ordersLink).toBeVisible({ timeout: 20_000 });
  await ordersLink.click();
  await page.waitForURL(/\/waste-orders/, { timeout: 20_000 });
  await expectNoFullReload(page);

  // The seeded pending order is visible in the incoming order book.
  await page.goto("/incoming");
  await expect(page.getByText("DS-P-E2E-000001-001")).toBeVisible({
    timeout: 20_000,
  });
});

test("admin console renders its dashboard shell", async ({ page }) => {
  await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
  await expectConsoleShell(page);
  const links = page.locator('a[href^="/"]');
  expect(await links.count()).toBeGreaterThan(3);
});

test("browser back returns to the previous console page", async ({ page }) => {
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.waitForLoadState("networkidle");
  const startPath = new URL(page.url()).pathname;

  const projectsLink = page.locator('a[href="/modules/projects"]').first();
  await expect(projectsLink).toBeVisible({ timeout: 20_000 });
  await projectsLink.click();
  await page.waitForURL(/\/modules\/projects/, { timeout: 20_000 });

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe(startPath);
});
