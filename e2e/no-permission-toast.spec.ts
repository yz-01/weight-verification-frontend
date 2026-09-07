import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * A screen the reader is allowed to open must not refuse its own requests.
 *
 * The customer reported "You do not have permission to perform this action"
 * on screens they had just been let into. A 403 on one of a screen's several
 * opening calls does not stop the page rendering, so it arrives as a toast
 * beside content that looks complete - and the reader cannot tell which part
 * of what they are looking at is missing.
 *
 * The assertion is the toast, but the diagnosis is the list of refused URLs
 * this prints: the fix is a permission map entry, and it needs the path.
 */
function watch(page: import("@playwright/test").Page): string[] {
  const refused: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 403) {
      const url = new URL(response.url()).pathname;
      if (!refused.includes(url)) refused.push(url);
    }
  });
  return refused;
}

test.describe("a screen does not refuse its own requests", () => {
  test("the platform admin dashboard", async ({ page }) => {
    const refused = watch(page);
    await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Give the deferred sections time to ask for what they need.
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

    console.log("ADMIN 403s:", JSON.stringify(refused, null, 1));
    expect(refused, "the admin dashboard was refused these paths").toEqual([]);
  });

  test("the contractor dashboard", async ({ page }) => {
    const refused = watch(page);
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

    console.log("CONTRACTOR 403s:", JSON.stringify(refused, null, 1));
    expect(refused, "the contractor dashboard was refused these paths").toEqual(
      [],
    );
  });

  // The site GPS panel the customer also reported is not here: field staff
  // sign in through the PIN flow at /trace/field-login, not the portal login
  // these helpers drive, so a walk of that screen lives on the backend
  // instead - core.tests.test_screen_walks.FieldStaffLocationTabWalkTests,
  // which now includes the four shell calls this file exists for.
});
