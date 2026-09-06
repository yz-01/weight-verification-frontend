import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * A failed request must not be drawn as an empty answer.
 *
 * `data?.total ?? 0` turns a dead call into a zero, and a bell with no badge
 * is exactly what an inbox with nothing in it looks like - so the reader is
 * told there is nothing waiting, and nobody goes looking for a notification
 * they have been told does not exist. `data?.results ?? []` does the same to
 * a list, which then words an absence it never observed: "no schedule history
 * yet" beside a red toast was how the customer found this (F-222).
 *
 * This runs in a real browser because that is the only place the claim can be
 * checked. The component renders identically for "nothing" and "no answer",
 * so nothing below the query can tell them apart, and no test on the query
 * itself can see what the reader ends up looking at.
 *
 * Routes are matched with a RegExp, not a glob: Playwright's `*` does not
 * cross a `/`, so `get_unread_count*` silently matches nothing against
 * `/api/notifications/get_unread_count/` and the test passes for the wrong
 * reason. The first version of this file did exactly that.
 */

/** Answer one endpoint with the envelope a server error produces. */
async function breakEndpoint(
  page: import("@playwright/test").Page,
  pattern: RegExp,
): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Deliberately broken by the test.",
        code: "server_error",
        errors: {},
      }),
    }),
  );
}

const UNREAD_COUNT = /\/api\/notifications\/get_unread_count\//;

test.describe("a failed request is not an empty answer", () => {
  test("the bell says the unread count is unknown, not that it is zero", async ({
    page,
  }) => {
    await breakEndpoint(page, UNREAD_COUNT);
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);

    // The accessible name is the assertion: a reader using the page without
    // sight gets the same claim the badge makes, and before the fix both
    // said "0 unread".
    await expect(
      page.getByRole("button", { name: /count could not be loaded/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("the bell still reports a real count when the request succeeds", async ({
    page,
  }) => {
    // The guard on the guard. A bell that always said "could not be loaded"
    // would pass the test above, and this is what notices.
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);

    await expect(
      page.getByRole("button", { name: /unread/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /count could not be loaded/i }),
    ).toHaveCount(0);
  });
});
