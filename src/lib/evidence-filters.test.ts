import { describe, expect, it } from "vitest";

import { builtinCategoryKey, groupModules, MODULE_LABEL_PATH, moduleKeyOf, subcategoriesOf } from "@/lib/evidence-filters";

describe("evidence filters (I40)", () => {
  it("folds a module's tables into one choice and adds their counts", () => {
    const groups = groupModules([
      { value: "receiving.receiptphoto", count: 3 },
      { value: "receiving.deliverynoteevidence", count: 2 },
      { value: "site_operations.safetyincident", count: 1 },
    ]);
    expect(groups).toEqual([
      { key: "materialIn", value: "receiving.receiptphoto,receiving.deliverynoteevidence", count: 5 },
      { key: "hazard", value: "site_operations.safetyincident", count: 1 },
    ]);
  });

  it("shows an unknown table as the module 「other」, never its code", () => {
    expect(moduleKeyOf("some_app.somethingnew")).toBe("other");
    expect(groupModules([{ value: "x.y", count: 4 }])[0].key).toBe("other");
  });

  it("lists sub-categories only for the chosen category", () => {
    const categories = [
      { value: "A", subcategories: [{ value: "A1", count: 2 }] },
      { value: "B", subcategories: [] },
    ];
    expect(subcategoriesOf(categories, "A")).toEqual([{ value: "A1", count: 2 }]);
    expect(subcategoriesOf(categories, "B")).toEqual([]);
    expect(subcategoriesOf(categories, "")).toEqual([]);
  });

  it("names the built-in categories, and leaves a project's own as typed", () => {
    expect(builtinCategoryKey("Progress Management")).toBe("progress");
    expect(builtinCategoryKey("Equipment In")).toBe("equipmentIn");
    expect(builtinCategoryKey("Concrete works")).toBeNull();
  });

  it("reads every module's name from a menu key", () => {
    for (const row of groupModules([{ value: "receiving.receiptphoto", count: 1 }, { value: "site_operations.safetyincident", count: 1 }])) {
      expect(MODULE_LABEL_PATH[row.key]).toBeTruthy();
    }
  });
});
