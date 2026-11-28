/**
 * JB309 group E (客户 11-28l 第 2、4 点): 「根据项目、分包商、施工分类及日期范围，筛选…」
 * 「同一个施工分类下、同一笔已经申报的施工明细，不得重复申报工程款」「已经用于工程款申请的
 * 施工明细，必须显示所属 Claim 编号及当前审批、结算状态」. The server refuses; the picker and
 * the list's tick say so first.
 */
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

const { ClaimedByLine, ClaimScopeToggle, claimedByText } = await import(
  "@/components/contractor-ops/package-claim-ledger"
);

function render(node: React.ReactNode, messages: typeof zh = zh) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      {node}
    </NextIntlClientProvider>,
  );
}

const SETTLED = { package_no: "PKG-PRJ-0003-028", claim_ref_no: "ABC/PC/2611-01", stage: "SETTLED" as const };

describe("a claimed 施工明细 names its claim, Claim No. and state", () => {
  it("「已用于 PKG-… · Claim No. … · 已结算」", () => {
    const html = render(<ClaimedByLine claimed={SETTLED} />);
    expect(html).toContain("已用于 PKG-PRJ-0003-028 · Claim No. ABC/PC/2611-01 · 已结算");
    expect(html).toContain('data-slot="claimed-by"');
  });

  it("a claim made before JB309 has no Claim No.", () => {
    const html = render(<ClaimedByLine claimed={{ package_no: "PKG-PRJ-0003-010", claim_ref_no: "", stage: "IN_REVIEW" }} />);
    expect(html).toContain("已用于 PKG-PRJ-0003-010 · 审批中");
    expect(html).not.toContain("Claim No.");
  });

  it("every state has its words in every language", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const t = (key: string, values?: Record<string, string>) => {
        const path = key.split(".");
        let text = path.reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages.multiEngine);
        for (const [name, value] of Object.entries(values ?? {})) {
          text = String(text).replace(`{${name}}`, value);
        }
        return String(text);
      };
      for (const stage of ["DRAFT", "CONFIRMED", "IN_REVIEW", "RETURNED", "APPROVED", "COMPLETED", "CHECKED", "SETTLED"] as const) {
        const line = claimedByText(t, { ...SETTLED, stage });
        expect(line).toContain("PKG-PRJ-0003-028");
        expect(line).not.toContain("undefined");
        expect(line).not.toContain(stage);
      }
    }
  });
});

describe("the picker holds the claim's 施工分类 and dates by default", () => {
  it("says what it is narrowed by", () => {
    const html = render(
      <ClaimScopeToggle
        scope={{ narrowed: true, phase: "ph-1", phase_name: "Piling", work_from: "2026-11-01", work_to: "2026-11-15" }}
        checked
        onChange={() => {}}
      />,
    );
    expect(html).toContain(zh.multiEngine.claimLedger.scopeOnly);
    expect(html).toContain("Piling");
    expect(html).toContain("data-claim-only");
    expect(html).toContain('data-state="checked"');
  });

  it("an empty field reads 未填, never blank", () => {
    const html = render(
      <ClaimScopeToggle
        scope={{ narrowed: true, phase: null, phase_name: "", work_from: null, work_to: null }}
        checked={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain(`施工分类：${zh.multiEngine.claimLedger.notSet}`);
  });
});

describe("every language has the words", () => {
  it("the tick reason, the picker and the refusal", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.multiEngine.collect.reason.claimed).toContain("{used}");
      expect(messages.multiEngine.claimLedger.cannotPick).toBeTruthy();
      expect(messages.multiEngine.claimLedger.scopeDetail).toContain("{phase}");
      expect(messages.errors.api.package_record_claimed).toContain("{records}");
      expect(messages.errors.api.package_record_claimed).toContain("{packages}");
    }
  });
});
