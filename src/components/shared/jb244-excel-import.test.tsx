/**
 * 导入 Excel (JB244, 客户 11-23 事项 16): 供应商资料 and 公司通用分类 › 材料分类.
 *
 * 「上传客户原有 Excel 文件」「自动识别或手动匹配对应栏目」「导入前检查重复资料，并提供
 * 预览确认」「导入后自动保存到对应管理栏目」. Pinned here: the 【导入 Excel】 button on
 * both pages, for whoever may add there; what the page sends (the file again,
 * with the column choices - nothing kept on the server before 【确认导入】); the
 * preview's 新增 / 已经有，跳过 / 有问题 and why, in four languages; 单价 only for
 * a reader who sees amounts; every word in all four message files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";
import type { ImportRow } from "@/services/excel-import.service";

let permissions: string[] = ["category.manage", "category.view"];
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: (code: string) => permissions.includes(code) }),
}));

const { ImportPreviewTable, FIELD_LABEL_KEYS } = await import("@/components/shared/excel-import-dialog");
const { importBody } = await import("@/services/excel-import.service");
const { CompanyCategories } = await import("@/components/contractor-ops/company-categories");

const LOCALES = { zh, "zh-TW": zhTW, en, ms } as const;
const SRC = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8");

function render(children: ReactNode, messages: typeof zh = zh, locale = "zh") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["company-categories", "material"], []);
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

const row = (over: Partial<ImportRow>): ImportRow => ({
  line: 2,
  status: "new",
  values: {},
  problems: [],
  notes: [],
  match: null,
  same_as_line: null,
  ...over,
});

const SUPPLIER_ROWS: ImportRow[] = [
  row({ line: 2, status: "exists", values: { name: "hong leong steel" }, match: { code: "SUP-0007", name: "Hong Leong Steel" } }),
  row({ line: 3, status: "new", values: { name: "Acme Trading", industry: "Hardware" }, company_types: ["SUPPLIER", "SUBCONTRACTOR"] }),
  row({ line: 4, status: "exists", values: { name: "ACME trading" }, same_as_line: 3 }),
  row({ line: 5, status: "problem", values: { name: "Kim" }, problems: [{ code: "missing", field: "industry" }] }),
  row({ line: 6, status: "problem", values: { name: "Bad" }, problems: [{ code: "invalid", field: "contact_email" }] }),
];

const MATERIAL_ROWS: ImportRow[] = [
  row({
    line: 2,
    status: "new",
    values: { material: "钢板", spec: "6mm", unit: "Ton", suppliers: "甲钢铁、乙公司", unit_price: "" },
    unit: { text: "Ton", code: "TONNE", new: false },
    price: "1250.50",
    notes: [
      { code: "material_added", name: "钢板" },
      { code: "supplier_not_found", name: "乙公司" },
    ],
  }),
  row({ line: 3, status: "new", values: { material: "水管", unit: "卷" }, unit: { text: "卷", code: null, new: true } }),
  row({ line: 4, status: "problem", values: { material: "铁丝" }, problems: [{ code: "missing", field: "unit" }] }),
];

describe("JB244 导入 Excel", () => {
  it("sends the file again with the column choices, the batch's choices and the units", () => {
    const file = new File(["x"], "供应商.xlsx");
    const body = importBody(file, {
      mapping: { name: 1, contact_person: null },
      choices: { company_types: ["SUBCONTRACTOR"], industry: "Steel", main_products: "" },
      units: { 卷: "__new__" },
    });
    expect((body.get("file") as File).name).toBe("供应商.xlsx");
    expect(JSON.parse(String(body.get("mapping")))).toEqual({ name: 1, contact_person: null });
    expect(JSON.parse(String(body.get("choices")))).toEqual({
      company_types: ["SUBCONTRACTOR"],
      industry: "Steel",
      main_products: "",
    });
    expect(JSON.parse(String(body.get("units")))).toEqual({ 卷: "__new__" });
    // The first preview sends no choice: the server recognises the columns.
    const first = importBody(file);
    expect(first.get("mapping")).toBeNull();
  });

  it("writes each supplier row as 新增 / 已经有，跳过 / 有问题 and why", () => {
    const html = render(<ImportPreviewTable kind="supplier" rows={SUPPLIER_ROWS} showsPrices />);
    expect(html).toContain("已经有，跳过");
    expect(html).toContain("已经有：SUP-0007 Hong Leong Steel");
    expect(html).toContain("和第 3 行一样");
    expect(html).toContain("新增");
    expect(html).toContain("没有行业");
    expect(html).toContain("联系邮箱格式不对");
    expect(html).toContain("供应商、分包商");
    for (const header of ["行", "结果", "供应商名称", "注册号", "联系人", "联系电话", "行业", "主要产品", "公司类型"]) {
      expect(html).toContain(`>${header}</th>`);
    }
  });

  it("writes the material rows: unit matched or added, supplier not on the list, the material added", () => {
    const html = render(<ImportPreviewTable kind="material" rows={MATERIAL_ROWS} showsPrices />);
    expect(html).toContain("吨（Ton）");
    expect(html).toContain("1250.50");
    expect(html).toContain("材料「钢板」也会新增");
    expect(html).toContain("供应商「乙公司」不在供应商资料里，没有关联");
    expect(html).toContain("单位「卷」会新增到单位管理");
    expect(html).toContain("没有单位");
    expect(html).toContain(">单价（RM）</th>");
    // No 金额查看: no price column at all.
    const blind = render(<ImportPreviewTable kind="material" rows={MATERIAL_ROWS} showsPrices={false} />);
    expect(blind).not.toContain("单价");
    expect(blind).not.toContain("1250.50");
  });

  it("reads in all four languages with no key path left on the screen", () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      for (const [kind, rows] of [
        ["supplier", SUPPLIER_ROWS],
        ["material", MATERIAL_ROWS],
      ] as const) {
        const html = render(<ImportPreviewTable kind={kind} rows={rows} showsPrices />, messages as typeof zh, locale);
        expect(html, `${locale} ${kind}`).not.toMatch(/jb244\.|suppliers\.field|categoryManagement\./);
      }
    }
    const en = render(<ImportPreviewTable kind="supplier" rows={SUPPLIER_ROWS} showsPrices />, LOCALES.en, "en");
    expect(en).toContain("Already there, skipped");
    expect(en).toContain("Same as row 3");
  });

  it("has every word in all four message files, the same keys, and 你 never 您", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value).flatMap(([key, inner]) => keys(inner, prefix ? `${prefix}.${key}` : key))
        : [prefix];
    const zhKeys = keys((zh as Record<string, unknown>).jb244).sort();
    expect(zhKeys.length).toBeGreaterThan(50);
    for (const messages of Object.values(LOCALES)) {
      expect(keys((messages as Record<string, unknown>).jb244).sort()).toEqual(zhKeys);
      const api = (messages as { errors: { api: Record<string, string> } }).errors.api;
      for (const code of [
        "import_excel_old_format",
        "import_excel_invalid",
        "import_excel_too_large",
        "import_excel_empty",
        "import_excel_too_many_rows",
        "import_excel_mapping_invalid",
      ]) {
        expect(api[code]).toBeTruthy();
      }
      const operations = (messages as { audit: { operation: Record<string, string> } }).audit.operation;
      expect(operations.supplier_excel_import).toBeTruthy();
      expect(operations.company_material_excel_import).toBeTruthy();
    }
    expect(JSON.stringify(zh.jb244)).not.toContain("您");
    expect(JSON.stringify(zhTW.jb244)).not.toContain("您");
    expect(zh.errors.api.import_excel_old_format).toContain(".xlsx");
  });

  it("labels each system field with the words the manual forms already use", () => {
    const get = (dotted: string) =>
      dotted.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], zh);
    for (const labels of Object.values(FIELD_LABEL_KEYS)) {
      for (const key of Object.values(labels)) expect(typeof get(key), key).toBe("string");
    }
    expect(get(FIELD_LABEL_KEYS.supplier.name)).toBe("供应商名称");
    expect(get(FIELD_LABEL_KEYS.material.material)).toBe("材料名称");
  });

  it("puts 【导入 Excel】 on 材料分类 for whoever keeps the categories", () => {
    permissions = ["category.manage", "category.view"];
    expect(render(<CompanyCategories />)).toContain("导入 Excel");
    permissions = ["category.view"];
    expect(render(<CompanyCategories />)).not.toContain("导入 Excel");
    permissions = ["category.manage", "category.view"];
  });

  it("puts 【导入 Excel】 on 供应商资料 for whoever may add a supplier", () => {
    const page = read("components/suppliers/suppliers.tsx");
    expect(page).toMatch(/can\("supplier\.create"\) && \(\s*<Button variant="outline" onClick=\{\(\) => setImporting\(true\)\}/);
    expect(page).toContain('<ExcelImportDialog kind="supplier"');
    const categories = read("components/contractor-ops/company-categories.tsx");
    expect(categories).toMatch(/canManage && active\.key === "material" && \(/);
    expect(categories).toContain('<ExcelImportDialog kind="material"');
  });

  it("accepts an old .xls so the server can say 「另存为 .xlsx」 instead of the browser hiding it", () => {
    const dialog = read("components/shared/excel-import-dialog.tsx");
    expect(dialog).toContain('accept=".xlsx,.xlsm,.xls,');
  });
});
