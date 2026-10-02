import { expect, test } from "@playwright/test";

import { loginAsFieldStaff, openHold } from "./helpers";

/**
 * The material form asks which column a delivery files under, and requires it
 * (D-188, T-276).
 *
 * This file used to assert the opposite. T-222 / AC-217 took the column off
 * the gate - 「现场工作人员不需要选择栏目，会跟着对应项目自动归档」 - with an
 * unfiled delivery as the default (D-108). D-188 [CONFIRMED] reversed it:
 * 「mandatory business columns」 on new submissions, phones included, with
 * the API refusing a delivery that names none. The form now carries a required
 * 「Material category」 picker, and these assertions follow the product.
 *
 * What still matters from the old file is the tell it watched for: an
 * 「Not filed yet」 option is a way round a required column, so it is asserted
 * absent. The 「New column name」 escape hatch it also held open (U-038) is no
 * longer on the form; that is left to whoever settles U-038 rather than
 * asserted either way here.
 */

const ORIGIN = "http://localhost:3199";
const FORM = "/field-staff?tab=records&record=material";

test("the material form asks which column a delivery files under, and requires it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);
  await page.goto(FORM);

  // The screen's name since `fde751d` (T-207).
  await expect(
    page.getByRole("heading", { name: "Material receipts" }),
  ).toBeVisible({ timeout: 20_000 });
  // One of the four 挂号 screens: no form until a hold is opened (D-260).
  await openHold(page);

  // Asked, and marked as required.
  const label = page.locator("label").filter({ hasText: /^Material category\s*\*$/ });
  await expect(label).toBeVisible({ timeout: 20_000 });
  // Through its row: the label sits on the wrapper rather than naming the
  // trigger, the same as every `FieldWrapper` field.
  const column = label.locator("..").getByRole("combobox");
  await expect(column).toBeVisible();

  // This project's columns to choose from - `seed_e2e` makes one - and no
  // option that would file it nowhere.
  await column.click();
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("option", { name: /not filed yet/i })).toHaveCount(0);
});
