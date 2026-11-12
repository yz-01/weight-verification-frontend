/**
 * 公司通用分类 › 材料分类（含规格） - the list (JB181, 客户 11-12 追加 4、追加 5).
 *
 * 「分类列表采用材料名称分组、规格展开／收起的方式，避免每个规格占一行，造成页面过长、
 * 不方便操作」「平时只显示材料名称及规格数量，点击展开才显示全部规格」「公司通用分类只
 * 需要材料基础资料管理，不需要项目累计数量、金额等统计功能」. Lucas 11-12 (「只是怕
 * 可能客户不会用或者不明白」): the fold is 【展开】 / 【收起】 in words, and the
 * suppliers and prices are written out.
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

let permissions: string[] = ["category.manage", "category.view"];
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: (code: string) => permissions.includes(code) }),
}));

const { CompanyCategories, linesOf } = await import("@/components/contractor-ops/company-categories");
const { CompanyMaterialList, visibleRows, toggled, priceWords, suppliersWords, money } = await import(
  "@/components/contractor-ops/company-material-list"
);

const price = (unit_price: string | null, upcoming: string[] = []): MaterialPriceSummary => ({
  current: unit_price ? { id: `p-${unit_price}`, unit_price, unit: "TONNE", effective_from: "2026-11-01" } : null,
  upcoming: upcoming.map((value) => ({ id: `u-${value}`, unit_price: value, unit: "TONNE", effective_from: "2026-12-01" })),
});

const row = (over: Partial<CompanyCategory>): CompanyCategory => ({
  id: over.name ?? "x",
  kind: "MATERIAL",
  code: "MAT-X",
  name: "x",
  description: "",
  sort_order: 0,
  is_active: true,
  is_fixed: false,
  default_unit: "TONNE",
  form_style: "",
  parent: null,
  suppliers: [],
  price: price(null),
  ...over,
});

const REBAR_SPECS = ["Y10", "Y12", "Y16", "Y20", "Y25", "Y32", "Y40mm"];
const MATERIALS = [
  row({
    name: "钢筋",
    description: "Rebar",
    suppliers: [{ id: "s1", name: "甲钢铁" }, { id: "s2", name: "乙五金" }, { id: "s3", name: "丙建材" }],
    price: price("2680.00"),
    specs: REBAR_SPECS.map((name) =>
      row({
        name,
        parent: "钢筋",
        price: name === "Y10" ? price("2700.00") : price(null),
        suppliers: name === "Y10" ? [{ id: "s1", name: "甲钢铁" }] : [],
      }),
    ),
  }),
  row({
    name: "混凝土",
    description: "Concrete",
    default_unit: "M3",
    specs: [row({ name: "G15", parent: "混凝土", default_unit: "M3" })],
  }),
  row({ name: "钢管", specs: [] }),
];

function providers(children: ReactNode, messages: typeof zh = zh, locale = "zh") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["company-categories", "material"], linesOf(MATERIALS));
  client.setQueryData(["material-units", "all"], []);
  client.setQueryData(["material-units", "active"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{children}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const list = (open: string[] = [], over: Partial<Parameters<typeof CompanyMaterialList>[0]> = {}) =>
  providers(
    <CompanyMaterialList
      materials={MATERIALS}
      open={new Set(open)}
      onToggle={() => {}}
      canManage
      showsPrices
      onEdit={() => {}}
      onAddSpec={() => {}}
      {...over}
    />,
  );

const words = zh.categoryManagement.company;
const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/company-material-list.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("JB181-1 一个材料一行，写规格数量；【展开】/【收起】", () => {
  it("shows one row per material with its count, and no specification, when the page opens", () => {
    permissions = ["category.manage", "category.view"];
    const html = providers(<CompanyCategories />);
    for (const name of ["钢筋", "Rebar", "混凝土", "Concrete", "钢管"]) expect(html).toContain(name);
    expect(html).toContain("7 个规格");
    expect(html).toContain("1 个规格");
    expect(html).toContain(words.noSpecs);
    for (const name of [...REBAR_SPECS, "G15"]) expect(html).not.toContain(`>${name}<`);
    // The header row and three materials: not eleven rows.
    expect(html.match(/data-slot="table-row"/g)).toHaveLength(4);
    expect(html).toContain(words.foldHelp);
    expect(words.foldHelp).toBe("每个材料一行。按【展开】看它的全部规格，再按一次收起。");
  });

  it("has the labelled 【展开】 button, keyboard-reachable with aria-expanded, and 【收起】 when open", () => {
    const closed = list();
    expect(closed.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(closed.match(new RegExp(`>${words.expand}<`, "g"))).toHaveLength(2);
    const opened = list(["钢筋"]);
    expect(opened).toContain('aria-expanded="true"');
    expect(opened).toContain(`>${words.collapse}<`);
    for (const name of REBAR_SPECS) expect(opened).toContain(`>${name}<`);
    expect(opened).not.toContain(">G15<");
    expect(words.expand).toBe("展开");
    expect(words.collapse).toBe("收起");
  });

  it("opens and closes: the rows shown, and a click on the row itself does the same", () => {
    const shown = (open: Set<string>) => visibleRows(MATERIALS, open).map(({ row: line }) => line.name);
    expect(shown(new Set())).toEqual(["钢筋", "混凝土", "钢管"]);
    const opened = toggled(new Set(), "钢筋");
    expect(shown(opened)).toEqual(["钢筋", ...REBAR_SPECS, "混凝土", "钢管"]);
    expect(shown(toggled(opened, "钢筋"))).toEqual(["钢筋", "混凝土", "钢管"]);
    expect(SOURCE).toMatch(/if \(onRowItself\(event\.target\)\) onToggle\(row\.id\);/);
    expect(SOURCE).toContain(`target.closest("button, a, input, [role='switch']")`);
  });

  it("lists an unfolded specification only to look at: no button on its row (做法 2)", () => {
    const opened = list(["钢筋"]);
    // 编辑 and ＋ 规格 once per material, none per specification.
    expect(opened.match(new RegExp(`</svg>${zh.categoryManagement.edit}<`, "g"))).toHaveLength(3);
    expect(opened.match(new RegExp(`</svg>${words.addSpec}<`, "g"))).toHaveLength(3);
  });
});

describe("JB181-5 no record counts, quantities or amounts (追加 5 第 5 点)", () => {
  it("has 材料名称｜单位｜规格｜供应商｜单价｜状态｜操作 and nothing else", () => {
    const html = list();
    const heads = [...html.matchAll(/data-slot="table-head"[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(heads).toEqual(["材料名称", "单位", "规格", "供应商", "单价", "状态", "操作"]);
    const columns = zh.categoryManagement.column;
    for (const word of [columns.records, columns.archived, columns.spend, columns.quantity, columns.tonnes]) {
      expect(html).not.toContain(word);
    }
  });

  it("drops 单价 for a reader without 金额查看, and 操作 for one who only looks", () => {
    const heads = (html: string) => [...html.matchAll(/data-slot="table-head"[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(heads(list([], { showsPrices: false }))).not.toContain("单价");
    expect(list(["钢筋"], { showsPrices: false })).not.toContain("RM ");
    expect(heads(list([], { canManage: false }))).not.toContain("操作");
  });
});

describe("JB181-9 the suppliers and the price written out (做法 3)", () => {
  it("writes the suppliers: 「、」, 「甲、乙 等 N 家」, 「没有选」", () => {
    expect(suppliersWords([{ name: "甲钢铁" }, { name: "乙五金" }])).toEqual({
      key: "suppliersList",
      values: { names: "甲钢铁、乙五金" },
    });
    expect(suppliersWords([{ name: "甲" }, { name: "乙" }, { name: "丙" }])).toEqual({
      key: "suppliersMore",
      values: { names: "甲、乙", count: 3 },
    });
    expect(suppliersWords([])).toEqual({ key: "suppliersNone" });
    const html = list(["钢筋"]);
    expect(html).toContain("甲钢铁、乙五金 等 3 家");
    expect(html).toContain(`>${words.suppliersNone}<`);
  });

  it("writes the three price states: its own, the material's with the number, none", () => {
    expect(priceWords(price("2680.00"), null, false)).toEqual({ key: "pricePer", price: "2,680.00", unit: "TONNE" });
    expect(priceWords(price(null), price("2680.00"), true)).toEqual({
      key: "priceUsesMaterial",
      price: "2,680.00",
      unit: "TONNE",
    });
    expect(priceWords(price(null), price(null), true)).toEqual({ key: "priceNone" });
    expect(priceWords(price(null), price("2680.00"), false)).toEqual({ key: "priceNone" });
    const html = list(["钢筋", "混凝土"]);
    expect(html).toContain("RM 2,680.00 / 吨（Ton）");
    expect(html).toContain("RM 2,700.00 / 吨（Ton）");
    expect(html).toContain("用材料的单价（RM 2,680.00 / 吨（Ton））");
    expect(html).toContain(words.priceNone);
    expect(words.pricePer).toBe("RM {price} / {unit}");
    expect(words.priceUsesMaterial).toBe("用材料的单价（RM {price} / {unit}）");
    expect(words.priceNone).toBe("没有设单价");
    expect(money("1234567.5")).toBe("1,234,567.50");
  });
});

describe("the words are in all four languages", () => {
  it("has every new list key in zh, zh-TW, en and ms", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const company = messages.categoryManagement.company as unknown as Record<string, unknown>;
      for (const key of [
        "foldHelp", "specCount", "noSpecs", "expand", "collapse", "suppliersNone", "suppliersMore",
        "suppliersJoiner", "pricePer", "priceUsesMaterial", "priceNone",
      ]) {
        expect(company[key], key).toBeTruthy();
      }
      expect(Object.keys(company.col as object).sort()).toEqual(["material", "price", "specs", "suppliers"]);
    }
  });

  it("counts in English with the plural", () => {
    const html = providers(<CompanyCategories />, en as unknown as typeof zh, "en");
    expect(html).toContain("7 specifications");
    expect(html).toContain("1 specification<");
  });
});
