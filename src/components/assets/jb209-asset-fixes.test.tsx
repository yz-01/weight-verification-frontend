/**
 * JB209 (Lucas 11-16 audit, Part D) - 资产管理 fixes.
 *
 * - D-A1 (JB209-9): 「新增资产」 shows on the 资产管理与查询 page.
 * - X-2 (JB209-14): lists read a hundred at a time with 「加载更多」; pickers
 *   read every page.
 * - Part D usability (JB209-16): 🗑 asks first, ✎ is named, a refused save
 *   names its field, 领用 offers only active assets, 定期重复保养 says how it
 *   repeats, 类别「其他」 says where categories come from, report files carry
 *   words instead of codes.
 *
 * Rendered to static markup (the runner has no DOM); the dialog wiring is
 * read in the source.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/assets/management",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Admin", company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
  }),
}));

const { AssetManagementWorkspace, REPORT_VALUE_GROUPS, firstFieldError } = await import(
  "@/components/assets/asset-management-workspace"
);

const ROOT = process.cwd();
const SOURCE = readFileSync(path.join(ROOT, "src/components/assets/asset-management-workspace.tsx"), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
/** The body of one top-level function in the workspace file. */
const body = (name: string) => {
  const start = SOURCE.indexOf(`function ${name}(`);
  const next = SOURCE.indexOf("\nfunction ", start + 1);
  return SOURCE.slice(start, next === -1 ? undefined : next);
};

const ASSET = {
  id: "a-1", asset_code: "AST-GW-0001", name: "Gateway 1", category: "GATEWAY", custom_category_name: "",
  brand: "ZLAN", model: "8308", serial_number: "SN-1", purchase_date: "2026-11-01", purchase_price: "100.00",
  warranty_expires_on: null, holder_name: "", department_name: "", current_warehouse: "HQ",
  deployed_company_name: "", project_name: "", status: "IN_STOCK", is_active: true,
};

function page<T>(results: T[], count = results.length) {
  return { pages: [{ count, page: 1, page_size: 100, total_pages: Math.ceil(count / 100) || 1, results }], pageParams: [1] };
}

function render(node: React.ReactNode, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">{node}</NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("JB209-9 D-A1: 「新增资产」 on the search page", () => {
  it("offers the button to an asset.manage holder on 资产管理与查询", () => {
    const html = render(<AssetManagementWorkspace section="management" />, (qc) =>
      qc.setQueryData(["assets", "search", "", "", "", "paged"], page([ASSET])),
    );
    expect(text(html)).toContain(zh.adminAssetManagement.action.addAsset);
    expect(text(html)).toContain("AST-GW-0001");
  });
});

describe("JB209-14 X-2: a hundred at a time, the rest one 「加载更多」 away", () => {
  it("says how many are shown and offers the next page when the server holds more", () => {
    const html = text(render(<AssetManagementWorkspace section="management" />, (qc) =>
      qc.setQueryData(["assets", "search", "", "", "", "paged"], page([ASSET], 150)),
    ));
    expect(html).toContain("已显示 1 笔，共 150 笔");
    expect(html).toContain("加载更多");
  });

  it("shows no pager when every row is on screen", () => {
    const html = render(<AssetManagementWorkspace section="management" />, (qc) =>
      qc.setQueryData(["assets", "search", "", "", "", "paged"], page([ASSET])),
    );
    expect(html).not.toContain("data-load-more");
  });

  it("asks the server for no more than it gives, and pickers read every page", () => {
    expect(SOURCE).not.toMatch(/page_size:\s*\d/);
    for (const key of ["assignable", "installable", "transferable", "maintenance-options", "disposal-options"]) {
      expect(SOURCE).toMatch(new RegExp(`queryKey: \\["assets", "${key}"\\], queryFn: \\(\\) => readAllPages\\(`));
    }
    for (const panel of ["AssetPanel", "CategoryPanel", "PurchasePanel", "AssignmentPanel", "InstallationPanel", "DepartmentPanel", "TransferPanel", "MaintenancePanel", "DisposalPanel"]) {
      expect(body(panel)).toContain("usePagedList(");
      expect(body(panel)).toContain("<LoadMoreRow list={rows} />");
    }
  });
});

describe("JB209-16 Part D usability", () => {
  it("(a)(b) names the category ✎ and 🗑, and 🗑 asks first", () => {
    const html = render(<AssetManagementWorkspace section="categories" />, (qc) =>
      qc.setQueryData(["asset-categories", "paged"], page([{ id: "c-1", code: "DRONE", name: "无人机", description: "", is_system: false, is_active: true }])),
    );
    expect(html).toContain(`title="${zh.adminAssetManagement.action.editCategory}"`);
    expect(html).toContain(`title="${zh.adminAssetManagement.action.removeCategory}"`);
    expect(body("CategoryPanel")).toContain("onClick={() => setRemoving(row)}");
    expect(body("CategoryPanel")).not.toContain("onClick={() => remove.mutate(row.id)}");
    expect(body("CategoryPanel")).toContain('description={t("confirm.removeCategory"');
    expect(body("DepartmentPanel")).toContain("onClick={() => setRemoving(row)}");
    expect(body("DepartmentPanel")).not.toContain("onClick={() => drop.mutate(row)}");
    expect(body("DepartmentPanel")).toContain('description={t("confirm.removeDepartment"');
  });

  it("(c) a refused save names the first field it refused", () => {
    expect(firstFieldError(new ApiError("请检查标红的字段后重试。", 400, { serial_number: "这个序列号已经登记过。" }))).toEqual({
      key: "serial_number",
      message: "这个序列号已经登记过。",
    });
    expect(firstFieldError(new ApiError("x", 409))).toBeNull();
    expect(firstFieldError(new Error("x"))).toBeNull();
    for (const dialog of ["AssetDialog", "CategoryDialog", "PurchaseDialog", "ReceiveDialog", "AssignmentDialog", "ReturnDialog", "InstallationDialog", "InstallationStatusDialog", "DepartmentDialog", "TransferDialog", "MaintenanceDialog", "MaintenanceCompleteDialog", "DisposalDialog", "DisposalDecisionDialog"]) {
      expect(body(dialog)).toContain("<SaveError error={save.error}");
    }
  });

  it("(d) 领用 offers only active 在库 assets", () => {
    expect(body("AssignmentDialog")).toContain('getAssets({ ...paging, status: "IN_STOCK", is_active: true })');
  });

  it("(f) a recurring 保养 says it needs the next date, and 完成 requires it", () => {
    expect(body("MaintenanceDialog")).toContain('t("field.recurringHint")');
    expect(body("MaintenanceCompleteDialog")).toContain("required={row.is_recurring}");
    expect(body("MaintenanceCompleteDialog")).toContain('[!row.is_recurring || form.next_maintenance_date, t("column.nextDate")]');
  });

  it("(g) 类别「其他」 with nothing to choose points to 资产类别", () => {
    expect(body("NoCustomCategories")).toContain('href="/assets/categories"');
    expect(body("AssetDialog")).toContain("<NoCustomCategories query={categories} />");
    expect(body("PurchaseDialog")).toContain("<NoCustomCategories query={categories} />");
  });

  it("(h) report columns of codes carry the screen's words", () => {
    const words = zh.adminAssetManagement as unknown as Record<string, Record<string, string>>;
    for (const [dataset, columns] of Object.entries(REPORT_VALUE_GROUPS)) {
      for (const [column, group] of Object.entries(columns)) {
        expect(words[group], `${dataset}.${column} -> ${group}`).toBeTypeOf("object");
      }
    }
    expect(REPORT_VALUE_GROUPS.assets).toEqual({ category: "category", status: "assetStatus" });
    expect(REPORT_VALUE_GROUPS.purchases).toEqual({ delivery_status: "purchaseStatus" });
    expect(body("ReportPanel")).toContain("...values(dataset, key)");
  });

  it("says every new sentence in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const asset = messages.adminAssetManagement as unknown as Record<string, Record<string, string> | string>;
      expect(asset.saveFieldError).toBeTruthy();
      expect((asset.confirm as Record<string, string>).removeCategory).toContain("{name}");
      expect((asset.field as Record<string, string>).recurringHint).toBeTruthy();
      expect((asset.field as Record<string, string>).noCustomCategories).toBeTruthy();
      expect((asset.action as Record<string, string>).goToCategories).toBeTruthy();
    }
  });
});
