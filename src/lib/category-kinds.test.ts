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
  it("declares the nine the server accepts, and BOTH", () => {
    // Pinned deliberately rather than derived: this is the one place the list
    // is asserted against what the customer asked for, and a list that reads
    // itself agrees with any change including a wrong one.
    expect(declaredKinds().sort()).toEqual([
      "BOTH",
      "CLAIM",
      "CONSTRUCTION_WASTE",
      "CONSULTANT",
      "EHS",
      "EQUIPMENT",
      "FIELD",
      "MATERIAL",
      "PROGRESS",
      "SUNDRY",
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

  it("gives every scheme a Category Management module that edits it in place", () => {
    // Since D-264 there is no second column screen to send a row to: each of
    // these kinds is a module on Category Management whose create, edit and
    // delete open the column dialog right there. A kind with no module would
    // be a column nobody can make - the F-372 shape again.
    const management = read(MANAGEMENT);
    const modules = [
      ...management.matchAll(/columnModule\("([a-z]+)", "([A-Z_]+)"\)/g),
    ].map((m) => m[2]);
    for (const kind of declaredKinds()) {
      if (kind === "BOTH") continue;
      expect(modules, `${kind} has a module row`).toContain(kind);
    }
  });

  it("keeps the equipment row on the equipment scheme", () => {
    // The row the customer asked about, pinned by name so a future edit that
    // points it elsewhere fails here rather than in a screenshot.
    expect(read(MANAGEMENT)).toContain('columnModule("equipment", "EQUIPMENT")');
  });
});
