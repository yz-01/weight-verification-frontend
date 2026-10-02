import fs from "node:fs";
import path from "node:path";

import {
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

export const API = "http://127.0.0.1:8199";

/** Fixed credentials created by `backend manage.py seed_e2e`. */
export const PASSWORD = "E2e-Pass-1234!";
export const FIELD_PIN = "000000";
export const FIELD_DEVICE_ID = "e2e-field-device";

export const ACCOUNTS = {
  admin: "admin@e2e.test",
  contractor: "contractor@e2e.test",
  field: "field@e2e.test",
  consultant: "consultant@e2e.test",
  recycler: "recycler@e2e.test",
  driver: "driver@e2e.test",
} as const;

export const LOGIN_PATHS = {
  admin: "/admin/login",
  trace: "/trace/login",
  scrap: "/scrap/login",
} as const;

export async function submitLogin(
  page: Page,
  loginPath: string,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await page.goto(loginPath);
  // Wait for hydration: clicking before React attaches its submit handler
  // turns the form into a native GET and the credentials are never sent.
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

/** The login redirect has a 1.2s hard-navigation fallback; allow for it. */
export async function expectSignedIn(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

export async function expectRefusedOnLoginPage(
  page: Page,
  loginPath: string,
): Promise<void> {
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe(loginPath);
}

export async function loginAs(
  page: Page,
  loginPath: string,
  email: string,
): Promise<void> {
  await submitLogin(page, loginPath, email);
  await expectSignedIn(page);
  await forceEnglish(page);
}

/**
 * Put this account back into English before anything is asserted (F-368).
 *
 * Every assertion in this suite is an English sentence, so the interface
 * language is a fixture - and it is one a person can change from inside the
 * product, on the very account the suite signs in as. It has now happened
 * twice: the whole suite goes red on wording, and the reason has nothing to
 * do with what any of the tests are about.
 *
 * `seed_e2e` resets it too (F-361), but a seed run is not what precedes a
 * test run - somebody working in the dev environment between the two undoes
 * it. Resetting here makes it restore itself every time, which is the only
 * form of fixture that holds.
 *
 * A no-op when the account is already English: the PATCH is skipped entirely
 * so a passing run costs nothing.
 */
export async function forceEnglish(page: Page): Promise<void> {
  const changed = await page.evaluate(async (api: string) => {
    const token = window.localStorage.getItem("mse_access_token");
    if (!token) return false;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const me = await fetch(`${api}/api/auth/get_me/`, { headers });
    if (!me.ok) return false;
    const body = await me.json();
    if (body?.data?.language === "en") return false;
    await fetch(`${api}/api/auth/update_profile/`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ language: "en" }),
    });
    return true;
  }, API);
  if (!changed) return;
  // The interface reads the locale from a cookie as well as the profile, and
  // the tree has to be rebuilt for a new language to take effect.
  await page.context().addCookies([
    {
      name: "mse_locale",
      value: "en",
      url: new URL(page.url()).origin,
    },
  ]);
  await page.reload();
  await page.waitForLoadState("networkidle");
}

export async function loginAsFieldStaff(page: Page): Promise<void> {
  await page.addInitScript((deviceId) => {
    window.localStorage.setItem("mse_field_device_id", deviceId);
  }, FIELD_DEVICE_ID);
  await page.goto("/trace/field-login");
  await page.waitForLoadState("networkidle");
  await page.fill("#field-pin", FIELD_PIN);
  await page.getByRole("button", { name: /sign in|登录|登入|log masuk/i }).click();
  await page.waitForURL(/\/trace\/field-ready/, { timeout: 20_000 });
  await page.getByRole("button", { name: /open.*workspace|打开.*工作|開啟.*工作|buka.*ruang/i }).click();
  await page.waitForURL(/\/field-staff(?:\?|$)/, { timeout: 20_000 });
}

/** The console sidebar always carries the Dashboard link once signed in. */
export async function expectConsoleShell(page: Page): Promise<void> {
  await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function apiLogin(
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

/**
 * Raise and release a fresh load as the contractor, over the API. Returns
 * its dispatch number. Business-flow tests use a fresh load each run so
 * they stay repeatable without resetting the seeded fixture.
 *
 * `pickupAddress` names the gate the lorry has to come to. Omit it and the
 * order inherits the project address, which is the more common case and the
 * one every existing caller wants.
 */
export async function raiseReleasedDispatch(
  request: APIRequestContext,
  pickupAddress?: string,
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
      ...(pickupAddress ? { pickup_address: pickupAddress } : {}),
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

/**
 * The id of a column this project already has for ``kind``.
 *
 * Records of the three filed kinds - progress, material and construction
 * waste - stopped being accepted without a column (``validate_record_column``
 * now runs at creation, not only when the office refiles). Every fixture that
 * raises one through the API therefore has to name one, and they all want the
 * same thing: any open column of the right module on the seeded project.
 *
 * Read rather than created. `seed_e2e` already makes one of each kind, and a
 * fixture that minted its own would leave a new column behind on every run -
 * which is how the seeded project ended up with four of each in the first
 * place.
 */
export async function columnFor(
  request: APIRequestContext,
  headers: Record<string, string>,
  projectId: string,
  kind: "PROGRESS" | "MATERIAL" | "CONSTRUCTION_WASTE",
): Promise<string> {
  const response = await request.get(
    `${API}/api/project-categories/get_categories/` +
      `?project=${projectId}&kind=${kind}&is_active=true&page_size=50`,
    { headers },
  );
  expect(response.ok(), await response.text()).toBe(true);
  const [column] = (await response.json()).data.results;
  expect(
    column,
    `run \`manage.py seed_e2e\` - no open ${kind} column on this project`,
  ).toBeTruthy();
  return column.id as string;
}

/**
 * Open a 挂号 (queue-number hold) on a capture screen that has them.
 *
 * Material in, equipment in/out, site disposal and waste outgoing show no form
 * until one is opened (D-259, D-279: 「Nothing opens by itself」). A hold with
 * anything typed or photographed in it survives the page closing, so a spec
 * about a draft surviving is a spec about the hold surviving.
 */
export async function openHold(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New hold" }).first().click();
}

/**
 * An approved disposal handed to an outside collector, work started. Returns
 * the link's token.
 *
 * Fresh each run: evidence is append-only and a submission takes at most four
 * photographs (L6 / B24), so a seeded link fills up and then refuses.
 */
export async function freshExternalTask(request: APIRequestContext): Promise<string> {
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
  expect(project, "the seeded E2E project is missing").toBeTruthy();

  const stamp = Date.now();
  /*
   * `FormData`, not the object form of `multipart`.
   *
   * The request form wants four photographs under the same field name, and
   * `multipart: { photos: [stream, stream] }` is not that - Playwright reads
   * an array there as one value and fails with `stream.on is not a function`.
   * Four `append` calls on the same key is what a browser sends.
   *
   * (These four are a different gate from the execution photos this spec is
   * about: they are the site's own photographs of the waste being reported.)
   */
  const form = new FormData();
  form.append("project", project.id);
  form.append("waste_description", "Strip-out debris");
  form.append("location_description", "Rear compound");
  // A disposal request names its column on creation now (D-188).
  form.append(
    "category",
    await columnFor(request, headers, project.id, "CONSTRUCTION_WASTE"),
  );
  form.append("client_event_id", `e2e-disposal-${stamp}`);
  form.append("latitude", "3.1390000");
  form.append("longitude", "101.6869000");
  const bytes = fs.readFileSync(path.join(__dirname, "fixtures", "loading-photo.png"));
  for (let index = 0; index < 4; index += 1) {
    form.append(
      "photos",
      new Blob([bytes], { type: "image/png" }),
      `waste-${index}.png`,
    );
  }
  const created = await request.post(
    `${API}/api/site-disposals/create_request/`,
    { headers, multipart: form },
  );
  expect(created.status(), await created.text()).toBe(201);
  const disposalId = (await created.json()).data.id;

  const approved = await request.post(
    `${API}/api/site-disposals/${disposalId}/review_request/`,
    { headers, data: { decision: "APPROVED", note: "Proceed" } },
  );
  expect(approved.status(), await approved.text()).toBe(200);

  const assigned = await request.post(
    `${API}/api/site-disposals/${disposalId}/assign_collector/`,
    {
      headers,
      data: {
        collector_company_name: "Clean Site Services",
        collector_contact_name: "External Executor",
        collector_phone: "+60123456789",
        expires_at: new Date(stamp + 2 * 24 * 3600 * 1000).toISOString(),
      },
    },
  );
  expect(assigned.status(), await assigned.text()).toBe(200);
  return (await assigned.json()).data.external_token;
}
