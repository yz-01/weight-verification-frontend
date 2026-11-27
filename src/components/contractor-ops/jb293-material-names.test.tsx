/**
 * 材料分类、材料名称 中英文 (JB293, 客户 11-27g).
 *
 * 「自行新增的材料分类及材料名称，也应支持中英文名称设置，并根据系统语言切换显示」
 * 「无论使用中文或英文界面，输入中文名称、英文名称或材料编号，都应能够搜索到相同的材料记录」
 *
 * Pinned here: both forms ask for 中文名称 and 英文名称 (at least one) and send
 * both; the pickers find a material by either name or its code; the words are
 * in four languages and say 你; the Excel import offers the 英文名称 column.
 * What a screen shows comes from the server, already in the reader's language.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { CompanyCategory, ProjectCategory } from "@/interfaces/contractor-ops";
import { materialOption } from "@/lib/material-catalogue";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ can: () => true }),
}));

const { CompanyMaterialForm, formOf, payloadOf, materialName } = await import(
  "@/components/contractor-ops/company-material-form"
);
const { filterMaterials } = await import("@/components/receipts/material-overview");

const read = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8");

const REBAR: CompanyCategory = {
  id: "m-1",
  kind: "MATERIAL",
  code: "MAT-REBAR",
  name: "Rebar",
  name_zh: "钢筋",
  name_en: "Rebar",
  description: "Rebar",
  sort_order: 0,
  is_active: true,
  is_fixed: false,
  default_unit: "TONNE",
  form_style: "",
  parent: null,
  specs: [],
  suppliers: [],
  price: null,
};

function render(children: ReactNode, locale: "zh" | "en" = "zh") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-units", "all"], []);
  client.setQueryData(["material-units", "active"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={locale === "zh" ? zh : en} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{children}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("JB293 第 1 点: two names on one material, at least one", () => {
  it("the company form asks for both and sends both, with the stored one", () => {
    const html = render(<CompanyMaterialForm row={REBAR} onBack={() => {}} onSaved={() => {}} />);
    expect(html).toContain("中文名称");
    expect(html).toContain("英文名称");
    expect(html).toContain('value="钢筋"');
    expect(html).toContain('value="Rebar"');
    const state = formOf(REBAR);
    expect(payloadOf(state, false)).toMatchObject({ name: "钢筋", name_zh: "钢筋", name_en: "Rebar" });
    // English only is enough; it is then the stored name.
    const english = { ...state, nameZh: " ", nameEn: "Plywood" };
    expect(materialName(english)).toBe("Plywood");
    expect(payloadOf(english, false)).toMatchObject({ name: "Plywood", name_zh: "", name_en: "Plywood" });
    expect(materialName({ ...state, nameZh: "", nameEn: "" })).toBe("");
  });

  it("an older row with one Chinese name reads it as its 中文名称", () => {
    const old = formOf({ ...REBAR, name: "钢筋", name_zh: undefined, name_en: undefined });
    expect([old.nameZh, old.nameEn]).toEqual(["钢筋", ""]);
    const latin = formOf({ ...REBAR, name: "Timber", name_zh: "", name_en: "Timber" });
    expect([latin.nameZh, latin.nameEn]).toEqual(["", "Timber"]);
  });

  it("the project's category window asks for both names on a material and sends them", () => {
    const source = read("components/contractor-ops/operations-workspaces.tsx");
    expect(source).toContain('const twoNames = isMaterial && !form.parent;');
    expect(source).toContain('label={tRoot("jb293.nameZh")}');
    expect(source).toContain('label={tRoot("jb293.nameEn")}');
    expect(source).toContain('name_zh: (form.name_zh ?? "").trim(),');
    expect(source).toContain('[anyName, twoNames ? tRoot("jb293.anyName") : t("field.name")]');
  });
});

describe("JB293 第 3 点: the pickers find a material by either name or its code", () => {
  const rebar = { id: "r", name: "Rebar", name_zh: "钢筋", name_en: "Rebar", code: "MAT-REBAR", specs: [] };

  it("gives every material picker option both names and the code to search", () => {
    expect(materialOption(rebar)).toEqual({ value: "r", label: "Rebar", keywords: ["钢筋", "Rebar", "MAT-REBAR"] });
    const combobox = read("components/material-requests/option-combobox.tsx");
    expect(combobox).toContain("[option.label, ...(option.keywords ?? [])].some(");
    expect(read("components/material-requests/request-form.tsx")).toContain("options={materials.map(materialOption)}");
    expect(read("components/shared/material-lines.tsx")).toContain("materials.map(materialOption)");
  });

  it("【按材料查询】 finds it by the Chinese name, the English name or the code", () => {
    const rows = [rebar as unknown as ProjectCategory];
    for (const typed of ["钢筋", "rebar", "mat-rebar", "Reb"]) {
      expect(filterMaterials(rows, typed).map((row) => row.id)).toEqual(["r"]);
    }
    expect(filterMaterials(rows, "砂石")).toEqual([]);
  });
});

describe("JB293 words and the Excel import", () => {
  it("has its words in four languages, saying 你", () => {
    const keys = ["nameZh", "nameEn", "anyName", "namesHint", "nameZhPlaceholder", "nameEnPlaceholder"];
    for (const catalogue of [zh, zhTW, en, ms]) {
      const group = (catalogue as unknown as Record<string, Record<string, string>>).jb293;
      for (const key of keys) expect(group[key], key).toBeTruthy();
      expect(JSON.stringify(group)).not.toContain("您");
    }
    expect(zh.jb293.nameZh).toBe("中文名称");
    expect(zh.jb293.nameEn).toBe("英文名称");
    expect(en.jb293.nameEn).toBe("English name");
  });

  it("offers the optional 英文名称 column", () => {
    const dialog = read("components/shared/excel-import-dialog.tsx");
    expect(dialog).toContain('name_en: "jb293.nameEn"');
    expect(dialog).toContain('material: ["material", "name_en", "spec"');
  });
});
