import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every full-page create and edit route has a dialog twin (T-216).
 *
 * The customer asked for all 28 forms at once. Converting them one at a time
 * is how half of them end up converted: the twenty-eighth is written weeks
 * after the first, by which time nobody remembers which ones were done. So the
 * list is not written down here - it is *read off the routes themselves*, and
 * a new create or edit page added tomorrow fails this test until it has a
 * dialog too.
 *
 * What the browser cannot check, and this can: that the count is complete, and
 * that each dialog renders the very page it intercepts rather than a copy that
 * will drift from it.
 */

const APP = path.join(process.cwd(), "src", "app", "(dashboard)");
const MODAL = path.join(APP, "@modal");

/** Every `create` or `[id]/edit` page under the dashboard, as a route path. */
function fullPageForms(): string[] {
  const found: string[] = [];

  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir)) {
      // The dialog twins live under the slot and are what we are checking for,
      // not what we are checking.
      if (entry === "@modal") continue;
      const full = path.join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      // Route groups such as `(dashboard)` do not appear in the address.
      const next = entry.startsWith("(") ? route : `${route}/${entry}`;
      if (existsSync(path.join(full, "page.tsx"))) {
        if (/\/(create|edit)$/.test(next)) found.push(next);
      }
      walk(full, next);
    }
  };

  walk(APP, "");
  return found.sort();
}

describe("the create and edit dialogs", () => {
  const routes = fullPageForms();

  it("finds the whole set of full-page forms", () => {
    // Not an arbitrary number: 14 modules with a create and an edit, plus
    // deductions and settlements which only create, less the receipt's create
    // (2026-10 A1: the office no longer records a delivery; only its
    // correction form, `/receipts/[id]/edit`, remains). If this changes, the
    // change is either a new form (which needs a dialog) or a deleted one.
    // 2026-10-09: less the dispatch's create and edit - a 废料订单 comes from
    // an approved 环保材料出场申请, and the old ones are read-only.
    // Also 2026-10-09: less the driver's and the lorry's create - both are
    // typed in 接单与派车 now (「新增司机和新增车辆也是可以移除了」).
    expect(routes.length).toBe(23);
  });

  it.each(fullPageForms())("%s opens as a dialog too", (route) => {
    const twin = path.join(MODAL, `(.)${route.slice(1)}`, "page.tsx");
    expect(existsSync(twin), `${twin} is missing`).toBe(true);

    const source = readFileSync(twin, "utf8");
    // The dialog renders the page it intercepts, so the two cannot drift.
    expect(source).toContain(`@/app/(dashboard)${route}/page`);
    expect(source).toContain("<FormDialog>");
  });

  it("has a default for the slot, so other pages still render", () => {
    // Without this file every address that is not a create or edit route has
    // nothing to put in the slot on a hard load, and 404s.
    expect(existsSync(path.join(MODAL, "default.tsx"))).toBe(true);
  });

  it("is actually rendered by the dashboard layout", () => {
    // A slot nothing renders is 28 files that never run.
    const layout = readFileSync(path.join(APP, "layout.tsx"), "utf8");
    expect(layout).toContain("modal");
    expect(layout).toMatch(/\{modal\}/);
  });
});

/**
 * Every full-page detail route has a dialog twin too (T-243).
 *
 * Lucas: 「为什么我按眼睛查看详情的时候不是弹窗」. T-216 converted the forms
 * and left the view routes as full-page navigations - the same list-losing
 * behaviour the forms had, on the screens people press most. Read off the
 * routes for the same reason the forms are: a detail page added tomorrow
 * fails this until it has a dialog.
 */
function fullPageDetails(): string[] {
  const found: string[] = [];

  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "@modal") continue;
      const full = path.join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      const next = entry.startsWith("(") ? route : `${route}/${entry}`;
      if (existsSync(path.join(full, "page.tsx"))) {
        // The record's own address: ends in the id segment, and is not one of
        // the create/edit routes the set above already covers.
        if (/\/\[id\]$/.test(next)) found.push(next);
      }
      walk(full, next);
    }
  };

  walk(APP, "");
  return found.sort();
}

/**
 * The business records among them (E8, Q31): their popup is the shared
 * record-detail dialog - number, status and 预览/打印 · 导出 PDF · 分享 in its
 * own header - rather than the page wrapped in a second dialog.
 */
const RECORD_DETAIL_ROUTES = [
  "/receipts/[id]",
  "/consultant-applications/[id]",
  "/dispatches/[id]",
  "/tasks/[id]",
];

describe("the detail dialogs", () => {
  const routes = fullPageDetails();

  it("finds the whole set of full-page detail screens", () => {
    // Twelve modules with a record of their own to open. A change here is
    // either a new detail screen (which needs a dialog) or a deleted one.
    expect(routes.length).toBe(12);
  });

  it.each(fullPageDetails())("%s opens as a dialog too", (route) => {
    const twin = path.join(MODAL, `(.)${route.slice(1)}`, "page.tsx");
    expect(existsSync(twin), `${twin} is missing`).toBe(true);

    const source = readFileSync(twin, "utf8");
    if (RECORD_DETAIL_ROUTES.includes(route)) {
      // A business record (E8, Q31): the module's own detail in its
      // record-detail popup, the same component the page renders.
      const page = readFileSync(path.join(APP, ...route.slice(1).split("/"), "page.tsx"), "utf8");
      const component = page.match(/<(\w+) id=\{id\}/)?.[1];
      expect(component, `${route}/page renders a detail component`).toBeTruthy();
      expect(source).toMatch(new RegExp(`<${component} id=\\{id\\} presentation="dialog"`));
      return;
    }
    expect(source).toContain(`@/app/(dashboard)${route}/page`);
    expect(source).toContain("<DetailDialog>");
  });

  it("draws its header from the one place every detail screen uses", () => {
    /*
     * `DetailHeader` is the seam. Eleven detail components render through it,
     * so the dialog branch lives there once instead of eleven times - and a
     * detail screen that drew its own back bar would show it inside the
     * dialog, beside the dialog's own close, pointing at the list behind.
     */
    const primitives = readFileSync(
      path.join(process.cwd(), "src", "components", "shared", "page-primitives.tsx"),
      "utf8",
    );
    expect(primitives).toContain('surface === "dialog"');
    expect(primitives).toContain("useFormSurface");
  });
});

/**
 * Every dialog closes once, whichever way it is closed (2026-10).
 *
 * Lucas, of 编辑用户: 「为什么我保存了不会自动关掉，然后要点两次取消才可以
 * 关掉？」. The forms pushed the list after saving; on a soft navigation Next
 * keeps the modal slot's previous content when the new address matches
 * nothing in it, so the dialog stayed, and each cancel went back through one
 * of the two history entries. The rule now lives in one file; these make
 * sure nothing goes round it.
 */
describe("closing the dialogs", () => {
  const SHARED = path.join(process.cwd(), "src", "components", "shared");
  const COMPONENTS = path.join(process.cwd(), "src", "components");

  /** Every component file that renders a form through `FormShell`. */
  function formComponents(): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith(".tsx") || entry.endsWith(".test.tsx")) continue;
        if (entry === "form-shell.tsx") continue;
        const source = readFileSync(full, "utf8");
        if (source.includes("<FormShell")) found.push(full);
      }
    };
    walk(COMPONENTS);
    return found.sort();
  }

  it("has a catch-all in the slot, so leaving a dialog for any other address empties it", () => {
    // `default.tsx` only applies on a hard load; on a soft navigation only a
    // matching route changes what the slot shows.
    const catchAll = path.join(MODAL, "[...catchAll]", "page.tsx");
    expect(existsSync(catchAll), `${catchAll} is missing`).toBe(true);
    expect(readFileSync(catchAll, "utf8")).toContain("return null");
  });

  it("records in-app navigations from the dashboard layout, so a dialog knows whether it can go back", () => {
    const layout = readFileSync(path.join(APP, "layout.tsx"), "utf8");
    expect(layout).toContain("<InAppNavigationTracker />");
  });

  const forms = formComponents();

  it("finds the forms", () => {
    // 13 since 2026-10-09: the direct dispatch form was retired.
    expect(forms.length).toBeGreaterThanOrEqual(13);
  });

  it.each(forms)("%s leaves through the shared rule after saving, not the router", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source, "router.push after a save reopens or strands the dialog").not.toMatch(
      /router\.push\(/,
    );
    expect(source).toContain("useFinishForm");
  });

  it.each([
    "form-dialog.tsx",
    "detail-dialog.tsx",
    "form-shell.tsx",
    "record-detail-shell.tsx",
  ])("shared/%s closes through the shared rule, never router.back() on its own", (name) => {
    const source = readFileSync(path.join(SHARED, name), "utf8");
    expect(source).not.toMatch(/router\.back\(\)/);
    expect(source).toContain("useDismissDialog");
  });

  it("the consultant application form, which draws its own footer, follows the same rule", () => {
    const source = readFileSync(
      path.join(COMPONENTS, "consultant-workflow", "application-form.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/router\.(push|back)\(/);
    expect(source).toContain("useFinishForm");
    expect(source).toContain("useDismissDialog");
  });
});
