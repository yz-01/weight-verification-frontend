import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * The counter-assertion to the F-291 gate.
 *
 * `field-location-permission-mobile.spec.ts` proves a field worker is no
 * longer refused the department and trade lists, which was done by not asking
 * for them. Without this file that fix would be indistinguishable from having
 * deleted the filters for everybody.
 *
 * `company_admin` does hold `department.view` and `work_trade.view` - not by
 * being listed in `role_templates.py`, which enumerates neither, but because
 * that role's permissions are computed as `_all_for(CONTRACTOR)` and
 * authorisation reads the catalogue directly (`Role.permissions_for`). So the
 * two filters are a working feature for a supervisor and must stay.
 *
 * This file has no `mobile` in its name on purpose: the project matchers in
 * `playwright.config.ts` send it to the desktop project, and `/site-gps` is
 * the console screen where the same panel is mounted at desktop width.
 */
test("a contractor admin still sees both presence filters", async ({ page }) => {
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/site-gps");
  await expect(page.getByText("On site now", { exact: false })).toBeVisible({
    timeout: 30_000,
  });

  // The selects are labelled through `aria-label` on their trigger.
  await expect(
    page.getByLabel("Department", { exact: false }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByLabel("Trade", { exact: false }).first(),
  ).toBeVisible({ timeout: 20_000 });
});
