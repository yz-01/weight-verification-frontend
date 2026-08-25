import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  LOGIN_PATHS,
  loginAs,
  submitLogin,
} from "./helpers";

/**
 * Runs under the `mobile` project (iPhone 12 viewport, 390px wide). The
 * phone-width portals are where field staff and drivers actually live, so a
 * layout that only works at desktop width is a regression, not a nit.
 */

test("the scrap login renders inside a 390px viewport", async ({ page }) => {
  await page.goto(LOGIN_PATHS.scrap);
  await expect(page.locator("#email")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow, "login page must not scroll horizontally").toBe(false);
});

test("a driver signs in and sees the driver workspace on mobile", async ({
  page,
}) => {
  await submitLogin(page, LOGIN_PATHS.scrap, ACCOUNTS.driver);
  await page.waitForURL(/\/driver(\/|$)/, { timeout: 20_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow, "driver workspace must not scroll horizontally").toBe(false);
});

test("the recycler console is reachable at phone width", async ({ page }) => {
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  await page.waitForLoadState("networkidle");
  await page.goto("/incoming");
  await expect(page.getByText("DS-P-E2E-000001-001")).toBeVisible({
    timeout: 20_000,
  });
});

test("the field staff login page renders at phone width", async ({ page }) => {
  const response = await page.goto("/trace/field-login");
  expect(response?.ok()).toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow, "field login must not scroll horizontally").toBe(false);
});
