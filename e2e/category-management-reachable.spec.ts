import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * Every module on 栏目管理 must open for the person looking at it (T-241).
 *
 * Reported from a screenshot: picking 机械设备分类 put "栏目读取失败，请重试。"
 * on the page and "你没有权限做这件事。" in a toast. The cause is structural
 * rather than a mis-set flag - that module's list lives at
 * `/api/asset-categories/get-categories/`, behind `IsPlatformStaff` and
 * `asset.view`, and the catalogue offers `asset.view` to the PLATFORM
 * audience alone. No contractor could ever hold it, and the "manage" link
 * beside the row pointed into the platform portal too (F-367).
 *
 * This walks every module rather than the reported one. A screen whose left
 * column is a list of modules fails the same way on any row that reaches an
 * endpoint this account cannot read, and checking only the row in the
 * screenshot would leave the next one to be reported the same way.
 */

const WAIT = { timeout: 30_000 };

test("every module a contractor is offered opens without a refusal", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/category-management");
  await expect(
    page.getByRole("heading", { name: "Category management" }),
  ).toBeVisible(WAIT);

  const modules = page.getByRole("navigation", { name: "Modules" });
  const buttons = modules.getByRole("button");
  await expect(buttons.first()).toBeVisible(WAIT);

  // The project-scoped modules need one chosen before they load anything.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /E2E/ }).first().click();
  /*
   * Wait for the list to come back before counting. While the select is open
   * the rest of the page sits under `aria-hidden`, so a role query finds
   * nothing - and `count()` would answer 0 for a nav that is on the screen.
   */
  await expect(buttons.first()).toBeVisible(WAIT);

  const count = await buttons.count();
  expect(count).toBeGreaterThan(5);
  // Equipment is an ordinary column module now, offered on `category.manage`
  // like the rest. It used to be gated behind `asset.view` - MSE's own
  // hardware vocabulary - which was the wrong list for a contractor's plant
  // (F-369). So it is here, and the walk below is what proves it opens.
  await expect(
    modules.getByRole("button", { name: "Equipment categories" }),
  ).toHaveCount(1);

  for (let index = 0; index < count; index += 1) {
    const name = (await buttons.nth(index).textContent())?.trim() ?? "";
    await buttons.nth(index).click();

    // The row's own failure line. This is what the screenshot showed.
    await expect(
      page.getByText("The categories could not be loaded. Try again."),
      `${name} could not read its columns`,
    ).toHaveCount(0, WAIT);
    // And the refusal toast the request raised behind it.
    await expect(
      page.getByText("You are not allowed to do that."),
      `${name} was refused`,
    ).toHaveCount(0);
  }
});

test("the platform portal does not reach this screen at all", async ({
  page,
}) => {
  /*
   * `/category-management` is a contractor-portal route, and a platform
   * account is sent to its own dashboard instead. Checked because the first
   * version of this fix was written on the assumption that platform staff saw
   * this screen too, and the assumption was wrong.
   */
  test.setTimeout(120_000);
  await loginAs(page, LOGIN_PATHS.admin, ACCOUNTS.admin);
  await page.goto("/category-management");

  await expect(
    page.getByRole("navigation", { name: "Modules" }),
  ).toHaveCount(0, WAIT);
});
