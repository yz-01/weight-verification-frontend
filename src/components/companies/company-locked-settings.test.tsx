/**
 * 锁定设定 on the platform's company page (JB99, 客户 11-05 事项 2 「应该锁起来，
 * 由 MSE 管理」): MSE reads and changes what the contractor's 公司设置 no
 * longer shows - 默认权限、二维码规则、通知规则、GPS、系统安全、归档与照片、
 * and the system defaults.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ updates: true }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: (code: string) => code !== "company.update" || reader.updates }),
}));
const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api-client", () => ({
  api: { ...api, list: vi.fn(), delete: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { CompanyLockedSettingsPanel } = await import("@/components/companies/company-locked-settings");
const { getCompanySiteSettings, updateCompanySiteSettings } = await import("@/services/companies.service");

const SETTINGS = {
  id: "s1", default_geofence_radius_m: 150, location_update_interval_seconds: 60, live_position_window_seconds: 120,
  visitor_pass_hours: 12, qr_prefix: "GP", qr_style: "STANDARD", enable_site_access_qr: true, enable_visitor_qr: true,
  enable_vehicle_qr: true, default_project_status: "ACTIVE", default_project_categories: [], default_archive_rules: {},
  default_notification_rules: {}, default_user_role_code: "site_staff", default_approval_role_code: "project_manager",
  default_consultant_permissions: ["project.view"], date_format: "DD/MM/YYYY", time_format: "24H", language: "zh",
  timezone: "Asia/Kuala_Lumpur", home_page: "/dashboard", default_notification_channel: "PUSH", email_notifications: true,
  system_notifications: true, approval_notifications: true, rectification_notifications: true, expiry_notifications: true,
  target_reminder_percent: 80, field_pin_expiry_days: 90, field_invite_valid_days: 7, require_attendance_photo: true,
  require_gate_photo: false, emergency_contact_name: "", emergency_contact_phone: "", updated_at: "2026-11-05T00:00:00Z",
  role_options: [{ code: "site_staff", name: "现场工作人员" }, { code: "project_manager", name: "项目经理" }],
};

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["companies", "site-settings", "c1"], SETTINGS);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <CompanyLockedSettingsPanel companyId="c1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("锁定设定 (JB99)", () => {
  it("shows every locked group to MSE", () => {
    const html = render();
    const groups = [...html.matchAll(/data-locked="([^"]+)"/g)].map((match) => match[1]);
    expect(groups).toEqual(["permissions", "qr", "notifications", "gps", "security", "records", "defaults"]);
    for (const words of [
      "由 MSE 管理的设定", "新用户默认角色", "通行证编号前缀", "GPS 上传间隔", "激活链接有效天数",
      "归档", "打卡必须拍照", "访客照片", "访客证默认时长", "新项目默认状态", "默认半径", "目标提醒比例",
    ]) {
      expect(html).toContain(words);
    }
    expect(html).toContain('value="GP"');
    // 「到期访客照片」 for this company, from MSE's side too (JB99 review F2).
    expect(html).toContain(zh.siteControl.visitorPrivacy.expired.open);
  });

  it("has no 大标题 any more - the slogan stays (JB164, 客户 11-10 第十一批 第 3 点 「永久保留」)", () => {
    const html = render();
    expect(html).not.toContain(zh.headquarters.reference.settingsTitle);
    // The subtitle under the slogan is still MSE's to set.
    expect(html).toContain(zh.headquarters.reference.settingsSubtitle);
  });

  it("names seeded roles in the reader's language and shows no permission codes (11-05 screen check)", () => {
    const stored = { ...SETTINGS, role_options: [{ code: "site_staff", name: "Site Staff" }, { code: "project_manager", name: "Project Manager" }] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["companies", "site-settings", "c1"], stored);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
          <CompanyLockedSettingsPanel companyId="c1" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(html).not.toContain("Site Staff");
    expect(html).not.toContain("Project Manager");
    expect(html).toContain(zh.roles.system_.site_staff);
    expect(html).not.toContain("project.view");
  });

  it("is read-only for platform staff who may not update companies", () => {
    reader.updates = false;
    try {
      const html = render();
      expect(html).not.toContain("保存设置");
      expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="GP"/);
    } finally {
      reader.updates = true;
    }
  });

  it("reads and writes the company's own settings", async () => {
    api.get.mockResolvedValueOnce(SETTINGS);
    await getCompanySiteSettings("c1");
    expect(api.get).toHaveBeenCalledWith("/api/companies/c1/get_site_settings/");
    api.patch.mockResolvedValueOnce(SETTINGS);
    await updateCompanySiteSettings("c1", { qr_prefix: "NEW" });
    expect(api.patch).toHaveBeenCalledWith("/api/companies/c1/update_site_settings/", { qr_prefix: "NEW" });
  });

  it("reads and removes the company's expired visitor photos, and its backups", async () => {
    const { getCompanyExpiredVisitorPhotos, purgeCompanyVisitorPhotos } = await import("@/services/companies.service");
    const { getOriginalBackupOverview } = await import("@/services/evidence.service");
    api.get.mockResolvedValue({});
    await getCompanyExpiredVisitorPhotos("c1");
    expect(api.get).toHaveBeenCalledWith("/api/companies/c1/get_expired_visitor_photos/");
    await getOriginalBackupOverview("c1");
    expect(api.get).toHaveBeenCalledWith("/api/evidence-originals/get_backup_overview/", { company: "c1" });
    api.post.mockResolvedValueOnce({ purged: 0 });
    await purgeCompanyVisitorPhotos("c1");
    expect(api.post).toHaveBeenCalledWith("/api/companies/c1/purge_visitor_photos/", {});
  });

  it("is worded in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const key of ["title", "subtitle", "gps", "security", "records", "defaults"] as const) {
        expect(messages.companies.lockedSettings[key].trim()).not.toBe("");
      }
    }
  });
});
