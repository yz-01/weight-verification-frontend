import { defineConfig, devices } from "@playwright/test";

/**
 * Browser regression suite for the six MSE Trace roles.
 *
 * Boots the real Django API against a dedicated `weightverification_e2e`
 * database (migrated and seeded with the fixed six-role accounts by
 * `manage.py seed_e2e`) and the Next.js dev server pointed at it. The dev
 * server is used on CI too: a production build refuses a localhost API
 * origin by design, and the suite tests behaviour, not build output.
 *
 * Local run: `npm run test:e2e` with Postgres running and the backend
 * conda environment active (so `python` resolves to it). Override the
 * interpreter with E2E_BACKEND_PYTHON, the backend checkout location with
 * E2E_BACKEND_DIR.
 */

const BACKEND_PORT = 8199;
const FRONTEND_PORT = 3199;
const BACKEND_DIR = process.env.E2E_BACKEND_DIR ?? "../backend";
const PYTHON = process.env.E2E_BACKEND_PYTHON ?? "python";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    // localhost, not 127.0.0.1: the Next 16 dev server blocks cross-origin
    // requests to its dev resources, and it treats the IP as a different
    // origin — the page renders but never hydrates, so every click falls
    // through to native form submission.
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 12"], browserName: "chromium" },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command:
        `${PYTHON} manage.py migrate --noinput && ` +
        `${PYTHON} manage.py seed_e2e && ` +
        `${PYTHON} manage.py runserver 127.0.0.1:${BACKEND_PORT} --noreload`,
      cwd: BACKEND_DIR,
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...process.env,
        POSTGRES_DB: process.env.E2E_POSTGRES_DB ?? "weightverification_e2e",
        DJANGO_DEBUG: "1",
        CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT}`,
      },
    },
    {
      command: `npx next dev -p ${FRONTEND_PORT}`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}`,
      },
    },
  ],
});
