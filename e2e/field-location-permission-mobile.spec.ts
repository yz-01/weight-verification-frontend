import { expect, test, type Page } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * The field app must not refuse its own requests (F-291).
 *
 * Written for the Location tab, where the customer photographed the refusal.
 * That tab is gone - 「位置」 left the bottom bar (T-321, customer item 43) and
 * its presence panel lives only in the office's /site-gps - so the guard now
 * walks the four tabs the phone does have. The property it holds was never
 * about that one screen: a refusal toast beside content that looks complete.
 *
 * The customer photographed "You do not have permission to perform this
 * action" on this tab twice. The screen renders and the presence numbers
 * appear, so the refusal arrives as a toast beside content that looks
 * complete and names nothing.
 *
 * Why this is a browser test and not another entry in
 * `core.tests.test_screen_walks.FieldStaffLocationTabWalkTests`: that walk
 * hand-maintains the list of URLs the tab fetches, and it was written *for
 * this very bug* - yet it passed throughout, because the two calls actually
 * being refused (`/api/departments/` and `/api/work-trades/`, fired by
 * `WorkforcePresencePanel`) were never added to the list. A hand-written list
 * can only catch what somebody remembered to put in it. Watching the real
 * network traffic cannot miss a call, including one added next year.
 *
 * The 403 list is printed rather than merely asserted: the fix for a refusal
 * is either a permission-map entry or a query gate, and both need the path.
 *
 * The refused-path list is the gate here, not the toast. A sonner toast lives
 * a few seconds, so by the time the panel has rendered and the network is idle
 * a toast that did appear has already gone - asserting only its absence at the
 * end would pass on the broken build too, which was measured rather than
 * assumed: on the unfixed code the toast assertion passed while the 403 list
 * held both refused paths. The toast is checked at first paint, where it would
 * still be on screen, and the 403 list carries the verdict.
 */

/** Every distinct path this page was refused, in the order first seen. */
function watchRefusals(page: Page): string[] {
  const refused: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 403) {
      const path = new URL(response.url()).pathname;
      if (!refused.includes(path)) refused.push(path);
    }
  });
  return refused;
}

test("the field staff tabs refuse none of their own requests", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], {
    origin: "http://localhost:3199",
  });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });

  const refused = watchRefusals(page);
  await loginAsFieldStaff(page);

  const navigation = page.locator("nav").last();
  for (const tab of ["Home", "Attendance", "Site record capture", "Hazard rectification"]) {
    await navigation.getByRole("button", { name: tab, exact: true }).click();
    // Each tab's own calls go out before the next one is opened.
    await page.waitForLoadState("networkidle");
    // Checked per tab, while a toast from that tab would still be on screen.
    await expect(
      page.getByText("You do not have permission to perform this action", {
        exact: false,
      }),
      `a refusal toast on ${tab}`,
    ).toHaveCount(0);
  }

  console.log("FIELD TAB 403s:", JSON.stringify(refused, null, 1));
  expect(refused, "the field tabs were refused these paths").toEqual([]);
});
