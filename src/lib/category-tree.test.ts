/** I11 (ID3): 分类组 → 分类 → 子分类, ordered the same way everywhere. */
import { describe, expect, it } from "vitest";

import { categoryLabel, categoryTree, showsGroups, type TreeCategory } from "@/lib/category-tree";

const row = (over: Partial<TreeCategory> & { id: string; name: string }): TreeCategory => ({
  parent: null,
  group: "sys",
  group_name: "",
  group_is_system: true,
  group_sort_order: 0,
  sort_order: 0,
  ...over,
});

describe("categoryTree", () => {
  it("puts each sub-category under its category, in order", () => {
    const groups = categoryTree([
      row({ id: "b", name: "钢管", sort_order: 2 }),
      row({ id: "a1", name: "Y12", parent: "a", parent_name: "钢筋", sort_order: 1 }),
      row({ id: "a", name: "钢筋", sort_order: 1 }),
      row({ id: "a0", name: "Y10", parent: "a", parent_name: "钢筋", sort_order: 0 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map(({ row: item, depth }) => `${depth}:${item.name}`)).toEqual([
      "0:钢筋",
      "1:Y10",
      "1:Y12",
      "0:钢管",
    ]);
  });

  it("lists the system group first, then the project's own groups by order", () => {
    const groups = categoryTree([
      row({ id: "x", name: "电缆", group: "g2", group_name: "机电材料", group_is_system: false, group_sort_order: 7 }),
      row({ id: "y", name: "钢筋" }),
      row({ id: "z", name: "瓷砖", group: "g3", group_name: "装修", group_is_system: false, group_sort_order: 6 }),
    ]);
    expect(groups.map((group) => group.name || "(system)")).toEqual(["(system)", "装修", "机电材料"]);
    expect(showsGroups(groups)).toBe(true);
  });

  it("shows no group heading with only one group", () => {
    expect(showsGroups(categoryTree([row({ id: "a", name: "钢筋" })]))).toBe(false);
  });

  it("keeps a sub-category whose parent is not listed, named with it", () => {
    const groups = categoryTree([row({ id: "c", name: "夜间", parent: "gone", parent_name: "噪音" })]);
    expect(groups[0].entries).toEqual([{ row: expect.objectContaining({ id: "c" }), depth: 0 }]);
    expect(categoryLabel(groups[0].entries[0].row)).toBe("噪音 › 夜间");
  });
});
