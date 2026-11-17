/**
 * JB215B (walk 11-17): the recycler's 账单 page showed MSE's own texts.
 *
 * 账单与佣金 is one component for MSE Admin and a customer company. A recycler
 * admin read 「管理 SaaS 收费、平台佣金、账单及收款」, MSE's five charging steps
 * (第 2 步 生成账单 … 确认收款) and MSE's receivable tiles (本月 SaaS 应收 / 已收).
 * The tiles' figures were the company's own (`billing/views.py` get_summary
 * scopes a tenant to its company), so this is wording, not a leak. A customer
 * now gets its own plain header - its bills from MSE, what it owes and has
 * paid - and no workflow or tiles; MSE Admin's page is unchanged.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ portal: "MSE_SCRAP", codes: new Set<string>(["billing.view", "billing.pay"]) }));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn() }));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/billing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", portal: reader.portal, company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: (code: string) => reader.codes.has(code),
  }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { BillingWorkspace } = await import("@/components/billing/billing-workspace");
const { PaymentManager } = await import("@/components/billing/payment-manager");
const { helpKeyFor } = await import("@/lib/page-help");

const words = zh.billing;
const SUMMARY = {
  saas: { billed: "100.00", collected: "50.00", outstanding: "50.00", overdue: "0.00", open_count: 1 },
  commission: { billed: "0.00", collected: "0.00", outstanding: "0.00", overdue: "0.00", open_count: 0 },
  pending_payment_review: 0,
  period_start: "2026-11-01",
  period_end: "2026-11-17",
};

function render(portal: string, codes: string[]) {
  reader.portal = portal;
  reader.codes = new Set(codes);
  return renderDetail(<BillingWorkspace />, (client) => client.setQueryData(["billing", "summary"], SUMMARY));
}

describe("JB215B a customer's 账单 page", () => {
  it("has its own plain header", () => {
    const html = render("MSE_SCRAP", ["billing.view", "billing.pay"]);
    expect(html).toContain(words.own.title);
    expect(html).toContain(words.own.subtitle);
    expect(html).not.toContain(words.subtitle);
  });

  it("shows neither MSE's charging steps nor MSE's receivable tiles", () => {
    const html = render("MSE_SCRAP", ["billing.view", "billing.pay"]);
    expect(html).not.toContain(words.workflow.title);
    expect(html).not.toContain(words.workflow.step.generate);
    expect(html).not.toContain(words.metric.saasBilled);
    expect(html).not.toContain(words.metric.saasCollected);
    // Its own bills are still one tap away.
    expect(html).toContain('href="/billing/search"');
  });

  it("is unchanged for MSE Admin", () => {
    const html = render("MSE_ADMIN", ["billing.view", "billing.manage", "billing.collect"]);
    expect(html).toContain(words.subtitle);
    expect(html).toContain(words.workflow.title);
    expect(html).toContain(words.workflow.step.generate);
    expect(html).toContain(words.metric.saasBilled);
    expect(html).not.toContain(words.own.subtitle);
  });

  it("is said in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.billing.own.title).toBeTruthy();
      expect(messages.billing.own.subtitle).toBeTruthy();
    }
  });
});

describe("JB215B the rest of a customer's 账单 pages", () => {
  it("open the customer's own help, not MSE's", () => {
    expect(helpKeyFor("MSE_SCRAP", "/billing")).toBe("billing_customer");
    expect(helpKeyFor("MSE_SCRAP", "/billing/payment-proofs")).toBe("billing_customer");
    expect(helpKeyFor("MSE_ADMIN", "/billing/search")).toBe("billing_commission");
    for (const messages of [zh, zhTW, en, ms]) {
      for (const section of ["what", "who", "need", "then", "trouble"] as const) {
        expect(messages.pageHelp.billing_customer[section], section).toBeTruthy();
      }
    }
    expect(Object.values(zh.pageHelp.billing_customer).join("")).not.toContain("平台的两笔钱");
  });

  it("word the payment button from the customer's side", () => {
    reader.portal = "MSE_SCRAP";
    reader.codes = new Set(["billing.view", "billing.pay"]);
    const own = renderDetail(<PaymentManager proofsOnly />);
    expect(own).toContain(words.payment.recordOwn);
    expect(own).not.toContain(words.payment.record);
    reader.portal = "MSE_ADMIN";
    reader.codes = new Set(["billing.view", "billing.pay", "billing.collect"]);
    expect(renderDetail(<PaymentManager proofsOnly />)).toContain(words.payment.record);
  });
});
