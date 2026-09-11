import { expect, test } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * A notification with nowhere to go still opens (T-217, AC-212).
 *
 * 客户：「每个通知也是可以点进去看细节的，我之前好像改过了可是不确定」. Clickable
 * was real (F-273). What was not: a notification whose payload carries no href
 * did nothing at all beyond marking itself read - while the message it was
 * about sat clamped to two lines above the tap. Every notification the seeded
 * field account holds is like that, all 64 of them, so this is not a corner
 * case.
 *
 * Two answers were possible: give every notification a destination, or let the
 * ones that genuinely have none open where they stand. The first is a
 * per-notifier job on the server and two of them were fixed that way in this
 * task; this spec covers the second, which is what stops the tap from being
 * swallowed in the meantime.
 *
 * Measured by height, not by class name. The clamp is a CSS rule, so what a
 * worker experiences is the box growing - and a test that asserted the class
 * would pass on a build where the clamp had been replaced by something else
 * that still truncated. The seeded notice is deliberately long enough for the
 * difference to exist.
 */

const ORIGIN = "http://localhost:3199";
const TITLE = "Site notice with no screen behind it";

test("a notification with no destination expands instead of doing nothing", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);

  // The bell, named by what it says rather than by an icon.
  await page.getByRole("button", { name: /unread notification/i }).click();

  const row = page.getByRole("button", { name: new RegExp(TITLE) });
  if ((await row.count()) === 0) {
    /*
     * Tapping this row marks it read, and the bell lists only unread - so it
     * can be spent. `manage.py seed_e2e` puts it back (it resets `read_at`),
     * and the suite's own `webServer` runs that on every CI start, so on CI
     * this branch never fires.
     *
     * A skip that says why, rather than a pass. A check that quietly stops
     * checking is the failure this whole suite keeps guarding against.
     */
    test.skip(
      true,
      "the seeded destinationless notification has already been read - run " +
        "`manage.py seed_e2e` to put it back",
    );
    return;
  }
  await expect(row).toBeVisible({ timeout: 20_000 });
  // `.last()`: the row wraps its text in an outer span as well as the message
  // span, so the filter matches both. The inner one is the clamped line.
  const message = row
    .locator("span", { hasText: "The access road at the north gate" })
    .last();
  await expect(message).toBeVisible();

  const clamped = await message.boundingBox();
  expect(clamped, "the message has no box").not.toBeNull();

  await row.click();

  // The list stays open - there was nowhere to navigate - and the message is
  // now taller than the two lines it was cut to.
  await expect(row).toBeVisible();
  await expect
    .poll(async () => (await message.boundingBox())?.height ?? 0, {
      timeout: 10_000,
    })
    .toBeGreaterThan(clamped!.height);

  // And the end of the sentence is on screen, which is the thing the worker
  // could not read before.
  await expect(message).toContainText("the gate closes at six");
});
