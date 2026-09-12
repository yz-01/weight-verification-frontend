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
  const ordersLink = page.locator('a[href="/recycler-modules/waste_orders"]').first();
  await expect(ordersLink).toBeVisible({ timeout: 20_000 });
  await ordersLink.click();
  await page.waitForURL(/\/recycler-modules\/waste_orders/, { timeout: 20_000 });
  await expectNoFullReload(page);

  const orderBook = page.locator('a[href="/waste-orders"]');
  await expect(orderBook).toBeVisible();
  await orderBook.click();
  await page.waitForURL(/\/waste-orders/, { timeout: 20_000 });

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

test("admin module landing opens a real child workspace", async ({ page }) => {
  await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
  await page.goto("/companies");
  const child = page.locator('a[href="/companies/admin/directory"]');
  await expect(child).toBeVisible({ timeout: 20_000 });
  await child.click();
  await page.waitForURL(/\/companies\/admin\/directory/, { timeout: 20_000 });
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
