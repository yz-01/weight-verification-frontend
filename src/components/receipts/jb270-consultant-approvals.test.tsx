/**
 * JB270 (客户 11-26 事项 11, 图 13–14): 「顾问审批记录」 on a delivery, between
 * 「验收」 and 「签名」: application number, latest version, status, decision
 * time; a row opens the application (its report and certificates). Read
 * only - the delivery's own 验收 is untouched.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReceiptConsultantApproval } from "@/interfaces/contractor";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, isLoading: false, can: () => true }),
}));

const { ConsultantApprovalsList } = await import("@/components/receipts/consultant-approvals-panel");

const approved: ReceiptConsultantApproval = {
  id: "a-1",
  application_no: "CA-PRJ-0003-012",
  revision: 1,
  status: "APPROVED",
  decided_at: "2026-11-25T08:00:00Z",
  submitted_at: "2026-11-24T08:00:00Z",
  application_type: "Material Approval",
  has_final_report: true,
  attachment_count: 2,
  can_open: true,
};

function render(rows: ReceiptConsultantApproval[], messages: Record<string, unknown> = zh) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <ConsultantApprovalsList rows={rows} />
    </NextIntlClientProvider>,
  );
}

describe("JB270 顾问审批记录", () => {
  it("lists number, version, status and decision time, and opens the application", () => {
    const html = render([approved]);
    expect(html).toContain("顾问审批记录");
    expect(html).toContain("CA-PRJ-0003-012 · 版本 1");
    expect(html).toContain("已批准");
    expect(html).toContain("审批时间");
    expect(html).toContain('href="/consultant-applications/a-1"');
    expect(html).toContain("查看审批报告及材料证书");
  });

  it("says a waiting one is not decided, and gives no link to a reader who may not open it", () => {
    const html = render([{ ...approved, status: "SUBMITTED", decided_at: null, can_open: false }]);
    expect(html).toContain("待审批");
    expect(html).toContain("还没审批");
    expect(html).not.toContain("href=");
  });

  it("says when nothing is linked, and that 验收 stays its own", () => {
    const html = render([]);
    expect(html).toContain("还没有顾问申请关联这笔进场的照片。");
    expect(html).toContain("不会改变这笔进场的验收状态");
  });

  it("sits between 验收 and 签名 on the delivery", () => {
    const source = readFileSync("src/components/receipts/view-receipt.tsx", "utf-8");
    // The shell's `aside` place: under the buttons (验收, 确认归档), above 签名.
    expect(source).toContain("aside={<ConsultantApprovalsPanel receiptId={data.id} />}");
    const shell = readFileSync("src/components/shared/record-detail-shell.tsx", "utf-8");
    const aside = shell.indexOf('{aside ? <div className="order-6');
    const signatures = shell.indexOf('<ShellPanel title={t("signatures")} className="order-7">');
    expect(aside).toBeGreaterThan(-1);
    expect(signatures).toBeGreaterThan(aside);
  });

  it("has its words in all four languages, 你 only", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(Object.keys(messages.jb270).sort()).toEqual(Object.keys(zh.jb270).sort());
    }
    expect(JSON.stringify(zh.jb270)).not.toContain("您");
  });
});
