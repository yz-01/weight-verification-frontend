/**
 * 「公司通用分类」 and 「项目专属分类」 (JB103, 客户 11-05 事项 8), and the
 * duplicate 「申请类型」 of 图 9 (JB102, 事项 7).
 *
 * 「分类管理不应该强制先选择项目才能新增分类」「分类管理分为『公司通用分类』及
 * 『项目专属分类』。公司通用分类不需要选择项目，可以直接新增及管理」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { CompanyCategory } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

let permissions: string[] = ["category.manage", "category.view"];
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: (code: string) => permissions.includes(code) }),
}));

const { CompanyCategories, COMPANY_MODULES, linesOf, allWasteCategories } = await import(
  "@/components/contractor-ops/company-categories"
);

const row = (over: Partial<CompanyCategory>): CompanyCategory => ({
  id: over.name ?? "x",
  kind: "MATERIAL",
  code: "MAT-REBAR",
  name: "钢筋",
  description: "",
  sort_order: 0,
  is_active: true,
  is_fixed: false,
  default_unit: "",
  form_style: "",
  parent: null,
  ...over,
});

const MATERIALS = [
  row({
    name: "钢筋",
    description: "Rebar",
    default_unit: "TONNE",
    specs: [row({ name: "Y10", code: "SPC-001", parent: "钢筋", default_unit: "TONNE" })],
  }),
  row({ name: "混凝土", code: "MAT-CONCRETE", description: "Concrete" }),
  row({ name: "砂石", code: "MAT-AGGREGATE", description: "Sand & Aggregate" }),
];

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["company-categories", "material"], linesOf(MATERIALS));
  client.setQueryData(["material-units", "all"], []);
  client.setQueryData(["material-units", "active"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <CompanyCategories />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const MANAGEMENT = read("src/components/contractor-ops/category-management.tsx");
const COMPANY = read("src/components/contractor-ops/company-categories.tsx");

describe("公司通用分类 needs no project (JB103 第 1、2 点)", () => {
  it("lists the company's materials with their specifications, and adds without a project", () => {
    permissions = ["category.manage", "category.view"];
    const html = render();
    for (const name of ["钢筋", "混凝土", "砂石", "Rebar", "Sand &amp; Aggregate"]) {
      expect(html).toContain(name);
    }
    // JB181 (客户 11-12 追加 4): a material's specifications are folded under
    // it and counted - 「平时只显示材料名称及规格数量」; Y10 shows once 钢筋 is unfolded.
    expect(html).toContain("1 个规格");
    expect(html).not.toContain(">Y10<");
    expect(html).toContain(zh.categoryManagement.company.create);
    expect(html).toContain(zh.categoryManagement.company.addToProjects);
    // No project anywhere: no picker, no 「先选项目」.
    expect(html).not.toContain(zh.categoryManagement.chooseProject);
    expect(html).not.toContain(zh.categoryManagement.groups.chooseProject);
    expect(COMPANY).not.toMatch(/ProjectPicker|project=\{/);
  });

  it("offers adding only to whoever keeps categories", () => {
    permissions = ["category.view"];
    const html = render();
    expect(html).toContain("钢筋");
    expect(html).not.toContain(zh.categoryManagement.company.create);
    // The button, not the words: since JB181 the page's own sentence names
    // 【加到现有项目】 (「已有的项目要按【加到现有项目】才会补上」).
    expect(html).not.toContain(`</svg>${zh.categoryManagement.company.addToProjects}</button>`);
    permissions = ["category.manage", "category.view"];
  });

  it("has every list the client named: material, request types, EHS, claims, equipment, recyclable", () => {
    expect(COMPANY_MODULES.map((entry) => entry.key)).toEqual([
      "material",
      "requestType",
      "ehs",
      "claim",
      "equipmentName",
      "recycle",
    ]);
  });

  it("never asks for a code (事项 7 「分类编号全部自动生成」)", () => {
    expect(COMPANY).not.toMatch(/code:/);
    const waste = read("src/components/contractor-ops/waste-category-dialog.tsx");
    expect(waste).not.toMatch(/setCode|code: code/);
    expect(waste).toMatch(/\{category && \(\s*<FieldWrapper label=\{w\("category\.code"\)\}>/);
  });
});

describe("the page has two tabs (JB103 第 2 点)", () => {
  it("shows 公司通用分类 first and 项目专属分类 beside it", () => {
    expect(MANAGEMENT).toMatch(/\(\["company", "project"\] as const\)\.map/);
    expect(MANAGEMENT).toMatch(/\{tab === "company" \? \(\s*<CompanyCategories \/>/);
    // An address about one project still opens that project's tab.
    expect(MANAGEMENT).toMatch(
      /searchParams\.get\("project"\) \|\| searchParams\.get\("module"\) \|\| searchParams\.get\("create"\)\s*\? "project"\s*: "company"/,
    );
  });
});

describe("one 「申请类型」 (JB102, 图 9)", () => {
  it("names a nameless group by its own module, never borrowing 「申请类型」", () => {
    expect(MANAGEMENT).toMatch(
      /module === "REQUEST_TYPE" \? t\("requestTypes"\) : t\(`module\.\$\{GROUP_MODULE\[module\]\}`\)/,
    );
    expect(MANAGEMENT).not.toMatch(/owner \? t\(`module\.\$\{owner\.key\}`\) : t\("requestTypes"\)/);
    expect(MANAGEMENT).toMatch(/\.filter\(\(row\) => row\.module !== "EQUIPMENT"\)/);
  });
});

describe("the words", () => {
  it("are in all four languages", () => {
    for (const messages of [en, zh, zhTW, ms]) {
      const words = messages.categoryManagement;
      expect(words.tabs.company).toBeTruthy();
      expect(words.tabs.project).toBeTruthy();
      expect(words.company.addToProjects).toBeTruthy();
      expect(Object.keys(words.company.module).sort()).toEqual(
        ["claim", "ehs", "equipmentName", "material", "recycle", "requestType"],
      );
      expect(messages.errors.api.category_group_single).toBeTruthy();
      expect(messages.errors.api.company_category_fixed).toBeTruthy();
    }
    expect(zh.categoryManagement.tabs.company).toBe("公司通用分类");
    expect(zh.categoryManagement.tabs.project).toBe("项目专属分类");
    expect(zh.categoryManagement.company.addToProjects).toBe("加到现有项目");
  });
});

describe("the recyclable list is read whole (review F4)", () => {
  it("pages through at the server's 100, never asking for more", async () => {
    const asked: number[] = [];
    const fetchPage = async ({ page = 1, page_size = 0 }: { page?: number; page_size?: number }) => {
      asked.push(page_size);
      const total = 230;
      const start = (page - 1) * page_size;
      const results = Array.from({ length: Math.max(0, Math.min(page_size, total - start)) }, (_, index) => ({
        id: `w-${start + index}`,
      }));
      return { count: total, page, page_size, total_pages: Math.ceil(total / page_size), results };
    };
    const rows = await allWasteCategories(fetchPage as never);
    expect(rows).toHaveLength(230);
    expect(asked).toEqual([100, 100, 100]);
  });
});
