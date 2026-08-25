import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  LOGIN_PATHS,
  expectConsoleShell,
  expectRefusedOnLoginPage,
  loginAs,
  submitLogin,
} from "./helpers";

test.describe("six-role sign-in", () => {
  test("platform admin reaches the admin console", async ({ page }) => {
    await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
    await expectConsoleShell(page);
  });

  test("contractor admin reaches the trace console", async ({ page }) => {
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
    await expectConsoleShell(page);
  });

  test("consultant signs in through the trace portal", async ({ page }) => {
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.consultant);
  });

  test("recycler admin reaches the scrap console", async ({ page }) => {
    await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
    await expectConsoleShell(page);
  });

  test("driver lands on the driver workspace, not the console", async ({
    page,
  }) => {
    await submitLogin(page, LOGIN_PATHS.scrap, ACCOUNTS.driver);
    await page.waitForURL(/\/driver(\/|$)/, { timeout: 20_000 });
  });

  test("field staff uses the mobile flow: its login page renders", async ({
    page,
  }) => {
    const response = await page.goto("/trace/field-login");
    expect(response?.ok()).toBe(true);
  });
});

test.describe("portal isolation", () => {
  test("recycler credentials are refused on the trace portal", async ({
    page,
  }) => {
    await submitLogin(page, LOGIN_PATHS.trace, ACCOUNTS.recycler);
    await expectRefusedOnLoginPage(page, LOGIN_PATHS.trace);
  });

  test("contractor credentials are refused on the scrap portal", async ({
    page,
  }) => {
    await submitLogin(page, LOGIN_PATHS.scrap, ACCOUNTS.contractor);
    await expectRefusedOnLoginPage(page, LOGIN_PATHS.scrap);
  });

  test("contractor credentials are refused on the admin portal", async ({
    page,
  }) => {
    await submitLogin(page, LOGIN_PATHS.admin, ACCOUNTS.contractor);
    await expectRefusedOnLoginPage(page, LOGIN_PATHS.admin);
  });

  test("a wrong password stays on the login page with an error", async ({
    page,
  }) => {
    await submitLogin(
      page,
      LOGIN_PATHS.trace,
      ACCOUNTS.contractor,
      "Wrong-Pass-999!",
    );
    await expectRefusedOnLoginPage(page, LOGIN_PATHS.trace);
  });

  test("an unauthenticated visit to the console redirects to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });
});
