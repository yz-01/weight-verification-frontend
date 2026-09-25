import { expect, test } from "@playwright/test";

import { ACCOUNTS, API, LOGIN_PATHS, apiLogin, loginAs } from "./helpers";

/**
 * A column can actually be filed under a module (T-221, AC-213, D-125).
 *
 * 客户 2026-09-11：「图片现在是把「栏目」设计成材料卡片，所以混凝土、钢管、门架都能
 * 放；但以后文件、设备、进度、EHS、废料等内容放进来就会很乱」，要求先选所属模块，
 * 再看该模块下的栏目。
 *
 * The module is a server field with a migration behind it, and that is exactly
 * the shape this project keeps catching: a field the API accepts that no
 * screen can set is a field nobody can fill. So this drives it the way a
 * person does - open the column, pick the module, save - and then asks the
 * server which module list the column is in now. Both halves in one pass,
 * because either one alone proves nothing about the other.
 *
 * The column is created fresh over the API rather than reusing a seeded one:
 * reclassifying is refused outright when deliveries or site records are
 * already filed in the column, so a seeded column would make this spec pass
 * or fail depending on what else the suite had filed that run.
 */

const CONTRACTOR_PORTAL = "MSE_TRACE";

test("a site-record column can be filed under a module and moves there", async ({
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

  const suffix = Date.now().toString().slice(-6);
  const code = `MOD-${suffix}`;
  const name = `Module probe ${suffix}`;
  const created = await request.post(
    `${API}/api/project-categories/create_category/`,
    {
      headers,
      data: {
        project: project.id,
        code,
        name,
        kind: "FIELD",
        submission_mode: "REVIEW",
      },
    },
  );
  expect(created.ok(), await created.text()).toBe(true);

  await loginAs(page, LOGIN_PATHS.trace, ACCOUNTS.contractor);
  // Category Management edits in place (D-264); /project-categories only
  // redirects there now.
  await page.goto(`/category-management?project=${project.id}&module=field`);

  const row = page.getByRole("row", { name: new RegExp(code) });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: /edit/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Every module this vocabulary owns is offerable, named as Category
  // Management names it. Documents, recyclable waste and the weighted stages
  // have their own tables on the server, so they are not in this picker
  // (F-338, D-126).
  // Asserted as a set rather than one option, because a missing catalogue key
  // renders as the key path - visible to nobody who is not looking for it.
  await dialog.getByRole("combobox").first().click();
  for (const label of [
    /progress categories/i,
    /ehs categories/i,
    /construction waste categories/i,
  ]) {
    await expect(page.getByRole("option", { name: label })).toBeVisible();
  }

  await page.getByRole("option", { name: /progress categories/i }).click();
  await dialog.getByRole("button", { name: /save|submit/i }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // The screen lists site-record columns, so a column that is now a progress
  // column has to leave it. This is the half a UI-only test would call done.
  await expect(page.getByRole("row", { name: new RegExp(code) })).toHaveCount(0, {
    timeout: 20_000,
  });

  // And the half that says where it went. `kind=PROGRESS` must return it and
  // `kind=FIELD` must not - the same question the management screen will ask.
  const inModule = await request.get(
    `${API}/api/project-categories/get_categories/?project=${project.id}&kind=PROGRESS&page_size=200`,
    { headers },
  );
  expect(inModule.ok(), await inModule.text()).toBe(true);
  const moduleCodes = (await inModule.json()).data.results.map(
    (row: { code: string }) => row.code,
  );
  expect(moduleCodes).toContain(code);

  const inField = await request.get(
    `${API}/api/project-categories/get_categories/?project=${project.id}&kind=FIELD&page_size=200`,
    { headers },
  );
  const fieldCodes = (await inField.json()).data.results.map(
    (row: { code: string }) => row.code,
  );
  expect(fieldCodes).not.toContain(code);
});
