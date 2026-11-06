/**
 * 现场人员管理 (JB114, 客户 11-06 第二轮事项 4): 「项目经理后台需要增加「现场人员管理」，
 * 与总部的用户管理分开……项目经理只管理现场人员手机链接，不管理公司后台用户账号。」
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { isRouteAllowed, visibleNavigation } from "@/lib/navigation";
import zh from "@/messages/zh.json";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock("@/services/api-client", () => ({
  api: { ...api, list: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { portal: "MSE_TRACE" }, can: () => true }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/field-staff-management",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { FieldStaffManagementPage } = await import("@/components/field-staff/field-staff-management");

const PERSON = {
  id: "u1", email: "field+1@mse.invalid", full_name: "阿明", phone: "+60129990001", status: "ACTIVE",
  role: "r1", role_name: "Site Staff", role_code: "site_staff", is_field_staff: true, mobile_access_only: true,
  last_login_at: null, created_at: "2026-11-06T00:00:00Z",
  projects: [{ id: "p1", code: "PRJ-0001", name: "project 1A" }],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["field-access", "staff", "", ""], { results: [PERSON], count: 1 });
  client.setQueryData(["projects", "field-staff-management"], { results: [], count: 0 });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <FieldStaffManagementPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("现场人员管理 page", () => {
  it("lists the field staff on my projects with their role, project and buttons", () => {
    const html = renderPage();
    expect(html).toContain("阿明");
    expect(html).toContain(zh.roles.system_.site_staff);
    expect(html).toContain("PRJ-0001 · project 1A");
    expect(html).toContain(zh.fieldStaffManagement.notYet);
    expect(html).toContain(zh.fieldStaffManagement.new);
    expect(html).toContain(zh.fieldStaffManagement.link);
    expect(html).toContain(zh.fieldStaffManagement.remove);
    // 怎么用, in three steps, for whoever opens it the first time.
    expect(html).toContain(zh.fieldStaffManagement.how1);
  });
});

describe("where it is", () => {
  const pm = ["field_staff.manage", "project.view", "notification.view"];

  it("is in the menu for whoever holds 现场人员管理, without 用户管理", () => {
    // The server sends 「field_staff」 for 现场人员管理 and no 「users」 without
    // 用户管理 (accounts/portal_features.py).
    const hrefs = visibleNavigation("MSE_TRACE", ["field_staff", "project_categories"], pm).flatMap((group) =>
      group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]),
    );
    expect(hrefs).toContain("/field-staff-management");
    expect(hrefs).not.toContain("/users");
    expect(isRouteAllowed("MSE_TRACE", ["field_staff"], "/field-staff-management", pm)).toBe(true);
    expect(isRouteAllowed("MSE_TRACE", [], "/field-staff-management", ["project.view"])).toBe(false);
  });

  it("uses 现场人员管理's own calls, never 用户管理's", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    for (const file of [
      "src/components/field-staff/field-access-management.tsx",
      "src/components/field-staff/field-staff-management.tsx",
    ]) {
      const code = read(file);
      expect(code).not.toContain("users.service");
      expect(code).toContain("getFieldStaff");
    }
  });
});
