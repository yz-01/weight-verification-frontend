/**
 * JB243 (客户 11-23 事项 15): 申请累计 - MR 已批准 / 未批准 / 已退回, MI 现场实际签收,
 * RN 实际退货, 尚未收货 = MR 已批准 − MI; search by 项目 / 材料 / 规格 / 供应商; a
 * figure opens its records; with a supplier chosen the MR figures stay the
 * project's (「MR仍显示项目层级的申请统计，供应商筛选则对应MI签收及RN退货记录」).
 *
 * JB253 (客户 11-24 事项 4): 「材料申请（MR）右侧的「开始处理」「确认完成」按钮及相关
 * 手动完成说明取消 … 根据实际收货数量自动显示执行情况，无需人工确认。其他申请保留现有
 * 操作方式不变。」
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialRequest, MaterialRequestTotal } from "@/interfaces/material-request";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

const reader: { codes: string[] } = { codes: [] };
const listFilters: Record<string, string> = {};

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-hq", is_field_staff: false },
    can: (code: string) => reader.codes.includes(code),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/material-requests",
}));

vi.mock("@/hooks/use-list-query", () => ({
  useListQuery: () => ({ filters: listFilters, setFilter: () => {}, setFilters: () => {} }),
}));

vi.mock("@/components/shared/supplier-date-filter", () => ({
  SupplierDateListFilter: () => <div data-supplier-filter="" />,
}));

vi.mock("@/components/shared/module-records-table", () => ({
  ProjectListFilter: () => <div data-project-filter="" />,
  FilterSelect: () => null,
  ModuleRecordsTable: () => null,
  PlainHeader: () => null,
  sortable: () => null,
}));

vi.mock("@/components/shared/export-button", () => ({
  ExportButton: () => <button type="button">导出</button>,
}));

vi.mock("@/components/shared/record-detail-shell", () => ({
  RecordDetailDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RecordRecorder: () => null,
  RecordDetailShell: ({
    facts,
    actions,
  }: {
    facts: { label: string; value: React.ReactNode }[];
    actions: React.ReactNode;
  }) => (
    <div>
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div data-actions>{actions}</div>
    </div>
  ),
}));

const { TotalsTab, totalsExportColumns } = await import("@/components/material-requests/totals-tab");
const { MaterialRequestDetail } = await import("@/components/material-requests/material-requests-office");

function total(overrides: Partial<MaterialRequestTotal> = {}): MaterialRequestTotal {
  return {
    project: "p-2",
    project_code: "PRJ-0002",
    project_name: "Project 2B",
    material_name: "钢筋",
    specification: "Y10",
    unit: "TONNE",
    approved_quantity: "150.000",
    pending_quantity: "0.000",
    approved_count: 2,
    pending_count: 0,
    returned_count: 1,
    mi_quantity: "120.000",
    mi_count: 4,
    rn_quantity: "5.000",
    rn_count: 1,
    outstanding_quantity: "30.000",
    over_received_quantity: "0.000",
    ...overrides,
  };
}

function wrap(node: React.ReactNode, seed: (client: QueryClient) => void) {
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

function totals(rows: MaterialRequestTotal[]) {
  return wrap(<TotalsTab onOpenGroup={() => {}} />, (client) =>
    client.setQueryData(["material-requests", "totals", listFilters], rows),
  );
}

describe("申请累计 (JB243)", () => {
  beforeEach(() => {
    reader.codes = ["material_request.view", "receipt.view"];
    for (const key of Object.keys(listFilters)) delete listFilters[key];
  });

  it("has the six columns the client listed, each a figure of its own", () => {
    const html = totals([total()]);
    for (const header of ["MR 已批准数量", "MR 未批准数量（待审）", "MR 已退回（历史）", "MI 现场实际签收数量", "RN 实际退货数量", "尚未收货数量"]) {
      expect(html).toContain(header);
    }
    expect(html).toContain("= MR 已批准 − MI 签收");
    expect(html).toContain("120.000");
    expect(html).toContain("5.000");
    expect(html).toContain("30.000");
    // Search by 项目, 材料, 规格 and 供应商.
    expect(html).toContain("data-project-filter");
    expect(html).toContain("data-supplier-filter");
    expect(html).toContain('placeholder="材料"');
    expect(html).toContain('placeholder="规格"');
    // Every figure opens its records.
    for (const column of ["approved", "pending", "returned", "mi", "rn"]) {
      expect(html).toContain(`data-slot="mr-total-${column}"`);
    }
    // The footer stays true: MI / RN come from 材料管理, not stock.
    expect(html).toContain("MI 签收和 RN 退货来自「材料管理」");
  });

  it("says what came in beyond the approved quantity", () => {
    const html = totals([total({ outstanding_quantity: "0.000", over_received_quantity: "4.000" })]);
    expect(html).toContain("多收 4.000");
  });

  it("with a supplier chosen says the MR figures stay the project's", () => {
    listFilters.supplier = "s-1";
    const html = totals([total()]);
    expect(html).toContain("MR 申请没有按供应商分，仍是整个项目的数量");
  });

  it("shows no delivery figures to who cannot read deliveries", () => {
    reader.codes = ["material_request.view"];
    const html = totals([total({ mi_quantity: null, mi_count: null, rn_quantity: null, rn_count: null, outstanding_quantity: null, over_received_quantity: null })]);
    expect(html).not.toContain("MI 现场实际签收数量");
    expect(html).not.toContain("data-supplier-filter");
    expect(html).toContain("以上是申请数量，不是现场库存");
  });

  it("exports the same columns", () => {
    const t = (key: string) => key;
    const withDeliveries = totalsExportColumns(t, {}, true).map((column) => column.key);
    expect(withDeliveries).toEqual([
      "project_label", "material_name", "specification", "unit", "approved_quantity", "approved_count",
      "pending_quantity", "pending_count", "returned_count", "mi_quantity", "mi_count", "rn_quantity",
      "rn_count", "outstanding_quantity", "over_received_quantity",
    ]);
    expect(totalsExportColumns(t, {}, false).map((column) => column.key)).not.toContain("mi_quantity");
  });

  it("opens each record at its own address", () => {
    const source = readFileSync(join(process.cwd(), "src/components/material-requests/totals-tab.tsx"), "utf8");
    expect(source).toContain("router.push(item.href)");
    expect(source).toContain("getMaterialRequestTotalRecords(row, column, bySupplier || undefined)");
    // Only MI and RN follow the supplier into the records; the requests never do.
    expect(source).toContain('column === "mi" || column === "rn" ? supplier : ""');
  });
});

function request(overrides: Partial<MaterialRequest> = {}): MaterialRequest {
  return {
    id: "mr-1",
    request_no: "MR-PRJ-0002-001",
    request_type: "MATERIAL",
    request_kind: "t-mat",
    request_kind_name: "材料申请",
    request_kind_form_style: "MATERIAL",
    subject: "",
    content: "",
    category: null,
    spec_category: null,
    status: "APPROVED",
    project: "p-2",
    project_name: "Project 2B",
    project_code: "PRJ-0002",
    material_name: "钢筋",
    specification: "Y10",
    quantity: "120",
    unit: "TONNE",
    remark: "",
    submitted_by: "u-mimi",
    submitted_by_name: "mimi lee",
    submitted_at: "2026-11-06T12:08:00Z",
    assigned_reviewer: "u-hq",
    assigned_reviewer_name: "测试建筑商 1",
    decided_by_name: "测试建筑商 1",
    decided_at: "2026-11-06T12:15:00Z",
    decision_note: "",
    attachments: [],
    attachment_count: 0,
    decisions: [],
    created_at: "2026-11-06T12:08:00Z",
    execution_status: "IN_PROGRESS",
    reminder_count: 0,
    reminder_hours: 24,
    execution_manager_names: ["mike"],
    can_execute: false,
    execution_automatic: true,
    completed_automatically: false,
    execution_lines: [
      { position: 1, material_name: "钢筋", specification: "Y10", unit: "TONNE", approved_quantity: "120.000", received_quantity: "40.000" },
    ],
    ...overrides,
  } as MaterialRequest;
}

function detail(row: MaterialRequest) {
  return wrap(<MaterialRequestDetail id={row.id} onClose={() => {}} onRaiseAgain={() => {}} />, (client) =>
    client.setQueryData(["material-requests", "detail", row.id], row),
  );
}

describe("a material request's execution follows the deliveries (JB253)", () => {
  beforeEach(() => {
    reader.codes = ["material_request.view", "material_request.config"];
  });

  it("has no 开始处理 / 确认完成 and no manual completion text, even for the project manager", () => {
    const html = detail(request({ can_execute: true }));
    expect(html).not.toMatch(/>确认完成<\/button>/);
    expect(html).not.toMatch(/>开始处理<\/button>/);
    expect(html).not.toContain("完成说明（选填）");
    expect(html).not.toContain("等待项目经理 mike 确认完成");
    expect(html).not.toContain("要按「确认完成」");
    expect(html).toContain("按「材料管理」材料进场的实际签收数量自动对比");
  });

  it("shows each material received against approved", () => {
    const html = detail(request());
    expect(html).toContain("<dt>收货情况</dt>");
    expect(html).toContain("已收 40.000 / 批准 120.000");
  });

  it("says an automatic completion with its time, never a confirmer", () => {
    const html = detail(
      request({ execution_status: "COMPLETED", completed_automatically: true, completed_at: "2026-11-24T03:00:00Z", completed_by_name: null }),
    );
    expect(html).toContain("<dt>完成方式</dt>");
    expect(html).toContain("全部收齐，系统自动完成");
    expect(html).not.toContain("<dt>确认完成人</dt>");
  });

  it("keeps an other request's buttons", () => {
    reader.codes = ["material_request.view", "material_request.config"];
    const html = detail(
      request({ request_type: "OTHER", execution_automatic: false, execution_lines: null, can_execute: true, execution_status: "PENDING" }),
    );
    expect(html).toMatch(/>确认完成<\/button>/);
    expect(html).toMatch(/>开始处理<\/button>/);
  });

  it("the phone says it completes by itself", () => {
    const source = readFileSync(join(process.cwd(), "src/components/field-staff/my-submissions.tsx"), "utf8");
    expect(source).toContain('row.execution_automatic ? "materialRequest.jb253.explain"');
  });
});

describe("four languages (JB243, JB253)", () => {
  const catalogues = { zh: messages, "zh-TW": zhTW, en, ms } as const;

  function keys(value: unknown, prefix = ""): string[] {
    if (typeof value !== "object" || value === null) return [prefix];
    return Object.entries(value).flatMap(([key, inner]) => keys(inner, prefix ? `${prefix}.${key}` : key));
  }

  it("every key in every catalogue, and 你 never 您", () => {
    const groups = ["jb243", "jb253"] as const;
    for (const group of groups) {
      const expected = keys(messages.materialRequest[group]).sort();
      for (const [locale, catalogue] of Object.entries(catalogues)) {
        expect(keys(catalogue.materialRequest[group]).sort(), `${locale} ${group}`).toEqual(expected);
        expect(JSON.stringify(catalogue.materialRequest[group])).not.toContain("您");
      }
    }
    for (const catalogue of Object.values(catalogues)) {
      expect(catalogue.errors.api.material_request_execution_automatic).toBeTruthy();
      expect(catalogue.audit.operation.execution_auto).toBeTruthy();
      expect(catalogue.mySubmissions.field.execution_received).toBeTruthy();
      expect(catalogue.mySubmissions.field.completed_auto).toBeTruthy();
    }
  });
});
