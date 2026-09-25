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
 * entry (F-335). Since D-263 the two routes that used to be entries only
 * redirect here; that is asserted below.
 *
 * The six columns are asserted as headers, and the record count against a
 * number the test put there itself: a count column that always reads 0 would
 * look the same as a working one on a quiet database.
 */

const CONTRACTOR_PORTAL = "MSE_TRACE";

test("the retired column screens redirect to Category Management", async ({
  page,
}) => {
  /*
   * `/material-columns` and `/project-categories` are gone as screens
   * (D-263): every module's categories are created, edited and deleted on
   * Category Management in dialogs. People still have links to them, so
   * each has to land there with its module chosen rather than on a 404.
   */
  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);

  for (const [route, module] of [
    ["/material-columns", "material"],
    ["/project-categories?kind=EQUIPMENT", "equipment"],
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/category-management" &&
        url.searchParams.get("module") === module,
      { timeout: 20_000 },
    );
    await expect(page.getByText(/404|not found/i)).toHaveCount(0);
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

  /*
   * The modules of the left-hand list this account is offered, each named.
   *
   * "Equipment categories" is deliberately not among them (F-367). Its list
   * is behind `IsPlatformStaff` and `asset.view`, a code the catalogue offers
   * to the PLATFORM audience alone, so for a contractor the row could only
   * ever answer "you are not allowed to do that" - which is what a customer
   * screenshot showed. This loop is where that should have been caught, and
   * was not: it asserted the button was *visible*, never that pressing it
   * reached anything. `category-management-reachable.spec.ts` now presses
   * every one of them.
   */
  const modules = page.getByRole("navigation", { name: /modules/i });
  await expect(modules).toBeVisible({ timeout: 20_000 });
  for (const name of [
    "Material categories",
    "Site record categories",
    "Document categories",
    "Progress categories",
    "Construction stages",
    "EHS categories",
    "Recycle categories",
    "Construction waste categories",
  ]) {
    await expect(modules.getByRole("button", { name })).toBeVisible();
  }
  await expect(
    modules.getByRole("button", { name: "Equipment categories" }),
  ).toHaveCount(0);

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
