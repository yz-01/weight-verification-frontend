/**
 * 「客户开放情况」 on MSE's company page, and 「客户开放」 in the directory
 * (JB220-1 / -3, 客户 11-18). MSE's staff are the client's own people: they read
 * what the customer has opened and until when, ask for it with a reason the
 * customer reads, and see the record the customer sees. MSE cannot open a door
 * itself.
 *
 * Rendered to static markup (the runner has no DOM); dialogs drawn in place.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { PlatformAccessStatus } from "@/interfaces/platform-access";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "mse-1", is_platform_staff: true, company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
  }),
}));
vi.mock("@/components/ui/dialog", async () => (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule());

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { AskForm, CompanyAccessCell, CompanyAccessPanel, CompanyAccessStatus, companyAccessKey } = await import(
  "@/components/platform-access/company-access-panel"
);

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const SHUT = { open: false, until: null, opened_at: null, opened_by_name: null, reason: "" };
const status = (overrides: Partial<PlatformAccessStatus> = {}): PlatformAccessStatus => ({
  company: "c-1",
  company_name: "示范建筑有限公司",
  view: { ...SHUT },
  accounts: { ...SHUT, onboarding: false },
  durations: {},
  can_change: false,
  always_visible: [],
  visible_when_open: [],
  never_visible: [],
  mse_added_accounts: [],
  external_links: [],
  ...overrides,
});

const rowOf = (html: string, kind: string) => {
  const start = html.indexOf(`data-company-access-row="${kind}"`);
  return html.slice(start, html.indexOf("</button>", start) + 9);
};

const render = (value: PlatformAccessStatus) =>
  renderDetail(<CompanyAccessStatus status={value} onAsk={() => {}} />, () => {});

describe("客户开放情况 — the two doors in words", () => {
  it("both shut: says what is hidden and what to press", () => {
    const html = render(status());
    expect(html).toContain(zh.mseAccess.mse.viewClosed);
    expect(html).toContain(zh.mseAccess.mse.accountsClosed);
    expect(rowOf(html, "VIEW_RECORDS")).toContain("请客户开放查看");
    expect(rowOf(html, "VIEW_RECORDS")).not.toContain('disabled=""');
    expect(rowOf(html, "MANAGE_ACCOUNTS")).toContain("请客户开放账号管理");
    expect(rowOf(html, "MANAGE_ACCOUNTS")).not.toContain('disabled=""');
  });

  it("open: until when, who opened it and why; asking again is greyed with the reason", () => {
    const html = render(
      status({ view: { open: true, until: "2026-11-19T15:00:00+08:00", opened_at: "2026-11-18T15:00:00+08:00", opened_by_name: "陈经理", reason: "客户报称重异常" } }),
    );
    const view = rowOf(html, "VIEW_RECORDS");
    expect(view).toContain('data-open="true"');
    expect(view).toContain("这家客户开放查看到 2026-11-19 15:00（只能看，不能改，每一次查看都会记录给客户看）。");
    expect(view).toContain("由 陈经理 在 2026-11-18 15:00 开放，原因：客户报称重异常");
    expect(view).toContain(`title="${zh.mseAccess.mse.alreadyOpen}"`);
  });

  it("a company still onboarding: accounts can be set up, no need to ask", () => {
    const html = render(status({ accounts: { ...SHUT, onboarding: true } }));
    const accounts = rowOf(html, "MANAGE_ACCOUNTS");
    expect(accounts).toContain(zh.mseAccess.mse.accountsOnboarding);
    expect(accounts).toContain(`title="${zh.mseAccess.mse.onboardingNoAsk}"`);
  });

  it("never offers MSE a way to open a door itself", () => {
    const html = render(status());
    expect(html).not.toContain(zh.mseAccess.view.name + "<");
    expect(html).not.toContain(zh.mseAccess.action.closeNow);
  });
});

describe("asking the customer", () => {
  it("needs a reason the customer will read, and says once an hour", () => {
    const html = renderDetail(<AskForm companyId="c-1" kind="VIEW_RECORDS" onClose={() => {}} />, () => {});
    expect(html).toContain(zh.mseAccess.mse.reason);
    expect(html).toContain(`title="还差这些没填：${zh.mseAccess.mse.reason}"`);
    expect(zh.mseAccess.mse.askHelp).toContain("一小时内只能发一次");
  });

  it("keeps the once-an-hour refusal in the dialog, not only in a toast", () => {
    const source = read("src/components/platform-access/company-access-panel.tsx");
    expect(source).toContain("requestPlatformAccess({ company: companyId, kind, reason }, { silent: true })");
    expect(source).toContain("data-ask-refusal");
  });
});

describe("the panel on the company page", () => {
  it("has the doors and the same 「MSE 查看记录」 the customer reads", () => {
    const html = renderDetail(<CompanyAccessPanel companyId="c-1" />, (client) => {
      client.setQueryData(companyAccessKey("c-1"), status());
      client.setQueryData(["platform-access", "records", { company: "c-1", page: 1, page_size: 20 }], {
        count: 0, page: 1, page_size: 20, total_pages: 1, results: [],
      });
    });
    expect(html).toContain(zh.mseAccess.mse.title);
    expect(html).toContain(zh.mseAccess.records.title);
    expect(html).toContain(zh.mseAccess.records.helpMse);
    expect(html).toContain(zh.mseAccess.records.emptyMse);
  });

  it("is on MSE's company page, with 新增用户 and 新增链接 waiting for the customer", () => {
    const source = read("src/components/companies/view-company.tsx");
    expect(source).toContain("<CompanyAccessPanel companyId={data.id} />");
    expect(source).toContain('disabledReason={t("mseAccess.reason.accounts")}');
    expect(source).toContain('createClosedReason={viewClosed ? t("mseAccess.reason.externalLink") : undefined}');
  });
});

describe("「客户开放」 in the directory", () => {
  const cell = (access: Parameters<typeof CompanyAccessCell>[0]["access"]) =>
    renderDetail(<CompanyAccessCell access={access} />, () => {});

  it("says 未开放 in words", () => {
    const html = cell({ view_until: null, accounts_until: null, accounts_onboarding: false, can_create_external_link: false });
    expect(html).toContain(">未开放<");
  });

  it("says what is open and until when", () => {
    const html = cell({ view_until: "2026-11-19T15:00:00+08:00", accounts_until: null, accounts_onboarding: false, can_create_external_link: true });
    expect(html).toContain("可查看，到 2026-11-19 15:00");
    expect(html).not.toContain(">未开放<");
  });

  it("says a company still onboarding can have its accounts set up", () => {
    expect(cell({ view_until: null, accounts_until: null, accounts_onboarding: true, can_create_external_link: false })).toContain(
      zh.mseAccess.directory.onboarding,
    );
  });

  it("is a column of 公司目录 and 回收商资料", () => {
    const source = read("src/components/companies/companies.tsx");
    expect(source).toContain('id: "platform_access"');
    // Listed in the directory's columns and in 回收商资料's.
    expect(source.match(/^\s+"platform_access",$/gm)?.length).toBe(2);
  });
});
