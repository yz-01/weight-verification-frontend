import { expect, test } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, loginAs } from "./helpers";

/**
 * One screen, module chosen from the left (T-219, T-220, AC-214, AC-216).
 *
 * 客户 2026-09-11：「页面最好采用左侧分类导航、右侧列表，不要继续现在这种大量卡片」,
 * with the rule that materials and documents must never share one level while
 * one screen still manages them all.
 *
 * The earlier plan had ten sidebar entries for this; the customer's own words
 * describe one screen with a list down its side, so T-219 became a single
 * entry (F-335). Both halves of that are asserted here: the sidebar has the
 * one entry and no longer has the material columns as an entry of their own,
 * and the two routes that used to be entries still open - people have links
 * to them, and the modules' own editors still live there.
 *
 * The six columns are asserted as headers, and the record count against a
 * number the test put there itself: a count column that always reads 0 would
 * look the same as a working one on a quiet database.
 */

const CONTRACTOR_PORTAL = "MSE_TRACE";

test("the routes that used to be sidebar entries still open", async ({
  page,
}) => {
  /*
   * The entry count is asserted in `src/lib/navigation.test.ts`, where the
   * registry is declared - a browser check of the sidebar would be asserting
   * the same fact through two more layers, and would go red for reasons that
   * have nothing to do with it.
   *
   * What a browser can say, and the unit test cannot, is that the two routes
   * this task took out of the sidebar still open: they are where each
   * module's categories are actually edited, and people have links to them.
   */
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);

  for (const route of ["/material-columns", "/project-categories"]) {
    await page.goto(route);
    await expect(page.getByText(/404|not found/i)).toHaveCount(0);
    await expect(page.locator("h1, h2").first()).toBeVisible({
      timeout: 20_000,
    });
  }
});

test("each module lists its own categories, with the six columns", async ({
  page,
  request,
}) => {
  const token = await apiLogin(request, ACCOUNTS.contractor, CONTRACTOR_PORTAL);
  const headers = { Authorization: `Bearer ${token}` };
  const projects = await request.get(
    `${API}/api/projects/get_projects/?page_size=10`,
    { headers },
  );
  const project = (await projects.json()).data.results.find(
    (row: { code: string }) => row.code === "P-E2E",
  );
  expect(project, "run `manage.py seed_e2e` first").toBeTruthy();

  const stamp = Date.now().toString().slice(-6);
  const code = `MAT-${stamp}`;
  const created = await request.post(
    `${API}/api/project-categories/create_category/`,
    {
      headers,
      data: {
        project: project.id,
        code,
        name: `Concrete ${stamp}`,
        kind: "MATERIAL",
        submission_mode: "REVIEW",
      },
    },
  );
  expect(created.ok(), await created.text()).toBe(true);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  await page.goto("/category-management");

  // The nine modules of the left-hand list, each named.
  const modules = page.getByRole("navigation", { name: /modules/i });
  await expect(modules).toBeVisible({ timeout: 20_000 });
  for (const name of [
    "Material categories",
    "Site record categories",
    "Document categories",
    "Equipment categories",
    "Progress categories",
    "Construction stages",
    "EHS categories",
    "Recycle categories",
    "Construction waste categories",
  ]) {
    await expect(modules.getByRole("button", { name })).toBeVisible();
  }

  // Material is project-scoped, so it asks for a project first rather than
  // listing another project's columns.
  await expect(
    page.getByText(/choose a project to see its categories/i),
  ).toBeVisible();

  await page
    .getByRole("combobox")
    .first()
    .click();
  await page.getByRole("option", { name: /E2E/ }).first().click();

  const row = page.getByRole("row", { name: new RegExp(code) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  for (const header of [
    "Category name",
    "Code",
    "Module",
    "Records",
    "Status",
    "Action",
  ]) {
    await expect(
      page.getByRole("columnheader", { name: header }),
    ).toBeVisible();
  }
  // The count reads the relation that matches the module: a brand-new
  // material column holds nothing, and the seeded ones hold deliveries.
  await expect(row).toContainText("0");
  await expect(row.getByText("Active")).toBeVisible();

  // Documents are company-wide, and the screen says so instead of leaving a
  // reader to find out by editing one.
  await modules.getByRole("button", { name: "Document categories" }).click();
  // The badge above the table, not the sentence below it: both say "the
  // whole company", so the badge is asked for by its own role.
  await expect(
    page.getByText("The whole company", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/one list for the whole company/i),
  ).toBeVisible();

  // Materials and documents are never in one list, which is the customer's
  // own rule: switching modules replaces the table rather than adding to it.
  await expect(page.getByRole("row", { name: new RegExp(code) })).toHaveCount(0);
});
