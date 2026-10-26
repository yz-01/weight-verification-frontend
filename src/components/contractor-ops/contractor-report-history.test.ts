import { describe, expect, it } from "vitest";

import { dateTime24, savedConditions } from "@/components/contractor-ops/contractor-report-history";
import type { ContractorReportExportRecord } from "@/interfaces/contractor-report";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

/**
 * JB27 (客户 10-26 事项 3): old history rows generated again from what they
 * saved; the log's time in 24-hour form; the tab and filters in every
 * language.
 */

const OLD: ContractorReportExportRecord = {
  id: "old",
  report_type: "safety",
  export_format: "PDF",
  date_from: "2026-09-01",
  date_to: "2026-09-30",
  filters: { project: "p1", category: "", status: "OPEN", keyword: "crane", unknown: "x" },
  file_name: "safety-20260930.pdf",
  metric_count: 3,
  project: "p1",
  project_name: "Site",
  generated_by_name: "A",
  generated_by_email: "a@x",
  created_at: "2026-09-30T10:00:00+08:00",
  has_file: false,
  file_size: 0,
  file_sha256: "",
};

describe("按当时条件重新生成", () => {
  it("sends back the report, project, period and saved filters", () => {
    expect(savedConditions(OLD)).toEqual({
      report_type: "safety",
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      project: "p1",
      status: "OPEN",
      keyword: "crane",
    });
  });

  it("reads the project from the saved filters on an old row without one", () => {
    expect(savedConditions({ ...OLD, project: null }).project).toBe("p1");
    expect(savedConditions({ ...OLD, project: null, filters: {} }).project).toBeUndefined();
  });
});

describe("操作日期及时间（24小时制）", () => {
  it("is always 24-hour", () => {
    const value = new Date(2026, 9, 26, 15, 4, 5).toISOString();
    expect(dateTime24(value)).toBe("2026-10-26 15:04:05");
  });
});

describe("the words", () => {
  it.each([
    ["en", en],
    ["zh", zh],
    ["zh-TW", zhTW],
    ["ms", ms],
  ])("%s has the tabs, filters, actions and PIN wording", (_language, messages) => {
    const history = messages.contractorReports.history as Record<string, unknown>;
    for (const key of ["tabReports", "tabLog", "regenerate", "rowActions", "count"]) {
      expect(history[key]).toBeTruthy();
    }
    expect(Object.keys(history.action as object).sort()).toEqual(["DOWNLOAD", "PRINT", "SEND"]);
    const actions = messages.signOff.action as Record<string, string>;
    for (const key of ["file_print", "file_download", "file_send"]) expect(actions[key]).toBeTruthy();
    expect((messages.errors.api as Record<string, string>).report_export_not_regenerable).toBeTruthy();
  });

  it("uses the client's own words in Chinese", () => {
    expect(zh.contractorReports.history.tabLog).toBe("操作记录");
    expect(zh.contractorReports.history.regenerate).toBe("按当时条件重新生成");
  });
});
