/**
 * JB280 (客户 11-26 事项 21): 设备租赁月结单 and its 核对与结算.
 *
 * - its own page under 设备管理, for the rental pages' people;
 * - 「待核对｜已核对｜已结算｜全部月结单」, the 设备公司 / 项目 / dates filters,
 *   【生成月结单】 and the 材料领用 【核对与结算】 (kind RENTAL);
 * - a statement: its machines (each opening its 按月 page for the month),
 *   the five amounts and 合计, the 核对 / 结算 numbers opening their windows,
 *   预览 · 打印 · 导出 · 发送 of the A4 PDF, 【作废】 while 待核对;
 * - the 按月 page opens on the machine and month a statement line names.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/equipment-rental-statements",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1", full_name: "Site Office" }, can: () => true }),
}));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({
    active: false,
    projectId: "",
    projects: [],
    canChooseAll: true,
    loading: false,
    setProjectId: () => undefined,
  }),
}));

const { RentalStatementWindow, StatementLines, monthHref, statementTabOf } = await import(
  "@/components/equipment-hours/rental-statements"
);
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed?.(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const LINE = {
  equipment: "e-1",
  equipment_no: "EQ0001",
  equipment_code: "EQ0001",
  equipment_name: "Excavator",
  terms: { method: "MONTHLY", unit_price: "18000.00" },
  days_worked: 22,
  normal_hours: "176.00",
  overtime_hours: "10.00",
  base_rent: "18000.00",
  overtime_fee: "1200.00",
  diesel_fee: "850.00",
  adjustment_amount: "-500.00",
  rental_total: "19550.00",
  months: [{ month: "2026-11", confirmed: true, rental_total: "19550.00" }],
};

const STATEMENT = {
  id: "st-1",
  statement_no: "EQ-MS001",
  project: "p-1",
  project_name: "PUTRA MAS",
  supplier: "s-1",
  supplier_name: "HH machinery sb",
  date_from: "2026-11-01",
  date_to: "2026-11-30",
  machine_count: 1,
  base_rent: "18000.00",
  overtime_fee: "1200.00",
  diesel_fee: "850.00",
  adjustment_amount: "-500.00",
  rental_total: "19550.00",
  state: "SETTLED",
  generated_by_name: "mike",
  generated_at: "2026-12-01T02:00:00Z",
  rental_check: "c-1",
  check_no: "EQ-RC001",
  settlement_no: "EQ-ST001",
  cancelled_at: null,
  cancelled_by_name: "",
  cancel_reason: "",
  lines: [LINE],
  check: {
    state: "SETTLED",
    check_id: "c-1",
    check_no: "EQ-RC001",
    checked_by_name: "mike",
    checked_at: "2026-12-01T03:00:00Z",
    settlement_id: "x-1",
    settlement_no: "EQ-ST001",
    settled_by_name: "mike",
    settled_at: "2026-12-02T03:00:00Z",
  },
  check_voucher_no: "INV-88",
  settlement_voucher_no: "PAID-01",
};

describe("JB280 设备租赁月结单", () => {
  it("is its own page in 设备管理, for whoever sets the rental terms", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toMatch(/"nav\.submodule\.equipmentRentalStatements",\s+"\/equipment-rental-statements",\s+"equipment",\s+"equipment\.manage",/);
    expect(zh.nav.submodule.equipmentRentalStatements).toBe("设备租赁月结单");
    expect(read("src/app/(dashboard)/equipment-rental-statements/page.tsx")).toContain("<RentalStatementsPage />");
  });

  it("第 2、3 点: 待核对｜已核对｜已结算 (+ 全部), and the same 【核对与结算】 as 材料领用", () => {
    expect(statementTabOf("checked")).toBe("checked");
    expect(statementTabOf("settled")).toBe("settled");
    expect(statementTabOf(null)).toBe("pending");
    const page = read("src/components/equipment-hours/rental-statements.tsx");
    expect(page).toMatch(/<ReconcileSettleButton\s+kind="RENTAL"/);
    expect(page).toMatch(/pending: "PENDING",\s+checked: "CHECKED",\s+settled: "SETTLED",/);
    expect(zh.jb280.tab.pending).toBe("待核对");
    expect(zh.jb280.tab.checked).toBe("已核对");
    expect(zh.jb280.tab.settled).toBe("已结算");
  });

  it("第 1 点: generated from 项目, 设备公司, 开始日期, 结束日期", () => {
    const page = read("src/components/equipment-hours/rental-statements.tsx");
    const dialog = page.slice(page.indexOf("function GenerateStatementDialog("), page.indexOf("export function StatementLines("));
    for (const label of ['tr("col.project")', 'tr("col.company")', 'tr("dateFrom")', 'tr("dateTo")']) {
      expect(dialog).toContain(`label={${label}} required`);
    }
    expect(dialog).toMatch(/previewRentalStatement\(choices\)/);
    expect(dialog).toMatch(/createRentalStatement\(choices\)/);
    expect(zh.jb280.generateHelp).toContain("确认本月金额");
  });

  it("第 5、6 点: machines with their 按月 page, 合计, the numbers that open, the four file buttons", () => {
    const html = render(<RentalStatementWindow id="st-1" onClose={() => undefined} />, (qc) =>
      qc.setQueryData(["rental-statements", "detail", "st-1"], STATEMENT),
    );
    const flat = text(html);
    for (const words of [
      "设备租赁月结单 EQ-MS001", "PUTRA MAS · HH machinery sb", "EQ0001 · Excavator", "按月 RM 18000.00",
      "19550.00", "合计", "EQ-RC001 · INV-88", "EQ-ST001 · PAID-01", "已结算",
      "这里只记录核对及结算结果，不涉及实际付款及财务操作。",
    ]) {
      expect(flat).toContain(words);
    }
    for (const action of ["preview", "print", "save", "share"]) expect(html).toContain(`data-slot="file-action-${action}"`);
    expect(html).toContain('href="/equipment-operator-hours?view=month&amp;month=2026-11&amp;equipment=e-1&amp;project=p-1"');
    // Settled: no 【作废】.
    expect(html).not.toContain('data-slot="cancel-statement-button"');
  });

  it("【作废】 only while 待核对", () => {
    const html = render(<RentalStatementWindow id="st-1" onClose={() => undefined} />, (qc) =>
      qc.setQueryData(["rental-statements", "detail", "st-1"], {
        ...STATEMENT,
        state: "PENDING",
        check: null,
        check_no: "",
        settlement_no: "",
      }),
    );
    expect(html).toContain('data-slot="cancel-statement-button"');
    expect(text(html)).toContain("待核对");
  });

  it("the lines total the five amounts", () => {
    const html = render(<StatementLines lines={[LINE]} totals={STATEMENT} project="p-1" />);
    expect(html).toContain('data-slot="statement-total-rental_total"');
    expect(monthHref("p-1", "e-1", "2026-11")).toBe("/equipment-operator-hours?view=month&month=2026-11&equipment=e-1&project=p-1");
  });

  it("the 按月 page opens on the machine and month the address names", () => {
    const hours = read("src/components/equipment-hours/equipment-operator-hours.tsx");
    expect(hours).toMatch(/useState<View>\(address\.get\("view"\) === "month" \? "month" : "day"\)/);
    expect(hours).toMatch(/useState\(address\.get\("equipment"\) \|\| ALL\)/);
  });

  it("a printed or sent statement's log row opens it on its page", async () => {
    const { PAGE_ONLY } = await import("@/lib/log-record-open");
    expect(PAGE_ONLY.EQUIPMENT_RENTAL_STATEMENT("st-1")).toBe("/equipment-rental-statements?statement=st-1");
  });
});
