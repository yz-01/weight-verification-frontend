import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * 新增顾问的页面打不开 (B16).
 *
 * The screen is reached on `consultant.config`, but its project query was
 * gated on `project.assign` - the permission for *granting* a project, not for
 * listing one. An account holding 顾问设定 without assignment rights opened a
 * page whose project picker could never fill, so the grant could not be
 * finished and the screen read as broken.
 *
 * What this spec can and cannot say: the seeded contractor is a company admin
 * and holds `project.assign` as well, so it would not have hit the original
 * refusal. It proves the screen works end to end - register a firm, invite a
 * consultant, see both in their lists, and find real projects in the grant
 * picker. Reproducing the refusal itself needs a role with `consultant.config`
 * and without `project.assign`, which the fixture does not have today.
 */
test("a contractor registers a firm, invites a consultant, and can grant a project", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now().toString().slice(-6);
  const firm = `Perunding ${stamp}`;
  const consultant = `Consultant ${stamp}`;

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/consultant-access");

  // The page itself opens, rather than sitting empty behind a refusal.
  await expect(
    page.getByRole("heading", { name: "Consultant accounts and project access" }),
  ).toBeVisible({ timeout: 20_000 });

  // -- a firm --------------------------------------------------------------
  await page.getByRole("tab", { name: "Consultant firms" }).click();
  await page.getByRole("button", { name: "Add firm" }).click();
  const firmDialog = page.getByRole("dialog", { name: "Add consultant firm" });
  await expect(firmDialog).toBeVisible();
  await firmDialog.getByRole("textbox").first().fill(firm);
  await firmDialog.getByRole("button", { name: /save|add|create/i }).last().click();
  await expect(firmDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(firm)).toBeVisible({ timeout: 20_000 });

  // -- a consultant under it ----------------------------------------------
  await page.getByRole("tab", { name: "Consultant accounts" }).click();
  await page.getByRole("button", { name: "Invite consultant" }).click();
  const inviteDialog = page.getByRole("dialog", {
    name: "Invite consultant account",
  });
  await expect(inviteDialog).toBeVisible();
  // Firm, full name and email are what the submit button waits on. The text
  // boxes are full name, job title, email, phone in that order - job title is
  // optional and sits between the two that are not.
  await inviteDialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: firm }).click();
  const boxes = inviteDialog.getByRole("textbox");
  await boxes.nth(0).fill(consultant);
  await boxes.nth(2).fill(`consultant.${stamp}@e2e.test`);
  await inviteDialog.getByRole("button", { name: "Register and invite" }).click();
  // The dialog stays open on success to hand over the invitation link - the
  // one chance to copy it - so it is closed deliberately rather than waiting
  // for it to disappear.
  await expect(inviteDialog.getByText(/reset-password\?token=/)).toBeVisible({
    timeout: 20_000,
  });
  // Closed with the corner ✕, the way people dismiss a dialog. It used to
  // shut the panel without refreshing, so the consultant just registered was
  // missing from the list behind it; only the footer button refreshed.
  await inviteDialog.locator('button[class*="absolute"]').click();
  await expect(inviteDialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(consultant)).toBeVisible({ timeout: 20_000 });

  // -- and the picker B16 was about ---------------------------------------
  await page.getByRole("tab", { name: "Project access" }).click();
  await page.getByRole("button", { name: "Grant project access" }).click();
  const grantDialog = page.getByRole("dialog", {
    name: "Grant consultant project access",
  });
  await expect(grantDialog).toBeVisible();
  // Real projects, not an empty list: this is the half that was broken.
  await expect(
    grantDialog.getByText("E2E", { exact: false }).first(),
  ).toBeVisible({ timeout: 20_000 });
});
