/**
 * JB260 (客户 11-26 事项 1): 「在『材料进场』主页面设置『按材料查询』按钮 … 直接
 * 打开对应材料的现有完整统计页面」, keeping 分类管理's 【查看记录】.
 *
 * JB262 / JB263 (事项 3、4): 「材料分类负责基础设置，材料进场负责记录、查询及统计，
 * 材料目标负责数量与预算控制」; 「把所有相关材料统计、材料目标、预算、MR申请及审批
 * 记录、材料查看及历史记录的查询入口，统一整理到材料进场页面，按照现有权限分别显示
 * 及操作」.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import type { MaterialRequestTotal } from "@/interfaces/material-request";
import type { MaterialTarget } from "@/interfaces/material-target";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

const reader: { codes: string[]; features: string[] | undefined } = { codes: [], features: undefined };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-hq", is_field_staff: false, features: reader.features },
    can: (code: string) => reader.codes.includes(code),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/receipts",
}));

const { MaterialOverview, MaterialLookupButton, filterMaterials, requestLinesOf, sameWords } = await import(
  "@/components/receipts/material-overview"
);
const { MaterialBudgets, BudgetHistoryList, budgetPayload } = await import("@/components/receipts/material-budget");

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function material(overrides: Partial<ProjectCategory> = {}): ProjectCategory {
  return {
    id: "m-rebar",
    project: "p-2",
    parent: null,
    parent_name: null,
    code: "MAT-REBAR",
    name: "钢筋",
    kind: "MATERIAL",
    specs: [
      { id: "s-y10", name: "Y10", is_active: true } as never,
      { id: "s-y12", name: "Y12", is_active: true } as never,
    ],
    submission_mode: "REVIEW",
    description: "",
    sort_order: 0,
    tracks_spend: true,
    budget_amount: "268000.00",
    budget_alert_percentages: [80, 100],
    budget_alert_amounts: [],
    budget_mode: "AMOUNT",
    record_count: 3,
    spend_amount: "120600.00",
    spend_uncounted_deliveries: 0,
    budget_used_percent: 45,
    tonnes_received: "45.000",
    tonnes_excluded_deliveries: 0,
    quantities: [{ material_name: "钢筋", material_specification: "Y10", unit: "TONNE", received: "45.000", returned: "0.000" } as never],
    pending_deliveries: 0,
    archived_deliveries: 2,
    is_visible_in_pwa: true,
    is_active: true,
    access_mode: "ALL",
    allowed_roles: [],
    allowed_role_names: [],
    allowed_users: [],
    allowed_user_names: [],
    upload_roles: [],
    upload_role_names: [],
    upload_users: [],
    upload_user_names: [],
    edit_roles: [],
    edit_role_names: [],
    edit_users: [],
    edit_user_names: [],
    can_upload: true,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function requestTotal(overrides: Partial<MaterialRequestTotal> = {}): MaterialRequestTotal {
  return {
    project: "p-2",
    project_code: "PRJ-0002",
    project_name: "Project 2B",
    material_name: "钢筋",
    specification: "Y10",
    unit: "TONNE",
    approved_quantity: "100.000",
    pending_quantity: "20.000",
    approved_count: 1,
    pending_count: 1,
    returned_count: 0,
    mi_quantity: null,
    mi_count: null,
    rn_quantity: null,
    rn_count: null,
    outstanding_quantity: null,
    over_received_quantity: null,
    ...overrides,
  } as MaterialRequestTotal;
}

function target(overrides: Partial<MaterialTarget> = {}): MaterialTarget {
  return {
    id: "t-1",
    project: "p-2",
    project_code: "PRJ-0002",
    project_name: "Project 2B",
    category: "m-rebar",
    category_name: "钢筋",
    spec_category: "s-y10",
    spec_name: "Y10",
    unit: "TONNE",
    unit_label: null,
    target_quantity: "100.000",
    alert_percentages: [80, 100],
    note: "",
    received: "45.000",
    rejected: "0.000",
    returned: "0.000",
    net: "45.000",
    remaining: "55.000",
    exceeded: "0.000",
    percent: 45,
    status: "NORMAL",
    tranches: [],
    deliveries: 1,
    other_units: [],
    created_by_name: "QS",
    created_at: "2026-11-01T00:00:00Z",
    can_manage: true,
    ...overrides,
  };
}

function render(node: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function seedAll(client: QueryClient, rows = [material()]) {
  client.setQueryData(["project-categories", "materials", "p-2"], { results: rows, count: rows.length });
  client.setQueryData(["material-targets", "p-2", ""], { results: [target()], can_manage: true });
  client.setQueryData(["material-requests", "totals", { project: "p-2" }], [
    requestTotal(),
    // Another material, and the same name in another project: not this row's.
    requestTotal({ material_name: "混凝土", approved_quantity: "9.000" }),
    requestTotal({ project: "p-9", approved_quantity: "777.000" }),
  ]);
}

describe("材料进场 › 材料统计 (JB262 / JB263)", () => {
  beforeEach(() => {
    reader.codes = ["receipt.view", "category.view", "material_request.view"];
    reader.features = undefined;
  });

  it("puts each material's 收货、MR、目标 and 预算 side by side, with the numbers the old pages showed", () => {
    const html = render(<MaterialOverview project="p-2" />, (client) => seedAll(client));
    expect(html).toContain("材料统计");
    for (const header of ["累计进场", "MR 申请", "材料目标", "花费／预算"]) expect(html).toContain(header);
    // 累计数量 (分类管理's figure), records and archived.
    expect(html).toContain("45.000");
    expect(html).toContain("3 笔记录");
    expect(html).toContain("已归档 2 笔");
    // 申请累计's line of this material in this project only.
    expect(html).toContain("待审 20.000 · 已批准 100.000");
    expect(html).not.toContain("777.000");
    expect(html).not.toContain("9.000");
    // 材料目标's figure.
    expect(html).toContain("45.000 / 100.000");
    expect(html).toContain("45%");
    // 花费／预算 as 分类管理 drew it.
    expect(html).toContain("RM 120,600.00 / RM 268,000.00");
  });

  it("opens the material's records, targets, MR totals and supplier totals from its row", () => {
    const html = render(<MaterialOverview project="p-2" />, (client) => seedAll(client));
    expect(html).toContain("查看记录");
    expect(html).toContain('href="/material-targets?project=p-2&amp;category=m-rebar"');
    expect(html).toContain(`href="/material-requests?tab=totals&amp;project=p-2&amp;material=${encodeURIComponent("钢筋")}"`);
    expect(html).toContain(`href="/receipts?view=totals&amp;project=p-2&amp;material=${encodeURIComponent("钢筋")}"`);
  });

  it("shows no MR figures or MR entry to a reader without MR view", () => {
    reader.codes = ["receipt.view", "category.view"];
    const html = render(<MaterialOverview project="p-2" />, (client) => seedAll(client));
    expect(html).not.toContain(">MR 申请</th>");
    expect(html).not.toContain("已批准 100.000");
    expect(html).not.toContain("/material-requests");
  });

  it("shows no targets to a consultant without 材料目标 ticked", () => {
    reader.features = ["consultant_menu", "item_materials_in"];
    const html = render(<MaterialOverview project="p-2" />, (client) => seedAll(client));
    expect(html).not.toContain("45.000 / 100.000");
  });

  it("asks for a project first", () => {
    const html = render(<MaterialOverview />);
    expect(html).toContain("先在上方选择项目，就会列出这个项目每种材料的统计。");
  });

  it("hides the money a reader may not see", () => {
    const html = render(<MaterialOverview project="p-2" />, (client) =>
      seedAll(client, [material({ spend_amount: null as never, budget_amount: null })]),
    );
    expect(html).not.toContain("RM 120,600.00");
  });
});

describe("按材料查询 (JB260)", () => {
  it("is a button on 材料进场 that waits for a project", () => {
    const html = render(<MaterialLookupButton />);
    expect(html).toContain("按材料查询");
    expect(html).toMatch(/data-slot="material-lookup"[^>]*disabled|disabled[^>]*data-slot="material-lookup"/);
    expect(render(<MaterialLookupButton project="p-2" />)).not.toMatch(/disabled=""/);
  });

  it("finds a material by name, code or specification, case and spaces ignored", () => {
    const rows = [material(), material({ id: "m-c", name: "混凝土", code: "MAT-CONCRETE", specs: [] })];
    expect(filterMaterials(rows, " 钢筋 ").map((row) => row.id)).toEqual(["m-rebar"]);
    expect(filterMaterials(rows, "mat-concrete").map((row) => row.id)).toEqual(["m-c"]);
    expect(filterMaterials(rows, "y12").map((row) => row.id)).toEqual(["m-rebar"]);
    expect(filterMaterials(rows, "")).toHaveLength(2);
    expect(sameWords("  Rebar   Y10 ")).toBe("rebar y10");
    expect(requestLinesOf(material(), [requestTotal({ material_name: " 钢筋 " }), requestTotal({ project: "x" })])).toHaveLength(1);
  });

  it("opens the same window 分类管理's 【查看记录】 opens, which stays there", () => {
    const overview = read("src/components/receipts/material-overview.tsx");
    expect(overview).toMatch(/<ColumnRecordsDialog\s+moduleKey="material"/);
    const receipts = read("src/components/receipts/receipts.tsx");
    expect(receipts).toMatch(/<MaterialLookupButton project=\{list\.filters\.project\} \/>/);
    expect(receipts).toMatch(/<MaterialOverview project=\{list\.filters\.project\} \/>/);
    const category = read("src/components/contractor-ops/category-management.tsx");
    expect(category).toMatch(/onClick=\{\(\) => setViewing\(row\)\}\s*>\s*\{t\("viewRecords"\)\}/);
    expect(category).toMatch(/<ColumnRecordsDialog\s+moduleKey=\{active\.key\}/);
  });
});

describe("材料分类 = basic data only (JB262)", () => {
  const category = read("src/components/contractor-ops/category-management.tsx");

  it("has no statistics columns on the material list", () => {
    expect(category).not.toMatch(/t\("column\.spend"\)/);
    expect(category).not.toMatch(/t\("column\.archived"\)/);
    expect(category).not.toMatch(/<SpendCell column=\{row\.column\}/);
    expect(category).not.toMatch(/<QuantityCell quantities=\{row\.column\.quantities/);
    expect(category).toMatch(/\{!isMaterial && \(\s*<TableHead className="text-right">\s*\{t\("column\.records"\)\}/);
    // and says where they went
    expect(category).toMatch(/\{isMaterial && <MaterialBasicsNote \/>\}/);
  });

  it("no longer sets or sends the budget in the material's form", () => {
    const dialog = read("src/components/contractor-ops/operations-workspaces.tsx");
    const body = dialog.slice(dialog.indexOf("export function CategoryDialog("), dialog.indexOf("export function FieldTasksWorkspace("));
    for (const field of ["tracks_spend", "budget_amount", "budget_alert_percentages", "budget_alert_amounts", "budget_mode"]) {
      expect(body).not.toContain(field);
    }
    expect(body).toContain('tRoot("jb262.budgetMoved")');
  });
});

describe("材料目标 = 数量目标 + 预算金额 + 追加记录 (JB262 / JB263)", () => {
  beforeEach(() => {
    reader.codes = ["receipt.view", "category.view", "category.manage"];
    reader.features = undefined;
  });

  it("lists each material's budget, as it was, with 设定预算 for category.manage", () => {
    const seed = (client: QueryClient) =>
      client.setQueryData(["project-categories", "materials", "p-2"], { results: [material()], count: 1 });
    const html = render(<MaterialBudgets project="p-2" />, seed);
    expect(html).toContain("预算金额");
    expect(html).toContain("RM 120,600.00 / RM 268,000.00");
    expect(html).toContain("80%、100%");
    expect(html).toContain("设定预算");
    reader.codes = ["receipt.view", "category.view"];
    expect(render(<MaterialBudgets project="p-2" />, seed)).not.toContain("设定预算");
  });

  it("sends the budget alone, so nothing else of the material changes", () => {
    expect(Object.keys(budgetPayload({ tracksSpend: true, budget: " 5000 ", alerts: [80], amounts: [] })).sort()).toEqual([
      "budget_alert_amounts",
      "budget_alert_percentages",
      "budget_amount",
      "budget_mode",
      "budget_quantity",
      "tracks_spend",
    ]);
    expect(budgetPayload({ tracksSpend: true, budget: " 5000 ", alerts: [], amounts: [] }).budget_amount).toBe("5000");
    expect(budgetPayload({ tracksSpend: false, budget: "5000", alerts: [], amounts: [] }).budget_amount).toBeNull();
  });

  it("shows one material's budget only when 材料统计 opened one, and each budget's 修改记录 (QA1 audit #24)", () => {
    const seed = (client: QueryClient) =>
      client.setQueryData(["project-categories", "materials", "p-2"], {
        results: [material(), material({ id: "m-sand", code: "MAT-SAND", name: "沙" })],
        count: 2,
      });
    const all = render(<MaterialBudgets project="p-2" />, seed);
    expect(all).toContain("MAT-SAND");
    const one = render(<MaterialBudgets project="p-2" material="m-rebar" />, seed);
    expect(one).toContain("MAT-REBAR");
    expect(one).not.toContain("MAT-SAND");
    expect(one).toContain('data-slot="budget-history-open"');
    // Read-only readers see the history too.
    reader.codes = ["receipt.view", "category.view"];
    expect(render(<MaterialBudgets project="p-2" />, seed)).toContain(messages.jb262.budgets.history);
  });

  it("lists who changed the budget, when, and what it was and became, newest first", () => {
    const html = render(
      <BudgetHistoryList
        rows={[
          {
            id: "a2",
            at: "2026-11-27T03:00:00Z",
            by: "PM Lee",
            before: { budget_amount: "250000.00" },
            after: { budget_amount: "268000.00", budget_alert_percentages: [80, 100] },
          },
          { id: "a1", at: "2026-11-20T03:00:00Z", by: "PM Lee", before: { budget_amount: null }, after: { budget_amount: null } },
        ]}
      />,
    );
    expect(html).toContain("PM Lee");
    expect(html).toContain("预算：RM 250000.00 → RM 268000.00");
    expect(html).toContain("80%、100%");
    // A reader without 金额查看 gets the amounts blanked by the server: 「—」.
    expect(html).toContain("预算：— → —");
  });

  it("names the material opened from 材料统计 even before it has a target", () => {
    const targets = read("src/components/receipts/material-targets.tsx");
    expect(targets).toMatch(/projectMaterials\.data\?\.find\(\(row\) => row\.id === material\)\?\.name/);
    expect(targets).not.toContain('rows[0]?.category_name ?? "—"');
  });

  it("is on the 材料目标 page beside the targets and their additions", () => {
    const targets = read("src/components/receipts/material-targets.tsx");
    expect(targets).toMatch(/<MaterialBudgets project=\{project\} material=\{material \|\| undefined\} \/>/);
    expect(targets).toMatch(/<AppendTargetDialog/);
    expect(targets).toMatch(/useListQuery\(\["project", "target", "category"\]\)/);
  });
});

describe("words (JB260, JB262)", () => {
  const shape = (value: unknown): unknown =>
    value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]))
      : typeof value;

  it.each([
    ["zh-TW", zhTW],
    ["en", en],
    ["ms", ms],
  ])("%s has every key zh has", (_, locale) => {
    const all = locale as Record<string, unknown>;
    const zh = messages as Record<string, unknown>;
    expect(shape(all.jb260)).toEqual(shape(zh.jb260));
    expect(shape(all.jb262)).toEqual(shape(zh.jb262));
  });

  it("says 你, never 您", () => {
    const text = JSON.stringify([(messages as Record<string, unknown>).jb260, (messages as Record<string, unknown>).jb262, (zhTW as Record<string, unknown>).jb262]);
    expect(text).not.toContain("您");
  });
});
