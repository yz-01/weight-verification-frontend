import { expect, test } from "@playwright/test";

import {
  ACCOUNTS,
  LOGIN_PATHS,
  loginAs,
  raiseReleasedDispatch,
} from "./helpers";

/**
 * The recycler has to be able to read where the lorry goes (F-302, T-227).
 *
 * The customer's instruction was that the order address is filled in on the
 * contractor's side and "回收商那边会收到" - the recycler receives it. The
 * server has sent `pickup_address` on every order since T-138 and the driver's
 * task has rendered it since then too, but the recycler's own order book never
 * read the field: `incoming.tsx` matched `address` zero times. So the yard
 * that plans tomorrow's runs and picks which driver goes had every fact about
 * a load except its destination.
 *
 * Both directions are covered because they are two different answers, not one
 * with a default. An address somebody typed and an address inherited from the
 * project record look identical after the fact, and when a lorry turns up at
 * the wrong gate that difference is the whole conversation - so the screen
 * says which of the two it is showing.
 *
 * The inherited case asserts the project's real postal line, which
 * `manage.py seed_e2e` now sets on the E2E project. Before T-227 it set only
 * a map pin, so this screen would have been asserted against an empty string
 * and a genuine regression would have looked exactly like a pass.
 *
 * Verified to have teeth: with the `incoming.tsx` change reverted, every
 * address and marker assertion here fails on the row that renders.
 */

/** `Project.postal_address` for the seeded E2E project. */
const PROJECT_ADDRESS = "Lot 88, Jalan Kilang, 47100 Puchong, Selangor";
const GATE = "Gate C, rear compound, off Jalan Kilang 3";

test("the recycler's order book says where each lorry goes", async ({
  page,
  request,
}) => {
  // Two fresh loads rather than the seeded one, so the test is repeatable
  // without resetting the fixture.
  const typed = await raiseReleasedDispatch(request, GATE);
  const inherited = await raiseReleasedDispatch(request);

  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  // Filtered rather than trusting the first page: released orders accumulate
  // across runs, and the newest sort to the top of this state.
  await page.goto("/incoming?state=RELEASED");

  const typedRow = page.locator("tr", { hasText: typed });
  await expect(typedRow).toBeVisible({ timeout: 20_000 });
  await expect(typedRow).toContainText(GATE);
  await expect(typedRow).toContainText("Typed in");

  const inheritedRow = page.locator("tr", { hasText: inherited });
  await expect(inheritedRow).toBeVisible({ timeout: 20_000 });
  await expect(inheritedRow).toContainText(PROJECT_ADDRESS);
  await expect(inheritedRow).toContainText("From the project address");
});

test("the dialog that commits a driver to the run names the address", async ({
  page,
}) => {
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  // Both states show the assign button, and this seeded order may already have
  // been accepted by an earlier spec in the same run - which is why the state
  // filter takes the comma list instead of one value.
  await page.goto("/incoming?state=PENDING_ACCEPTANCE,ACCEPTED");

  const row = page.locator("tr", { hasText: "DS-P-E2E-000001-001" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByTitle("Accept and assign").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Collect from");
  // Seeded straight onto the model, so its own column is blank and the server
  // falls back to the project address - the shape every order raised before
  // this column existed still has.
  await expect(dialog).toContainText(PROJECT_ADDRESS);
  await expect(dialog).toContainText("From the project address");
});
