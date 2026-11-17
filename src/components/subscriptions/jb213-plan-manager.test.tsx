/**
 * 套餐管理 after JB213 (Lucas 11-16 「把它们真的做出来」): the package fields
 * that used to save and do nothing say what they do, and 功能 is a checklist
 * of the audience's own menus instead of free text.
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
  useAuth: () => ({ user: null, can: () => true }),
}));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), list: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { PlanFeatureChecklist, PlanManager, weighingHiddenByCwe } = await import("@/components/subscriptions/plan-manager");

const RECYCLER_MENUS = [
  "dashboard", "partnerships", "yards", "weighbridges", "outbound_management", "billing_commission", "users",
];
const DEFAULTS = {
  billing_cycle: "QUARTERLY",
  trial_days: 14,
  max_users: 5,
  default_plan: { id: "p-basic", code: "BASIC", name: "Basic" },
  feature_choices: { CONTRACTOR: ["dashboard", "projects", "gate_records", "site_access"], RECYCLER: RECYCLER_MENUS },
  always_on_features: ["billing_commission", "dashboard", "users"],
};

function plan(overrides: Record<string, unknown>) {
  return {
    id: "p", code: "P", name: "Plan", description: "", audience: "CONTRACTOR", tier: "SUBSCRIPTION",
    billing_cycle: "MONTHLY", currency: "MYR", monthly_fee: "100.00", yearly_fee: "0.00", setup_fee: "0.00",
    trial_days: 0, max_projects: null, max_users: null, max_sites: null, max_scales: null,
    earns_platform_commission: false, commission_rate_override: null, effective_commission_rate: null,
    allows_external_integration: false, allows_cloud_weighing: true, feature_flags: [], is_public: true,
    is_active: true, sort_order: 0, company_count: 0, is_default: false, created_at: "", updated_at: "",
    ...overrides,
  };
}

function wrap(node: React.ReactNode, messages: Record<string, unknown> = zh, locale = "zh") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["subscription-plans", "defaults"], DEFAULTS);
  client.setQueryData(["subscription-plans", "all"], {
    count: 4, page: 1, page_size: 100, total_pages: 1,
    results: [
      plan({ id: "p-basic", code: "BASIC", name: "Basic", is_default: true }),
      plan({ id: "p-trial", code: "TRIAL", name: "Trial", trial_days: 14, is_public: false }),
      plan({
        id: "p-partner", code: "PARTNER", name: "Partner", audience: "RECYCLER", tier: "PARTNER",
        max_users: 3, max_sites: 2, max_scales: 4, feature_flags: ["yards", "weighbridges"],
      }),
      plan({
        id: "p-standard", code: "STANDARD", name: "Standard", audience: "RECYCLER", tier: "STANDARD",
        billing_cycle: "QUARTERLY", monthly_fee: "300.00",
      }),
    ],
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("套餐管理 list (JB213)", () => {
  it("marks the default, hidden and trial packages", () => {
    const html = wrap(<PlanManager />);
    expect(html).toContain(zh.subscriptions.badge.default);
    expect(html).toContain(zh.subscriptions.badge.hidden);
    expect(html).toContain("试用 14 天");
  });

  it("shows a recycler package's yard and weighbridge limits", () => {
    const html = wrap(<PlanManager />);
    expect(html).toContain("3 个账号，2 个回收场，4 台地磅");
  });

  it("says whether a package limits its features", () => {
    const html = wrap(<PlanManager />);
    expect(html).toContain(zh.subscriptions.plans.featuresAll);
    expect(html).toContain("2 项功能");
  });
});

describe("fee column on a package not billed monthly (walk 11-17)", () => {
  it("adds what one bill is, and leaves a monthly package as it was", () => {
    const html = wrap(<PlanManager />);
    expect(html).toContain("（季付：每 3 个月一张账单 MYR 900.00）");
    // Basic is monthly at MYR 100.00: no bill line for it.
    expect(html).not.toContain("每 1 个月");
    expect(html.match(/一张账单/g)).toHaveLength(1);
  });

  it("is worded in all four languages", () => {
    const expected = {
      en: "(Quarterly: one bill every 3 months, MYR 900.00)",
      ms: "(Suku tahunan: satu bil setiap 3 bulan, MYR 900.00)",
      "zh-TW": "（季付：每 3 個月一張帳單 MYR 900.00）",
    } as const;
    for (const [locale, messages] of [["en", en], ["ms", ms], ["zh-TW", zhTW]] as const) {
      expect(wrap(<PlanManager />, messages, locale)).toContain(expected[locale]);
    }
  });
});

describe("功能 checklist (JB213, 4e)", () => {
  function checklist(value: string[]) {
    return wrap(
      <PlanFeatureChecklist
        value={value}
        choices={RECYCLER_MENUS}
        alwaysOn={DEFAULTS.always_on_features}
        onChange={() => undefined}
      />,
    );
  }

  function stateOf(html: string, key: string) {
    const at = html.indexOf(`data-feature="${key}"`);
    const button = html.slice(at, html.indexOf("</label>", at));
    // The attribute Radix sets, not the `disabled:` style variants every
    // checkbox carries in its class list.
    return { checked: button.includes('data-state="checked"'), disabled: button.includes("data-disabled") };
  }

  it("lists the audience's own menus by their sidebar names", () => {
    const html = checklist([]);
    expect(html).toContain(zh.nav.outbound_management);
    expect(html).toContain(zh.nav.yards);
    expect(html).toContain(zh.subscriptions.plans.featuresAll);
  });

  it("ticks what the package has and greys what every package keeps", () => {
    const html = checklist(["yards"]);
    expect(stateOf(html, "yards")).toEqual({ checked: true, disabled: false });
    expect(stateOf(html, "outbound_management")).toEqual({ checked: false, disabled: false });
    expect(stateOf(html, "dashboard")).toEqual({ checked: true, disabled: true });
    expect(stateOf(html, "billing_commission")).toEqual({ checked: true, disabled: true });
  });

  it("keeps keys typed before it was a checklist, and says they do nothing", () => {
    const html = checklist(["yards", "old_free_text"]);
    expect(html).toContain("old_free_text");
    expect(html).toContain("保留，不起作用");
  });

  it("names the three menus the sidebar labels elsewhere", () => {
    const html = wrap(
      <PlanFeatureChecklist
        value={[]}
        choices={["gate_records", "field_staff", "site_workers"]}
        alwaysOn={[]}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain(zh.subscriptions.featureName.gate_records);
    expect(html).toContain(zh.subscriptions.featureName.field_staff);
    expect(html).toContain(zh.subscriptions.featureName.site_workers);
  });

  it("is worded in all four languages", () => {
    for (const [locale, messages] of [["en", en], ["ms", ms], ["zh-TW", zhTW]] as const) {
      const html = wrap(<PlanManager />, messages, locale);
      expect(html).toContain(messages.subscriptions.badge.hidden);
      expect(html).toContain(messages.subscriptions.plans.featuresAll);
    }
  });
});

describe("地磅 / 称重记录 ticked without 云端称重引擎 (walk 11-17, step 11)", () => {
  const recycler = { audience: "RECYCLER" as const, allows_cloud_weighing: false };

  it("says the two stay out of the menu, as get_portal_features drops them", () => {
    expect(weighingHiddenByCwe({ ...recycler, feature_flags: ["yards", "weighing_records"] })).toBe(true);
    expect(weighingHiddenByCwe({ ...recycler, feature_flags: ["weighbridges"] })).toBe(true);
  });

  it("says nothing when they are not ticked, the plan has the engine, or it is a contractor package", () => {
    expect(weighingHiddenByCwe({ ...recycler, feature_flags: ["yards", "waste_orders"] })).toBe(false);
    expect(weighingHiddenByCwe({ ...recycler, feature_flags: [] })).toBe(false);
    expect(weighingHiddenByCwe({ ...recycler, allows_cloud_weighing: true, feature_flags: ["weighing_records"] })).toBe(false);
    expect(
      weighingHiddenByCwe({ audience: "CONTRACTOR", allows_cloud_weighing: false, feature_flags: ["weighing_records"] }),
    ).toBe(false);
  });

  it("is worded in all four languages, naming the engine and both menus", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const sentence = messages.subscriptions.hint.weighingNeedsCwe;
      expect(sentence).toContain(messages.subscriptions.field.cloudWeighing);
      expect(sentence).toContain(messages.nav.weighbridges);
      expect(sentence).toContain(messages.nav.weighing_records);
    }
  });
});
