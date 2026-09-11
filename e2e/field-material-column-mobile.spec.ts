import { expect, test } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * Nobody at the gate sorts a delivery into a column any more (T-222, AC-217).
 *
 * 客户：「现场工作人员不需要选择栏目，会跟着对应项目自动归档」, and, asked what
 * happens to a delivery nobody has placed: 「先进『未归类』，后台看的时候再归」
 * (D-108). The office side of that already exists - an unfiled delivery is
 * accepted (`test_a_delivery_with_no_column_is_unfiled_rather_than_refused`)
 * and can be filed later (`test_an_unfiled_delivery_can_be_filed_later`), with
 * the material columns screen's own dialog to do it.
 *
 * What this asserts is the half that was still wrong: the form asked. It asked
 * twice, in fact - once for the delivery and once per line the delivery note's
 * reader had found - and both pickers offered "Not filed yet" as one option
 * among the site's columns, which is a question dressed as a default.
 *
 * Asserted as the absence of a control plus the presence of the sentence that
 * replaced it. Absence alone would also pass on a form that failed to render,
 * which is the way this kind of check quietly stops checking.
 */

const ORIGIN = "http://localhost:3199";
const FORM = "/field-staff?tab=records&record=material";

test("the material form says where a delivery files instead of asking", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);
  await page.goto(FORM);

  await expect(
    page.getByRole("heading", { name: "Material record" }),
  ).toBeVisible({ timeout: 20_000 });

  // The block is still there, and it still says "Material column" - what
  // changed is that it states the answer rather than collecting one.
  const block = page
    .locator("label")
    .filter({ hasText: "Material column" })
    .locator("..");
  await expect(block).toBeVisible();
  await expect(
    block.getByText(/not filed yet\. the office files it after checking\./i),
  ).toBeVisible();

  // No picker in that block. `combobox` is the role Radix's select trigger
  // takes, so this is the control itself and not a guess at its markup.
  await expect(block.getByRole("combobox")).toHaveCount(0);

  // And the option that used to be the default is nowhere on the form: it was
  // the tell that filing was being asked about at all.
  await expect(page.getByRole("option", { name: /not filed yet$/i })).toHaveCount(
    0,
  );

  // The escape hatch stays, and it is not a picker: a delivery of something no
  // column exists for anywhere (F-200) can still have one opened. Whether the
  // gate keeps even this is U-038, the one thing the customer's words do not
  // settle - asserted so that removing it later has to be a decision.
  await expect(
    page.getByPlaceholder("New column name"),
  ).toBeVisible();
});
