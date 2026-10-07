/**
 * Material outgoing after the batch-4 audit (FABLE_AUDIT_B4, Q29).
 *
 * - Q29.13 / #11: 「有退场资料」 is shown to everyone who sees the supplier;
 *   without `material_outgoing.view` it is a plain mark that opens nothing.
 *   The export inside the returns needs `report.export`.
 * - #24: the returns list says when it was cut and how to narrow it.
 * - #23: the completion date's column is labelled as a date; the supplier
 *   group on 累计净数量 counts the supplier's returns all time.
 * - Q29.9: a return naming no supplier is exported as 「未填供应商」.
 * - #15: the 「已批准」 notice's `&outgoing=<id>` opens that return's exit.
 * - Q29.3 / #10: the exit form lives in a draft, and an exit already waiting
 *   on the phone is said so instead of offering the form a second time.
 * - #16: the Return Note locked after approval has its own sentence.
 *
 * Rendered to static markup like the other screen tests - the runner has no
 * DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const drafts: Record<string, unknown> = {};
let permissions = new Set<string>();
let search = new URLSearchParams();

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-site", full_name: "Ah Seng", is_field_staff: true },
    can: (code: string) => permissions.has(code),
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/field-staff",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => search,
}));

vi.mock("@/components/field-staff/field-draft", () => ({
  FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useClearDraft: () => () => {},
  useDraftState: (key: string, initial?: unknown) => [
    key in drafts ? drafts[key] : typeof initial === "function" ? (initial as () => unknown)() : initial,
    () => {},
  ],
}));

vi.mock("@/components/ui/dialog", () => {
  const Inline = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Inline,
    DialogContent: Inline,
    DialogDescription: Inline,
    DialogFooter: Inline,
    DialogHeader: Inline,
    DialogTitle: Inline,
  };
});

const { SupplierReturnBadge, SupplierReturnsDialog, supplierReturnsExportColumns } = await import(
  "@/components/suppliers/supplier-return-badge"
);
const { MaterialOutgoingWorkspace, ReturnProcessingDialog } = await import(
  "@/components/contractor-ops/operations-workspaces"
);
const { groupBySupplier, netTotalsExportColumns } = await import("@/components/receipts/material-tabs");

const SUPPLIER = { id: "s-1", name: "Rebar Supply", completed_return_count: 3 };

function outgoing(overrides: Partial<MaterialOutgoing> = {}): MaterialOutgoing {
  return {
    id: "o-1",
    reference_no: "MO-SITE-261008-001",
    project: "p-1",
    project_name: "Site",
    category: "c-steel",
    category_name: "钢筋",
    supplier: "s-1",
    supplier_name: "Rebar Supply",
    material_name: "钢筋",
    quantity: "2.000",
    unit: "TONNE",
    destination: "",
    executor_name: "Ah Seng",
    vehicle_plate: "WXY 1",
    delivery_note_no: "",
    reason: "Surplus",
    status: "APPROVED",
    captured_at: "2026-10-07T02:00:00Z",
    latitude: null,
    longitude: null,
    submitted_by_name: "Ah Seng",
    approved_by_name: "Site Office",
    approved_at: "2026-10-07T03:00:00Z",
    review_note: "",
    photos: [],
    has_return_note: true,
    ...overrides,
  };
}

function client(seed: (qc: QueryClient) => void = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const page = <T,>(results: T[]) => ({ results, count: results.length });
  qc.setQueryData(["projects", "options"], page([{ id: "p-1", code: "SITE", name: "Site" }]));
  qc.setQueryData(["material-outgoing", ""], page([]));
  qc.setQueryData(["material-outgoing", "p-1"], page([]));
  qc.setQueryData(["project-categories", "outgoing", "p-1"], page([]));
  qc.setQueryData(["suppliers", "picker", ""], page([{ ...SUPPLIER, code: "S1", is_active: true }]));
  qc.setQueryData(["material-units", "active"], []);
  qc.setQueryData(["material-units", "all"], []);
  qc.setQueryData(["material-outgoing", "exit-queued", "o-1"], false);
  seed(qc);
  return qc;
}

function render(node: React.ReactNode, seed?: (qc: QueryClient) => void) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client(seed)}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(drafts)) delete drafts[key];
  permissions = new Set();
  search = new URLSearchParams();
});

describe("「有退场资料」 for everyone (Q29.13)", () => {
  it("is a plain mark for someone who may not read the returns", () => {
    permissions = new Set(["supplier.view", "receipt.create"]);
    const html = render(<SupplierReturnBadge supplier={SUPPLIER} />);
    expect(html).toContain("有退场资料");
    expect(html).toMatch(/^<span/);
    expect(html).not.toContain("<button");
  });

  it("opens the returns for someone who may read them", () => {
    permissions = new Set(["material_outgoing.view"]);
    const html = render(<SupplierReturnBadge supplier={SUPPLIER} />);
    expect(html).toMatch(/^<button/);
  });
});

describe("the returns it opens", () => {
  const seedReturns = (truncated: boolean) => (qc: QueryClient) =>
    qc.setQueryData(["suppliers", "returns", "s-1", { project: "", date_from: "", date_to: "" }], {
      supplier: "s-1",
      supplier_name: "Rebar Supply",
      count: 1,
      total: truncated ? 140 : 1,
      limit: 100,
      truncated,
      results: [outgoing({ status: "COMPLETED", completed_at: "2026-10-08T03:00:00Z" })],
    });

  it("offers the export only with report.export", () => {
    permissions = new Set(["material_outgoing.view"]);
    const without = render(<SupplierReturnsDialog supplier={SUPPLIER} onClose={() => {}} />, seedReturns(false));
    expect(without).toContain("MO-SITE-261008-001");
    expect(without).not.toContain("导出");

    permissions = new Set(["material_outgoing.view", "report.export"]);
    const withExport = render(<SupplierReturnsDialog supplier={SUPPLIER} onClose={() => {}} />, seedReturns(false));
    expect(withExport).toContain("导出");
  });

  it("says when the list was cut, and how to narrow it", () => {
    permissions = new Set(["material_outgoing.view"]);
    const html = render(<SupplierReturnsDialog supplier={SUPPLIER} onClose={() => {}} />, seedReturns(true));
    expect(html).toContain(zh.supplierReturns.truncated.replace("{shown}", "1").replace("{total}", "140"));
    // Narrowed by project and by date, right there.
    expect(html).toContain(`aria-label="${zh.supplierDateFilter.from}"`);
    expect(html).toContain(`aria-label="${zh.supplierDateFilter.toLabel}"`);
  });

  it("labels the completion column as the date it was completed", () => {
    const columns = supplierReturnsExportColumns(
      (key: string) => `returns:${key}`,
      (key: string) => `ops:${key}`,
      {},
    );
    const completed = columns.find((column) => column.key === "completed_at");
    expect(completed?.label).toBe("returns:column.completedAt");
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.supplierReturns.column.completedAt).toBeTruthy();
    }
    expect(zh.supplierReturns.column.completedAt).toBe("完成日期");
  });
});

describe("累计净数量 (#23, Q29.9)", () => {
  const row = (overrides: Record<string, unknown>) => ({
    project: "p-1",
    project_name: "Site",
    supplier: "s-1",
    supplier_name: "Rebar Supply",
    material_name: "钢筋",
    material_specification: "",
    unit: "TONNE",
    received: "10.000",
    rejected: "0.000",
    returned: "0.000",
    net: "10.000",
    deliveries: 1,
    items: [],
    ...overrides,
  });

  it("badges a supplier group by the supplier's all-time returns, not this view's", () => {
    const groups = groupBySupplier([row({ supplier_return_count: 5 })]);
    expect(groups[0].returnCount).toBe(5);
  });

  it("exports a line naming no supplier as 「未填供应商」", () => {
    const columns = netTotalsExportColumns((key: string) => (key === "receipts.net.noSupplier" ? "未填供应商" : key), {});
    const supplier = columns.find((column) => column.key === "supplier_name");
    expect(supplier?.values).toEqual({ "": "未填供应商" });
  });
});

describe("the 「已批准」 notice opens the exit (#15)", () => {
  const seedRecord = (status: MaterialOutgoing["status"]) => (qc: QueryClient) =>
    qc.setQueryData(["material-outgoing", "detail", "o-1"], outgoing({ status }));

  it("lands the worker on that return's exit step", () => {
    permissions = new Set(["material_outgoing.submit", "material_outgoing.view"]);
    search = new URLSearchParams("tab=records&record=outgoing&outgoing=o-1");
    const html = render(<MaterialOutgoingWorkspace initialProject="p-1" />, seedRecord("APPROVED"));
    expect(html).toContain(zh.contractorOps.outgoing.returnHelp.replace("{reference}", "MO-SITE-261008-001"));
    expect(html).toContain(zh.contractorOps.outgoing.sendReturn);
  });

  it("opens nothing without the link", () => {
    permissions = new Set(["material_outgoing.submit", "material_outgoing.view"]);
    const html = render(<MaterialOutgoingWorkspace initialProject="p-1" />, seedRecord("APPROVED"));
    expect(html).not.toContain(zh.contractorOps.outgoing.sendReturn);
  });
});

describe("the exit form (Q29.3)", () => {
  const seedRecord = (qc: QueryClient) =>
    qc.setQueryData(["material-outgoing", "detail", "o-1"], outgoing());

  it("keeps what was typed in the draft, so a failed send loses nothing", () => {
    permissions = new Set(["material_outgoing.submit"]);
    drafts["exit:o-1:returned"] = "7.5";
    drafts["exit:o-1:plate"] = "JQK 4321";
    const html = render(
      <ReturnProcessingDialog row={{ id: "o-1", reference_no: "MO-SITE-261008-001" }} onClose={() => {}} onSaved={() => {}} />,
      seedRecord,
    );
    expect(html).toContain('value="7.5"');
    expect(html).toContain('value="JQK 4321"');
  });

  it("says an exit already waiting on the phone instead of asking again", () => {
    permissions = new Set(["material_outgoing.submit"]);
    const html = render(
      <ReturnProcessingDialog row={{ id: "o-1", reference_no: "MO-SITE-261008-001" }} onClose={() => {}} onSaved={() => {}} />,
      (qc) => {
        seedRecord(qc);
        qc.setQueryData(["material-outgoing", "exit-queued", "o-1"], true);
      },
    );
    expect(html).toContain(zh.contractorOps.outgoing.exitWaitingUpload);
    expect(html).not.toContain(zh.contractorOps.outgoing.sendReturn);
  });

  it("names the queued exit in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.offline.kind.MATERIAL_OUTGOING_EXIT).toBeTruthy();
      expect(catalogue.contractorOps.outgoing.exitWaitingUpload).toBeTruthy();
    }
  });
});

describe("the Return Note after approval (#16)", () => {
  it("has its own sentence in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.errors.api.return_note_locked).toBeTruthy();
    }
    expect(zh.errors.api.return_note_locked).toContain("不能再修改");
  });
});
