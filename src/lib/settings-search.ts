/**
 * Every setting in the top search (JB70, client 10-29: 「找不到查询入口」 when
 * looking for 助理副密码). Lucas: the 「搜索模块和功能」 box (Ctrl K) finds every
 * setting, not only the menu's modules.
 *
 * One row per section of a settings page: where it is (`href` + `anchor`, the
 * section's stable `id` on the page), its words (the page's and the section's
 * own message keys, so the result reads exactly what the page says) and the
 * other words people use for it, in all four languages.
 *
 * Who sees a row: whoever may open its page - the same rule the address bar
 * uses (`isRouteAllowed`); 个人资料 is everybody's. A row can also need a
 * permission of its own, an office account, or one kind of company.
 */

import type { Portal } from "@/interfaces/auth";
import { isRouteAllowed } from "@/lib/navigation";

export interface SettingsSection {
  /** The section's `id` on its page; the page alone when absent. */
  anchor?: string;
  href: string;
  /** Message key of the page's title. */
  pageKey: string;
  /** Message key of the section's title; absent for a one-section page. */
  sectionKey?: string;
  /** Other words for it, any language - matched as typed, case aside. */
  keywords?: readonly string[];
  /** A permission of its own, beyond opening the page (`a|b` is either). */
  permission?: string;
  /** Not for a phone (field-staff) account. */
  officeOnly?: boolean;
  /** Only on this kind of company's version of the page. */
  companyType?: "RECYCLER" | "OTHER";
}

/** 副密码 / 签核密码 / PIN, said every way the client and his staff say it. */
const PIN_WORDS = [
  "密码", "密碼", "签核密码", "簽核密碼", "签核", "簽核", "PIN", "password",
  "sign-off", "sign off", "kata laluan", "pengesahan",
] as const;
const ASSISTANT_WORDS = [
  ...PIN_WORDS, "副密码", "副密碼", "助理", "assistant", "secondary", "pembantu",
] as const;
const LOGIN_WORDS = ["密码", "密碼", "登录", "登入", "password", "login", "kata laluan", "log masuk"] as const;
const LANGUAGE_WORDS = ["语言", "語言", "language", "bahasa", "主题", "theme", "时区", "timezone"] as const;
const NOTIFY_WORDS = ["通知", "提醒", "notification", "alert", "pemberitahuan"] as const;
const COMPANY_WORDS = ["公司", "company", "syarikat", "logo", "公司资料", "公司資料"] as const;

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  // 个人资料 - everybody's.
  { href: "/profile", anchor: "profile-identity", pageKey: "profile.title", sectionKey: "profile.section.identity", keywords: ["头像", "頭像", "姓名", "name", "avatar", "phone", "电话", "nama"] },
  { href: "/profile", anchor: "profile-preferences", pageKey: "profile.title", sectionKey: "profile.section.preferences", keywords: LANGUAGE_WORDS },
  { href: "/profile", anchor: "profile-security", pageKey: "profile.title", sectionKey: "profile.section.security", keywords: LOGIN_WORDS, officeOnly: true },
  { href: "/profile", anchor: "sign-off-pin", pageKey: "profile.title", sectionKey: "signOff.profileTitle", keywords: PIN_WORDS, officeOnly: true },
  { href: "/profile", anchor: "sign-off-assistants", pageKey: "profile.title", sectionKey: "signOff.assistants.title", keywords: ASSISTANT_WORDS, officeOnly: true },

  // 公司设置 - a contractor's.
  { href: "/company-settings", anchor: "company-profile", pageKey: "siteControl.settings.title", sectionKey: "siteControl.profile.title", keywords: [...COMPANY_WORDS, "紧急联络", "emergency"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-project-defaults", pageKey: "siteControl.settings.title", sectionKey: "siteControl.projectDefaults.title", keywords: ["项目", "項目", "project", "projek", "默认", "default"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-default-categories", pageKey: "siteControl.settings.title", sectionKey: "siteControl.categories.title", keywords: ["分类", "分類", "category", "kategori", "材料", "material"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-preferences", pageKey: "siteControl.settings.title", sectionKey: "siteControl.preferences.title", keywords: LANGUAGE_WORDS, companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-permission-defaults", pageKey: "siteControl.settings.title", sectionKey: "siteControl.permissionDefaults.title", keywords: ["权限", "權限", "permission", "kebenaran", "角色", "role"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-consultant-permissions", pageKey: "siteControl.settings.title", sectionKey: "siteControl.permissionDefaults.consultant", keywords: ["顾问", "顧問", "consultant", "perunding", "权限", "permission"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-qr", pageKey: "siteControl.settings.title", sectionKey: "siteControl.qrSettings.title", keywords: ["QR", "二维码", "二維碼", "扫码", "kod QR"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-notifications", pageKey: "siteControl.settings.title", sectionKey: "siteControl.notificationSettings.title", keywords: NOTIFY_WORDS, companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-site-rules", pageKey: "siteControl.settings.title", sectionKey: "siteControl.settings.siteRules", keywords: ["规则", "規則", "rule", "peraturan", "打卡", "attendance", "照片", "photo"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-visitor-privacy", pageKey: "siteControl.settings.title", sectionKey: "siteControl.visitorPrivacy.title", keywords: ["访客", "訪客", "visitor", "pelawat", "PDPA", "隐私", "privacy"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-branches", pageKey: "siteControl.settings.title", sectionKey: "siteControl.branches.title", keywords: ["分公司", "branch", "cawangan", "地址", "address"], companyType: "OTHER" },
  { href: "/company-settings", anchor: "company-organisation", pageKey: "siteControl.settings.title", sectionKey: "organisation.title", keywords: ["部门", "部門", "工种", "工種", "department", "trade", "jabatan"], companyType: "OTHER" },

  // 公司设置 - a recycler's.
  { href: "/company-settings", anchor: "recycler-profile", pageKey: "recyclerCompanySettings.title", sectionKey: "recyclerCompanySettings.profile.title", keywords: COMPANY_WORDS, companyType: "RECYCLER" },
  { href: "/company-settings", anchor: "recycler-bank", pageKey: "recyclerCompanySettings.title", sectionKey: "recyclerCompanySettings.bank.title", keywords: ["银行", "銀行", "bank", "akaun", "account"], companyType: "RECYCLER" },
  { href: "/company-settings", anchor: "recycler-notifications", pageKey: "recyclerCompanySettings.title", sectionKey: "recyclerCompanySettings.notifications.title", keywords: NOTIFY_WORDS, companyType: "RECYCLER" },
  { href: "/company-settings", anchor: "recycler-business", pageKey: "recyclerCompanySettings.title", sectionKey: "recyclerCompanySettings.business.title", companyType: "RECYCLER" },
  { href: "/company-settings", anchor: "recycler-driver-link", pageKey: "recyclerCompanySettings.title", sectionKey: "recyclerCompanySettings.driverLink.title", keywords: ["司机", "司機", "driver", "pemandu", "链接", "link"], companyType: "RECYCLER" },
  { href: "/company-settings", anchor: "recycler-commission", pageKey: "recyclerCompanySettings.title", sectionKey: "recyclerCompanySettings.commission.title", keywords: ["佣金", "commission", "komisen"], companyType: "RECYCLER" },
  { href: "/company-settings", anchor: "recycler-links", pageKey: "recyclerCompanySettings.title", sectionKey: "recyclerCompanySettings.links.title", companyType: "RECYCLER" },

  // 系统集成 and 外部设备接入.
  { href: "/integrations", anchor: "integrations-new", pageKey: "integrations.title", sectionKey: "integrations.newTitle", keywords: ["integration", "integrasi", "集成", "API"], permission: "integration.manage" },
  { href: "/integrations", anchor: "integrations-connections", pageKey: "integrations.title", sectionKey: "integrations.connections", keywords: ["integration", "integrasi", "集成", "API", "ERP", "webhook"] },
  { href: "/integrations", anchor: "integrations-devices", pageKey: "integrations.title", sectionKey: "integrations.devices", keywords: ["设备", "設備", "device", "peranti", "CCTV", "地磅", "weighbridge"] },
  { href: "/device-integration", pageKey: "integrations.deviceOverview.title", keywords: ["设备", "設備", "device", "peranti", "无人机", "無人機", "drone", "CCTV", "地磅", "weighbridge", "塔吊"] },

  // The other settings pages.
  { href: "/external-access", pageKey: "externalAccess.title", keywords: ["外部", "链接", "link", "pautan", "access", "akses"] },
  { href: "/category-management", pageKey: "categoryManagement.title", keywords: ["分类", "分類", "category", "kategori", "施工分类"] },
  { href: "/users", pageKey: "users.title", keywords: ["用户", "用戶", "user", "pengguna", "人员", "staff"] },
  { href: "/roles", pageKey: "roles.title", keywords: ["权限", "權限", "角色", "role", "permission", "peranan", "kebenaran"] },
  { href: "/technical", anchor: "technical-server-originals", pageKey: "technical.title", sectionKey: "technical.server.title", keywords: ["原图", "原圖", "original", "照片", "photo", "备份", "backup"] },
  { href: "/technical", anchor: "technical-device", pageKey: "technical.title", sectionKey: "technical.device.title", keywords: ["上传", "上傳", "upload", "储存", "storage", "照片", "photo"] },
  { href: "/consultant-settings", pageKey: "consultantWorkflow.settingsHub.title", keywords: ["顾问", "顧問", "consultant", "perunding"] },
  { href: "/approval-credential", anchor: "credential-identity", pageKey: "consultantWorkflow.credential.title", sectionKey: "consultantWorkflow.credential.identityTitle", keywords: ["签名", "簽名", "印章", "signature", "stamp", "tandatangan"] },
  { href: "/approval-credential", anchor: "credential-pin", pageKey: "consultantWorkflow.credential.title", sectionKey: "consultantWorkflow.credential.pinTitle", keywords: [...PIN_WORDS, "审批", "審批", "approval"] },
  { href: "/detection-settings", pageKey: "weighingRules.title", keywords: ["地磅", "weighbridge", "jambatan timbang", "参数", "parameter"] },
];

export interface SettingsReader {
  portal?: Portal | string | null;
  features?: readonly string[] | null;
  permissions?: readonly string[] | null;
  is_superuser?: boolean | null;
  is_field_staff?: boolean | null;
  company_type?: string | null;
}

function allowed(permissions: readonly string[], code: string, superuser: boolean) {
  return superuser || code.split("|").some((one) => permissions.includes(one));
}

/** The settings sections this reader may open, in the table's order. */
export function visibleSettings(user: SettingsReader | null | undefined): SettingsSection[] {
  if (!user) return [];
  const permissions = user.permissions ?? [];
  const superuser = Boolean(user.is_superuser);
  return SETTINGS_SECTIONS.filter((row) => {
    if (row.officeOnly && user.is_field_staff) return false;
    if (row.companyType === "RECYCLER" && user.company_type !== "RECYCLER") return false;
    if (row.companyType === "OTHER" && user.company_type === "RECYCLER") return false;
    if (row.permission && !allowed(permissions, row.permission, superuser)) return false;
    if (row.href === "/profile") return true;
    if (!user.portal || !user.features) return false;
    return isRouteAllowed(user.portal as Portal, user.features, row.href, permissions, superuser);
  });
}

/** Lower case, no spaces: 「助理 副密码」 and 「助理副密码」 read the same. */
export function normalizeSearch(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, "");
}

/** Whether `query` finds a row whose words are `text` plus `keywords`. */
export function settingMatches(query: string, text: string, keywords: readonly string[] = []): boolean {
  const words = query.trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
  if (!words.length) return false;
  const haystack = normalizeSearch([text, ...keywords].join(" | "));
  return words.every((word) => haystack.includes(word));
}

/** The address a result opens: the page, at its section. */
export function settingHref(row: SettingsSection): string {
  return row.anchor ? `${row.href}#${row.anchor}` : row.href;
}

const HIGHLIGHT = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"];

/**
 * Scroll to the section `anchor` and light it up for a moment. The page may
 * still be loading its data, so the section is looked for a few times before
 * giving up (the page itself has opened either way).
 */
export function focusSection(anchor: string, tries = 30): void {
  if (typeof document === "undefined" || !anchor) return;
  const target = document.getElementById(anchor);
  if (!target) {
    if (tries > 0) window.setTimeout(() => focusSection(anchor, tries - 1), 200);
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add(...HIGHLIGHT);
  window.setTimeout(() => target.classList.remove(...HIGHLIGHT), 2000);
}

/** Whether `anchor` is one of the settings sections (a page opened with `#…`). */
export function isSettingsAnchor(anchor: string): boolean {
  return SETTINGS_SECTIONS.some((row) => row.anchor === anchor);
}

export interface SettingsResult {
  href: string;
  anchor?: string;
  /** 「设定 · 页面 · 区块」 in the reader's language. */
  label: string;
  keywords: readonly string[];
}

/** The reader's settings results, worded with `translate` (a message key in, its words out). */
export function settingsResults(
  user: SettingsReader | null | undefined,
  translate: (key: string) => string,
): SettingsResult[] {
  return visibleSettings(user).map((row) => {
    const parts = [translate("globalSearch.settings"), translate(row.pageKey)];
    if (row.sectionKey) parts.push(translate(row.sectionKey));
    return {
      href: settingHref(row),
      anchor: row.anchor,
      label: parts.join(" · "),
      keywords: row.keywords ?? [],
    };
  });
}

/** The results `query` finds, in the table's order. */
export function searchSettings<T extends SettingsResult>(query: string, results: readonly T[]): T[] {
  return results.filter((row) => settingMatches(query, row.label, row.keywords));
}
