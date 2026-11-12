/**
 * 公司通用分类 › 一个材料一页填完、一起保存 (JB181, 客户 11-12 追加 5), and what
 * 【加到现有项目】 and the page say (Lucas 11-12 「跟分类一样带入」「怕客户不会用」).
 *
 * 「新增或编辑时，所有资料在同一个页面一次性填写完成，包括多个规格、对应供应商及各自
 * 单价，最后统一保存，不要分开多个窗口操作」「项目已有『项目专属分类』，项目端就不需
 * 要再显示『公司通用分类』，避免两套分类同时出现，造成混乱」「这次只需要完善总部『公司
 * 通用分类』，项目专属分类原有功能保持不变」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { CompanyCategory, MaterialPriceSummary } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: () => true }),
}));

const form = await import("@/components/contractor-ops/company-material-form");
const { addedWords } = await import("@/components/contractor-ops/company-categories");
const { CompanyMaterialForm, formOf, payloadOf, rowProblems, changedPrices, rowOfError } = form;

const price = (unit_price: string | null): MaterialPriceSummary => ({
  current: unit_price ? { id: `p-${unit_price}`, unit_price, unit: "TONNE", effective_from: "2026-11-01" } : null,
  upcoming: [],
});

const REBAR: CompanyCategory = {
  id: "m-1",
  kind: "MATERIAL",
  code: "MAT-REBAR",
  name: "钢筋",
  description: "Rebar",
  sort_order: 0,
  is_active: true,
  is_fixed: false,
  default_unit: "TONNE",
  form_style: "",
  parent: null,
  suppliers: [{ id: "s1", name: "甲钢铁" }],
  price: price("2680.00"),
  specs: [
    {
      id: "y10", kind: "MATERIAL", code: "SPC-001", name: "Y10", description: "", sort_order: 0, is_active: true,
      is_fixed: false, default_unit: "TONNE", form_style: "", parent: "m-1", suppliers: [], price: price("2700.00"),
    },
    {
      id: "y12", kind: "MATERIAL", code: "SPC-002", name: "Y12", description: "", sort_order: 1, is_active: true,
      is_fixed: false, default_unit: "TONNE", form_style: "", parent: "m-1", suppliers: [], price: price(null),
    },
  ],
};

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const FORM = read("src/components/contractor-ops/company-material-form.tsx");
const COMPANY = read("src/components/contractor-ops/company-categories.tsx");
const MANAGEMENT = read("src/components/contractor-ops/category-management.tsx");
const words = zh.categoryManagement.company;

function render(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-units", "all"], []);
  client.setQueryData(["material-units", "active"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{children}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("JB181-4 one page, one 【保存】 (追加 5 第 3 点)", () => {
  it("is a page in place of the list, not a window: 返回列表 on top, 整个材料 first, one 保存", () => {
    const html = render(<CompanyMaterialForm row={REBAR} onBack={() => {}} onSaved={() => {}} />);
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain(words.form.back);
    expect(html).toContain(words.form.table);
    expect(html.indexOf(words.form.wholeMaterial)).toBeLessThan(html.indexOf('value="Y10"'));
    expect(html).toContain('value="Y12"');
    expect(html).toContain(words.form.addRow);
    expect(html.match(new RegExp(`</svg>${words.form.save}<`, "g"))).toHaveLength(1);
    // Every row: 规格名称｜单位｜供应商｜单价（RM）｜启用｜操作.
    const heads = [...html.matchAll(/data-slot="table-head"[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(heads).toEqual(["规格名称", "单位", "供应商", "单价（RM）", "启用", "操作"]);
    // The prices as they are now, in their boxes; no date asked while none changed.
    expect(html).toContain('value="2680.00"');
    expect(html).toContain('value="2700.00"');
    expect(html).not.toContain("从哪一天开始用");
    // Removing the material stays possible here, behind its switch.
    expect(html).toContain(words.remove);
  });

  it("opens with a blank row waiting after 【＋ 规格】 (做法 4)", () => {
    const state = formOf(REBAR, { addSpec: true });
    expect(state.specs.map((spec) => spec.name)).toEqual(["Y10", "Y12", ""]);
    expect(state.specs[2].unit).toBe("TONNE");
    expect(formOf(null).specs).toEqual([]);
  });

  it("sends everything in one request: specifications, suppliers, a price only where it changed", () => {
    const state = formOf(REBAR, { today: "2026-11-12" });
    state.specs[0] = { ...state.specs[0], name: "Y10 ", suppliers: [{ id: "s2", name: "乙五金" }] };
    state.specs[1] = { ...state.specs[1], price: "2,750.5" };
    state.removed = ["old-spec"];
    state.specs.push({ ...form.blankSpec("TONNE"), name: "Y16", price: "2800" });
    const payload = payloadOf(state, true);
    expect(payload).toEqual({
      id: "m-1",
      name: "钢筋",
      description: "Rebar",
      default_unit: "TONNE",
      is_active: true,
      suppliers: ["s1"],
      unit_price: "",
      specs: [
        { id: "y10", name: "Y10", default_unit: "TONNE", is_active: true, suppliers: ["s2"], unit_price: "" },
        { id: "y12", name: "Y12", default_unit: "TONNE", is_active: true, suppliers: [], unit_price: "2750.5" },
        { name: "Y16", default_unit: "TONNE", is_active: true, suppliers: [], unit_price: "2800" },
      ],
      removed_specs: ["old-spec"],
      effective_from: "2026-11-12",
    });
    expect(changedPrices(state).map((row) => row.name)).toEqual(["Y12", "Y16"]);
    // The same price typed again is no change: no date, no PIN.
    const same = formOf(REBAR, { today: "2026-11-12" });
    same.whole = { ...same.whole, price: "2680" };
    expect(changedPrices(same)).toEqual([]);
    expect(payloadOf(same, true).effective_from).toBeUndefined();
    // Without 金额查看 no price is ever sent.
    expect(payloadOf(state, false).specs.every((spec) => spec.unit_price === "")).toBe(true);
    expect(FORM).toMatch(/mutationFn: \(\) => saveCompanyMaterial\(payloadOf\(form, seesAmounts\)\)/);
  });

  it("says what is wrong on the row before anything is sent; a set price is changed, never cleared", () => {
    const state = formOf(REBAR);
    state.specs.push({ ...form.blankSpec("TONNE") });
    state.specs.push({ ...form.blankSpec("TONNE"), name: "y10" });
    state.specs[0] = { ...state.specs[0], price: "" };
    state.specs[1] = { ...state.specs[1], price: "1.234" };
    const problems = rowProblems(state, true);
    expect(Object.values(problems).sort()).toEqual(["priceCleared", "priceRule", "specNameMissing", "specNameTwice"]);
    expect(problems.y10).toBe("priceCleared");
    expect(problems.y12).toBe("priceRule");
    expect(rowOfError({ "specs.1.name": "x" }, state)).toBe("y12");
    expect(rowOfError({ unit_price: "x" }, state)).toBe("whole");
    expect(words.form.priceCleared).toBe("设过的单价可以改，不能清空。");
  });

  it("asks the day once, for every price of the save, only when one changed (做法 7)", () => {
    expect(words.form.pricesChanged).toBe("这次填了 / 改了 {count} 个单价。从哪一天开始用？");
    expect(FORM).toContain("{changed.length > 0 && (");
    // The PIN: the server asks once per save that sets a price; the shared dialog opens by itself.
    expect(FORM).toContain("if (isSignOffCancelled(reason)) return;");
  });

  it("unfolds 价格历史 under its row, not in a window", () => {
    expect(FORM).toMatch(/historyOf === line\.key && line\.id \? \(\s*<TableRow key=\{`\$\{line\.key\}-history`\}>/);
    expect(FORM).toContain('queryKey: ["company-price-history", category]');
    expect(FORM).not.toMatch(/<Dialog/);
  });

  it("picks suppliers with the project material dialog's picker, from the company's list", () => {
    expect(FORM).toContain("<MultiPickList");
    expect(FORM).toContain("getSuppliers({ page_size: 100, sort_by: \"name\"");
  });

  it("goes back to the list with the material unfolded after 【保存】 (做法 4)", () => {
    expect(COMPANY).toMatch(/if \(id\) setOpen\(\(current\) => new Set\(current\)\.add\(id\)\);\s*setMaterialPage\(null\);/);
    expect(COMPANY).toContain('active.key === "material" ? setMaterialPage({ row: null }) : setEditing({ line: null })');
  });
});

describe("JB181-8, JB181-9 【加到现有项目】 says what it does, and counts what it did", () => {
  const t = (key: string, values?: Record<string, number>) => {
    const template = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], zh.categoryManagement) as string;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
  };

  it("explains in two numbered lines and two sentences", () => {
    expect(words.addStep1).toBe("1. 各项目还没有的材料和规格，加进去。");
    expect(words.addStep2).toBe("2. 各项目还没有单价的材料和规格，补上这里的单价。");
    expect(words.addKeeps).toBe("已经有单价的不会改。");
    expect(words.addFills).toBe("补上单价以后，那个项目从生效日期起、还没有单价的进场和领用记录，会自动算上这个单价。");
    for (const key of ["addStep1", "addStep2", "addKeeps", "addFills"]) expect(COMPANY).toContain(`t("company.${key}")`);
  });

  it("counts projects, categories and prices; and says when nothing changed", () => {
    expect(addedWords({ project_count: 2, added_count: 3, price_count: 4 }, t)).toBe(
      "完成。2 个项目加了 3 个分类、补了 4 个单价。",
    );
    expect(addedWords({ project_count: 1, added_count: 0, price_count: 2 }, t)).toBe(
      "完成。1 个项目加了 0 个分类、补了 2 个单价。",
    );
    expect(addedWords({ project_count: 0, added_count: 0, price_count: 0 }, t)).toBe("所有项目都已经有了，没有改动。");
  });

  it("says on the page that prices come in like the categories (做法 14)", () => {
    expect(words.intro).toBe(
      "公司通用分类不用选项目，项目还没开工就可以先建好。建立新项目时，系统自动带入这里启用中的全部分类和单价。在这里修改不会改动已有项目；已有的项目要按【加到现有项目】才会补上。",
    );
  });
});

describe("JB181-6 the project side has no 「公司通用分类」 (追加 5 第 6 点)", () => {
  it("shows the tabs only to head office on 「全部项目」; one project - its own categories, no tabs", () => {
    expect(MANAGEMENT).toContain('const headOffice = can("project.view_all");');
    expect(MANAGEMENT).toContain("const showsCompany = headOffice && !(topBar.active && topBar.projectId);");
    expect(MANAGEMENT).toContain('const tab = showsCompany ? chosenTab : "project";');
    expect(MANAGEMENT).toMatch(/\{showsCompany && \(\s*<div role="tablist"/);
    expect(MANAGEMENT).toMatch(/\{headOffice && !showsCompany && \(\s*<p className="text-xs text-muted-foreground">\{t\("tabs\.companyWhere"\)\}<\/p>/);
    expect(zh.categoryManagement.tabs.projectIntro).toBe("这里是这个项目自己的分类，只影响这个项目。");
    expect(zh.categoryManagement.tabs.companyWhere).toBe("公司通用分类：请在右上角选「全部项目」。");
  });
});

describe("the words are in all four languages", () => {
  it("has every new form and 加到现有项目 key in zh, zh-TW, en and ms", () => {
    const formKeys = Object.keys(zh.categoryManagement.company.form).sort();
    for (const messages of [zh, zhTW, en, ms]) {
      const company = messages.categoryManagement.company as unknown as Record<string, unknown>;
      expect(Object.keys(company.form as object).sort()).toEqual(formKeys);
      for (const key of ["addStep1", "addStep2", "addKeeps", "addFills", "addedPrices", "addedFilled", "addedSome", "addedNone"]) {
        expect(company[key], key).toBeTruthy();
      }
      expect(company.addedSome).toContain("{prices}");
      expect(messages.categoryManagement.tabs.companyWhere).toBeTruthy();
    }
  });
});
