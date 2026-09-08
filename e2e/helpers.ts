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
 */
export async function raiseReleasedDispatch(
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
