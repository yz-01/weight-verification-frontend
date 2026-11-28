/**
 * JB307-7 / JB308 (客户 11-28j 第 7 点, 11-28k): the 核对 / 结算 vouchers on the
 * original record - the Multi Engine package, 设备租赁月结单, 人工月结单,
 * 材料退场 / 领用 - one shared block.
 *
 * 「将核对金额、结算金额、凭证编号、凭证照片或文件、操作人及日期时间全部关联回原始
 * 资料包，供有权限的人员查看、预览及打印」; 「相关凭证必须能够从原始记录直接查看、
 * 预览、打印及导出」.
 *
 * The runner has no DOM: static markup and the source text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/evidence-packages",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  CURRENT_USER_KEY: ["auth", "me"],
  useAuth: () => ({
    user: { id: "u-1", full_name: "mike", is_field_staff: false, account_type: "TENANT" },
    can: () => true,
    refresh: async () => {},
  }),
}));
const money = { sees: true };
vi.mock("@/hooks/use-sees-amounts", () => ({ useSeesAmounts: () => money.sees }));

const { ReconciliationVouchers } = await import("@/components/contractor-ops/reconciliation-vouchers");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const SETTLED = {
  state: "SETTLED" as const,
  kind: "CLAIM" as const,
  check_id: "chk-1",
  check_no: "CL-RC001",
  voucher_no: "PV 1233",
  checked_by_name: "mike",
  checked_at: "2026-11-28T05:04:00Z",
  settlement_id: "st-1",
  settlement_no: "CL-ST001",
  settled_by_name: "测试建筑商 1",
  settled_at: "2026-11-28T06:02:00Z",
  check_voucher_no: "PV 1233",
  check_note: "",
  check_item_count: 1,
  checked_amount: "200000.00",
  checked_reason: "",
  check_vouchers: [],
  settlement_voucher_no: "PVC 1233",
  settlement_note: "",
  settlement_item_count: 1,
  settled_amount: "200000.00",
  settlement_vouchers: [],
};

describe("the shared 核对与结算 block (JB307-7 / JB308)", () => {
  it("shows 核对编号, 核对金额, 凭证编号, who and when, and both voucher slots", () => {
    money.sees = true;
    const shown = render(<ReconciliationVouchers links={SETTLED} />);
    const words = text(shown);
    for (const piece of [
      "核对与结算",
      "核对编号",
      "CL-RC001",
      "核对金额",
      "RM 200000.00",
      "核对凭证编号",
      "PV 1233",
      "mike",
      "结算编号",
      "CL-ST001",
      "结算金额",
      "结算凭证编号",
      "PVC 1233",
      "测试建筑商 1",
    ]) {
      expect(words).toContain(piece);
    }
    // Both voucher panels (read only: 查看 / 预览 / 打印 / 下载 in the panel).
    expect(words).toContain("核对凭证");
    expect(words).toContain("结算凭证");
    expect(shown).toContain('data-slot="reconciliation-vouchers-checked-amount"');
    expect(shown).toContain('data-slot="reconciliation-vouchers-settled-amount"');
  });

  it("a changed 核对金额 says why; several records settled together say so", () => {
    money.sees = true;
    const words = text(
      render(
        <ReconciliationVouchers
          links={{ ...SETTLED, checked_amount: "70000.00", checked_reason: "扣保留金", settlement_item_count: 3 }}
        />,
      ),
    );
    expect(words).toContain("与批准金额不同，原因：扣保留金");
    expect(words).toContain("本结算单一共 3 笔的合计");
  });

  it("checked, not settled: the 结算 side says so", () => {
    money.sees = true;
    const shown = render(
      <ReconciliationVouchers
        links={{ ...SETTLED, state: "CHECKED", settlement_id: null, settlement_no: "", settled_at: null }}
      />,
    );
    expect(shown).toContain('data-slot="reconciliation-vouchers-not-settled"');
    expect(text(shown)).toContain("已核对，还没有结算。");
  });

  it("without 「金额查看」 no amount; a locked package says why", () => {
    money.sees = false;
    const shown = render(<ReconciliationVouchers links={SETTLED} />);
    expect(shown).not.toContain("RM 200000.00");
    const locked = render(<ReconciliationVouchers links={{ locked: true }} />);
    expect(locked).toContain('data-slot="reconciliation-vouchers-locked"');
    expect(text(locked)).toContain("你的账号关闭了「金额查看」");
    money.sees = true;
  });

  it("nothing before 核对", () => {
    expect(render(<ReconciliationVouchers links={null} />)).toBe("");
  });

  it("every language has the words", () => {
    const keys = Object.keys(zh.jb307Vouchers);
    for (const catalogue of [en, ms, zhTW]) {
      expect(Object.keys(catalogue.jb307Vouchers).sort()).toEqual([...keys].sort());
    }
  });

  it("is on every original record's window", () => {
    expect(read("src/components/contractor-ops/multi-engine.tsx")).toContain(
      "<ReconciliationVouchers links={data.reconciliation} />",
    );
    expect(read("src/components/equipment-hours/rental-statements.tsx")).toContain(
      '<ReconciliationVouchers links={{ ...data.check, kind: "RENTAL" }} />',
    );
    expect(read("src/components/labour/labour-statements.tsx")).toContain(
      "<ReconciliationVouchers links={data.links} />",
    );
    expect(read("src/components/contractor-ops/operations-workspaces.tsx")).toContain(
      "<ReconciliationVouchers links={row.reconciliation} stacked />",
    );
  });
});
