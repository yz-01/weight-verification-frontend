import { expect, type Page } from "@playwright/test";

/** Fixed credentials created by `backend manage.py seed_e2e`. */
export const PASSWORD = "E2e-Pass-1234!";

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

/** The console sidebar always carries the Dashboard link once signed in. */
export async function expectConsoleShell(page: Page): Promise<void> {
  await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible({
    timeout: 20_000,
  });
}
