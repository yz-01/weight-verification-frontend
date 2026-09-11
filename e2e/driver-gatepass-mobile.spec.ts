import path from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, loginAs } from "./helpers";

const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");
const SCRAP_PORTAL = "MSE_SCRAP";

/**
 * T-223 / D-110: a driver cannot drive off the site until both the loading
 * photograph and the gate pass are on the trip.
 *
 * The backend gate is asserted in `haulage.tests.test_driver_tasks`. What only
 * a browser can show is the half that decides whether the rule is usable: that
 * there is somewhere to take the second photograph at all, and that the
 * sentence on the screen names the one still missing. A rule the driver cannot
 * satisfy from the screen is not a rule, it is a wall.
 *
 * Runs under the `mobile` project - 390px, which is where drivers are.
 *
 * A fresh trip each run, raised over the API, for the reason the rest of this
 * suite raises fresh loads: this test *drives* its fixture to the loaded step,
 * so a seeded trip would be usable exactly once and every run after that would
 * pass by finding nothing left to prove.
 *
 * A driver and a lorry can only be on one running trip at a time, so the setup
 * first fails whatever a previous run left behind. Cleaning up at the start
 * rather than at the end is deliberate: a run that crashes half way through
 * skips its own teardown, and then every later run fails for a reason that has
 * nothing to do with gate passes.
 *
 * The trip carries no dispatch - the field is nullable because a yard can
 * raise one for a load that simply turned up - and the first run of this test
 * found the driver screen crashing outright on exactly that (F-355). So it
 * also stands as the guard for that shape: if the screen white-screens on a
 * dispatch-less trip again, this test cannot reach its first assertion.
 */
test("a driver cannot drive off until the gate pass is photographed", async ({
  page,
  context,
  request,
}) => {
  const taskId = await raiseArrivedTrip(request);

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3.0738, longitude: 101.5183 });
  await loginAs(page, LOGIN_PATHS.scrap, ACCOUNTS.driver);
  await page.goto(`/driver/${taskId}`);

  const loaded = page.getByRole("button", { name: "Loaded", exact: true });

  // With neither photograph the screen names both, and the step is shut.
  await expect(
    page.getByText(
      "Take a loading photograph and a photograph of the gate pass before you drive off.",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect(loaded).toBeDisabled();

  // The loading photograph alone is not enough, and - the point of the whole
  // task - the sentence changes to name the gate pass and says the loading
  // photograph is done, so the driver does not go and photograph the load
  // again.
  await attach(page, "Take a photo");
  await expect(
    page.getByText(
      "Photograph the gate pass before you drive off. The loading photograph is done.",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect(loaded).toBeDisabled();

  // The gate pass has its own button on the screen. Without it this rule would
  // be a backend refusal with nowhere to answer it.
  await attach(page, "Photograph the gate pass");
  await expect(loaded).toBeEnabled({ timeout: 20_000 });

  await loaded.click();
  await page.getByRole("button", { name: "Confirm" }).click();

  // The trip actually moved: the loaded step is gone and the next one is up.
  await expect(page.getByRole("button", { name: "Heading back" })).toBeVisible({
    timeout: 20_000,
  });
});

/**
 * A trip standing at the site with no photographs on it, raised as the yard
 * and walked to ARRIVED as the driver. Returns its id.
 *
 * The yard, the lorry and the driver come from the seeded fleet, read back
 * over the same list endpoints the recycler console uses.
 */
async function raiseArrivedTrip(request: APIRequestContext): Promise<string> {
  const yardToken = await apiLogin(request, ACCOUNTS.recycler, SCRAP_PORTAL);
  const yardHeaders = { Authorization: `Bearer ${yardToken}` };
  const driverToken = await apiLogin(request, ACCOUNTS.driver, SCRAP_PORTAL);
  const driverHeaders = { Authorization: `Bearer ${driverToken}` };

  await releaseTheFleet(request, yardHeaders, driverHeaders);

  const created = await request.post(`${API}/api/tasks/create_task/`, {
    headers: yardHeaders,
    data: {
      site: await firstId(request, yardHeaders, "/api/sites/get_sites/"),
      vehicle: await firstId(request, yardHeaders, "/api/vehicles/get_vehicles/"),
      driver: await firstId(request, yardHeaders, "/api/drivers/get_drivers/"),
      notes: "Gate pass rule: both photographs before loading.",
      client_event_id: `gatepass-${Date.now()}`,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const taskId = (await created.json()).data.id as string;

  for (const state of ["ACCEPTED", "EN_ROUTE", "ARRIVED"]) {
    const moved = await request.post(
      `${API}/api/tasks/${taskId}/advance_task/`,
      {
        headers: driverHeaders,
        data: {
          state,
          latitude: "3.0738000",
          longitude: "101.5183000",
          client_event_id: `gatepass-${state}-${taskId}`,
        },
      },
    );
    expect(moved.ok(), await moved.text()).toBe(true);
  }
  return taskId;
}

/**
 * Fail whatever trip a previous run left running.
 *
 * The platform refuses to assign a driver or a lorry that is already out, so
 * without this the second run of this file fails on the assignment rather than
 * on anything it is trying to prove. `FAILED` rather than cancel: dispatch can
 * only cancel a trip that has not started, and the one left behind has.
 */
async function releaseTheFleet(
  request: APIRequestContext,
  yardHeaders: Record<string, string>,
  driverHeaders: Record<string, string>,
): Promise<void> {
  const listed = await request.get(`${API}/api/tasks/get_tasks/`, {
    headers: yardHeaders,
  });
  expect(listed.ok()).toBe(true);
  const running = (await listed.json()).data.results.filter(
    (row: { is_running: boolean }) => row.is_running,
  );
  for (const task of running) {
    const ended = await request.post(
      `${API}/api/tasks/${task.id}/advance_task/`,
      {
        headers: driverHeaders,
        data: {
          state: "FAILED",
          reason: "Left over by an earlier browser run.",
          client_event_id: `gatepass-cleanup-${task.id}`,
        },
      },
    );
    expect(ended.ok(), await ended.text()).toBe(true);
  }
}

/** The id of the first row a list endpoint returns, which must have one. */
async function firstId(
  request: APIRequestContext,
  headers: Record<string, string>,
  path: string,
): Promise<string> {
  const response = await request.get(`${API}${path}`, { headers });
  expect(response.ok(), `${path} must answer`).toBe(true);
  const rows = (await response.json()).data.results;
  expect(rows.length, `seed_e2e must leave a row at ${path}`).toBeGreaterThan(0);
  return rows[0].id as string;
}

/** Press a capture button and hand its file chooser the fixture image. */
async function attach(page: Page, buttonName: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
  await chooser.setFiles(PHOTO);
}
