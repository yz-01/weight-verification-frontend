import { expect, test } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * The site asks from the phone, for the project it is on (C01, C07).
 *
 * The project is the phone's own, so the form never asks for it; the request
 * then sits on 「What I sent」 with its number and status, and opens to what
 * was asked.
 */

const ORIGIN = "http://localhost:3199";

test("a material request is raised on the phone and followed on What I sent", async ({ page, context }) => {
  // The phone app asks for location before anything else, like every spec here.
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);
  await page.goto("/field-staff?tab=records&record=request");
  await expect(page.getByRole("heading", { name: "MR / Other Request" }).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("combobox", { name: "Product / Material" }).click();
  await page.getByRole("option", { name: "E2E Rebar" }).click();
  await page.getByRole("combobox", { name: "Type / Specification" }).click();
  await page.getByRole("option", { name: "Y16" }).click();
  await page.getByRole("spinbutton").fill("3");
  await page.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: "Tonne" }).click();
  const remark = page.locator("label").filter({ hasText: /^Remark/ });
  await remark.locator("..").getByRole("textbox").fill("For the level 4 slab.");
  await page.getByRole("button", { name: "Submit" }).click();

  await page.goto("/field-staff");
  await expect(page.getByRole("heading", { name: "What I sent" })).toBeVisible({ timeout: 30_000 });
  const row = page.getByRole("button").filter({ hasText: /MR-P-E2E-/ }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("Pending approval");
  await row.click();
  await expect(page.getByText("For the level 4 slab.")).toBeVisible({ timeout: 20_000 });
});
