import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * T-216: the create and edit forms open as dialogs over the list.
 *
 * 客户：「所有 form 的东西可以弄成 pop out card，比如说材料进场（图4）太大了
 * 可以弄小一点他们不用滑那么多下去」.
 *
 * The 28 routes are intercepted, not replaced. Three things follow, and all
 * three are asserted here because each one is a way this could have quietly
 * broken something that used to work:
 *
 * - a click from inside the app opens the dialog and the address still changes,
 *   so the browser's back button closes it;
 * - the list behind is never unmounted, so it comes back as it was;
 * - the same address typed or followed from outside still renders the full
 *   page, which is what the bookmarks and the notification links (F-293) use.
 *
 * The registry side - that all 28 routes exist and each one renders the page it
 * intercepts - is asserted in `src/app/modal-routes.test.ts`, where it can be
 * exhaustive. A browser is the wrong instrument for counting files.
 */

const WAIT = { timeout: 30_000 };

/** Which signed-in account can actually reach each module's list. */
const CREATE: Array<[keyof typeof ACCOUNTS, keyof typeof LOGIN_PATHS, string[]]> = [
  [
    "contractor",
    "trace",
    ["consultant-applications", "dispatches", "projects", "receipts", "roles", "suppliers", "users"],
  ],
  [
    "recycler",
    "scrap",
    ["deductions", "drivers", "settlements", "sites", "tasks", "vehicles"],
  ],
  ["admin", "admin", ["companies", "scales"]],
];

/** Modules whose list carries a row to edit with the seeded data. */
const EDIT: Array<[keyof typeof ACCOUNTS, keyof typeof LOGIN_PATHS, string[]]> = [
  ["contractor", "trace", ["dispatches", "projects", "roles", "users"]],
  ["recycler", "scrap", ["drivers", "sites", "vehicles"]],
];

test.describe("form dialogs", () => {
  test("the delivery form opens over the list, and the address still works", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
    await page.goto("/receipts");

    /*
     * A plain CSS locator, not `getByRole`. While the dialog is open the rest
     * of the page is `aria-hidden`, which is correct - and which means the
     * accessibility tree, and therefore every role query, cannot see the list
     * at all. That is exactly the thing this test has to look at.
     */
    const listTitle = page.locator("main h1, main h2").first();
    await expect(listTitle).toHaveText("Material receipts", WAIT);

    await page.locator('a[href="/receipts/create"]').click();

    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible(WAIT);
    expect(new URL(page.url()).pathname).toBe("/receipts/create");

    // The list did not go anywhere. This is the whole point of intercepting
    // rather than navigating: the filters, the page and the scroll position
    // are still there because the component was never unmounted.
    //
    await expect(listTitle).toHaveText("Material receipts");

    // 「弄小一点他们不用滑那么多下去」 measured rather than eyeballed: the
    // dialog has to fit the window, and the fields scroll inside it rather
    // than the whole page scrolling.
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box, "the dialog must have a box").toBeTruthy();
    expect(viewport, "the viewport must have a size").toBeTruthy();
    expect(box!.height).toBeLessThanOrEqual(viewport!.height);
    expect(box!.y).toBeGreaterThanOrEqual(0);

    const pageScrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    );
    expect(pageScrolls, "the page behind the dialog must not scroll").toBe(
      false,
    );

    /*
     * Both buttons are in the dialog and on screen without scrolling to them.
     * This is the half of 「不用滑那么多下去」 that a height measurement alone
     * misses: a dialog that fits the window but puts Save below its own fold
     * is the same complaint in a smaller box.
     */
    const footer = dialog.locator('[data-slot="dialog-footer"]');
    await expect(footer.getByRole("button", { name: "Cancel" })).toBeInViewport();
    await expect(footer.getByRole("button", { name: "Create" })).toBeInViewport();

    // Back closes it and leaves the list where it was.
    await page.goBack();
    await expect(dialog).toBeHidden(WAIT);
    expect(new URL(page.url()).pathname).toBe("/receipts");
    await expect(listTitle).toBeVisible();
    await expect(listTitle).toHaveText("Material receipts");
  });

  test("the same address typed from outside still renders the full page", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);

    // A hard load, the way a bookmark or a notification link arrives.
    await page.goto("/receipts/create");

    await expect(
      page.getByRole("heading", { name: "Record a delivery" }),
    ).toBeVisible(WAIT);
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
    // The page chrome the dialog does without: a way back to the list.
    await expect(page.locator('a[href="/receipts"]').first()).toBeVisible();
  });

  for (const [who, portal, slugs] of CREATE) {
    test(`every new-record form ${who} can reach opens as a dialog`, async ({
      page,
    }) => {
      test.setTimeout(600_000);
      await loginAs(page, LOGIN_PATHS[portal], ACCOUNTS[who]);

      for (const slug of slugs) {
        await openFrom(page, `/${slug}`, `a[href="/${slug}/create"]`);
        expect(
          new URL(page.url()).pathname,
          `${slug}: the address must change so back can close it`,
        ).toBe(`/${slug}/create`);
        await closeDialog(page, slug);
      }
    });
  }

  for (const [who, portal, slugs] of EDIT) {
    test(`every edit form ${who} can reach opens as a dialog`, async ({
      page,
    }) => {
      test.setTimeout(600_000);
      await loginAs(page, LOGIN_PATHS[portal], ACCOUNTS[who]);

      for (const slug of slugs) {
        await openFrom(
          page,
          `/${slug}`,
          `a[href^="/${slug}/"][href$="/edit"]`,
        );
        expect(new URL(page.url()).pathname, slug).toMatch(
          new RegExp(`^/${slug}/[^/]+/edit$`),
        );
        await closeDialog(page, slug);
      }
    });
  }
});

/** Go to a list and click the link that used to navigate away from it. */
async function openFrom(page: Page, list: string, selector: string) {
  await page.goto(list);
  const link = page.locator(selector).first();
  await expect(link, `${list}: no link matching ${selector}`).toBeVisible(WAIT);
  await link.click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(
    dialog,
    `${list}: the form should have opened as a dialog`,
  ).toBeVisible(WAIT);
  /*
   * And the form inside it is wearing the dialog's chrome, not the page's.
   * Asserting only that a dialog appeared would pass even if the shell had
   * ignored the surface entirely and drawn its own title bar, back link and
   * card inside the dialog - a frame inside a frame, with the submit button
   * somewhere down in the scroll. The footer is what tells the two apart.
   */
  await expect(
    dialog.locator('[data-slot="dialog-footer"]'),
    `${list}: the submit row should be the dialog's own footer`,
  ).toBeVisible(WAIT);
  await expect(
    dialog.locator('[data-slot="detail-header"]'),
    `${list}: the page's back bar does not belong inside a dialog`,
  ).toHaveCount(0);
}

/**
 * Close with Escape and prove it really went.
 *
 * Escape rather than the Cancel button because it is the one an edit form and
 * a create form and a half-loaded form all answer the same way, and because a
 * dialog that traps the key is a dialog people get stuck in.
 */
async function closeDialog(page: Page, label: string) {
  await page.keyboard.press("Escape");
  await expect(
    page.locator('[data-slot="dialog-content"]'),
    `${label}: Escape should close the dialog`,
  ).toBeHidden(WAIT);
}
