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

  // A03: the entry opens its page directly - no card page in between.
  const projectsLink = page.locator('[data-sidebar="menu-button"][href="/projects"]').first();
  await expect(projectsLink).toBeVisible({ timeout: 20_000 });
  await projectsLink.click();
  await page.waitForURL(/\/projects$/, { timeout: 20_000 });
  await expectNoFullReload(page);
});

test("recycler sidebar reaches the order book without a reload", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  await page.waitForLoadState("networkidle");
  await markDocument(page);

  // The order book lives under the "Waste orders" entry, which opens its
  // first page directly (A03); hovering it opens the rest to the right (B03).
  const ordersEntry = page
    .locator('[data-sidebar="menu-item"]')
    .filter({ has: page.locator('[data-sidebar="menu-button"][href="/waste-orders"]') })
    .first();
  await expect(ordersEntry).toBeVisible({ timeout: 20_000 });
  await ordersEntry.hover();
  const tasks = page.getByRole("menuitem", { name: "Driver tasks" });
  await expect(tasks).toBeVisible();
  await ordersEntry.locator('[data-sidebar="menu-button"]').click();
  await page.waitForURL(/\/waste-orders/, { timeout: 20_000 });
  await expectNoFullReload(page);

  // Search for the stable seed record so repeated E2E runs cannot push it
  // beyond the first page with the orders created by order-flow.spec.ts.
  await page.goto("/incoming");
  await page.getByRole("textbox", { name: "Search" }).fill("DS-P-E2E-000001-001");
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

test("admin and contractor put actionable work before long dashboard content", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
  const adminPriority = page.locator("[data-dashboard-priority]");
  const adminMap = page.locator("#admin-map-title");
  await expect(adminPriority).toBeVisible({ timeout: 20_000 });
  await expect(adminMap).toBeVisible();
  expect(await page.evaluate(() => {
    const priority = document.querySelector("[data-dashboard-priority]");
    const map = document.querySelector("#admin-map-title");
    return Boolean(priority && map && (priority.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);

  await page.evaluate(() => window.localStorage.clear());
  await page.context().clearCookies();
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  const contractorPriority = page.locator("[data-dashboard-priority]");
  await expect(contractorPriority).toBeVisible({ timeout: 20_000 });
  const overview = page.locator("[data-dashboard-overview]");
  await expect(overview).toBeVisible();
  expect(await page.evaluate(() => {
    const priority = document.querySelector("[data-dashboard-priority]");
    const overview = document.querySelector("[data-dashboard-overview]");
    return Boolean(priority && overview && (priority.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
});

test("an old module address forwards to its first page (A03)", async ({ page }) => {
  await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
  await page.goto("/companies");
  await page.waitForURL(/\/companies\/create/, { timeout: 20_000 });

  await page.evaluate(() => window.localStorage.clear());
  await page.context().clearCookies();
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/modules/materials");
  await page.waitForURL(/\/receipts$/, { timeout: 20_000 });
});

test("browser back returns to the previous console page", async ({ page }) => {
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.waitForLoadState("networkidle");
  const startPath = new URL(page.url()).pathname;

  const projectsLink = page.locator('[data-sidebar="menu-button"][href="/projects"]').first();
  await expect(projectsLink).toBeVisible({ timeout: 20_000 });
  await projectsLink.click();
  await page.waitForURL(/\/projects$/, { timeout: 20_000 });

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe(startPath);
});
