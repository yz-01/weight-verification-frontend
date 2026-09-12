import { expect, test, type Page } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";

/**
 * Every row of 「我提交过的」 opens (T-210, AC-205).
 *
 * The customer asked for it in one line - 「确保『我提交过的』每个东西是可以点进去
 * 然后查看详细资料的」 - and the reason it matters is the reason the list exists:
 * a row saying a delivery arrived, with no way to see *what* arrived, cannot
 * settle "did I record this right". A worker who cannot check photographs the
 * delivery again, so the load exists twice, or stops sending (F-228).
 *
 * Two paths, because a hazard is not a record sheet. D-109: 「可以直接上报然后进
 * 聊天室就好了」 - so a hazard row goes to its conversation, and every other
 * kind opens a sheet of its fields and its photographs.
 *
 * Both rows are seeded by `manage.py seed_e2e`: the field task this account is
 * assigned (a SITE_RECORD row) and a hazard it reported. Seeded rather than
 * created through the browser because both forms need a camera, and what this
 * spec checks is where a row *goes* - not the capture path, which has its own
 * coverage.
 *
 * The third state, a submission still in the offline queue, is deliberately
 * not here: producing one means photographing through a fake media stream with
 * the network off, which tests the camera harness rather than the sheet. Its
 * content extraction is unit-tested in
 * `src/services/queued-submission-detail.test.ts`, and its rendering is the
 * same `FieldRows` component this spec exercises.
 */

const ORIGIN = "http://localhost:3199";

async function openFieldHome(page: Page) {
  await page.goto("/field-staff");
  await expect(page.getByRole("heading", { name: "What I sent" })).toBeVisible({
    timeout: 30_000,
  });
}

test.beforeEach(async ({ page, context }) => {
  // The workspace covers the home with a modal until it has a fix.
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await loginAsFieldStaff(page);
});

test("a site record opens to its own fields", async ({ page }) => {
  await openFieldHome(page);

  const row = page.getByRole("button", { name: /Inspect E2E material delivery/ });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  // The sheet's own heading is the row's reference, so this is that row and
  // not whichever one happened to be first.
  await expect(sheet).toContainText("Inspect E2E material delivery");
  // A field the server sent, under a label from the catalogue - not a key
  // path, which is what a missing translation would render (F-225).
  await expect(sheet).toContainText("What was asked for");
  await expect(sheet).toContainText(
    "Record the delivered material and attach site evidence.",
  );
  // The seeded task carries no photographs, and the sheet says so rather than
  // leaving an empty frame that reads as "still loading".
  await expect(sheet).toContainText("No photographs on this record");
});

test("a hazard opens its conversation, not a field sheet", async ({ page }) => {
  await openFieldHome(page);

  const row = page.getByRole("button", { name: /SI-E2E-000001/ });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  // No dialog: this row navigates.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Unsecured scaffold board" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("SI-E2E-000001")).toBeVisible();
  // The conversation's own control, which is what makes this the chat room
  // rather than a read-only copy of the hazard.
  await expect(page.getByRole("button", { name: /send/i })).toBeVisible({
    timeout: 20_000,
  });
});
