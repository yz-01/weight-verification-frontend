import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  LOGIN_PATHS,
  loginAs,
  raiseReleasedDispatch,
} from "./helpers";

/**
 * A real cross-party slice of the order cycle: the contractor raises and
 * releases a fresh load over the API, and the recycler takes it on through
 * the browser — the same dialog, mutation and idempotent collect endpoint
 * the yard uses on a real morning.
 */
test("recycler collects a released load through the browser", async ({
  page,
  request,
}) => {
  const dispatchNo = await raiseReleasedDispatch(request);

  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  await page.goto("/incoming");

  const row = page.locator("tr", { hasText: dispatchNo });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText("Released")).toBeVisible();

  await row.getByTitle("Collect").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input").fill("YARD-FLOW-1");
  await dialog.getByRole("button", { name: "Collect" }).click();

  await expect(page.getByText("Load collected")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.locator("tr", { hasText: dispatchNo }).getByText("Collected"),
  ).toBeVisible({ timeout: 20_000 });
});

/**
 * The offline half of the same action. The yard's connection drops, the
 * operator still records the collection, and the queued action uploads by
 * itself when the network returns — exactly once, because the retry
 * carries the client_event_id its first submission was born with.
 */
test("a collection recorded offline syncs itself when the network returns", async ({
  page,
  context,
  request,
}) => {
  const dispatchNo = await raiseReleasedDispatch(request);

  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  await page.goto("/incoming");
  const row = page.locator("tr", { hasText: dispatchNo });
  await expect(row).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);

  await row.getByTitle("Collect").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input").fill("YARD-OFFLINE-1");
  await dialog.getByRole("button", { name: "Collect" }).click();

  // Queued, not lost: the dialog closes and the queue toast confirms.
  await expect(
    page.getByText("Saved offline and queued for upload"),
  ).toBeVisible({ timeout: 20_000 });

  await context.setOffline(false);

  // The online listener flushes the queue without any user action.
  await expect(page.getByText("Uploaded 1 offline record")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator("tr", { hasText: dispatchNo }).getByText("Collected"),
  ).toBeVisible({ timeout: 30_000 });
});
