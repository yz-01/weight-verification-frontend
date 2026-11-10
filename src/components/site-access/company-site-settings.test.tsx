/**
 * 公司设置, simplified (JB99, 客户 11-05 事项 2–4): 「公司设置只保留公司名称、
 * SSM注册号码、地址、联系电话、Logo等基本公司资料」 - three blocks, 公司资料 /
 * 显示偏好 / 分公司与总部, and nothing MSE manages. A save sends only the
 * fields the block shows, so the backend's lock is never tripped by the page.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ContractorCompanyProfile, ContractorSiteSettings } from "@/interfaces/site-access";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true, refresh: vi.fn() }),
}));
vi.mock("@/services/api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), list: vi.fn(), delete: vi.fn(), patch: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { CompanySiteSettingsWorkspace, PREFERENCE_SETTINGS, PROFILE_SETTINGS, pickSettings } = await import(
  "@/components/site-access/company-site-settings"
);

const SETTINGS = {
  id: "s1",
  default_geofence_radius_m: 150,
  location_update_interval_seconds: 60,
  live_position_window_seconds: 120,
  visitor_pass_hours: 12,
  qr_prefix: "MSE",
  qr_style: "STANDARD",
  enable_site_access_qr: true,
  enable_visitor_qr: true,
  enable_vehicle_qr: true,
  default_project_status: "ACTIVE",
  default_project_categories: [{ code: "RB", name: "Rebar", is_visible_in_pwa: true }],
  default_archive_rules: {},
  default_notification_rules: {},
  default_user_role_code: "site_staff",
  default_approval_role_code: "project_manager",
  default_consultant_permissions: ["project.view"],
  date_format: "DD/MM/YYYY",
  time_format: "24H",
  language: "zh",
  timezone: "Asia/Kuala_Lumpur",
  home_page: "/dashboard",
  default_notification_channel: "PUSH",
  email_notifications: true,
  system_notifications: true,
  approval_notifications: true,
  rectification_notifications: true,
  expiry_notifications: true,
  target_reminder_percent: 80,
  field_pin_expiry_days: 90,
  field_invite_valid_days: 7,
  require_attendance_photo: true,
  require_gate_photo: false,
  emergency_contact_name: "Guard house",
  emergency_contact_phone: "+60123",
  updated_at: "2026-11-05T00:00:00Z",
} satisfies ContractorSiteSettings;

const PROFILE = {
  id: "c1", code: "CT-1", name: "测试建筑商 1", description: "intro", registration_no: "202601000001",
  tax_id: "", sst_no: "", logo: null, background_image: null, contact_person: "", contact_designation: "",
  address_line_1: "1 Jalan", address_line_2: "", city: "KL", state: "Selangor", postcode: "50000",
  country: "MY", latitude: null, longitude: null, contact_phone: "+603", contact_email: "a@b.test",
  billing_email: "", website: "https://site.test", default_language: "zh", timezone: "Asia/Kuala_Lumpur",
  updated_at: "2026-11-05T00:00:00Z",
} as unknown as ContractorCompanyProfile;

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["contractor-site-settings"], SETTINGS);
  client.setQueryData(["contractor-company-profile"], PROFILE);
  client.setQueryData(["company-branches"], { count: 0, results: [] });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <CompanySiteSettingsWorkspace />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const sectionIds = (html: string) => [...html.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);

describe("公司设置 (JB99)", () => {
  it("is three blocks: 公司资料, 显示偏好, 分公司与总部 - and 公司资料's 正式文件样板预览 (JB162)", () => {
    expect(sectionIds(render())).toEqual(["company-profile", "letterhead-preview", "company-preferences", "company-branches"]);
  });

  it("shows the company's own details, the emergency contact and the four preferences", () => {
    const html = render();
    for (const words of ["公司名称", "SSM 注册号码", "地址", "电话", "电邮", "Logo", "紧急联系人", "显示偏好", "语言", "日期格式", "时间格式", "时区"]) {
      expect(html).toContain(words);
    }
    expect(html).toContain("Guard house");
    expect(html).toContain("由 MSE 统一管理");
  });

  it("shows nothing MSE manages, nor the lists that moved", () => {
    const html = render();
    for (const words of [
      "通行证编号前缀", "二维码打印大小", "新用户默认角色", "默认审批角色", "GPS 上传间隔", "实时位置有效时间",
      "激活链接有效天数", "重新输入 PIN", "打卡必须拍照", "访客证默认时长", "登录后首页", "默认通知方式",
      "新项目默认状态", "默认半径", "目标提醒比例", "公司简介", "公司网站", "背景图", "组织架构",
    ]) {
      expect(html).not.toContain(words);
    }
    // The categories are kept, only not shown here (分类管理, JB102/JB103).
    expect(html).not.toContain("Rebar");
  });

  it("sends only the fields a block shows", () => {
    expect(Object.keys(pickSettings(SETTINGS, PREFERENCE_SETTINGS)).sort()).toEqual(["date_format", "language", "pdf_link_valid_days", "time_format", "timezone"]);
    expect(pickSettings(SETTINGS, PROFILE_SETTINGS)).toEqual({ emergency_contact_name: "Guard house", emergency_contact_phone: "+60123" });
  });
});
