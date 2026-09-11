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
    // deductions and settlements which only create. If this changes, the
    // change is either a new form (which needs a dialog) or a deleted one.
    expect(routes.length).toBe(28);
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
