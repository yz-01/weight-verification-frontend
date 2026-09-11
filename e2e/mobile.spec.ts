import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  LOGIN_PATHS,
  loginAs,
  loginAsFieldStaff,
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
  await page.goto("/incoming?search=DS-P-E2E-000001-001");
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

test("field staff sees actionable tasks with five direct navigation buttons", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], {
    origin: "http://localhost:3199",
  });
  await context.setGeolocation({
    latitude: 3.139,
    longitude: 101.6869,
  });
  await loginAsFieldStaff(page);

  // The task *card*, named specifically: since T-209 put 「我提交过的」 back on
  // the home, this task's title is on the screen twice - once here and once as
  // a history row - and a bare text match is ambiguous.
  await expect(
    page.getByRole("heading", { name: "Inspect E2E material delivery" }),
  ).toBeVisible({ timeout: 20_000 });
  const navigation = page.locator("nav").last();
  await expect(navigation.getByRole("button")).toHaveCount(5);
  await expect(navigation.getByText(/task|任务|任務|tugas/i)).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow, "field workspace must not scroll horizontally").toBe(false);

  /*
   * 隐患 in one tap (T-211).
   *
   * This assertion used to be two taps: the button opened a list page whose
   * only action was 上报隐患, and the form came after that. The customer asked
   * for the middle page to go - 「当工作人员按隐患后可以直接上报，不需要跳两个
   * 页面」 - so the form has to be on screen after the first tap, and the
   * intermediate button has to be gone rather than merely skippable.
   */
  await navigation.getByRole("button").last().click();
  await expect(page.getByRole("heading", { name: "Safety / hazard" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-draft-status]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(report a hazard|上报隐患|上報隱患|lapor bahaya)$/i }),
  ).toHaveCount(0);
});

test("field staff material draft survives closing and reopening the work form", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], {
    origin: "http://localhost:3199",
  });
  await context.setGeolocation({
    latitude: 3.139,
    longitude: 101.6869,
  });
  await loginAsFieldStaff(page);

  const task = page.locator("article").filter({
    hasText: "Inspect E2E material delivery",
  });
  await task.getByRole("button", { name: "Open work form" }).click();

  const workFormUrl = page.url();
  const materialName = page
    .locator("label")
    .filter({ hasText: "Material name" })
    .locator("..")
    .locator("input");
  const draftValue = `Draft material ${Date.now()}`;
  await materialName.fill(draftValue);
  await expect(page.locator('[data-draft-status="saved"]')).toBeVisible({
    timeout: 20_000,
  });

  await page.close();
  const reopenedPage = await context.newPage();
  await reopenedPage.goto(workFormUrl);
  const restoredMaterialName = reopenedPage
    .locator("label")
    .filter({ hasText: "Material name" })
    .locator("..")
    .locator("input");
  await expect(restoredMaterialName).toHaveValue(draftValue, {
    timeout: 20_000,
  });
});
