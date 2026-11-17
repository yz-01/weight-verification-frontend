/**
 * JB215B-11 (Lucas 11-17: fix everything found that no rule settles) - a
 * wrong partner payout.
 *
 * Since JB209-15 a rejected payout is final and frees its period, so the way
 * to correct one is 「驳回, then calculate that partner and period again」 -
 * but nothing on screen said so or helped. A rejected row now says how, and
 * 【重新计算这一期】 makes the new draft through the same endpoint as
 * 「计算佣金」 (no new server rule; a refusal is the server's own sentence,
 * worded by the API client). Once the period has a new payout, the rejected
 * row names it instead of offering the button again.
 *
 * Rendered to static markup with the queries answered from the cache, or read
 * from the source (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { PartnerCommissionPayout } from "@/interfaces/partner";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ codes: new Set<string>(["partner.view", "partner.manage"]) }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-admin", company_type: null, is_platform_staff: true },
    can: (code: string) => reader.codes.has(code),
  }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { PartnerManagementWorkspace, laterPayoutFor } = await import(
  "@/components/partners/partner-management-workspace"
);

const workspace = readFileSync(
  path.join(process.cwd(), "src/components/partners/partner-management-workspace.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const words = zh.adminPartnerManagement;

function payout(id: string, state: string, overrides: Partial<PartnerCommissionPayout> = {}): PartnerCommissionPayout {
  return {
    id, payout_code: `PCOM-2026-000${id}`, partner: { id: "p-1", code: "PART-0001", name: "Lim Install" },
    period_start: "2026-10-01", period_end: "2026-10-31", new_customers: 1, saas_revenue: "100.00",
    platform_commission_revenue: "0.00", gross_amount: "100.00", adjustment: "0.00", net_amount: "100.00",
    paid_on: null, state, payment_reference: "", payment_proof: null, ...overrides,
  } as unknown as PartnerCommissionPayout;
}

const page = <T,>(results: T[]) => ({
  pages: [{ count: results.length, page: 1, page_size: 100, total_pages: 1, results }],
  pageParams: [1],
});

function renderSchemes(payouts: PartnerCommissionPayout[], codes = ["partner.view", "partner.manage"]) {
  reader.codes = new Set(codes);
  try {
    return renderDetail(<PartnerManagementWorkspace section="schemes" />, (client) => {
      client.setQueryData(["partner-agreements", "schemes", "paged"], page([]));
      client.setQueryData(["partner-payouts", "paged"], page(payouts));
    });
  } finally {
    reader.codes = new Set(["partner.view", "partner.manage"]);
  }
}

describe("JB215B-11 a rejected payout says how to correct it", () => {
  it("offers 【重新计算这一期】 with a one-line hint", () => {
    const html = renderSchemes([payout("1", "REJECTED")]);
    expect(html).toContain(words.payout.rejectedRecalculate);
    expect(html).toContain(words.action.recalculatePeriod);
    expect(words.payout.rejectedRecalculate).toContain("【重新计算这一期】");
  });

  it("is not offered on a payout that is not rejected", () => {
    for (const state of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID"]) {
      const html = renderSchemes([payout("1", state)]);
      expect(html, state).not.toContain(words.action.recalculatePeriod);
      expect(html, state).not.toContain(words.payout.rejectedRecalculate);
    }
  });

  it("is not offered to whoever cannot calculate payouts", () => {
    const html = renderSchemes([payout("1", "REJECTED")], ["partner.view"]);
    expect(html).not.toContain(words.action.recalculatePeriod);
    expect(html).toContain(words.payout.rejectedClosed);
  });

  it("names the new payout once the period has one, instead of the button", () => {
    const rows = [payout("2", "DRAFT"), payout("1", "REJECTED")];
    const html = renderSchemes(rows);
    expect(html).toContain("这一期已重新计算：PCOM-2026-0002。");
    expect(html).not.toContain(words.action.recalculatePeriod);
  });
});

describe("JB215B-11 the payout that replaced a rejected one", () => {
  const rejected = payout("1", "REJECTED");

  it("is the same partner and period, not rejected", () => {
    expect(laterPayoutFor(rejected, [rejected, payout("2", "PENDING_APPROVAL")])?.id).toBe("2");
    expect(laterPayoutFor(rejected, [rejected, payout("3", "REJECTED")])).toBeUndefined();
    expect(laterPayoutFor(rejected, [rejected, payout("4", "DRAFT", { period_end: "2026-11-30" })])).toBeUndefined();
    expect(
      laterPayoutFor(rejected, [rejected, payout("5", "DRAFT", { partner: { id: "p-2", code: "PART-0002", name: "Other" } })]),
    ).toBeUndefined();
  });
});

describe("JB215B-11 the button asks the existing endpoint", () => {
  it("calculates the same partner and period as 「计算佣金」 does", () => {
    expect(workspace).toContain(
      "calculatePartnerPayout({ partner_id: row.partner.id, period_start: row.period_start, period_end: row.period_end })",
    );
    expect(workspace).toContain('onClick={() => recalculate.mutate(row)}');
  });

  it("is worded in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const partner = messages.adminPartnerManagement;
      expect(partner.action.recalculatePeriod).toBeTruthy();
      expect(partner.payout.rejectedRecalculate).toBeTruthy();
      expect(partner.payout.recalculated).toContain("{code}");
    }
  });
});
