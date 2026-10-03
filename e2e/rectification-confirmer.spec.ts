import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";
import {
  confirmCardHref,
  expectLocked,
  raise,
  sessions,
  site,
  submitFix,
} from "./rectification";

/**
 * Who closes a rectification is decided by where it was raised (B21, E02).
 *
 * 「后台发起 → 由后台发起人确认；顾问发起 → 由顾问确认」, one confirmer each,
 * and 「不要求手机和后台两端都确认」. Each loop here goes 上报 → 指派 → 整改人
 * 提交 → the confirmer's card opens the item → 确认 → 闭环锁定, and the
 * confirm button is asserted from both sides: the one confirmer has it, a
 * supervisor holding safety.verify who is not the confirmer does not.
 *
 * The phone-raised loop is in `rectification-confirmer-mobile.spec.ts`, where
 * its confirmer - the worker who reported it - actually works.
 */

const CONFIRM = /^(Verify and complete|Review rectification)$/;

async function confirmFromCard(page: Page, href: string) {
  await page.goto(href);
  // The card opens straight onto 【确认完成】 for the one confirmer.
  const dialog = page.getByRole("dialog", { name: "Verify rectification" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("textbox").fill("Checked on site.");
  await dialog.getByRole("button", { name: "Verify and complete" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

test("an office-raised hazard is confirmed by the office user who raised it", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const where = await site(request);
  const people = await sessions(request, where);

  // 上报 → 指派: the office raises it from a desk (no GPS) and names the site
  // worker to fix it.
  const hazard = await raise(request, where, people.contractor, {
    rectifier: people.field,
    gps: false,
    title: `Office-raised ${Date.now()}`,
  });
  expect(hazard.confirmer).toBe(people.contractor.userId);

  await submitFix(request, hazard.id, people.field);
  // 通知直达: the confirmer's card leads to this item.
  const href = await confirmCardHref(request, hazard.id, people.contractor);
  expect(href).toBe(`/hazard-rectifications?incident=${hazard.id}`);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await confirmFromCard(page, href);

  await expectLocked(request, hazard.id, people.field);
});

test("a supervisor who is not the confirmer gets no confirm button", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const where = await site(request);
  const people = await sessions(request, where);

  // Raised by the consultant: they confirm it. The contractor's account
  // holds safety.verify and every project - and still is not the confirmer.
  const title = `Not yours to confirm ${Date.now()}`;
  const hazard = await raise(request, where, people.consultant, {
    rectifier: people.field,
    gps: false,
    title,
  });
  await submitFix(request, hazard.id, people.field);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto(`/hazard-rectifications?incident=${hazard.id}`);

  // The link opens the item itself, read-only, rather than the confirm form.
  const detail = page.getByRole("dialog", { name: hazard.incident_no });
  await expect(detail).toBeVisible({ timeout: 30_000 });
  await expect(detail.getByText("Raised by a consultant")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Rectification discussion" })).toBeVisible();
  await expect(detail.getByRole("button", { name: CONFIRM })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Nor on its row in the list.
  const row = page.locator("tr").filter({ hasText: hazard.incident_no });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTitle("Review rectification")).toHaveCount(0);

  // And the server agrees: pressing it anyway is refused.
  const refused = await request.post(
    `http://127.0.0.1:8199/api/safety-incidents/${hazard.id}/review_rectification/`,
    { headers: people.contractor.headers, data: { decision: "VERIFIED", note: "" } },
  );
  expect(refused.status()).toBe(403);
});

test("a consultant-raised hazard is confirmed by the consultant", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const where = await site(request);
  const people = await sessions(request, where);

  const hazard = await raise(request, where, people.consultant, {
    rectifier: people.field,
    gps: false,
    title: `Consultant-raised ${Date.now()}`,
  });
  expect(hazard.confirmer).toBe(people.consultant.userId);
  await submitFix(request, hazard.id, people.field);
  const href = await confirmCardHref(request, hazard.id, people.consultant);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.consultant);
  await confirmFromCard(page, href);

  await expectLocked(request, hazard.id, people.field);
});
