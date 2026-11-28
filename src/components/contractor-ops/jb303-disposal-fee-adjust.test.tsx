/**
 * JB303 (客户 11-28f): 垃圾清运费用与结算.
 *
 * > 「清运费用设定」继续保留，按照不同项目、不同供应商分别设定每车清运单价。
 * > 正式垃圾清运记录不需要填写费用，只记录实际验收车次及相关证据。
 * > 结算时，系统自动带出对应项目及供应商的每车单价，根据实际验收车次计算费用。如实际单价不同，
 * > 可在确认核对前调整。
 * > 结算完毕后，金额自动锁定，并关联至对应项目的「项目现场费用总览」。
 * > 项目现场费用总览只累计已结算金额，避免重复计算。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/waste-clearance",
  useSearchParams: () => new URLSearchParams("kind=settlement"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Site Office", email: "office@x.test", is_field_staff: false },
    can: () => true,
  }),
}));
type Call = (...args: unknown[]) => Promise<unknown>;
const api = vi.hoisted(() => ({
  get: vi.fn<Call>(async () => ({})),
  post: vi.fn<Call>(async () => ({ number: "CS-PRJ-0003-002" })),
}));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api: { get: api.get, post: api.post, list: api.get },
}));

const service = await import("@/services/disposal-settlement.service");
const { ConfirmCheckDialog, SettlementLinesTable } = await import("@/components/contractor-ops/disposal-settlements");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => api.post.mockClear());

const ROW = {
  disposal_id: "d-1",
  reference_no: "DISP-PRJ-0003-010",
  project: { id: "p-3", name: "PUTRA_MAS" },
  supplier: { id: "s-1", name: "AAA Supplier" },
  cleared_on: "2026-11-20",
  trip_count: 5,
  fee_per_trip: "350.00",
  fee_amount: "1750.00",
  can_tick: true,
  cannot_tick_reason: null,
};

describe("「系统自动带出…每车单价，根据实际验收车次计算费用。如实际单价不同，可在确认核对前调整」", () => {
  it("the window brings the set price and the accepted trips, and each price can be typed", () => {
    const html = render(<ConfirmCheckDialog rows={[ROW]} onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain('data-slot="settlement-adjust"');
    expect(html).toContain(zh.jb303.help);
    expect(html).toContain(zh.jb303.price);
    expect(html).toContain('value="350.00"');
    expect(text(html)).toContain("1,750.00");
    // Nothing changed yet: no reason asked.
    expect(html).not.toContain(zh.jb303.reason);
  });

  it("no price box for an account that sees no amounts", () => {
    const html = render(<ConfirmCheckDialog rows={[ROW]} amountsHidden onClose={() => {}} onSaved={() => {}} />);
    expect(html).not.toContain('data-slot="settlement-adjust"');
  });

  it("the call carries the typed prices and the reason only when one changed", async () => {
    await service.createDisposalSettlement(["d-1"]);
    expect(api.post).toHaveBeenLastCalledWith("/api/disposal-settlements/", { disposal_ids: ["d-1"] });
    await service.createDisposalSettlement(["d-1"], { fees: { "d-1": "380.00" }, reason: "合同补充" });
    expect(api.post).toHaveBeenLastCalledWith("/api/disposal-settlements/", {
      disposal_ids: ["d-1"],
      fees: { "d-1": "380.00" },
      adjust_reason: "合同补充",
    });
    await service.createDisposalSettlement(["d-1"], { fees: {}, reason: "" });
    expect(api.post).toHaveBeenLastCalledWith("/api/disposal-settlements/", { disposal_ids: ["d-1"] });
  });
});

describe("「结算完毕后，金额自动锁定」: the settlement shows the set price beside an adjusted one and why", () => {
  it("lists both and the reason", () => {
    const html = render(
      <SettlementLinesTable
        settlement={{
          id: "st-2", number: "CS-PRJ-0003-002", project: ROW.project, supplier: ROW.supplier,
          date_from: "2026-11-20", date_to: "2026-11-20", trip_total: 5, weight_total_kg: "0.00",
          amount_total: "1900.00", line_count: 1, status: "SETTLED", checked_by_name: "mike",
          checked_at: "2026-11-28T03:00:00Z", settled_by_name: "mike", settled_at: "2026-11-28T04:00:00Z",
          adjust_reason: "供应商加价，合同补充协议",
          lines: [{
            disposal_id: "d-1", reference_no: ROW.reference_no, cleared_on: "2026-11-20", trip_count: 5,
            fee_per_trip: "380.00", fee_amount: "1900.00", set_fee_per_trip: "350.00", fee_adjusted: true, weight_kg: null,
          }],
        } as never}
      />,
    );
    expect(html).toContain('data-slot="settlement-line-adjusted"');
    expect(text(html)).toContain("设定 RM");
    expect(html).toContain("供应商加价，合同补充协议");
  });
});

describe("every language has the words", () => {
  it("jb303 and the three refusals", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(Object.keys(messages.jb303).sort()).toEqual(Object.keys(zh.jb303).sort());
      expect(messages.errors.api.disposal_fee_adjust_invalid).toContain("{reference}");
      expect(messages.errors.api.disposal_fee_adjust_reason_required).toBeTruthy();
      expect(messages.errors.api.disposal_fee_adjust_amounts_off).toBeTruthy();
    }
  });
});
