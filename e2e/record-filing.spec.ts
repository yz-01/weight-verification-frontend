import fs from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, loginAs } from "./helpers";

/**
 * The office can file a progress record and a debris request (T-231, T-232).
 *
 * Two of the seven category modules the customer named had a vocabulary and
 * nothing that could point at it (F-338): progress records and disposal
 * requests carried no column at all, so their columns would have been lists
 * nobody could ever file into, with a record count of 0 for ever. Lucas asked
 * for the record end in the same batch (D-128).
 *
 * Both halves in one pass each, because neither proves the other: the server
 * refusing a wrong-module column is asserted in
 * `contractor_ops/tests/test_record_filing.py`, and what this adds is that a
 * person can reach it - the row says whether it is filed, the dialog offers
 * that module's columns, and the row says the new answer afterwards.
 *
 * Records are created over the API each run rather than seeded: filing is a
 * state, so a seeded record would carry whatever the last run left on it.
 */

const CONTRACTOR_PORTAL = "MSE_TRACE";
const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");

async function contractorHeaders(request: APIRequestContext) {
  const token = await apiLogin(request, ACCOUNTS.contractor, CONTRACTOR_PORTAL);
  return { Authorization: `Bearer ${token}` };
}

async function e2eProject(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(
    `${API}/api/projects/get_projects/?page_size=10`,
    { headers },
  );
  const project = (await response.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project, "run `manage.py seed_e2e` first").toBeTruthy();
  return project as { id: string };
}

/** A column of one module, created fresh so the test owns it. */
async function makeColumn(
  request: APIRequestContext,
  headers: Record<string, string>,
  project: string,
  kind: string,
  code: string,
  name: string,
) {
  const created = await request.post(
    `${API}/api/project-categories/create_category/`,
    {
      headers,
      data: { project, code, name, kind, submission_mode: "REVIEW" },
    },
  );
  expect(created.ok(), await created.text()).toBe(true);
  return (await created.json()).data as { id: string; name: string };
}

/** Open the filing dialog on one row, choose a column, and save. */
async function fileInto(page: Page, row: ReturnType<Page["locator"]>, column: string) {
  await row.getByRole("button", { name: /^File it$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: column }).click();
  // The one free-text box in the dialog. Located by role rather than by its
  // label: the label is on the wrapper, not bound to the input, and a test
  // that asserted the binding would be testing the wrapper, not the filing.
  await dialog.getByRole("textbox").fill("Checked against the drawing");
  await dialog.getByRole("button", { name: /^Save filing$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

test("a progress record is filed from the office, and the card says so", async ({
  page,
  request,
}) => {
  const headers = await contractorHeaders(request);
  const project = await e2eProject(request, headers);
  const stamp = Date.now().toString().slice(-6);

  const column = await makeColumn(
    request,
    headers,
    project.id,
    "PROGRESS",
    `PRG-${stamp}`,
    `Zone ${stamp}`,
  );

  const phase = await request.post(
    `${API}/api/site-progress/create_phase/`,
    {
      headers,
      data: {
        project: project.id,
        code: `PH-${stamp}`,
        name: `Substructure ${stamp}`,
        planned_weight: "1",
      },
    },
  );
  expect(phase.ok(), await phase.text()).toBe(true);

  const description = `Rebar tied, run ${stamp}`;
  const form = new FormData();
  form.append("project", project.id);
  form.append("phase", (await phase.json()).data.id);
  form.append("percent_complete", "42");
  form.append("description", description);
  // Required here, unlike on the disposal route: the progress endpoint uses it
  // to make a retried submission idempotent.
  form.append("client_event_id", `e2e-progress-${stamp}`);
  form.append("latitude", "3.1390000");
  form.append("longitude", "101.6869000");
  form.append(
    "photos",
    new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }),
    "progress.png",
  );
  const record = await request.post(`${API}/api/site-progress/create_record/`, {
    headers,
    multipart: form,
  });
  expect(record.status(), await record.text()).toBe(201);
  const recordId = (await record.json()).data.id;

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/progress");

  const card = page.locator("article", { hasText: description });
  await expect(card).toBeVisible({ timeout: 20_000 });
  // Unfiled has to be visible, not blank: it is the state somebody has to
  // notice before they can act on it.
  await expect(card.getByText("Not filed yet")).toBeVisible();

  await fileInto(page, card, column.name);

  await expect(card.getByText(column.name)).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("Not filed yet")).toHaveCount(0);

  // And the server agrees - the half a screen-only check would miss.
  const reread = await request.get(
    `${API}/api/site-progress/get_records/?project=${project.id}&page_size=200`,
    { headers },
  );
  const mine = (await reread.json()).data.results.find(
    (row: { id: string }) => row.id === recordId,
  );
  expect(mine.category).toBe(column.id);
  expect(mine.category_name).toBe(column.name);
});

test("a disposal request is filed from the office, and the row says so", async ({
  page,
  request,
}) => {
  const headers = await contractorHeaders(request);
  const project = await e2eProject(request, headers);
  const stamp = Date.now().toString().slice(-6);

  const column = await makeColumn(
    request,
    headers,
    project.id,
    "CONSTRUCTION_WASTE",
    `CWS-${stamp}`,
    `Rubble ${stamp}`,
  );

  const reference = `Strip-out debris ${stamp}`;
  const form = new FormData();
  form.append("project", project.id);
  form.append("waste_description", reference);
  form.append("location_description", "Rear compound");
  form.append("client_event_id", `e2e-filing-${stamp}`);
  form.append("latitude", "3.1390000");
  form.append("longitude", "101.6869000");
  const bytes = fs.readFileSync(PHOTO);
  for (let index = 0; index < 4; index += 1) {
    form.append(
      "photos",
      new Blob([bytes], { type: "image/png" }),
      `waste-${index}.png`,
    );
  }
  const created = await request.post(`${API}/api/site-disposals/create_request/`, {
    headers,
    multipart: form,
  });
  expect(created.status(), await created.text()).toBe(201);
  const requestId = (await created.json()).data.id;

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/site-disposals");

  const row = page.locator("article", { hasText: reference });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(/Not filed yet/)).toBeVisible();

  await fileInto(page, row, column.name);

  await expect(row.getByText(column.name)).toBeVisible({ timeout: 20_000 });

  const reread = await request.get(
    `${API}/api/site-disposals/get_requests/?page_size=200`,
    { headers },
  );
  const mine = (await reread.json()).data.results.find(
    (item: { id: string }) => item.id === requestId,
  );
  expect(mine.category).toBe(column.id);
  expect(mine.category_name).toBe(column.name);
});
