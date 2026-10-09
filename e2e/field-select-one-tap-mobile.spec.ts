import { expect, test } from "@playwright/test";

import { loginAsFieldStaff, openHold } from "./helpers";

/**
 * One tap opens a dropdown on the phone, and it stays open.
 *
 * Lucas, 2026-10-09, iPhone: in 现场记录 → 材料进场 (挂号 01) the 「材料分类」
 * dropdown opened and closed at once and needed a second tap. Radix Select
 * closes its list on every window `resize`, and on a phone the tap itself
 * changes the viewport height: iOS Safari re-expands its toolbar when the
 * list locks the page's scroll, and the keyboard goes down when focus leaves
 * a text box for the dropdown. Emulation has neither, so the height change is
 * made here by hand, straight after the one tap.
 */

const ORIGIN = "http://localhost:3199";
const FORM = "/field-staff?tab=records&record=material";

test("the material category dropdown opens with one tap and stays open", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);
  await page.goto(FORM);
  await expect(
    page.getByRole("heading", { name: "Material receipts" }),
  ).toBeVisible({ timeout: 20_000 });
  await openHold(page);

  const label = page.locator("label").filter({ hasText: /^Material category\s*\*$/ });
  await expect(label).toBeVisible({ timeout: 20_000 });
  const column = label.locator("..").getByRole("combobox");
  await expect(column).toBeEnabled({ timeout: 20_000 });

  const viewport = page.viewportSize() ?? { width: 390, height: 664 };
  await column.tap();
  // The toolbar comes back / the keyboard goes down: height only.
  await page.setViewportSize({ width: viewport.width, height: viewport.height - 80 });

  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  // Still open a moment later, not just caught on its way out.
  await page.waitForTimeout(400);
  await expect(listbox).toBeVisible();
  await expect(page.getByRole("option").first()).toBeVisible();

  // And one more tap chooses.
  await page.getByRole("option").first().tap();
  await expect(listbox).toHaveCount(0);
});

test("a dropdown still closes when the phone is turned", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);
  await page.goto(FORM);
  await openHold(page);
  const label = page.locator("label").filter({ hasText: /^Material category\s*\*$/ });
  const column = label.locator("..").getByRole("combobox");
  await expect(column).toBeEnabled({ timeout: 20_000 });

  const viewport = page.viewportSize() ?? { width: 390, height: 664 };
  await column.tap();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.setViewportSize({ width: viewport.height, height: viewport.width });

  await expect(page.getByRole("listbox")).toHaveCount(0);
});
