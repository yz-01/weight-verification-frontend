import { expect, test } from "@playwright/test";

import { loginAsFieldStaff } from "./helpers";
import {
  confirmCardHref,
  expectLocked,
  raise,
  sessions,
  site,
  submitFix,
} from "./rectification";

/**
 * 手机现场发起 → 指定整改人 → 由指定确认人确认 (B21, E02).
 *
 * The worker who reports a hazard on the phone confirms it unless they name
 * somebody else, and confirms it on the phone: 「确认入口跟着有权限的确认人出现
 * 在他用的那一端」. The rectifier here is the office account, so the button
 * the worker presses is the only way this item closes.
 */

const ORIGIN = "http://localhost:3199";

test("a phone-raised hazard is confirmed on the phone by its confirmer", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });

  const where = await site(request);
  const people = await sessions(request, where);

  // 上报 → 指派 from the phone: the worker names who fixes it and, by naming
  // nobody else, confirms it themselves.
  const hazard = await raise(request, where, people.field, {
    rectifier: people.contractor,
    title: `Phone-raised ${Date.now()}`,
  });
  expect(hazard.confirmer).toBe(people.field.userId);

  await submitFix(request, hazard.id, people.contractor);
  // 通知直达: the worker's 「请确认」 card opens this hazard on the phone.
  const href = await confirmCardHref(request, hazard.id, people.field);
  expect(href).toContain(`incident=${hazard.id}`);

  await loginAsFieldStaff(page);
  await page.goto(href);

  const state = page.getByTestId("field-hazard-state");
  await expect(state).toBeVisible({ timeout: 30_000 });
  await expect(state.getByText("Awaiting verification")).toBeVisible();
  await state.getByRole("button", { name: "Confirm completed" }).click();

  const dialog = page.getByRole("dialog", { name: "Verify rectification" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Verify and complete" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // Closed: the button is gone and the room says it takes nothing more.
  await expect(state.getByText("Verified")).toBeVisible({ timeout: 20_000 });
  await expect(state.getByRole("button", { name: "Confirm completed" })).toHaveCount(0);
  await expectLocked(request, hazard.id, people.contractor);
});
