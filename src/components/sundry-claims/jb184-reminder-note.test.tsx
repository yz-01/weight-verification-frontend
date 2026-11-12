/**
 * JB184-4 杂费报销的详情写明提醒规则 (客户 11-13 事项 3):
 *
 *   「请说明目前系统实际的提醒规则。我认为该比事项还没确认完毕，确认上传凭证48小时
 *   体检通知双方」 - Lucas: 「没完成就每48小时提醒」.
 *
 * A claim that is not finished says, at the top of its detail (office and
 * phone): 「这一笔还没走完。系统每 48 小时提醒一次提交的人和要处理的人，直到确认
 * 已付款（或拒绝、撤回）。」 and, once reminded, 「已经提醒 n 次，上一次：日期时间。」
 * A finished claim says nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-office" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
  recordConversationKey: (kind: string, id: string) => ["record-conversation", kind, id],
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));
vi.mock("@/components/shared/record-closure", () => ({
  RecordClosurePanel: () => <div data-stub="closure" />,
  useRecordArchived: () => false,
  recordClosureKey: (kind: string, id: string) => ["record-closure", kind, id],
}));

const { RECORDER, renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { SundryReminderNote, sundryReminderOpen } = await import(
  "@/components/sundry-claims/sundry-reminder-note"
);
const { SundryClaimDetail } = await import("@/components/sundry-claims/sundry-claims-office");

const RULE = "这一笔还没走完。系统每 48 小时提醒一次提交的人和要处理的人，直到确认已付款（或拒绝、撤回）。";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function claim(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    claim_no: "CLM-P1-2611-001",
    project: "p1",
    project_name: "Tower A",
    project_code: "P1",
    amount: "38.50",
    description: "Gloves",
    state: "SUBMITTED",
    payment_state: "NOT_RECEIVED",
    is_paid: false,
    captured_at: "2026-11-09T02:00:00Z",
    latitude: null,
    longitude: null,
    submitted_by: "u1",
    submitted_by_name: RECORDER.created_by_name,
    review_note: "",
    reviewed_by_name: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    paid_by_name: null,
    paid_by_user_id: null,
    paid_at: null,
    payment_note: "",
    attachments: [],
    payment_proofs: [],
    category: null,
    category_name: null,
    created_at: "2026-11-09T02:00:00Z",
    reminder_hours: 48,
    reminder_count: 0,
    reminded_at: null,
    ...RECORDER,
    ...overrides,
  };
}

function office(record: ReturnType<typeof claim>) {
  return renderDetail(<SundryClaimDetail id="c1" onClose={() => {}} />, (client) =>
    client.setQueryData(["sundry-claims", "detail", "c1"], record),
  );
}

describe("JB184-4 the rule on the claim", () => {
  it("is shown only while the claim waits for 确认 or for payment", () => {
    expect(sundryReminderOpen("SUBMITTED")).toBe(true);
    expect(sundryReminderOpen("CONFIRMED")).toBe(true);
    for (const finished of ["PAID", "REJECTED", "CANCELLED", "", null, undefined]) {
      expect(sundryReminderOpen(finished)).toBe(false);
    }
  });

  it("says the rule, and nothing about reminders before the first one", () => {
    const html = renderDetail(<SundryReminderNote status="SUBMITTED" hours={48} count={0} lastAt={null} />);
    expect(html).toContain(RULE);
    expect(html).not.toContain("已经提醒");
  });

  it("says how many reminders went and when the last one did", () => {
    const html = renderDetail(
      <SundryReminderNote status="CONFIRMED" hours={48} count={2} lastAt="2026-11-13T02:00:00Z" />,
    );
    expect(html).toContain(RULE);
    expect(html).toMatch(/已经提醒 2 次，上一次：[^<]*2026[^<]*10:00[^<]*。/);
  });

  it("says nothing on a finished claim", () => {
    for (const status of ["PAID", "REJECTED", "CANCELLED"]) {
      expect(renderDetail(<SundryReminderNote status={status} hours={48} count={3} lastAt="2026-11-13T02:00:00Z" />)).toBe("");
    }
  });

  it("is at the top of the office's detail while the claim is not finished", () => {
    const waiting = office(claim({ reminder_count: 1, reminded_at: "2026-11-11T02:00:00Z" }));
    expect(waiting).toContain('data-slot="sundry-reminder"');
    expect(waiting).toContain(RULE);
    expect(waiting).toContain("已经提醒 1 次，上一次：");
    const unpaid = office(claim({ state: "CONFIRMED", reviewed_at: "2026-11-10T02:00:00Z" }));
    expect(unpaid).toContain(RULE);
    const paid = office(claim({ state: "CONFIRMED", payment_state: "RECEIVED", is_paid: true, reminder_count: 3 }));
    expect(paid).not.toContain('data-slot="sundry-reminder"');
    const rejected = office(claim({ state: "REJECTED", review_note: "Wrong project" }));
    expect(rejected).not.toContain('data-slot="sundry-reminder"');
  });

  it("is on the phone's 我的提交 detail of the same claim, from the server's figures", () => {
    const phone = source("src/components/field-staff/my-submissions.tsx");
    expect(phone).toMatch(
      /row\.kind === "SUNDRY_CLAIM" && \(\n\s*<SundryReminderNote\n\s*status=\{detail\.data\.status \?\? row\.status\}\n\s*hours=\{detail\.data\.reminder_hours\}\n\s*count=\{detail\.data\.reminder_count\}\n\s*lastAt=\{detail\.data\.reminded_at\}/,
    );
  });

  it("has the words in all four languages", async () => {
    for (const language of ["zh", "zh-TW", "en", "ms"]) {
      const messages = JSON.parse(source(`src/messages/${language}.json`));
      const words = messages.sundryClaim.reminder;
      expect(words.rule).toContain("{hours}");
      expect(words.sent).toContain("{at}");
      expect(words.sent).toMatch(/count/);
    }
  });
});
