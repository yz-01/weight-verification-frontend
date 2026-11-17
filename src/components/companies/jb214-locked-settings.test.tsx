/**
 * 锁定设定 that now do something (JB214, Lucas 11-16 「把它们真的做出来」):
 * 通行证编号前缀 (3a, Q3), 二维码打印大小 (3b), no 「通知项目经理」 (3c, Q2),
 * and 「归档后锁定记录」 project by project (3d, Q1 = A 「按项目锁」).
 * Rendered to static markup: the runner has no DOM.
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
const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api-client", () => ({
  api: { ...api, list: vi.fn(), delete: vi.fn(), put: vi.fn() },
  toastSuccess: vi.fn(),
  download: vi.fn(),
}));

const { CompanyLockedSettingsPanel, qrPrefixProblem } = await import("@/components/companies/company-locked-settings");
const { getCompanyProjectArchiveLocks, setProjectArchiveLock } = await import("@/services/project-archive-lock.service");

const SETTINGS = {
  id: "s1", default_geofence_radius_m: 150, location_update_interval_seconds: 60, live_position_window_seconds: 120,
  visitor_pass_hours: 12, qr_prefix: "PS", qr_style: "STANDARD", enable_site_access_qr: true, enable_visitor_qr: true,
  enable_vehicle_qr: true, default_project_status: "ACTIVE", default_project_categories: [],
  default_archive_rules: { lock_after_archive: false },
  // Saved before JB214; kept in the data, no longer shown (Q2 = A).
  default_notification_rules: { notify_project_manager: false },
  default_user_role_code: "site_staff", default_approval_role_code: "project_manager",
  default_consultant_permissions: ["project.view"], date_format: "DD/MM/YYYY", time_format: "24H", language: "zh",
  timezone: "Asia/Kuala_Lumpur", home_page: "/dashboard", default_notification_channel: "PUSH", email_notifications: true,
  system_notifications: true, approval_notifications: true, rectification_notifications: true, expiry_notifications: true,
  target_reminder_percent: 80, field_pin_expiry_days: 90, field_invite_valid_days: 7, require_attendance_photo: true,
  require_gate_photo: false, emergency_contact_name: "", emergency_contact_phone: "", updated_at: "2026-11-16T00:00:00Z",
  reserved_qr_prefixes: ["GT", "MI", "MR", "VA"],
  role_options: [{ code: "site_staff", name: "现场工作人员" }, { code: "project_manager", name: "项目经理" }],
};

const PROJECTS = [
  { id: "p1", code: "PRJ-0001", name: "Putra Mas", status: "ACTIVE", lock_after_archive: true },
  { id: "p2", code: "PRJ-0002", name: "Bukit Jalil", status: "ACTIVE", lock_after_archive: false },
];

function render(messages = zh, projects: unknown = PROJECTS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["companies", "site-settings", "c1"], SETTINGS);
  if (projects) client.setQueryData(["companies", "project-archive-locks", "c1"], projects);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <CompanyLockedSettingsPanel companyId="c1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("通行证编号前缀 (JB214-3a)", () => {
  it("says it only reaches new passes and which letters it may not take", () => {
    const html = render();
    expect(html).toContain(zh.companies.lockedSettings.qrPrefixHint);
    expect(html).toContain("GT");
    expect(html).toMatch(/<input[^>]*maxLength="6"[^>]*value="PS"/);
  });

  it("is checked as it is typed: 2 to 6 letters, not another record's", () => {
    const reserved = SETTINGS.reserved_qr_prefixes;
    expect(qrPrefixProblem("KL", reserved)).toBeNull();
    expect(qrPrefixProblem("PS", reserved)).toBeNull();
    expect(qrPrefixProblem("GT", reserved)).toBe("taken");
    expect(qrPrefixProblem("MI", reserved)).toBe("taken");
    for (const bad of ["P", "A1", "PS-1", "ABCDEFG", "", "通行"]) {
      expect(qrPrefixProblem(bad, reserved)).toBe("format");
    }
  });
});

describe("二维码打印大小 (JB214-3b)", () => {
  it("says what each size prints at", () => {
    expect(render()).toContain(zh.companies.lockedSettings.qrStyleHint);
  });
});

describe("通知项目经理 (JB214-3c, Lucas 11-16 Q2 = A)", () => {
  it("is no longer offered; the saved value is left alone", () => {
    const html = render();
    expect(html).not.toContain(zh.siteControl.projectDefaults.notifyManager);
    expect(html).not.toContain(zh.siteControl.projectDefaults.notifyManagerHelp);
    // The other notification switches stay.
    expect(html).toContain(zh.siteControl.notificationSettings.approval);
    expect(SETTINGS.default_notification_rules).toEqual({ notify_project_manager: false });
  });
});

describe("归档后锁定记录, project by project (JB214-3d, Lucas 11-16 Q1 = A)", () => {
  it("shows the new-project default and each project with its state", () => {
    const html = render();
    expect(html).toContain(zh.companies.lockedSettings.archiveDefault);
    expect(html).toContain(zh.companies.lockedSettings.projectLocks.help);
    expect(html).toContain("Putra Mas");
    expect(html).toContain(`PRJ-0001 · ${zh.companies.lockedSettings.projectLocks.on}`);
    expect(html).toContain(`PRJ-0002 · ${zh.companies.lockedSettings.projectLocks.off}`);
    // Each project's own switch, read by the code under its name.
    const switches = Object.fromEntries(
      [...html.matchAll(/(PRJ-000\d) · [^<]*<\/span><\/span><button([^>]*)>/g)].map(([, code, attrs]) => [
        code,
        /aria-checked="true"/.test(attrs),
      ]),
    );
    expect(switches).toEqual({ "PRJ-0001": true, "PRJ-0002": false });
  });

  it("says so when the company has no project", () => {
    expect(render(zh, [])).toContain(zh.companies.lockedSettings.projectLocks.empty);
  });

  it("reads and sets one project's switch", async () => {
    api.get.mockResolvedValueOnce(PROJECTS);
    await getCompanyProjectArchiveLocks("c1");
    expect(api.get).toHaveBeenCalledWith("/api/project-archive-locks/get_company_projects/", { company: "c1" });
    api.post.mockResolvedValueOnce(PROJECTS[1]);
    await setProjectArchiveLock("p2", true);
    expect(api.post).toHaveBeenCalledWith("/api/project-archive-locks/p2/set_archive_lock/", { lock_after_archive: true });
  });
});

describe("words (JB214)", () => {
  it("are in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const locked = messages.companies.lockedSettings;
      for (const text of [
        locked.qrPrefixHint, locked.qrPrefixFormat, locked.qrPrefixTaken, locked.qrStyleHint,
        locked.archiveDefault, locked.archiveDefaultHelp, ...Object.values(locked.projectLocks),
        messages.recyclerCompanySettings.business.noDevice,
        messages.errors.api.ai_cctv_disabled, messages.errors.api.archive_lock_choice_invalid,
      ]) {
        expect(text.trim()).not.toBe("");
      }
      expect(locked.qrPrefixTaken).toContain("{prefix}");
      expect(locked.projectLocks.confirmOnTitle).toContain("{project}");
    }
  });

  it("renders in each language without a raw key", () => {
    for (const messages of [zhTW, en, ms]) {
      const html = render(messages);
      expect(html).toContain(messages.companies.lockedSettings.projectLocks.title);
      expect(html).not.toContain("companies.lockedSettings");
    }
  });
});
