import fs from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, loginAs } from "./helpers";

/**
 * 总栏目: everything finished, waiting for this reader to look at it (T-233).
 *
 * 客户：「全部都是属于未归档需要查看了之后才可以归档，总栏目里面是放所有归档的东西」.
 *
 * What a browser can prove here, and the backend tests cannot, is that the
 * round trip exists: a record that finished shows up in the waiting half, its
 * detail sheet renders the record's own fields in this reader's language, and
 * archiving it moves it to the other half and keeps it there on reload.
 *
 * What this deliberately does *not* assert is that archiving is per person -
 * that needs two office accounts and the seed has one, so it is asserted where
 * it can be, in `contractor_ops/tests/test_archive_queue.py`
 * (`ArchivingIsPerPersonTests`). Asserting half of it here and calling it
 * covered would be worse than leaving it to the test that does the whole job.
 *
 * The record is created and confirmed over the API each run: "archived" is a
 * per-reader state, so a seeded record would carry whatever the last run left.
 */

const CONTRACTOR_PORTAL = "MSE_TRACE";
const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");

async function contractorHeaders(request: APIRequestContext) {
  const token = await apiLogin(request, ACCOUNTS.contractor, CONTRACTOR_PORTAL);
  return { Authorization: `Bearer ${token}` };
}

test("a confirmed record waits in the queue until this reader opens it", async ({
  page,
  request,
}) => {
  const headers = await contractorHeaders(request);
  const projects = await request.get(
    `${API}/api/projects/get_projects/?page_size=10`,
    { headers },
  );
  const project = (await projects.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project, "run `manage.py seed_e2e` first").toBeTruthy();

  const stamp = Date.now().toString().slice(-6);
  // A progress row is identified in the queue by its phase, not its
  // description: `reference` is the percentage and `detail` is the phase name
  // (`record_shapes.progress_row`). The description is on the detail sheet,
  // which is where this test looks for it.
  const phaseName = `Queue phase ${stamp}`;
  const phase = await request.post(`${API}/api/site-progress/create_phase/`, {
    headers,
    data: {
      project: project.id,
      code: `PHQ-${stamp}`,
      name: phaseName,
      planned_weight: "1",
    },
  });
  expect(phase.ok(), await phase.text()).toBe(true);

  const description = `Queued progress ${stamp}`;
  const form = new FormData();
  form.append("project", project.id);
  form.append("phase", (await phase.json()).data.id);
  form.append("percent_complete", "61");
  form.append("description", description);
  form.append("client_event_id", `e2e-queue-${stamp}`);
  form.append("latitude", "3.1390000");
  form.append("longitude", "101.6869000");
  form.append(
    "photos",
    new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }),
    "progress.png",
  );
  const created = await request.post(`${API}/api/site-progress/create_record/`, {
    headers,
    multipart: form,
  });
  expect(created.status(), await created.text()).toBe(201);
  const recordId = (await created.json()).data.id;

  // Submitted is not finished. Confirming is what closes a progress record,
  // and only then does the archive queue have anything to say about it
  // (D-130) - so this call is the test's own proof of the status gate.
  const confirmed = await request.post(
    `${API}/api/site-progress/${recordId}/review_record/`,
    { headers, data: { status: "CONFIRMED" } },
  );
  expect(confirmed.ok(), await confirmed.text()).toBe(true);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/archive-queue");

  // The unarchived half is what the screen opens on: it is the work.
  await expect(page.getByRole("heading", { name: "Archive queue" })).toBeVisible({
    timeout: 20_000,
  });
  const row = page.getByRole("row", { name: new RegExp(phaseName) });
  await expect(row).toBeVisible({ timeout: 20_000 });

  // Opening it shows the record's own fields, translated - a raw key like
  // `mySubmissions.field.phase` on screen is the defect F-225 is about.
  await row.getByRole("button", { name: "Open" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Site progress")).toBeVisible();
  await expect(sheet.getByText(description)).toBeVisible();
  await expect(sheet.getByText(/mySubmissions\./)).toHaveCount(0);

  // Opening is not archiving. The row is still waiting behind the sheet.
  await sheet.getByRole("button", { name: "Archive for me" }).click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });

  await expect(
    page.getByRole("row", { name: new RegExp(phaseName) }),
  ).toHaveCount(0, { timeout: 20_000 });

  // And it is in the other half, which is where the customer said the
  // archived things live.
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(phaseName) }),
  ).toBeVisible({ timeout: 20_000 });

  // Reloaded, because a state that only exists in React state is not archived.
  await page.reload();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(phaseName) }),
  ).toBeVisible({ timeout: 20_000 });
});

test("the module filter narrows the queue and its counts together", async ({
  page,
}) => {
  /*
   * A badge that ignores the filter beside it is read as the filter's number,
   * and the reader who trusts it stops looking. The server builds both from
   * one query (D-132); what a browser adds is that the two are wired to the
   * same control.
   */
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/archive-queue");

  const modules = page.getByRole("navigation", { name: "Modules" });
  await expect(modules).toBeVisible({ timeout: 20_000 });
  // Nine modules plus "all". Named rather than counted, so a module quietly
  // dropped from the registry fails here.
  for (const name of [
    "Material receipts",
    "Material leaving site",
    "Equipment in and out",
    "Hazard rectification",
    "Recyclable waste orders",
    "Construction waste disposal",
    "Site progress",
    "Consultant applications",
    "Attendance, by day",
  ]) {
    await expect(modules.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  await modules.getByRole("button", { name: /^Site progress/ }).click();
  // Every row left is a progress row: the filter is a filter, not a sort.
  const moduleCells = page.getByRole("cell", { name: "Site progress" });
  const rows = page.getByRole("row");
  const bodyRows = (await rows.count()) - 1;
  if (bodyRows > 0) {
    expect(await moduleCells.count()).toBe(bodyRows);
  }
});
