import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * A session that cannot be asked about is not a session that ended (T-240).
 *
 * Found from a flaky run, not from reading code: the Playwright trace of a
 * failed mobile test showed `field_login` answering 200 and the very next
 * `GET /api/auth/get_me/` answering 429, after which the browser was sitting
 * on the PIN screen. The rate limit was the local harness's own doing, but
 * the bounce was not - `auth-provider` sets `retry: false` and then reads
 * `data ?? null`, so one transient failure became "nobody is signed in"
 * (F-365). On a site phone that is a worker re-entering a PIN, and whatever
 * had not synced going with it.
 *
 * The failure is stubbed rather than provoked. The input to the branch is
 * *what the server answered*, and a 429 raised for real would depend on a
 * throttle counter shared with every other test in the run.
 */

const ME = "**/api/auth/get_me/**";

test("a transient failure keeps the person signed in and says why", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/dashboard");
  await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible({
    timeout: 20_000,
  });

  // Every later answer is a 429 - the shape of a throttled or overloaded
  // server, which is not an answer about who this is.
  await page.route(ME, (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Request was throttled." }),
    }),
  );
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Cannot reach the server" }),
  ).toBeVisible({ timeout: 60_000 });
  // The sentence a person needs first: their work is not gone.
  await expect(page.getByText(/You are still signed in/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // And it is not the sign-in page.
  expect(page.url()).not.toMatch(/\/login/);
});

test("the same screen recovers the moment the server answers again", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);

  let refusing = true;
  await page.route(ME, async (route) => {
    if (refusing) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Request was throttled." }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Cannot reach the server" }),
  ).toBeVisible({ timeout: 60_000 });

  refusing = false;
  await page.getByRole("button", { name: "Try again" }).click();

  // Back into the workspace, without having signed in again.
  await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible({
    timeout: 30_000,
  });
});

test("a refused session still signs out, as it always did", async ({ page }) => {
  /*
   * The other half, and the reason this is not simply "never sign anyone out".
   * A 401 means the token is no longer accepted - revoked, expired, account
   * suspended - and leaving that device in the workspace would be worse than
   * any inconvenience of signing in again.
   */
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/dashboard");
  await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible({
    timeout: 20_000,
  });

  await page.route(ME, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Given token not valid." }),
    }),
  );
  await page.reload();

  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Cannot reach the server" }),
  ).toHaveCount(0);
});
