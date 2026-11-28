/**
 * JB304 (客户 11-28g): 「原始记录已经被拒绝，不能通过 Multi Engine 打包审批重新变成有效报销」
 * 「已拒绝的原始记录不得参与正式审批及结算，也不得计入项目现场费用总览」「原有拒绝记录及历史证据必须
 * 完整保留」.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1", is_field_staff: false }, can: () => true }),
}));

const { ClaimFacetBlock } = await import("@/components/contractor-ops/package-claim-facet");
const { TooltipProvider } = await import("@/components/ui/tooltip");

function render(node: React.ReactNode) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("杂费合计 never adds a rejected / withdrawn 杂费报销", () => {
  it("lists it as 已拒绝 · 不计入 and says why above", () => {
    const html = render(
      <ClaimFacetBlock
        onChanged={() => {}}
        facet={{
          type: "SUNDRY_CLAIM",
          claim: null,
          sundry_total: "200.00",
          ended_count: 1,
          sundry: [
            { id: "c-8", claim_no: "CLM-PRJ-0003-2611-08", amount: "300.00", state: "REJECTED", payment_state: "NOT_RECEIVED", payment_proof_count: 0, counted: false },
            { id: "c-7", claim_no: "CLM-PRJ-0003-2611-07", amount: "200.00", state: "CONFIRMED", payment_state: "RECEIVED", payment_proof_count: 1, counted: true },
          ],
        } as never}
      />,
    );
    expect(html).toContain("200.00");
    expect(html).toContain('data-slot="sundry-ended-note"');
    expect(html).toContain(zh.multiEngine.claimFacet.rejected);
    expect(html).toContain(zh.multiEngine.claimFacet.notCounted);
    expect(html).toContain('data-sundry-counted="no"');
  });
});

describe("every language has the words", () => {
  it("the facet, the tick reason and the refusal", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.multiEngine.claimFacet.endedNote).toContain("{count}");
      expect(messages.multiEngine.collect.reason.ended).toBeTruthy();
      expect(messages.errors.api.package_ended_record).toContain("{records}");
    }
  });
});
