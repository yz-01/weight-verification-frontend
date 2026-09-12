import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every column scheme the platform has must be creatable from a screen.
 *
 * `SiteEquipment.category` shipped served by the API, counted on Category
 * Management and offered on the equipment form - and with no screen anywhere
 * that could create a column to put in it. The kind picker did not list it,
 * the type union did not carry it, and the generic column screen was pinned to
 * site records, so "Open the module" on the Equipment row opened somebody
 * else's list (F-372). Nothing errored. The only symptom was a customer asking
 * where the thing was made.
 *
 * `check-category-kinds.mjs` cannot see this: it checks that every screen
 * *reading* categories says which kind it wants, which is the opposite
 * direction. This checks the writing end - that the set of kinds is closed
 * over creation - and it is the check that was missing when T-242 shipped.
 */

const SRC = path.join(process.cwd(), "src");
const INTERFACES = path.join(SRC, "interfaces", "contractor-ops.ts");
const WORKSPACES = path.join(
  SRC,
  "components",
  "contractor-ops",
  "operations-workspaces.tsx",
);
const MANAGEMENT = path.join(
  SRC,
  "components",
  "contractor-ops",
  "category-management.tsx",
);

const read = (file: string) => readFileSync(file, "utf8");

/**
 * The kinds `ProjectCategoryKind` declares, read off the union itself.
 *
 * Read rather than repeated: a list written twice is a list that disagrees
 * with itself the first time somebody adds a sixth scheme.
 */
function declaredKinds(): string[] {
  const source = read(INTERFACES);
  const union = source.match(
    /export type ProjectCategoryKind =([\s\S]*?);/,
  )?.[1];
  expect(union, "ProjectCategoryKind is declared").toBeTruthy();
  return [...(union as string).matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

describe("the column schemes", () => {
  it("declares the six the server accepts, and BOTH", () => {
    // Pinned deliberately rather than derived: this is the one place the list
    // is asserted against what the customer asked for, and a list that reads
    // itself agrees with any change including a wrong one.
    expect(declaredKinds().sort()).toEqual([
      "BOTH",
      "CONSTRUCTION_WASTE",
      "EHS",
      "EQUIPMENT",
      "FIELD",
      "MATERIAL",
      "PROGRESS",
    ]);
  });

  it("offers every one of them in the kind picker", () => {
    const dialog = read(WORKSPACES);
    for (const kind of declaredKinds()) {
      if (kind === "BOTH") continue; // Legacy marker: only shown on a row that already carries it.
      expect(
        dialog.includes(`<SelectItem value="${kind}">`),
        `${kind} can be chosen when creating a column`,
      ).toBe(true);
    }
  });

  it("sends each Category Management row to a list that can show it", () => {
    const management = read(MANAGEMENT);
    // The generic screen takes its scheme from the address (D-161). A row
    // pointing at it without saying which kind lands on site records, which
    // is how four of these rows opened the wrong list for months.
    const generic = [
      ...management.matchAll(/href: "\/project-categories([^"]*)"/g),
    ].map((m) => m[1]);
    expect(generic.length).toBeGreaterThan(0);
    for (const query of generic) {
      expect(query, "each row carries its own kind").toMatch(
        /^\?kind=[A-Z_]+$/,
      );
    }
    // And each kind it names is one the destination actually serves.
    const served = read(WORKSPACES).match(
      /const CATEGORY_SCREENS: Record<string, string> = \{([\s\S]*?)\};/,
    )?.[1];
    expect(served, "the destination declares which kinds it serves").toBeTruthy();
    for (const query of generic) {
      const kind = query.replace("?kind=", "");
      expect(
        (served as string).includes(`${kind}:`),
        `${kind} is a scheme /project-categories serves`,
      ).toBe(true);
    }
  });

  it("keeps the equipment row pointing at the equipment list", () => {
    // The row the customer asked about, pinned by name so a future edit that
    // drops the parameter fails here rather than in a screenshot.
    expect(read(MANAGEMENT)).toContain(
      'href: "/project-categories?kind=EQUIPMENT"',
    );
  });
});
