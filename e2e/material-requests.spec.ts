import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * MR / Other Request in the office (C01–C07, D02).
 *
 * One request is raised through the real form, so the lists `seed_e2e` keeps
 * (E2E Rebar / Y12) and the quantity rule are exercised; then it is approved,
 * and a second one is returned - which ends it, so the screen offers a new
 * request instead of an edit. The old 照片审批 address must land on the
 * photo tab of the new entry.
 */

async function raiseRequest(page: Page, quantity: string) {
  await page.getByRole("button", { name: "New Request" }).click();
  const dialog = page.getByRole("dialog", { name: "New Request" });
  await expect(dialog).toBeVisible();

  const project = dialog.getByRole("combobox").filter({ hasText: /choose a project/i });
  if (await project.count()) {
    await project.click();
    await page.getByRole("option", { name: /E2E Tower/ }).click();
  }
  await dialog.getByRole("combobox", { name: "Product / Material" }).click();
  await page.getByPlaceholder("Type to search").fill("rebar");
  await page.getByRole("option", { name: "E2E Rebar" }).click();
  await dialog.getByRole("combobox", { name: "Type / Specification" }).click();
  await page.getByRole("option", { name: "Y12" }).click();

  const amount = dialog.getByRole("spinbutton");
  // More than two decimals is refused before anything is sent (C02).
  await amount.fill("1.005");
  await expect(dialog.getByText("Above 0, whole number or up to 2 decimal places").first()).toBeVisible();
  await amount.fill(quantity);
  await dialog.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: "Tonne" }).click();
  await dialog.getByRole("button", { name: "Submit" }).click();

  // The new request opens at once, numbered and pending.
  await expect(page.getByRole("heading", { name: /^MR-P-E2E-\d{6}-\d{3}$/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Pending approval").first()).toBeVisible();
}

test.describe("MR / Other Request", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  });

  test("a request is raised, approved, and counted as approved", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "MR / Other Request" }).first().click();
    await expect(page).toHaveURL(/\/material-requests/);

    await raiseRequest(page, "2.5");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved By").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/closed\. The record can still be viewed/)).toBeVisible();

    // The formal form opens in a frame, ready to print.
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.locator("iframe")).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "Requested totals" }).click();
    await expect(page.getByRole("cell", { name: "E2E Rebar" }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Pending counts only requests still waiting/)).toBeVisible();
  });

  test("a returned request is closed and is asked again as a new one", async ({ page }) => {
    await page.goto("/material-requests");
    await raiseRequest(page, "4");
    const number = (await page.getByRole("heading", { name: /^MR-P-E2E-/ }).textContent())?.trim();

    await page.getByRole("switch", { name: "Return this request" }).click();
    // The reason field, not the conversation box under it.
    const reason = page.locator("label").filter({ hasText: /^Reason for return\s*\*$/ });
    await reason.locator("..").getByRole("textbox").fill("Wrong bar size - Y16 is needed.");
    await page.getByRole("button", { name: "Return and close" }).click();
    await expect(page.getByText(/returned and is closed/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await page.getByRole("button", { name: "Raise a new request" }).click();
    const form = page.getByRole("dialog", { name: "New Request" });
    await expect(form.getByText(/It gets its own new Request No\./)).toBeVisible();
    await form.getByRole("button", { name: "Submit" }).click();
    const renewed = page.getByRole("heading", { name: /^MR-P-E2E-/ });
    await expect(renewed).toBeVisible({ timeout: 20_000 });
    await expect(renewed).not.toHaveText(number ?? "");
  });

  test("the old photo approvals address opens the photo tab (D02)", async ({ page }) => {
    await page.goto("/photo-approvals");
    await expect(page).toHaveURL(/\/material-requests\?tab=photos/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Photo approvals" })).toBeVisible();
    await page.getByRole("tab", { name: "Approved" }).click();
    await expect(page.getByRole("tab", { name: "Approved" })).toHaveAttribute("aria-selected", "true");
  });
});
