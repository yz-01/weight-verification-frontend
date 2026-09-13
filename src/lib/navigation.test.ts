import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PORTAL_NAVIGATION, isRouteAllowed } from "./navigation";
import { helpKeyFor, helpKeys } from "./page-help";

/**
 * The rule this file protects: a feature the backend hands out must have a way
 * in.
 *
 * `recycling_records` failed it. The backend granted it to every contractor
 * role holding weighing.view, `accounts/tests/test_portals.py` asserted it,
 * the customer acceptance plan wrote it up as step B8, and the label was
 * translated into all four languages - but the registry below had no entry for
 * it, so the sidebar never showed it and `isRouteAllowed` denied `/weighing`
 * to exactly the people the feature exists for. Everything was in place except
 * the door.
 *
 * That is the shape of failure worth a permanent check, because nothing else
 * catches it: the types compile, the build passes, the page renders fine for
 * the role that does have a way in, and the only symptom is a customer saying
 * "I was told this was there and I cannot find it".
 */

/** Every key the union declares, read from the source it is declared in. */
function declaredFeatureKeys(): string[] {
  const source = readFileSync(
    path.join(process.cwd(), "src/lib/navigation.ts"),
    "utf8",
  );
  const start = source.indexOf("export type PortalFeatureKey =");
  const end = source.indexOf(";", start);
  expect(start, "the feature key union moved").toBeGreaterThan(-1);
  return [...source.slice(start, end).matchAll(/"([a-z_]+)"/g)].map(
    (match) => match[1],
  );
}

/** Every key that has an entry somewhere - a module of its own, or a child. */
function reachableFeatureKeys(): Set<string> {
  const keys = new Set<string>();
  for (const items of Object.values(PORTAL_NAVIGATION)) {
    for (const item of items) {
      keys.add(item.feature);
      for (const child of item.children ?? []) {
        if (child.feature) keys.add(child.feature);
      }
    }
  }
  return keys;
}

const LOCALES = ["en", "zh", "zh-TW", "ms"] as const;

/** Read one catalogue. */
function catalogue(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), `src/messages/${locale}.json`),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

/** The string at a dotted path, or undefined if nothing is there. */
function messageAt(tree: unknown, dotted: string): unknown {
  let node: unknown = tree;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Every label the sidebar will ask the catalogue for. */
function requestedLabels(): string[] {
  const keys = new Set<string>();
  for (const items of Object.values(PORTAL_NAVIGATION)) {
    for (const item of items) {
      keys.add(`nav.${item.labelKey}`);
      for (const child of item.children ?? []) keys.add(child.labelKey);
    }
  }
  return [...keys].sort();
}

describe("the feature registry", () => {
  it("gives every declared feature a way in", () => {
    const reachable = reachableFeatureKeys();
    const stranded = declaredFeatureKeys().filter((key) => !reachable.has(key));
    expect(
      stranded,
      "these feature keys exist in the type but nothing in the sidebar or " +
        "route table opens them, so a user granted one has no way to reach it",
    ).toEqual([]);
  });

  it("opens the weighing list to a contractor who may see recycling records", () => {
    // The exact hole that was open: the feature was granted and the route
    // refused.
    expect(
      isRouteAllowed("MSE_TRACE", ["recycling_records"], "/weighing"),
    ).toBe(true);
  });

  it("still refuses the weighing list to a contractor without that feature", () => {
    expect(isRouteAllowed("MSE_TRACE", ["projects"], "/weighing")).toBe(false);
  });

  it("refuses a route no feature owns", () => {
    expect(
      isRouteAllowed("MSE_TRACE", ["recycling_records"], "/nothing-here"),
    ).toBe(false);
  });

  it("gives every grouped recycler module a real child route", () => {
    const grouped = PORTAL_NAVIGATION.MSE_SCRAP.filter((item) =>
      item.href.startsWith("/recycler-modules/"),
    );
    expect(grouped.map((item) => item.feature)).toEqual([
      "customer_management",
      "yards",
      "waste_orders",
      "weighing_records",
      "inventory_management",
    ]);
    for (const item of grouped) {
      expect(item.children?.length ?? 0).toBeGreaterThan(0);
      for (const child of item.children ?? []) {
        expect(child.href.startsWith("/recycler-modules/"), child.href).toBe(false);
        expect(
          isRouteAllowed(
            "MSE_SCRAP",
            [item.feature, ...(child.feature ? [child.feature] : [])],
            child.href,
          ),
          `${item.feature} must open ${child.href}`,
        ).toBe(true);
      }
    }
  });
});

/**
 * The sidebar renders `t(item.labelKey)` and `t(child.labelKey)`, so the key
 * reaches next-intl inside a variable. `check-message-keys.mjs` scans for
 * literal `t("...")` calls and structurally cannot see these, which is how
 * `nav.submodule.photoApprovals` and `nav.submodule.materialColumns` sat
 * missing from all four catalogues while every other check stayed green - and
 * the contractor's menu printed the key path where a name belongs.
 */
/**
 * The rule this protects: the help button must say something true about the
 * screen it is on.
 *
 * It used to open the same three sentences everywhere - look at what is there,
 * do the thing, check the result - which is true of every screen ever built
 * and therefore describes none of them. A person opens that once, learns
 * nothing, and never opens it again, so the feature was worse than absent: it
 * occupied the place where real help would have gone.
 *
 * `need` is the one optional section, because plenty of screens are read-only
 * and a "nothing is required here" line would be noise.
 */
const REQUIRED_HELP = ["what", "who", "then", "trouble"] as const;

describe("every module explains itself", () => {
  for (const locale of LOCALES) {
    it(`in ${locale}`, () => {
      const messages = catalogue(locale);
      const gaps: string[] = [];
      for (const key of helpKeys()) {
        for (const section of REQUIRED_HELP) {
          if (typeof messageAt(messages, `pageHelp.${key}.${section}`) !== "string") {
            gaps.push(`pageHelp.${key}.${section}`);
          }
        }
      }
      expect(
        gaps,
        `these modules would open a help panel with a hole in it in ${locale}`,
      ).toEqual([]);
    });
  }

  it("puts a route on the module a reader is actually looking at", () => {
    // The same path under two portals is two different screens, and the help
    // has to follow the one in front of the reader.
    expect(helpKeyFor("MSE_SCRAP", "/weighing")).toBe("weighing_records");
    expect(helpKeyFor("MSE_TRACE", "/weighing")).toBe("recycling_records");
    expect(helpKeyFor("MSE_ADMIN", "/weighing")).toBe("cloud_weighing");
  });

  it("prefers the child entry over its parent module", () => {
    expect(helpKeyFor("MSE_TRACE", "/waste-outgoing")).toBe("waste_outgoing");
  });

  it("claims nothing for a route no module owns", () => {
    expect(helpKeyFor("MSE_TRACE", "/nothing-here")).toBeNull();
  });
});

describe("every menu entry has a name", () => {
  for (const locale of LOCALES) {
    it(`in ${locale}`, () => {
      const messages = catalogue(locale);
      const nameless = requestedLabels().filter(
        (key) => typeof messageAt(messages, key) !== "string",
      );
      expect(
        nameless,
        `these menu entries would render their key path in ${locale}`,
      ).toEqual([]);
    });
  }
});

/**
 * The category module has one entry, not ten (T-219, D-125, F-335).
 *
 * The earlier plan gave the customer's seven modules a sidebar entry each,
 * plus a combined one. Their own words describe something else - "the user
 * picks the module first, then sees the columns under it" - which is one
 * screen with a list down its side. Ten entries would have been ten places to
 * maintain one thing, and the drift would start the first time a module was
 * added.
 *
 * Asserted here rather than in a browser: this is a fact about the registry,
 * and the registry is where somebody would undo it.
 */
describe("the category module", () => {
  // Not named `module`: Next forbids assigning that identifier.
  const categories = PORTAL_NAVIGATION.MSE_TRACE.find(
    (item) => item.feature === "project_categories",
  );

  it("has four children: definitions, the queue, Multi Engine, claims", () => {
    expect(categories?.children?.map((child) => child.href)).toEqual([
      "/category-management",
      "/archive-queue",
      "/evidence-packages",
      // Claim Engine (T-236). A fourth sibling for the same reason the
      // third is one: three different questions about the same records -
      // what nobody has read, why a bundle exists, and what is being
      // claimed this month.
      "/claims",
    ]);
  });

  /*
   * Multi Engine is a third sibling, not a tab of the queue (T-235). 总栏目
   * answers "what has nobody looked at yet"; a package answers "why was this
   * bundle put together". Both list records and they mean different things,
   * which is the same reason the first two are separate.
   *
   * Gated on `package.view`, because that is what the endpoints behind it
   * check. An entry that leads to a 403 is worse than no entry: the person
   * cannot tell whether the feature is missing or they are.
   */
  it("keeps Multi Engine behind the permission its endpoints check", () => {
    expect(
      isRouteAllowed(
        "MSE_TRACE",
        ["project_categories"],
        "/evidence-packages",
        ["package.view"],
      ),
    ).toBe(true);
    expect(
      isRouteAllowed("MSE_TRACE", ["project_categories"], "/evidence-packages", []),
    ).toBe(false);
  });

  /*
   * Two entries and not two tabs, because the two screens' status columns mean
   * different things: active/inactive for a category definition, and
   * unarchived/archived for a record (D-125). One column with two meanings is
   * how somebody deactivates a column believing they archived a delivery.
   */
  it("opens the record queue to every module whose records it lists", () => {
    expect(
      isRouteAllowed("MSE_TRACE", ["project_categories"], "/archive-queue"),
    ).toBe(true);
    /*
     * The queue merges nine modules and the server already answers each caller
     * with only the kinds they may read. Gating the route on the category
     * feature alone would hide a project manager's own deliveries from them
     * because of a feature flag about categories - the same silent removal
     * `/material-columns` suffered (F-340).
     */
    expect(
      isRouteAllowed("MSE_TRACE", ["material_receipts"], "/archive-queue"),
    ).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", [], "/archive-queue")).toBe(false);
  });

  it("no longer lists the material columns as an entry of their own", () => {
    const entries = PORTAL_NAVIGATION.MSE_TRACE.flatMap((item) => [
      item.href,
      ...(item.children ?? []).map((child) => child.href),
    ]);

    expect(entries).not.toContain("/material-columns");
    /*
     * The route still resolves, for both kinds of reader. `isRouteAllowed`
     * reads this registry, so dropping the entry did not merely hide the
     * screen - it refused it, and to whoever held material access rather
     * than category access it would have disappeared without a word. Both
     * modules therefore claim the route.
     */
    expect(
      isRouteAllowed("MSE_TRACE", ["material_receipts"], "/material-columns"),
    ).toBe(true);
    expect(
      isRouteAllowed("MSE_TRACE", ["project_categories"], "/material-columns"),
    ).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", [], "/material-columns")).toBe(false);
  });

  it("keeps the management screen behind the category feature", () => {
    expect(
      isRouteAllowed("MSE_TRACE", ["project_categories"], "/category-management"),
    ).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", [], "/category-management")).toBe(false);
  });
});

describe("project and field workflows", () => {
  it("keeps Project limited to project records", () => {
    const projects = PORTAL_NAVIGATION.MSE_TRACE.find(
      (item) => item.feature === "projects",
    );
    expect(projects?.children?.map((child) => child.href)).toEqual(["/projects"]);
  });

  it("exposes field tasks and photo approvals as independent entries", () => {
    const entries = PORTAL_NAVIGATION.MSE_TRACE.filter(
      (item) => item.feature === "field_tasks",
    );
    expect(entries.map((item) => item.href)).toEqual([
      "/field-tasks",
      "/photo-approvals",
    ]);
    expect(entries.map((item) => item.labelKey)).toEqual([
      "field_tasks",
      "submodule.photoApprovals",
    ]);
    expect(isRouteAllowed("MSE_TRACE", ["field_tasks"], "/field-tasks")).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", ["field_tasks"], "/photo-approvals")).toBe(true);
  });
});
