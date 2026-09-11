import { expect, test } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * `?tab=incidents` still lands somewhere useful (T-211).
 *
 * The hazard tab used to be a list page. The customer asked for it to go -
 * 「图3也可以移除…当工作人员按隐患后可以直接上报，不需要跳两个页面」 - so the
 * tab now renders exactly one thing, a hazard's conversation, and has nothing
 * to show when it is reached without one.
 *
 * That case is not hypothetical. The old 事故上报 feature still builds
 * notifications pointing at `/field-staff?tab=incidents&thread=...`
 * (`site_operations/views.py`), and its field screen was removed when the
 * customer folded that feature into 隐患整改 (F-317). Those links used to land
 * on the list; without a fall-through they would now land on a blank tab.
 *
 * What they cannot do is open the conversation the notification is about: the
 * `thread` in that link is an `IncidentReportThread` id and this room is keyed
 * by `SafetyIncident`. Resolving one to the other is T-217's job, so this spec
 * asserts the honest current behaviour - the reporting form, which is also
 * where the nav button goes - rather than a redirect that does not exist.
 *
 * The one-tap path itself is asserted in `mobile.spec.ts`, beside the rest of
 * the bottom-nav contract.
 */

const ORIGIN = "http://localhost:3199";

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);
});

test("an old hazard-tab link opens the reporting form, not a blank tab", async ({
  page,
}) => {
  await page.goto("/field-staff?tab=incidents&thread=some-old-thread-id");

  await expect(
    page.getByRole("heading", { name: "Safety / hazard" }),
  ).toBeVisible({ timeout: 30_000 });
  // The form, for real: its draft banner is part of it.
  await expect(page.locator("[data-draft-status]")).toBeVisible();
});

test("the removed hazard list is not reachable from the tab", async ({
  page,
}) => {
  await page.goto("/field-staff?tab=incidents");

  await expect(
    page.getByRole("heading", { name: "Safety / hazard" }),
  ).toBeVisible({ timeout: 30_000 });
  /*
   * The list page and its single button, both gone. Asserted by absence,
   * because that is the change: a middle page that still rendered would
   * satisfy every other assertion in this file.
   *
   * The string is the list's subtitle, not its heading. Its heading said
   * "Hazards", which the bottom nav also says - so that assertion could never
   * have failed for the right reason.
   */
  await expect(
    page.getByText("What you reported, and what you have to fix."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /^(report a hazard|上报隐患|上報隱患|lapor bahaya)$/i,
    }),
  ).toHaveCount(0);
});
