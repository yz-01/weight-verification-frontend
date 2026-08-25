import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNTS, LOGIN_PATHS, PASSWORD, loginAs } from "./helpers";

const API = "http://127.0.0.1:8199";

/**
 * A real cross-party slice of the order cycle: the contractor raises and
 * releases a fresh load over the API, and the recycler takes it on through
 * the browser — the same dialog, mutation and idempotent collect endpoint
 * the yard uses on a real morning. A fresh dispatch per run keeps the test
 * repeatable without resetting the seeded one.
 */

async function apiLogin(
  request: APIRequestContext,
  email: string,
  portal: string,
): Promise<string> {
  const response = await request.post(`${API}/api/auth/login/`, {
    data: { email, password: PASSWORD, portal },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data.tokens.access;
}

async function raiseReleasedDispatch(
  request: APIRequestContext,
): Promise<string> {
  const token = await apiLogin(request, ACCOUNTS.contractor, "MSE_TRACE");
  const headers = { Authorization: `Bearer ${token}` };

  const projects = await request.get(
    `${API}/api/projects/get_projects/?page_size=10`,
    { headers },
  );
  expect(projects.ok()).toBe(true);
  const project = (await projects.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project).toBeTruthy();

  const recyclers = await request.get(
    `${API}/api/dispatches/get_recyclers/?project=${project.id}`,
    { headers },
  );
  expect(recyclers.ok()).toBe(true);
  const recyclersBody = (await recyclers.json()).data;
  const recycler = (recyclersBody.results ?? recyclersBody)[0];
  expect(recycler).toBeTruthy();

  const created = await request.post(`${API}/api/dispatches/create_dispatch/`, {
    headers,
    data: {
      project: project.id,
      recycler: recycler.id,
      waste_type: "MIXED",
      estimated_weight_kg: "1200.00",
      vehicle_plate: "WFL 7001",
      driver_name: "Flow Driver",
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const dispatch = (await created.json()).data;

  const released = await request.post(
    `${API}/api/dispatches/${dispatch.id}/release_dispatch/`,
    { headers, data: { released_by_name: "Flow Clerk" } },
  );
  expect(released.status(), await released.text()).toBe(200);
  return dispatch.dispatch_no as string;
}

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
