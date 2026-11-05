/**
 * Every setting in the top search (JB70, client 10-29: 「找不到查询入口」).
 *
 * 「助理副密码」 / 「副密码」 / 「PIN」 find the assistant section; each result
 * reads 「设定 · 页面 · 区块」 and opens the page at the section's own id; a page
 * the reader may not open is not listed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import {
  SETTINGS_SECTIONS,
  searchSettings,
  settingsResults,
  visibleSettings,
  type SettingsReader,
} from "@/lib/settings-search";

type Messages = Record<string, unknown>;

function lookup(messages: Messages, key: string): string | undefined {
  let value: unknown = messages;
  for (const part of key.split(".")) {
    value = value && typeof value === "object" ? (value as Messages)[part] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

const translator = (messages: Messages) => (key: string) => lookup(messages, key) ?? key;

const OFFICE: SettingsReader = {
  portal: "MSE_TRACE",
  features: ["company_settings", "integrations", "users", "roles", "project_categories"],
  permissions: ["company_settings.manage", "integration.view", "integration.manage", "external_access.manage"],
  is_superuser: false,
  is_field_staff: false,
  company_type: "CONTRACTOR",
};

/** A recycler's office: its back office keeps 系统集成 (「回收商后台不动」). */
const YARD: SettingsReader = {
  ...OFFICE,
  portal: "MSE_SCRAP",
  features: ["company_settings", "integrations", "users", "roles"],
  company_type: "RECYCLER",
};

function found(query: string, user: SettingsReader = OFFICE, messages: Messages = zh as Messages) {
  return searchSettings(query, settingsResults(user, translator(messages)));
}

describe("the assistant's PIN is found", () => {
  for (const query of ["助理副密码", "副密码", "PIN", "助理", "签核密码", "密码", "pin"]) {
    it(`by 「${query}」`, () => {
      const hrefs = found(query).map((row) => row.href);
      expect(hrefs).toContain("/profile#sign-off-assistants");
    });
  }

  it("as 「设定 · 个人资料 · 助理副密码」", () => {
    const row = found("助理副密码").find((result) => result.anchor === "sign-off-assistants");
    expect(row?.label).toBe("设定 · 个人资料 · 助理副密码");
  });

  it("and my own sign-off PIN by 签核密码 / PIN", () => {
    expect(found("签核密码").map((row) => row.anchor)).toContain("sign-off-pin");
    expect(found("PIN").map((row) => row.anchor)).toContain("sign-off-pin");
  });

  it("in Traditional Chinese, English and Malay too", () => {
    expect(found("副密碼", OFFICE, zhTW as Messages).map((row) => row.anchor)).toContain("sign-off-assistants");
    expect(found("assistant", OFFICE, en as Messages).map((row) => row.anchor)).toContain("sign-off-assistants");
    expect(found("pembantu", OFFICE, ms as Messages).map((row) => row.anchor)).toContain("sign-off-assistants");
    expect(found("kata laluan", OFFICE, ms as Messages).map((row) => row.anchor)).toContain("sign-off-pin");
  });
});

describe("who sees what", () => {
  it("lists no page the reader may not open", () => {
    const noIntegrations = { ...OFFICE, features: ["company_settings"], permissions: ["company_settings.manage"] };
    const hrefs = visibleSettings(noIntegrations).map((row) => row.href);
    expect(hrefs).not.toContain("/integrations");
    expect(hrefs).not.toContain("/device-integration");
    expect(found("集成", noIntegrations)).toEqual([]);
    // With it, they are there - on a recycler's back office; a contractor's
    // has no 系统集成 since JB99.
    expect(visibleSettings(YARD).map((row) => row.href)).toContain("/integrations");
  });

  it("keeps a section that needs its own permission for who holds it", () => {
    const viewOnly = { ...YARD, permissions: ["integration.view"] };
    expect(visibleSettings(viewOnly).map((row) => row.anchor)).not.toContain("integrations-new");
    expect(visibleSettings(YARD).map((row) => row.anchor)).toContain("integrations-new");
  });

  it("finds no technical setting for a contractor (JB99)", () => {
    // Even holding every code it once held: 系统集成、外部访问链接、技术管理
    // are out of the contractor's menu, and so out of its search.
    const rows = visibleSettings(OFFICE);
    const hrefs = rows.map((row) => row.href);
    expect(hrefs).not.toContain("/integrations");
    expect(hrefs).not.toContain("/external-access");
    expect(hrefs).not.toContain("/technical");
    expect(hrefs).toContain("/device-integration");
    // 公司设置 is its three blocks; nothing MSE manages is offered.
    const company = rows.filter((row) => row.href === "/company-settings").map((row) => row.anchor);
    expect(company).toEqual(["company-profile", "company-preferences", "company-branches"]);
    expect(found("二维码")).toEqual([]);
    // 部门与工种 is found on its own page under 用户.
    const people = { ...OFFICE, permissions: [...(OFFICE.permissions ?? []), "department.view"] };
    expect(found("工种", people).map((row) => row.href)).toEqual(["/departments-trades"]);
  });

  it("gives everybody their profile, the PIN sections to office accounts only", () => {
    const nobody = { ...OFFICE, features: [], permissions: [] };
    expect(visibleSettings(nobody).every((row) => row.href === "/profile")).toBe(true);
    expect(visibleSettings(nobody).map((row) => row.anchor)).toContain("sign-off-assistants");
    const phone = { ...nobody, is_field_staff: true };
    const anchors = visibleSettings(phone).map((row) => row.anchor);
    expect(anchors).toContain("profile-identity");
    expect(anchors).not.toContain("sign-off-assistants");
  });

  it("shows a company the sections of its own 公司设置", () => {
    const contractor = visibleSettings(OFFICE).map((row) => row.anchor);
    expect(contractor).toContain("company-profile");
    expect(contractor).not.toContain("recycler-bank");
    const recycler = visibleSettings({ ...OFFICE, portal: "MSE_SCRAP", company_type: "RECYCLER" }).map(
      (row) => row.anchor,
    );
    expect(recycler).toContain("recycler-bank");
    expect(recycler).not.toContain("company-profile");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !name.endsWith(".test.tsx") ? [path] : [];
  });
}

describe("the table", () => {
  it("names words that exist in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms] as Messages[]) {
      expect(lookup(messages, "globalSearch.settings")).toBeTruthy();
      for (const row of SETTINGS_SECTIONS) {
        expect(lookup(messages, row.pageKey), row.pageKey).toBeTruthy();
        if (row.sectionKey) expect(lookup(messages, row.sectionKey), row.sectionKey).toBeTruthy();
      }
    }
  });

  it("points at an id each page really carries", () => {
    const source = sourceFiles(join(process.cwd(), "src", "components")).map((path) => readFileSync(path, "utf8")).join("\n");
    for (const row of SETTINGS_SECTIONS) {
      if (!row.anchor) continue;
      expect(source.includes(`id="${row.anchor}"`), row.anchor).toBe(true);
    }
  });

  it("has a page for every address", () => {
    for (const row of SETTINGS_SECTIONS) {
      const page = join(process.cwd(), "src", "app", "(dashboard)", row.href.slice(1), "page.tsx");
      expect(statSync(page).isFile(), row.href).toBe(true);
    }
  });
});
