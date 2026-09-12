import fs from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, loginAs } from "./helpers";

/**
 * An order is accepted the moment the site sends it (T-226, D-111, AC-211).
 *
 * 客户：「建筑商发送订单的时候是自动接受的，不存在他们可以拒绝订单的情况。」
 *
 * F-275 checked the whole codebase and found no way to refuse an order, so
 * half the rule already held. The other half did not: the order sat in
 * `PENDING_ACCEPTANCE` until the yard pressed accept, and that button demanded
 * a collection time - a waiting room with one exit and a required field on the
 * door. The time moved to the contractor, who is the one raising the order.
 *
 * The load is raised through the waste-outgoing route on purpose. That is the
 * route that used to create the waiting state; `release_dispatch`, the other
 * way to reach a recycler, has always gone straight past it - so the two
 * routes did not even agree with each other before this.
 *
 * Realtime is asserted the way `order-flow.spec.ts` does it: a marker is set
 * on the window and must survive, so a full page reload cannot be mistaken for
 * an SSE update (F-274).
 */

const CONTRACTOR_PORTAL = "MSE_TRACE";
const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");

/** Raise, approve and send one waste record as an order. Returns its number. */
async function sendWasteOrder(
  request: APIRequestContext,
  collectionAt?: string,
): Promise<string> {
  const token = await apiLogin(request, ACCOUNTS.contractor, CONTRACTOR_PORTAL);
  const headers = { Authorization: `Bearer ${token}` };

  const projects = await request.get(
    `${API}/api/projects/get_projects/?page_size=10`,
    { headers },
  );
  const project = (await projects.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project, "the seeded E2E project is missing").toBeTruthy();

  const categories = await request.get(
    `${API}/api/waste-categories/get_options/`,
    { headers },
  );
  expect(categories.ok(), await categories.text()).toBeTruthy();
  const category = (await categories.json()).data.categories.find(
    (row: { is_active: boolean }) => row.is_active,
  );
  expect(category, "no active waste category is seeded").toBeTruthy();

  const stamp = Date.now();
  // The record needs at least one photograph of the waste - a separate gate
  // from anything this spec is about, so it is satisfied rather than argued
  // with. `FormData` because the field repeats.
  const form = new FormData();
  form.append("project", project.id);
  form.append("category", category.id);
  form.append("quantity", "2.500");
  form.append("unit", "TONNE");
  form.append("note", "Offcuts");
  form.append("latitude", "3.1390000");
  form.append("longitude", "101.6869000");
  form.append("client_event_id", `e2e-waste-${stamp}`);
  const bytes = fs.readFileSync(PHOTO);
  for (let index = 0; index < 4; index += 1) {
    form.append(
      "photos",
      new Blob([bytes], { type: "image/png" }),
      `waste-${index}.png`,
    );
  }
  const created = await request.post(
    `${API}/api/waste-outgoing/create_record/`,
    { headers, multipart: form },
  );
  expect(created.status(), await created.text()).toBe(201);
  const recordId = (await created.json()).data.id;

  const reviewed = await request.post(
    `${API}/api/waste-outgoing/${recordId}/review_request/`,
    { headers, data: { decision: "APPROVED", note: "Approved" } },
  );
  expect(reviewed.status(), await reviewed.text()).toBe(200);

  const recyclers = await request.get(
    `${API}/api/waste-outgoing/${recordId}/get_recycler_options/`,
    { headers },
  );
  expect(recyclers.ok(), await recyclers.text()).toBeTruthy();
  const body = (await recyclers.json()).data;
  const recycler = (body.rows ?? body.results ?? body)[0];
  expect(recycler, "the seeded partnership is missing").toBeTruthy();

  const ordered = await request.post(
    `${API}/api/waste-outgoing/${recordId}/assign_recycler/`,
    {
      headers,
      data: {
        recycler: recycler.id,
        estimated_weight_kg: "2500.00",
        ...(collectionAt ? { collection_at: collectionAt } : {}),
      },
    },
  );
  expect(ordered.status(), await ordered.text()).toBe(201);
  return (await ordered.json()).data.dispatch_no as string;
}

test("the recycler's book shows a new order as accepted, with no accept step", async ({
  page,
  request,
}) => {
  const wanted = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const dispatchNo = await sendWasteOrder(request, wanted.toISOString());

  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  await page.goto("/incoming?state=ACCEPTED");

  const row = page.locator("tr", { hasText: dispatchNo });
  await expect(row).toBeVisible({ timeout: 20_000 });
  // The state pill, not the API: this is what the yard reads.
  await expect(row).toContainText("Accepted");

  // Opening the order offers scheduling, and says why there is nothing to
  // accept - a screen that simply lost its button reads as broken.
  await row.getByTitle("Accept and assign").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "This order was accepted when the site sent it",
  );
  await expect(dialog).toContainText("Site wants it collected");
  await expect(
    dialog.getByRole("button", { name: "Accept and propose time" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Change the collection time" }),
  ).toBeEnabled();
});

test("a new order reaches the recycler's book without a reload", async ({
  page,
  request,
}) => {
  const streamStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/events/stream/")) {
      streamStatuses.push(response.status());
    }
  });
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.recycler);
  streamStatuses.length = 0;
  await page.goto("/incoming");
  // 20s, not 10: the stream connects in well under a second once warm, but the
  // first request after a dev-server compile can take longer, and the first
  // attempt of this spec timed out at 10s and then passed on retry. A test
  // that is green only on the second try is one nobody trusts.
  await expect
    .poll(() => streamStatuses.includes(200), { timeout: 20_000 })
    .toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __orderMarker?: number }).__orderMarker = 1;
  });

  const dispatchNo = await sendWasteOrder(request);

  await expect(page.locator("tr", { hasText: dispatchNo })).toBeVisible({
    timeout: 10_000,
  });
  // The marker proves it arrived over the stream rather than through a reload,
  // which is the only way this assertion means what it says (F-274).
  expect(
    await page.evaluate(
      () => (window as unknown as { __orderMarker?: number }).__orderMarker,
    ),
  ).toBe(1);
});
