import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PORTAL_NAVIGATION, isRouteAllowed, visibleNavigation } from "./navigation";
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
  /*
   * 「现场资料」 is no longer a container (D-283). The customer: 「栏目管理、
   * 总栏目、Multi Engine、进度 Claim、杂费报销……并不是同一个层级……『现场资料』
   * 不要作为一个总容器」. Each of the five is its own entry, at its own level.
   */
  const entries = PORTAL_NAVIGATION.MSE_TRACE.filter(
    (item) => item.feature === "project_categories",
  );
  const where = (href: string) => entries.find((item) => item.href === href);

  it("is five entries at their own levels, and no container", () => {
    expect(entries.every((item) => !item.children?.length)).toBe(true);
    expect(entries.map((item) => item.href)).not.toContain("/modules/categories");
    // Business entries.
    expect(where("/claims")?.group).toBe("operations");
    expect(where("/sundry-claims")?.group).toBe("operations");
    // Tools across every entry.
    expect(where("/archive-queue")?.group).toBe("tools");
    expect(where("/evidence-packages")?.group).toBe("tools");
    // A setting.
    expect(where("/category-management")?.group).toBe("system");
    expect(entries).toHaveLength(5);
  });

  it("shows the tools group between the business entries and finance", () => {
    const groups = visibleNavigation(
      "MSE_TRACE",
      ["project_categories", "material_receipts"],
      ["package.view", "claim.view", "sundry_claim.view"],
    ).map((group) => group.key);
    expect(groups.indexOf("tools")).toBe(groups.indexOf("operations") + 1);
    const tools = visibleNavigation("MSE_TRACE", ["project_categories"], ["package.view"])
      .find((group) => group.key === "tools")
      ?.items.map((item) => item.href);
    expect(tools).toEqual(["/archive-queue", "/evidence-packages"]);
  });

  it("hides an entry from somebody without its permission", () => {
    const hrefs = visibleNavigation("MSE_TRACE", ["project_categories"], [])
      .flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain("/category-management");
    expect(hrefs).toContain("/archive-queue");
    for (const gated of ["/claims", "/sundry-claims", "/evidence-packages"]) {
      expect(hrefs).not.toContain(gated);
    }
  });

  it("sends the old container's address to Category Management", () => {
    expect(
      isRouteAllowed("MSE_TRACE", ["project_categories"], "/modules/categories"),
    ).toBe(true);
    const page = readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/modules/[module]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/categories: "\/category-management"/);
    expect(page).not.toMatch(/categories: "project_categories"/);
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
     * the old material columns screen once suffered (F-340).
     */
    expect(
      isRouteAllowed("MSE_TRACE", ["material_receipts"], "/archive-queue"),
    ).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", [], "/archive-queue")).toBe(false);
  });

  it("keeps the retired column screens out of the sidebar", () => {
    const entries = PORTAL_NAVIGATION.MSE_TRACE.flatMap((item) => [
      item.href,
      ...(item.children ?? []).map((child) => child.href),
    ]);

    /*
     * Both only redirect to Category Management now (D-263): every module's
     * categories, the material budgets included, are managed there in
     * dialogs. They stay claimed by the category feature so an old link
     * reaches the redirect rather than a refusal on the way.
     */
    expect(entries).not.toContain("/material-columns");
    expect(entries).not.toContain("/project-categories");
    expect(
      isRouteAllowed("MSE_TRACE", ["project_categories"], "/material-columns"),
    ).toBe(true);
    expect(
      isRouteAllowed("MSE_TRACE", ["project_categories"], "/project-categories"),
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

describe("document archive workflows", () => {
  it("keeps evidence archive under the document archive module", () => {
    const documents = PORTAL_NAVIGATION.MSE_TRACE.find(
      (item) => item.feature === "documents",
    );
    expect(documents?.children?.map((child) => child.href)).toEqual([
      "/documents",
      "/approvals",
      "/evidence",
    ]);
    expect(
      PORTAL_NAVIGATION.MSE_TRACE.filter((item) => item.feature === "evidence"),
    ).toHaveLength(0);
    expect(
      isRouteAllowed("MSE_TRACE", ["evidence"], "/evidence", ["audit.view"]),
    ).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", [], "/evidence", [])).toBe(false);
  });

  it("does not list the evidence archive in the menu any more (T-345, 第 67 条)", () => {
    const groups = visibleNavigation("MSE_TRACE", ["documents", "approvals", "evidence"], ["audit.view"]);
    const hrefs = groups.flatMap((group) =>
      group.items.flatMap((item) => (item.children ?? []).map((child) => child.href)),
    );
    expect(hrefs).toContain("/documents");
    expect(hrefs).not.toContain("/evidence");
    // …and the page still opens by its address.
    expect(isRouteAllowed("MSE_TRACE", ["evidence"], "/evidence", ["audit.view"])).toBe(true);
  });
});
