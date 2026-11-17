/**
 * JB206-12 (Lucas 11-16 audit, U1-U3): the 「?」 help that misled.
 *
 * - U1: 隐患整改 opened the help of the removed 安全事件 / 事故上报, and its own
 *   help asked for a 验收 photo the server refuses;
 * - U2: the contractor's 公司设置 talked about external links and bank details
 *   it has not had since JB99 - it has its own words now, and MSE Scrap's
 *   page keeps its own;
 * - U3: four 「谁能用」 lines named the wrong permission.
 */
import { describe, expect, it } from "vitest";

import { helpKeyFor, helpKeys } from "@/lib/page-help";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const ALL = [zh, zhTW, en, ms];

describe("隐患整改's own help (U1)", () => {
  it("is the hazard help, not the removed incident report's", () => {
    expect(helpKeyFor("MSE_TRACE", "/hazard-rectifications")).toBe("hazard_rectification");
    // 施工准证 has its own help since JB215B-3 (no longer the old 安全事件 text).
    expect(helpKeyFor("MSE_TRACE", "/permits")).toBe("permits");
  });

  it("asks for no photo at 验收", () => {
    expect(zh.pageHelp.hazard_rectification.need).not.toContain("验收要验收照片");
    expect(zh.pageHelp.hazard_rectification.then).not.toContain("没有验收照片");
    expect(zh.pageHelp.hazard_rectification.need).toContain("不用再拍照");
    expect(en.pageHelp.hazard_rectification.need).not.toMatch(/acceptance photo/);
  });
});

describe("the contractor's 公司设置 help (U2)", () => {
  it("is its own on MSE Trace and unchanged on MSE Scrap", () => {
    expect(helpKeyFor("MSE_TRACE", "/company-settings")).toBe("company_settings_trace");
    expect(helpKeyFor("MSE_SCRAP", "/company-settings")).not.toBe("company_settings_trace");
    expect(helpKeys()).toContain("company_settings_trace");
  });

  it("says nothing of external links or bank details", () => {
    for (const messages of ALL) {
      const help = messages.pageHelp.company_settings_trace;
      for (const section of ["what", "who", "need", "then", "trouble"] as const) {
        expect(help[section], section).toBeTruthy();
      }
    }
    expect(Object.values(zh.pageHelp.company_settings_trace).join("")).not.toMatch(/外部链接|银行/);
    // MSE Scrap's words are untouched.
    expect(zh.pageHelp.company_settings.need).toContain("外部链接");
  });
});

describe("「谁能用」 names the real permission (U3)", () => {
  it("in every catalogue", () => {
    for (const messages of ALL) {
      expect(messages.pageHelp.field_tasks.who).toContain("field_task.manage");
      expect(messages.pageHelp.field_tasks.who).not.toContain("task.assign");
      expect(messages.pageHelp.schedule.who).toContain("schedule.view");
      expect(messages.pageHelp.emergency_list.who).toContain("site_access.view");
      expect(messages.pageHelp.site_gps.who).toContain("field_position.view");
    }
  });
});

describe("the four English-only refusals are worded (U4)", () => {
  const codes = [
    "hazard_not_awaiting_check",
    "hazard_confirmed_by_other",
    "visitor_host_required",
    "visitor_host_not_on_project",
  ];
  it("in all four catalogues", () => {
    for (const messages of ALL) {
      const api = messages.errors.api as Record<string, string>;
      for (const code of codes) expect(api[code], code).toBeTruthy();
    }
    expect(zh.errors.api.hazard_confirmed_by_other).toContain("{confirmer}");
  });
});
