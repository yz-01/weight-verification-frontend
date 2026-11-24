/**
 * JB252 / JB254 (客户 11-24 事项 3, 11-24b 事项 1): Multi Engine's signed
 * review loop on the screen.
 *
 * - 「审阅」 says exactly the client's seven words, in all four languages,
 *   and 「已确认（已锁定）」 only means locked - 「已完成（已归档）」 once closed.
 * - The review window: 确认通过 / 退回补充资料 per record, 全部确认, 审核意见,
 *   the signature pad; 本期批准金额 only when the review approves a money
 *   type, with the difference worked out as it is typed.
 * - The signatures of every round are listed, both sides.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  EvidencePackageDetail,
  PackageSignature,
} from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, isLoading: false, can: () => true }),
}));

const loop = await import("@/components/contractor-ops/package-review-loop");

function render(node: React.ReactNode, messages: Record<string, unknown> = zh) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale="zh"
        messages={messages}
        timeZone="Asia/Kuala_Lumpur"
      >
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const pkg = (
  over: Partial<EvidencePackageDetail> = {},
): EvidencePackageDetail =>
  ({
    id: "p-1",
    package_no: "PKG-PRJ-0003-007",
    name: "contractor claim",
    remarks: "",
    package_type: "PROGRESS_CLAIM",
    state: "CONFIRMED",
    project: "pr-1",
    project_name: "PUTRA_MAS",
    created_at: "2026-11-13T05:00:00Z",
    created_by_name: "mike",
    confirmed_at: "2026-11-13T05:00:00Z",
    pdf_sha256: "",
    pdf_bytes: 0,
    merge_report: [],
    review_state: "SENT",
    review_progress: "VIEWED",
    sent_at: null,
    sent_to: null,
    sent_to_name: "",
    exported_at: null,
    item_count: 2,
    returned_count: 0,
    can_delete: false,
    can_return: true,
    claim_amount: "12500.00",
    money: {
      claim_amount: "12500.00",
      approved_amount: null,
      difference: null,
      approved_amount_reason: "",
      approved_at: null,
      locked: false,
    },
    items: [],
    ...over,
  }) as EvidencePackageDetail;

describe("「审阅」 in the client's words", () => {
  const table: Record<string, string> = {
    NOT_SENT: "未发送",
    SENT: "已发送，待审核",
    VIEWED: "已查看，待审核",
    IN_REVIEW: "审核处理中",
    RETURNED: "退回补充资料",
    APPROVED: "审核通过，待完成确认",
    COMPLETED: "审核完成",
  };

  it("says each of the seven exactly as the client's table", () => {
    for (const [code, words] of Object.entries(table)) {
      expect(
        (zh as unknown as { jb252: { progress: Record<string, string> } }).jb252
          .progress[code],
      ).toBe(words);
    }
  });

  it("has every word in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const group = (
        messages as unknown as {
          jb252: { progress: Record<string, string>; stateCompleted: string };
        }
      ).jb252;
      for (const code of Object.keys(table))
        expect(group.progress[code]).toBeTruthy();
      expect(group.stateCompleted).toBeTruthy();
    }
  });

  it("says 已完成（已归档） once the loop is closed, 已确认（已锁定） before", () => {
    const t = (key: string) =>
      key === "state.CONFIRMED" ? "已确认（已锁定）" : key;
    const words = (key: string) =>
      key === "stateCompleted" ? "已完成（已归档）" : key;
    expect(
      loop.packageStateLabel(
        { state: "CONFIRMED", completed_at: null },
        t,
        words,
      ),
    ).toBe("已确认（已锁定）");
    expect(
      loop.packageStateLabel(
        { state: "CONFIRMED", completed_at: "2026-11-24T01:00:00Z" },
        t,
        words,
      ),
    ).toBe("已完成（已归档）");
  });
});

describe("the review window", () => {
  const records = [
    { id: "i-1", label: "GRN-001", mine: "PENDING" as const },
    { id: "i-2", label: "GRN-002", mine: "PENDING" as const },
  ];

  it("offers 确认通过 / 退回补充资料 per record, 全部确认, the opinion and the signature", () => {
    const html = render(
      <loop.ReviewDialog
        pkg={pkg()}
        records={records}
        onClose={() => {}}
        submit={async () => {}}
        onDone={() => {}}
      />,
    );
    expect(html).toContain("确认通过");
    expect(html).toContain("退回补充资料");
    expect(html).toContain("全部确认");
    expect(html).toContain("审核意见（备注）");
    expect(html).toContain("电子签名");
    expect(html).toContain("签名提交审核结果");
    // Nothing chosen yet: not an approval, so no approved amount.
    expect(html).not.toContain("本期批准金额");
  });

  it("approves only when every record ends up confirmed", () => {
    expect(loop.reviewApproves(records, { "i-1": "ACCEPTED" })).toBe(false);
    expect(
      loop.reviewApproves(records, { "i-1": "ACCEPTED", "i-2": "ACCEPTED" }),
    ).toBe(true);
    expect(
      loop.reviewApproves(records, { "i-1": "ACCEPTED", "i-2": "RETURNED" }),
    ).toBe(false);
    expect(
      loop.reviewApproves(
        [{ id: "i-1", label: "A", mine: "ACCEPTED" }, records[1]],
        { "i-2": "ACCEPTED" },
      ),
    ).toBe(true);
    expect(
      loop.reviewApproves([{ id: "i-1", label: "A", mine: "RETURNED" }], {}),
    ).toBe(false);
  });

  it("works out 差额 from the claim and the approved amount", () => {
    expect(loop.amountDifference("12500.00", "12000")).toBe("500.00");
    expect(loop.amountDifference("12500.00", "12,500.00")).toBe("0.00");
    expect(loop.amountDifference(null, "100")).toBeNull();
    expect(loop.amountDifference("100", " ")).toBeNull();
  });

  it("only the two money types carry amounts", () => {
    expect(loop.isMoneyType({ package_type: "PROGRESS_CLAIM" })).toBe(true);
    expect(loop.isMoneyType({ package_type: "SUNDRY_CLAIM" })).toBe(true);
    expect(loop.isMoneyType({ package_type: "SAFETY_INCIDENT" })).toBe(false);
  });
});

describe("signatures and money on the package", () => {
  const signature = (over: Partial<PackageSignature>): PackageSignature => ({
    id: "s-1",
    round_no: 1,
    side: "SENDER",
    action: "SUBMITTED",
    recipient: null,
    recipient_name: "",
    recipient_kind: "",
    signer_name: "mike",
    signed_at: "2026-11-13T05:03:00Z",
    opinion: "contractor claim",
    decisions: [],
    claim_amount: "12500.00",
    approved_amount: null,
    amount_reason: "",
    round_sha256: "abc",
    signature_url: "https://files.test/s1.png",
    ...over,
  });

  it("lists both sides of every round with the opinion and the picture", () => {
    const html = render(
      <loop.SignaturesBlock
        signatures={[
          signature({}),
          signature({
            id: "s-2",
            side: "REVIEWER",
            action: "RETURNED",
            recipient_name: "总部（系统内）",
            signer_name: "hq",
            opinion: "DO 照片看不清",
            decisions: [
              {
                item: "i-2",
                record_kind: "MATERIAL_RECEIPT",
                reference: "GRN-002",
                decision: "RETURNED",
                reason: "重拍",
              },
            ],
          }),
        ]}
      />,
    );
    expect(html).toContain("签名及审核记录");
    expect(html).toContain("项目经理签名提交");
    expect(html).toContain("审核人签名");
    expect(html).toContain("退回补充资料");
    expect(html).toContain("DO 照片看不清");
    expect(html).toContain("GRN-002");
    expect(html).toContain("https://files.test/s1.png");
  });

  it("shows the claim, the approved amount, the difference and the reason", () => {
    const html = render(
      <loop.MoneyBlock
        pkg={pkg({
          money: {
            claim_amount: "12500.00",
            approved_amount: "12000.00",
            difference: "500.00",
            approved_amount_reason: "第三项少 RM 500",
            approved_at: "2026-11-24T01:00:00Z",
            locked: true,
          },
        })}
      />,
    );
    expect(html).toContain("申请金额（RM）");
    expect(html).toContain("本期批准金额（RM）");
    expect(html).toContain("差额（RM）");
    expect(html).toContain("RM 12,000.00");
    expect(html).toContain("RM 500.00");
    expect(html).toContain("第三项少 RM 500");
    expect(html).toContain("已锁定");
  });

  it("offers 确认完毕并归档 only when everything is approved", () => {
    expect(
      render(
        <loop.CompletePanel
          pkg={pkg({ can_complete: true })}
          onChanged={() => {}}
        />,
      ),
    ).toContain("确认完毕并归档");
    expect(
      render(
        <loop.CompletePanel
          pkg={pkg({ can_complete: false })}
          onChanged={() => {}}
        />,
      ),
    ).toBe("");
  });
});
