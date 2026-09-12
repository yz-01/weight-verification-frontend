import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * The pending block has to be readable without scrolling (T-215, AC-209).
 *
 * 客户：「尽量可以缩小那些卡片 他们不需要滑下去那么多」, on top of
 * 「确保他们可以一登录就直接看到」. Ordering alone does not satisfy that: a
 * block can be first in the document and still start below the fold because
 * the header, the filters and the greeting got there before it.
 *
 * Until now there was no evidence either way. `dashboard-priority-order.test.ts`
 * compares source positions, which says nothing about pixels - the reason
 * V-397 was left `PENDING` was exactly this. So this spec measures, and it
 * prints what it measured: a number in the log is what makes "we shrank it"
 * checkable next time instead of a claim.
 *
 * Viewport: the suite's own desktop project, 1280x720. Chosen because it is
 * already the project's convention and it is *tighter* than the 1080p the
 * previous round assumed - a block that clears the fold at 720px of height
 * clears it at 1080p too. **Which resolution the customer actually uses has
 * never been asked**, and this is the one assumption in this file: if they are
 * on something shorter, the threshold here has to come down with it.
 *
 * The assertion is on the block's *top* plus one readable row, not on its
 * whole height. A pending list with forty rows is taller than any screen, and
 * demanding that all of it fit would be a test nobody can keep green; what the
 * customer asked for is to not have to scroll before seeing it at all.
 */

/** How much of a block has to be on screen before it counts as visible. */
const READABLE_ROW = 56;

/**
 * How much chrome may sit above each console's pending block.
 *
 * Measured, not chosen. After T-215: contractor 228, consultant 245, admin
 * 301, recycler 172. Each budget is its own measurement plus about one small
 * row of headroom.
 *
 * Per console rather than one shared number, and that is the point. A single
 * budget had to clear the tallest console (the admin's 301) and therefore
 * could not notice the consultant sliding back from 245 to 301 - which is
 * exactly what this task exists to prevent. A shared threshold would have
 * left the consultant change with no guard at all: reverting it kept the test
 * green, which was checked rather than assumed.
 *
 * Before T-215 the contractor sat at 372 and the consultant at 301. The two
 * changes were a reordering and a merged control row, and both are visible in
 * these numbers rather than argued about.
 *
 * Deliberately a budget on the *chrome* and not on the whole block: a pending
 * list grows with the data, so "all of it fits" would be a test that goes red
 * on a busy week rather than on a mistake.
 */
const CHROME_BUDGET: Record<string, number> = {
  contractor: 260,
  consultant: 275,
  admin: 330,
  recycler: 200,
};

async function foldReport(
  page: Page,
  label: string,
): Promise<{ top: number; viewport: number }> {
  const block = page.locator("[data-dashboard-priority]").first();
  await block.waitFor({ state: "visible", timeout: 20_000 });
  const box = await block.boundingBox();
  expect(box, `${label}: the priority block has no box`).not.toBeNull();
  const viewport = page.viewportSize()?.height ?? 0;
  const scrolled = await page.evaluate(() => window.scrollY);

  // Printed, not just asserted: the next person to touch these screens needs
  // the number to compare against, and a pass with no number is not evidence.
  console.log(
    `FOLD ${label}: priority top=${Math.round(box!.y)} ` +
      `height=${Math.round(box!.height)} viewport=${viewport} scrollY=${scrolled}`,
  );
  return { top: box!.y, viewport };
}

const CONSOLES = [
  {
    label: "contractor",
    portal: LOGIN_PATHS.trace,
    account: ACCOUNTS.contractor,
    path: "/dashboard",
  },
  {
    label: "admin",
    portal: LOGIN_PATHS.admin,
    account: ACCOUNTS.admin,
    path: "/dashboard",
  },
  {
    label: "recycler",
    portal: LOGIN_PATHS.scrap,
    account: ACCOUNTS.recycler,
    path: "/dashboard",
  },
  {
    label: "consultant",
    portal: LOGIN_PATHS.trace,
    account: ACCOUNTS.consultant,
    path: "/consultant-dashboard",
  },
] as const;

for (const console_ of CONSOLES) {
  test(`the ${console_.label} console shows its pending block above the fold`, async ({
    page,
  }) => {
    await loginAs(page, console_.portal, console_.account);
    await page.goto(console_.path);

    const { top, viewport } = await foldReport(page, console_.label);

    // No scrolling happened: `boundingBox` is viewport-relative, so a block
    // reachable only after a scroll would read as fitting.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      top + READABLE_ROW,
      `${console_.label}: the pending block starts at y=${Math.round(top)} in a ` +
        `${viewport}px viewport, so a person has to scroll before they can read it`,
    ).toBeLessThanOrEqual(viewport);
    const budget = CHROME_BUDGET[console_.label];
    expect(budget, `${console_.label} has no measured budget`).toBeGreaterThan(0);
    expect(
      Math.round(top),
      `${console_.label}: ${Math.round(top)}px of header, filters and controls ` +
        `sit above the pending work - the measured budget is ${budget}px`,
    ).toBeLessThanOrEqual(budget);
  });
}
