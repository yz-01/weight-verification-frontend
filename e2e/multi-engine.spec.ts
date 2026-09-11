import fs from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, loginAs } from "./helpers";

/**
 * Multi Engine: gather evidence from two columns into one PDF (T-235).
 *
 * Lucas 转述客户：「用来 export pdf 的，就是可以把文件整合在一起然后打包成 PDF」.
 *
 * What only a browser can show, and the backend tests cannot: that the round
 * trip exists. A person can start a package, reach records from more than one
 * column of their project, tick which parts of a record go in, confirm it, and
 * get a file back - and find it again afterwards by what they called it.
 *
 * The records are created over the API each run rather than seeded, for the
 * reason the rest of this suite does it: this test *confirms* a package, and a
 * confirmed package cannot be edited or deleted (D-142), so a seeded one would
 * be usable once.
 */

const CONTRACTOR_PORTAL = "MSE_TRACE";
const PHOTO = path.join(__dirname, "fixtures", "loading-photo.png");
const WAIT = { timeout: 30_000 };

async function contractorHeaders(request: APIRequestContext) {
  const token = await apiLogin(request, ACCOUNTS.contractor, CONTRACTOR_PORTAL);
  return { Authorization: `Bearer ${token}` };
}

/** The seeded project every contractor fixture hangs off. */
async function e2eProject(request: APIRequestContext, headers: Record<string, string>) {
  const projects = await request.get(
    `${API}/api/projects/get_projects/?page_size=10`,
    { headers },
  );
  const project = (await projects.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project, "run `manage.py seed_e2e` first").toBeTruthy();
  return project;
}

/** A confirmed progress record, which is one of the columns a package draws from. */
async function progressRecord(
  request: APIRequestContext,
  headers: Record<string, string>,
  projectId: string,
  stamp: string,
  options: { phaseName?: string } = {},
) {
  const phase = await request.post(`${API}/api/site-progress/create_phase/`, {
    headers,
    data: {
      project: projectId,
      code: `PKG-${stamp}`,
      name: options.phaseName ?? `Package phase ${stamp}`,
      planned_weight: "1",
    },
  });
  expect(phase.ok(), await phase.text()).toBe(true);

  const form = new FormData();
  form.append("project", projectId);
  form.append("phase", (await phase.json()).data.id);
  form.append("percent_complete", "42");
  form.append("description", `Packaged progress ${stamp}`);
  form.append("client_event_id", `e2e-package-${stamp}`);
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
  return (await created.json()).data.id;
}

test("evidence from two columns becomes one package, and can be found again", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const headers = await contractorHeaders(request);
  const project = await e2eProject(request, headers);
  const stamp = Date.now().toString().slice(-6);
  await progressRecord(request, headers, project.id, stamp);

  const draftName = `Draft ${stamp}`;
  const packageName = `Progress claim ${stamp}`;

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/evidence-packages");
  await expect(
    page.getByRole("heading", { name: "Multi Engine" }),
  ).toBeVisible(WAIT);

  // -- start one -----------------------------------------------------------
  await page.getByRole("button", { name: "New package" }).click();
  const dialog = page.getByRole("dialog", { name: "Start a package" });
  await expect(dialog).toBeVisible(WAIT);
  await dialog.getByRole("combobox").click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("textbox").fill(draftName);
  await dialog.getByRole("button", { name: "Create" }).click();

  // The new package opens straight away: the next thing to do is fill it.
  const draft = page.getByRole("dialog", { name: draftName });
  await expect(draft).toBeVisible(WAIT);

  // -- fix the name -------------------------------------------------------
  // The name is typed before the package holds anything, so it is routinely
  // wrong by the time it holds something. Without this the only repair is to
  // delete the package and pick every record over again.
  await draft.getByLabel("Package name").fill(packageName);
  await draft.getByRole("button", { name: "Rename" }).click();
  const sheet = page.getByRole("dialog", { name: packageName });
  await expect(sheet).toBeVisible(WAIT);

  // -- add records from a column ------------------------------------------
  await sheet.getByRole("button", { name: "Add records" }).click();
  const picker = page.getByRole("dialog", { name: "Add records" });
  await expect(picker).toBeVisible(WAIT);
  await picker.getByRole("button", { name: "Progress", exact: true }).click();
  const firstRecord = picker.getByRole("checkbox").first();
  await expect(firstRecord).toBeVisible(WAIT);
  await firstRecord.check();
  await picker.getByRole("button", { name: /^Add \d+ selected$/ }).click();
  await expect(picker).toBeHidden(WAIT);

  // -- tick which parts of it go in (D-149) --------------------------------
  await expect(sheet.getByRole("button", { name: "Choose parts" })).toBeVisible(
    WAIT,
  );
  await sheet.getByRole("button", { name: "Choose parts" }).click();
  /*
   * Identified by its Save button rather than by `getByRole("dialog").last()`:
   * that locator re-evaluates, so once this dialog closes it resolves to the
   * package sheet behind it and never becomes hidden.
   */
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeVisible(WAIT);
  await expect(page.getByText("Fields", { exact: true })).toBeVisible();
  // Everything starts ticked, because ticking the record meant the record.
  const boxes = page.getByRole("checkbox");
  await expect(boxes.first()).toBeChecked();
  // Untick one field and save.
  await boxes.first().uncheck();
  await save.click();
  await expect(save).toHaveCount(0, WAIT);

  // -- confirm and merge ---------------------------------------------------
  await sheet
    .getByRole("textbox")
    .last()
    .fill(`Evidence for the ${stamp} claim.`);
  await sheet.getByRole("button", { name: "Confirm and merge" }).click();

  // A confirmed package says so, carries a digest, and no longer offers the
  // controls that would change it (D-142).
  await expect(sheet.getByText(/^Digest [0-9a-f]{64}$/)).toBeVisible(WAIT);
  await expect(
    sheet.getByRole("button", { name: "Add records" }),
  ).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Remove" })).toHaveCount(0);

  // -- the file actually comes back ---------------------------------------
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  // -- and it can be found again by what it was called ---------------------
  // Scoped to the sheet: the toasts this flow raised each carry a Close
  // button of their own.
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toBeHidden(WAIT);
  await page.getByPlaceholder("Search by name or remarks").fill(stamp);
  await expect(page.getByRole("cell", { name: packageName })).toBeVisible(WAIT);
  await expect(page.getByRole("cell", { name: "Confirmed" })).toBeVisible(WAIT);
});

test("a package refuses a record from another project, and says why", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const headers = await contractorHeaders(request);
  const project = await e2eProject(request, headers);
  const stamp = Date.now().toString().slice(-6);
  await progressRecord(request, headers, project.id, stamp);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/evidence-packages");

  // The rule is stated on the screen where a package is started, not
  // discovered when an add is refused (D-143).
  await page.getByRole("button", { name: "New package" }).click();
  const dialog = page.getByRole("dialog", { name: "Start a package" });
  await expect(dialog).toBeVisible(WAIT);
  await expect(
    dialog.getByText(/A package belongs to one project/),
  ).toBeVisible();
});

test("a record can be put in a package from the column it sits in", async ({
  page,
  request,
}) => {
  /*
   * T-238 / D-154. The workspace answers "which records go in this package";
   * this is the same act from the other end, where the thing being chosen is
   * the package. What only a browser can show is that both ends arrive at the
   * same member: a record added from the queue is in the workspace afterwards,
   * indistinguishable from one picked there.
   *
   * The archive queue is where this is asserted because it is the one screen
   * that opens a record of any of the nine kinds, which is also why the
   * shortcut lives there rather than nine times over.
   *
   * The draft is raised over the API rather than assumed: every earlier run of
   * this file leaves drafts behind, so "this project has no draft yet" is a
   * fixture that only works once.
   */
  test.setTimeout(240_000);
  const headers = await contractorHeaders(request);
  const project = await e2eProject(request, headers);
  const stamp = Date.now().toString().slice(-6);
  const phaseName = `Shortcut phase ${stamp}`;
  const recordId = await progressRecord(request, headers, project.id, stamp, {
    phaseName,
  });

  // Submitted is not finished: the queue only carries confirmed records.
  const confirmed = await request.post(
    `${API}/api/site-progress/${recordId}/review_record/`,
    { headers, data: { status: "CONFIRMED" } },
  );
  expect(confirmed.ok(), await confirmed.text()).toBe(true);

  const packageName = `Shortcut claim ${stamp}`;
  const draft = await request.post(
    `${API}/api/evidence-packages/create_package/`,
    { headers, data: { project: project.id, name: packageName } },
  );
  expect(draft.status(), await draft.text()).toBe(201);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/archive-queue");
  const row = page.getByRole("row", { name: new RegExp(phaseName) });
  await expect(row).toBeVisible(WAIT);
  await row.getByRole("button", { name: "Open" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible(WAIT);
  await sheet.getByRole("button", { name: "Add to a package" }).click();

  const picker = page.getByRole("dialog", { name: "Add to a package" });
  await expect(picker).toBeVisible(WAIT);
  // Drafts of this project only - a confirmed package would refuse a new
  // member, so offering one would be an option that fails on being chosen.
  await picker.getByRole("radio", { name: new RegExp(packageName) }).check();
  await picker.getByRole("button", { name: "Add to a package" }).click();
  await expect(picker).toBeHidden(WAIT);

  /*
   * The record sheet is still open behind the picker, and it is a full-screen
   * overlay - leaving it there makes every link on the page unclickable, which
   * is also true for the person using it.
   */
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0, WAIT);

  /*
   * And it really is in there, reached from the other screen entirely -
   * through the sidebar rather than a second `page.goto`, which is a full
   * reload: one run of the whole suite landed that reload on the sign-in page
   * with the session half-restored, and an in-app navigation is both steadier
   * and closer to what a person does.
   */
  await page.getByRole("link", { name: "Multi Engine" }).click();
  await expect(
    page.getByRole("heading", { name: "Multi Engine" }),
  ).toBeVisible(WAIT);
  await page.getByPlaceholder("Search by name or remarks").fill(stamp);
  await page
    .getByRole("row", { name: new RegExp(packageName) })
    .getByRole("button", { name: "Open" })
    .click();
  const workspace = page.getByRole("dialog", { name: packageName });
  await expect(workspace).toBeVisible(WAIT);
  // The member line names the column it came from and what it carries.
  await expect(workspace.getByText(/^Progress .* fields/)).toBeVisible(WAIT);
  // The same per-part control the workspace gives a record picked there, which
  // is the point: one shape of member, two ways in.
  await expect(
    workspace.getByRole("button", { name: "Choose parts" }),
  ).toBeVisible(WAIT);
});

test("with no draft open, the shortcut starts one instead of greying out", async ({
  page,
  request,
}) => {
  /*
   * The empty branch, which cannot be reached from the shared development
   * database - every run of the test above leaves a draft behind. The list
   * coming back empty is the whole input to this branch, so it is stubbed at
   * that one call rather than arranged in the data.
   */
  test.setTimeout(240_000);
  const headers = await contractorHeaders(request);
  const project = await e2eProject(request, headers);
  const stamp = Date.now().toString().slice(-6);
  const phaseName = `Empty phase ${stamp}`;
  const recordId = await progressRecord(request, headers, project.id, stamp, {
    phaseName,
  });
  const confirmed = await request.post(
    `${API}/api/site-progress/${recordId}/review_record/`,
    { headers, data: { status: "CONFIRMED" } },
  );
  expect(confirmed.ok(), await confirmed.text()).toBe(true);

  await page.route("**/api/evidence-packages/get_packages/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "",
        data: { count: 0, next: null, previous: null, results: [] },
      }),
    }),
  );

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/archive-queue");
  const row = page.getByRole("row", { name: new RegExp(phaseName) });
  await expect(row).toBeVisible(WAIT);
  await row.getByRole("button", { name: "Open" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to a package" })
    .click();

  const picker = page.getByRole("dialog", { name: "Add to a package" });
  await expect(picker).toBeVisible(WAIT);
  await expect(
    picker.getByText(/This project has no draft package open/),
  ).toBeVisible();
  await expect(picker.getByLabel("Package name")).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Start it and add" }),
  ).toBeVisible();
});
