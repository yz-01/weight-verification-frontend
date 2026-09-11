import { expect, test } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, loginAs } from "./helpers";

/**
 * The office must be able to name the gate when it raises an order (F-311).
 *
 * The customer moved the order address off the phone: "订单地址是由建筑商后台来填，
 * 现场工作人员不需要填地址". That left this screen without an owner for it.
 * `/dispatches/create` had no address input at all, and - the half that made a
 * frontend-only fix impossible - `WasteDispatchWriteSerializer` did not list
 * `pickup_address`, so DRF dropped the key silently. A client could send the
 * gate and get a 201 back with the project address in it.
 *
 * The request and the response are watched rather than inferred from the
 * screen. The failure this guards against is precisely a field that looks
 * wired and is not: an input bound to nothing, or bound to a key the server
 * throws away, renders exactly like a working one. What the server actually
 * stored is the only honest answer, and it comes back in the create response.
 *
 * Reopening the edit form is the second half, and it is not decoration.
 * `pickup_address` reads back as the *effective* address, so prefilling the
 * box unconditionally would put an inherited project line into it, and saving
 * without touching it would re-submit that line as a typed one - the record
 * would then claim somebody chose this gate. The form prefills only when the
 * source is MANUAL, which is what the second half checks.
 */

const GATE = "Gate C, rear compound, off Jalan Kilang 3";

test("the office can name the gate on a new order, and edit it afterwards", async ({
  page,
}) => {
  const created: { pickup_address?: string; pickup_address_source?: string; id?: string }[] =
    [];
  page.on("response", async (response) => {
    if (
      response.url().includes("/api/dispatches/create_dispatch/") &&
      response.request().method() === "POST"
    ) {
      created.push((await response.json()).data);
    }
  });

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/dispatches/create");
  await expect(
    page.getByRole("heading", { name: "New load out" }),
  ).toBeVisible({ timeout: 30_000 });

  // Radix selects, reached by the id `SelectField` puts on its trigger.
  await page.locator("#project").click();
  await page.getByRole("option", { name: /P-E2E/ }).click();
  // The recycler list only loads once a project is chosen.
  await page.locator("#recycler").click();
  const recycler = page.getByRole("option").first();
  await expect(recycler).toBeVisible({ timeout: 20_000 });
  await recycler.click();

  await page.locator("#vehicle_plate").fill("WGT 8001");
  await page.locator("#pickup_address").fill(GATE);
  await page.getByRole("button", { name: "Create" }).click();

  await page.waitForURL(/\/dispatches(?:\?|$)/, { timeout: 30_000 });
  expect(created, "the create response never arrived").toHaveLength(1);
  // What the server stored, not what the box showed.
  expect(created[0].pickup_address).toBe(GATE);
  expect(created[0].pickup_address_source).toBe("MANUAL");

  await page.goto(`/dispatches/${created[0].id}/edit`);
  await expect(page.locator("#pickup_address")).toHaveValue(GATE, {
    timeout: 30_000,
  });
  // The hint carries the source, which is the difference between "somebody
  // chose this" and "nobody did".
  await expect(page.getByText("Typed in")).toBeVisible();
});
