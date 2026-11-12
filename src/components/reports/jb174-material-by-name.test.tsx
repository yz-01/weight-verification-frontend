/**
 * JB174 (客户 11-12 事项 1): 「全部项目」 - each material name once, and every
 * project's material of that name behind it.
 *
 * The client: 「1. 第一张截图选择「全部项目」时，材料下拉菜单出现4个「钢筋」、多个
 * 「混凝土」，因为系统分别列出了不同项目的同名材料。 2. 第二张截图选择「PRJ-0002 –
 * Project 2B」时，材料名称只显示一次，这是正确的。 3. 总部选择「全部项目」时，相同
 * 材料名称只需要显示一次。 例如「钢筋」只显示一个选项，选择后自动汇总所有项目的钢筋
 * 记录及数量。 4. 不同规格、单位仍然分别统计，不能把不同单位的数量直接相加。 5. 总部
 * 选择指定项目时，只显示该项目的材料及统计数据，保持原有项目隔离。」
 *
 * The runner has no DOM: the rules are plain functions (`lib/report-menu`),
 * the dropdown is rendered to static markup, and the page's wiring is read
 * from its source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportChoiceField } from "@/components/reports/report-filter-bar";
import { SpecFilterSelect } from "@/components/shared/spec-filter";
import type { MaterialSpec } from "@/interfaces/contractor-ops";
import {
  byMaterialName,
  chosenMaterial,
  chosenMaterialLabels,
  chosenMaterialName,
  everyPage,
  materialExportSubtitle,
  materialMenuEntries,
  materialNameKey,
  materialOptions,
} from "@/lib/report-menu";
import messages from "@/messages/zh.json";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

function spec(id: string, name: string, extra: Partial<MaterialSpec> = {}): MaterialSpec {
  return {
    id,
    code: id,
    name,
    default_unit: "TONNE",
    default_unit_label: null,
    is_active: true,
    is_other: false,
    is_fixed: false,
    sort_order: 0,
    ...extra,
  };
}

/** Four projects' materials, as `get_categories` sends them with no project chosen. */
const ROWS = [
  { id: "steel-1", name: "钢筋", specs: [spec("y12-1", "Y12"), spec("other-1", "其他", { is_other: true })] },
  { id: "steel-2", name: "钢筋 ", specs: [spec("y12-2", "y12 "), spec("r10-2", "R10", { default_unit: "PIECE" })] },
  { id: "steel-3", name: "钢筋", specs: [spec("y16-3", "Y16", { is_active: false })] },
  { id: "steel-4", name: " 钢筋", specs: [spec("y16-4", "Y16")] },
  { id: "concrete-1", name: "混凝土", specs: [spec("g30-1", "G30")] },
  { id: "concrete-2", name: "混凝土", specs: [] },
  { id: "scaffold-1", name: "Scalfoding", specs: [] },
  { id: "scaffold-2", name: "scalfoding", specs: [] },
];

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("the value form (JB174)", () => {
  it("names a material as name:<名字>, and reads it back; an id is not a name", () => {
    expect(byMaterialName(" 钢筋 ")).toBe("name:钢筋");
    expect(chosenMaterialName("name:钢筋")).toBe("钢筋");
    expect(chosenMaterialName("name: 钢筋 ")).toBe("钢筋");
    expect(chosenMaterialName("steel-1")).toBeUndefined();
    expect(chosenMaterialName("group:g1")).toBeUndefined();
    expect(chosenMaterialName(undefined)).toBeUndefined();
  });

  it("compares names as the server does: case and the spaces around them ignored", () => {
    expect(materialNameKey(" Scalfoding ")).toBe(materialNameKey("scalfoding"));
    expect(materialNameKey("钢筋 ")).toBe(materialNameKey("钢筋"));
    expect(materialNameKey("钢 筋")).not.toBe(materialNameKey("钢筋"));
  });
});

describe("the 材料 dropdown (第 1、3 点)", () => {
  it("with 全部项目 lists each name once, valued by name", () => {
    expect(materialOptions(ROWS, { byName: true })).toEqual([
      { value: "name:钢筋", label: "钢筋" },
      { value: "name:混凝土", label: "混凝土" },
      { value: "name:Scalfoding", label: "Scalfoding" },
    ]);
  });

  it("with one project chosen lists that project's rows by id, as before (第 2、5 点)", () => {
    const project = [ROWS[0], ROWS[4], { id: "y12-1", name: "Y12", parent: "steel-1" }];
    expect(materialOptions(project)).toEqual([
      { value: "steel-1", label: "钢筋" },
      { value: "concrete-1", label: "混凝土" },
    ]);
    // Not deduplicated when a project is chosen: what the project has.
    expect(materialOptions(ROWS).map((option) => option.value)).toHaveLength(ROWS.length);
  });

  it("shows a name the list does not hold as the name, never as name:…", () => {
    const html = render(
      <ReportChoiceField
        label="材料"
        value="name:钢筋"
        options={[{ value: "steel-1", label: "钢筋" }]}
        onChange={() => {}}
        valueLabel="钢筋"
      />,
    );
    expect(html).toContain("钢筋");
    expect(html).not.toContain("name:");
  });
});

describe("the 规格 dropdown (第 3、4 点)", () => {
  it("offers every project's specifications of the material, a name once", () => {
    const material = chosenMaterial(ROWS, "name:钢筋");
    expect(material?.name).toBe("钢筋");
    expect(material?.specs?.map((row) => [row.id, row.name, row.is_active])).toEqual([
      // 「Y12」 and 「y12 」: one, as first spelled.
      ["name:Y12", "Y12", true],
      ["name:R10", "R10", true],
      // Switched off in one project, on in another: offered.
      ["name:Y16", "Y16", true],
    ]);
    // 「其他」 is not one specification.
    expect(material?.specs?.some((row) => row.name === "其他")).toBe(false);
  });

  it("is the row itself for an id, and nothing for a name nobody has", () => {
    expect(chosenMaterial(ROWS, "steel-2")).toBe(ROWS[1]);
    expect(chosenMaterial(ROWS, "name:木材")).toBeUndefined();
    expect(chosenMaterial(ROWS, "name:")).toBeUndefined();
    expect(chosenMaterial(ROWS, undefined)).toBeUndefined();
  });

  it("renders the union in the 规格 dropdown, valued by name", () => {
    const html = render(
      <SpecFilterSelect material={chosenMaterial(ROWS, "name:钢筋")} value={undefined} onChange={() => {}} />,
    );
    expect(html).not.toContain('disabled=""');
  });
});

describe("what the report says it is narrowed to (第 7 点: 显示的是材料的名字)", () => {
  it("names a material and a specification chosen by name", () => {
    expect(
      chosenMaterialLabels(ROWS, { category: "name:钢筋", spec: "name:Y12" }),
    ).toEqual({ material: "钢筋", spec: "Y12" });
    // Before the list arrives too: the name is in the value.
    expect(chosenMaterialLabels([], { category: "name:钢筋", spec: "name:Y12" })).toEqual({
      material: "钢筋",
      spec: "Y12",
    });
  });

  it("names a material and a specification chosen by id", () => {
    expect(chosenMaterialLabels(ROWS, { category: "steel-2", spec: "r10-2" })).toEqual({
      material: "钢筋 ",
      spec: "R10",
    });
    // A specification that is switched off is left for 「已停用规格」.
    expect(chosenMaterialLabels(ROWS, { category: "steel-3", spec: "y16-3" }).spec).toBeUndefined();
  });

  it("puts the name in the export's subtitle, never name:…", () => {
    const labels = chosenMaterialLabels(ROWS, { category: "name:钢筋", spec: "name:Y12" });
    const subtitle = materialExportSubtitle((key) => key, {
      level: [labels.material, labels.spec, "全部供应商"].join(" › "),
    });
    expect(subtitle).toBe("钢筋 › Y12 › 全部供应商");
  });
});

describe("【选择报表】's material level (第 7 点)", () => {
  const specsOf = (id: string) =>
    ROWS.find((row) => row.id === id)?.specs?.map((row) => ({ id: row.id, name: row.name })) ?? [];

  it("with 全部项目 lists each name once, every project's specifications under it", () => {
    const entries = materialMenuEntries(ROWS, specsOf, { byName: true });
    expect(entries.map((entry) => [entry.value, entry.name])).toEqual([
      ["name:钢筋", "钢筋"],
      ["name:混凝土", "混凝土"],
      ["name:Scalfoding", "Scalfoding"],
    ]);
    expect(entries[0].specs).toEqual([
      { id: "name:Y12", name: "Y12" },
      { id: "name:其他", name: "其他" },
      { id: "name:R10", name: "R10" },
      { id: "name:Y16", name: "Y16" },
    ]);
  });

  it("with one project chosen lists its rows by id, as before", () => {
    const entries = materialMenuEntries(ROWS.slice(0, 1), specsOf);
    expect(entries).toEqual([
      {
        value: "steel-1",
        name: "钢筋",
        specs: [
          { id: "y12-1", name: "Y12" },
          { id: "other-1", name: "其他" },
        ],
      },
    ]);
  });
});

describe("the report page (MaterialReport)", () => {
  const source = read("src/components/reports/material-report.tsx");

  it("lists by name only when no project is chosen", () => {
    expect(source).toContain("const byName = !filters.project;");
    expect(source).toContain("options={materialOptions(materialRows, { byName })}");
  });

  it("feeds the 规格 dropdown the chosen material - every project's, by name", () => {
    expect(source).toContain("const material = chosenMaterial(materialRows, filters.category);");
    expect(source).toMatch(/<SpecFilterSelect\s+material=\{material\}/);
  });

  it("names the choice in 【选择报表】's line, the dropdown and the export by its name", () => {
    expect(source).toContain("chosenMaterialName(filters.category) ||");
    expect(source).toContain("chosenMaterialName(filters.spec_category) ||");
    expect(source).toContain("valueLabel={materialName}");
  });

  it("never sends a 规格 left behind without its material (another project chosen)", () => {
    expect(source).toContain(
      "spec_category: list.filters.category ? list.filters.spec_category : undefined,",
    );
  });
});

describe("JB174: 全部项目 reads every page of the material list", () => {
  const pageOf = (page: number, names: string[]) => ({
    count: 250,
    page,
    page_size: 100,
    total_pages: 3,
    results: names.map((name, index) => ({ id: `${page}-${index}`, name })),
  });

  it("reads the pages after the first, so a material beyond 100 rows is still offered once", async () => {
    const asked: number[] = [];
    const all = await everyPage(async (page) => {
      asked.push(page);
      return pageOf(page, page === 3 ? ["钢筋", "BRC"] : ["钢筋", "混凝土"]);
    });

    expect(asked).toEqual([1, 2, 3]);
    expect(materialOptions(all.results, { byName: true }).map((option) => option.label)).toEqual([
      "钢筋",
      "混凝土",
      "BRC",
    ]);
  });

  it("the material reports' list is read that way", () => {
    const source = read("src/components/reports/report-selector.tsx");
    expect(source).toMatch(/everyPage\(\(page\) =>\s*getProjectCategories\(\{ kind: "MATERIAL", page_size: 100, page, project \}\)/);
  });
});
