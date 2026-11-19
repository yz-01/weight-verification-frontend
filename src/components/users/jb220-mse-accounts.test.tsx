/**
 * JB220-4 (客户 11-18, Lucas's approved point 「堵住加账号这条旁路」): MSE changes
 * a customer's accounts only while the customer has opened 「允许 MSE 管理账号」.
 * Until then MSE's write buttons on that customer's accounts are greyed with
 * the reason and whom to ask; 强制下线 still works. MSE's own staff and a company
 * still onboarding are untouched.
 *
 * Rendered to static markup (the runner has no DOM), or read in the source
 * where the list needs the whole page around it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ platform: true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/users/u-9",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "mse-1", is_platform_staff: reader.platform, company_preferences: { date_format: "YYYY-MM-DD", time_format: "24H" } },
    can: () => true,
  }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ViewUser } = await import("@/components/users/view-user");

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const USER = {
  id: "u-9", email: "lee@shifan.invalid", full_name: "李工", phone: "+60123456789", status: "ACTIVE", role: "r1",
  role_name: "项目经理", role_code: "project_manager", company: "c-1", company_name: "示范建筑有限公司",
  company_type: "CONTRACTOR", is_platform_staff: false, mobile_access_only: false, is_field_staff: false, language: "zh",
  last_login_at: "2026-11-17T09:00:00+08:00", created_at: "2026-10-01T09:00:00+08:00", avatar: null,
  timezone: "Asia/Kuala_Lumpur", last_login_ip: null, updated_at: "2026-11-17T09:00:00+08:00",
  sign_off_pin: { has_pin: true, was_reset: false, locked_until: null, exempt: false },
};

const view = (overrides: Record<string, unknown>, platform = true) => {
  reader.platform = platform;
  return renderDetail(<ViewUser id="u-9" />, (client) => client.setQueryData(["users", "detail", "u-9"], { ...USER, ...overrides }));
};

describe("a customer's user page, seen by MSE", () => {
  const reason = zh.mseAccess.reason.accounts;

  it("before the customer opens: 编辑 and 重设签核密码 greyed with whom to ask, said on the page too", () => {
    const html = view({ company_accounts_open: false });
    expect(reason).toBe("改这家客户的账号要客户同意，请客户管理员在「公司设置」里点「允许 MSE 管理账号」。");
    expect(html).not.toContain('href="/users/u-9/edit"');
    expect(html.match(new RegExp(`title="${reason}"`, "g"))?.length).toBe(2);
    expect(html).toContain("data-platform-reason");
  });

  it("with 「允许 MSE 管理账号」 open (or the company still onboarding): 编辑 works", () => {
    const html = view({ company_accounts_open: true });
    expect(html).toContain('href="/users/u-9/edit"');
    expect(html).not.toContain(reason);
  });

  it("MSE's own staff are never greyed", () => {
    const html = view({ company: null, company_name: null, company_type: null, is_platform_staff: true, company_accounts_open: true });
    expect(html).toContain('href="/users/u-9/edit"');
  });

  it("a customer's own administrator is never greyed, whatever an older row says", () => {
    const html = view({ company_accounts_open: false }, false);
    expect(html).toContain('href="/users/u-9/edit"');
    expect(html).not.toContain(reason);
  });
});

describe("用户管理's row buttons", () => {
  const source = read("src/components/users/users.tsx");

  it("each write button waits for the customer, with the reason", () => {
    expect(source).toContain("const accountsClosed = accountWritesClosed(me, target);");
    // 编辑 · 重发手机链接 · 重发登录邮件 · 人员交接 · 恢复 · 停用 · 删除.
    expect(source.match(/disabledReason=\{accountsReason\}/g)?.length).toBe(7);
  });

  it("强制下线 does not wait: it takes access away and tells the customer", () => {
    const logout = source.slice(source.indexOf('title={t("users.forceLogout.action")}') - 200, source.indexOf('title={t("users.forceLogout.action")}') + 200);
    expect(logout).not.toContain("accountsReason");
  });

  it("the page says once, in words, what the greyed buttons wait for", () => {
    expect(source).toContain('<PlatformReasonLine text={t("mseAccess.reason.accountsList")} />');
    expect(zh.mseAccess.reason.accountsList).toContain("强制下线随时可以用");
  });
});

describe("现场人员链接 for a customer's phone account", () => {
  const source = read("src/components/field-staff/field-access-management.tsx");

  it("重发 and 重置手机 wait for the customer too", () => {
    expect(source).toContain('accountWritesClosed(me, chosenStaff) ? access("reason.accounts")');
    expect(source.match(/disabledReason=\{accountsReason\}/g)?.length).toBe(2);
  });

  it("MSE picks among that customer's projects from the project directory, not its projects list", () => {
    expect(source).toContain("getCompanyProjectArchiveLocks(platformCompany)");
  });
});
