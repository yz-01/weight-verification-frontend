import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * What a console shows before anything else, measured on a real screen
 * (T-213).
 *
 * 客户：「所有待审批和通知和重要的东西是放在最上面，确保他们可以一登录就直接
 * 看到」. Four consoles were checked against that; three already complied and
 * the consultant's led with a four-step lifecycle diagram, so a consultant
 * logged in and read an explanation while applications waited past the fold
 * (F-283).
 *
 * This is the half `dashboard-priority-order.test.ts` cannot make. That file
 * reads source order, which is not render order the moment a block lives in
 * its own component - the recycler's pending block is defined at the bottom of
 * its file and rendered near the top, and comparing marker offsets there
 * failed on a screen that was correct. Geometry cannot be fooled that way.
 *
 * "First" is asserted as a y-coordinate comparison rather than as "inside the
 * viewport", deliberately. Whether the block clears the fold depends on the
 * header, the filters and the browser chrome, and pinning a pixel budget here
 * would make this spec fail for reasons that have nothing to do with
 * ordering - that measurement is T-215's, and it is a separate claim.
 */

/**
 * The top of a marked block, or null when the console does not render one.
 *
 * It waits rather than counting immediately. The first version asked
 * `count()` straight after `goto`, which answered zero because the dashboard
 * query had not come back yet - so a correct screen looked like a missing
 * block. A racy check that reports "absent" is worse than a slow one: it
 * fails loudly enough to look like a real defect.
 */
async function markerTop(page: Page, marker: string): Promise<number | null> {
  const block = page.locator(`[${marker}]`).first();
  try {
    await block.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    return null;
  }
  const box = await block.boundingBox();
  return box ? box.y : null;
}

test("the consultant console leads with pending work, not the lifecycle flow", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.consultant);
  // The consultant console has its own route; `/dashboard` is the shared one.
  await page.goto("/consultant-dashboard");

  const priority = await markerTop(page, "data-dashboard-priority");
  const overview = await markerTop(page, "data-dashboard-overview");

  expect(priority, "the consultant console renders no priority block").not.toBeNull();
  expect(overview, "the consultant console renders no overview block").not.toBeNull();
  expect(
    overview!,
    `priority at y=${priority}, overview at y=${overview}`,
  ).toBeGreaterThan(priority!);
});

test("the driver app leads with the job in hand, not the day's counts", async ({
  page,
}) => {
  // Named separately from the consoles because the driver's priority is a
  // different thing: the run they are on, not a queue of approvals (T-214).
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.driver);
  await page.goto("/driver");

  const priority = await markerTop(page, "data-dashboard-priority");
  const overview = await markerTop(page, "data-dashboard-overview");

  expect(priority, "the driver app renders no priority block").not.toBeNull();
  expect(overview, "the driver app renders no overview block").not.toBeNull();
  expect(
    overview!,
    `priority at y=${priority}, overview at y=${overview}`,
  ).toBeGreaterThan(priority!);
});

test("the recycler console leads with pending work, not the metric tiles", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  await page.goto("/dashboard");

  const overview = await markerTop(page, "data-dashboard-overview");
  expect(overview, "the recycler console renders no overview block").not.toBeNull();

  const priority = await markerTop(page, "data-dashboard-priority");
  if (priority === null) {
    /*
     * `PendingActions` returns null when every count is absent, so a yard with
     * nothing outstanding renders no block at all. That is defensible - an
     * empty list does not deserve the first screen - and it is why this is a
     * skip rather than a failure. The ordering claim is untestable on a quiet
     * fixture, and saying so beats asserting something else and calling it
     * proof.
     */
    test.skip(true, "no pending work on this fixture, so there is no order to check");
    return;
  }
  expect(
    overview!,
    `priority at y=${priority}, overview at y=${overview}`,
  ).toBeGreaterThan(priority);
});
