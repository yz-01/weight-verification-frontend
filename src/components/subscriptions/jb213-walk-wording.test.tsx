/**
 * JB213 walk 11-17 (findings-1117-B): three places that left an older reader
 * guessing when the money starts.
 *
 * - 延长或续费 on a lapsed company says the renewal counts from today and the
 *   stopped time is not charged (JB215, Lucas 11-17 「从续期那天算」).
 * - 新增公司 on a trial package says the trial runs to its date and billing
 *   starts after 延长或续费, instead of 「将从今天开始新的订阅周期」.
 * - 生成账单 for a trial company: covered by the backend code
 *   `invoice_in_trial` and `jb213-plan-messages`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), list: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { SubscriptionActionDialog } = await import("@/components/subscriptions/subscription-action-dialog");

function subscription(overrides: Record<string, unknown>) {
  return {
    id: "c1", company_code: "CT-WBX", company_name: "示范过期建筑公司", company_type: "CONTRACTOR", status: "OVERDUE",
    plan: "p1", plan_code: "MONTHLY", plan_name: "示范月费方案", plan_tier: "SUBSCRIPTION", monthly_fee: "800.00",
    subscription_state: "EXPIRED", subscription_started_on: "2026-09-01", subscription_months: 1,
    subscription_expires_on: "2026-09-30", subscription_expiry_is_custom: false, days_to_expiry: -48,
    user_limit: null, used_user_seats: 1, remaining_user_seats: null, earns_platform_commission: false,
    commission_rate: null, trial_ends_on: null, plan_billing_cycle: "MONTHLY",
    ...overrides,
  };
}

function extendDialog(row: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {/* The confirm button explains a missing 原因 in a tooltip. */}
        <TooltipProvider>
          <SubscriptionActionDialog
            open
            onOpenChange={() => undefined}
            mode="extend"
            subscription={subscription(row) as never}
            plans={[]}
          />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("延长或续费 says when the new term starts (walk 11-17)", () => {
  it("a lapsed company: from today, the stopped time not charged", () => {
    const html = extendDialog({});
    expect(html).toContain(zh.subscriptions.hint.lapsedRenew);
    expect(html).toContain("data-lapsed-renew");
  });

  it("a company still in its term gets no such line", () => {
    const html = extendDialog({ subscription_state: "ACTIVE", status: "ACTIVE", subscription_expires_on: "2099-12-31" });
    expect(html).not.toContain(zh.subscriptions.hint.lapsedRenew);
  });

  it("a trial past its end keeps the trial's own line, not the lapsed one", () => {
    const html = extendDialog({ trial_ends_on: "2026-09-30" });
    expect(html).not.toContain(zh.subscriptions.hint.lapsedRenew);
    expect(html).toContain("这家公司还在免费试用（到 2026-09-30）");
  });
});

describe("新增公司 on a trial package (walk 11-17)", () => {
  it("says the trial and when billing starts instead of 「将从今天开始新的订阅周期」", () => {
    // Source only: the form needs a router, a session and its effects.
    const code = readFileSync(path.join(process.cwd(), "src/components/companies/create-company.tsx"), "utf8");
    expect(code).toMatch(
      /trialEnd \|\| company\?\.trial_ends_on\s*\?\s*t\("companies\.subscriptionMonthsTrialHint", \{\s*date: trialEnd \?\? company\?\.trial_ends_on \?\? "",\s*\}\)\s*:\s*t\("companies\.subscriptionMonthsHint"\)/,
    );
    expect(zh.companies.subscriptionMonthsHint).toContain("从今天开始");
    expect(zh.companies.subscriptionMonthsTrialHint).not.toContain("从今天开始");
  });
});
