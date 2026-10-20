/**
 * Every report in 报表中心 has its words, and 「安全事件」 is 「整改 / EHS」
 * (J9, JB2, Q9-1).
 *
 * The four reports I11 added (现场任务, 材料出场, Progress Claim, 杂费报销)
 * had no `contractorReports.type.*` entry, so the screen printed the key -
 * `contractorReports.type.claims` (客户图 16).
 */
import { describe, expect, it } from "vitest";

import { REPORT_FILTERS } from "@/lib/report-filters";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

const CATALOGUES = { en, ms, zh, "zh-TW": zhTW } as const;
const REPORTS = Object.keys(REPORT_FILTERS);

describe("report centre words (J9)", () => {
  it.each(Object.entries(CATALOGUES))("names and describes every report type in %s", (_, words) => {
    const types = words.contractorReports.type as Record<string, string>;
    const descriptions = words.contractorReports.description as Record<string, string>;
    for (const report of REPORTS) {
      expect(types[report], report).toBeTruthy();
      expect(descriptions[report], report).toBeTruthy();
    }
  });

  it("calls the safety module 整改 / EHS in the report centre and on the dashboards", () => {
    for (const words of [zh, zhTW]) {
      expect(words.nav.submodule.safetyIncidents).toBe("整改 / EHS");
      expect(words.dashboard.tile.safety).toBe("整改 / EHS");
      expect(words.contractorDashboard.overview.safety).toBe("整改 / EHS");
      expect(words.projects.statistics.metric.safety_incidents).toBe("整改 / EHS");
    }
    expect(en.nav.submodule.safetyIncidents).toBe(en.fieldStaffPwa.nav.hazards);
    expect(ms.nav.submodule.safetyIncidents).toBe(ms.fieldStaffPwa.nav.hazards);
  });
});
