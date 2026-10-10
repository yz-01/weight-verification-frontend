import { describe, expect, it } from "vitest";

import type { ContractorReportType } from "@/interfaces/contractor-report";
import {
  ALL_REPORT_FILTERS,
  PROJECT_BOUND_FILTERS,
  REPORT_FILTERS,
  filterLabelKey,
  filterOptionKey,
} from "@/lib/report-filters";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const CATALOGUES = { en, ms, "zh-TW": zhTW, zh } as const;

function lookup(catalogue: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      catalogue,
    );
}

const REPORTS = Object.keys(REPORT_FILTERS) as ContractorReportType[];

describe("report centre filter bar (2026-10-10, 图11)", () => {
  it("gives every report more than the dates: at least one filter of its own", () => {
    expect(REPORTS.sort()).toEqual(
      [
        "attendance", "consultant", "documents", "equipment", "photos",
        "progress", "recycling", "safety", "schedule", "target",
      ].sort(),
    );
    for (const report of REPORTS) {
      expect(REPORT_FILTERS[report].length, report).toBeGreaterThan(0);
    }
  });

  it("puts every filter of every report in the address", () => {
    for (const report of REPORTS) {
      for (const key of REPORT_FILTERS[report]) {
        expect(ALL_REPORT_FILTERS).toContain(key);
      }
    }
    // A machine or a plan belongs to one project; a new project clears them.
    expect(PROJECT_BOUND_FILTERS).toEqual(
      expect.arrayContaining(["category", "subcategory", "equipment", "plan"]),
    );
  });

  it("names every field, and every keyword hint, in all four languages", () => {
    for (const [language, catalogue] of Object.entries(CATALOGUES)) {
      for (const report of REPORTS) {
        for (const key of REPORT_FILTERS[report]) {
          const label = lookup(catalogue, filterLabelKey(report, key));
          expect(typeof label, `${language} ${report}.${key}`).toBe("string");
        }
        const hint = lookup(catalogue, `contractorReports.filter.keywordPlaceholder.${report}`);
        expect(typeof hint, `${language} ${report} keyword hint`).toBe("string");
      }
      for (const key of [
        "contractorReports.filter.keyword",
        "contractorReports.filter.noMatch",
        "reports.filter.keywordPlaceholder",
        "reports.filter.clear",
      ]) {
        expect(typeof lookup(catalogue, key), `${language} ${key}`).toBe("string");
      }
    }
  });

  it("names the person filter after the report's own person column", () => {
    expect(filterLabelKey("safety", "actor")).toBe("contractorReports.column.responsible_person");
    expect(filterLabelKey("attendance", "actor")).toBe("contractorReports.column.worker");
    expect(filterLabelKey("progress", "actor")).toBe("contractorReports.filter.submittedBy");
    expect(filterLabelKey("equipment", "direction")).toBe("contractorReports.column.direction");
  });

  it("words a code the way its column does, and leaves a name alone", () => {
    expect(filterOptionKey("safety", "severity", { value: "HIGH", label: "HIGH" })).toBe(
      "safety.severity.HIGH",
    );
    expect(filterOptionKey("attendance", "event", { value: "CLOCK_IN", label: "CLOCK_IN" })).toBe(
      "attendance.event.CLOCK_IN",
    );
    expect(
      filterOptionKey("recycling", "status", {
        value: "COMPLETED",
        label: "COMPLETED",
        record_type: "DISPOSAL",
      }),
    ).toBe("siteDisposal.status.COMPLETED");
    expect(
      filterOptionKey("recycling", "status", {
        value: "SETTLED",
        label: "SETTLED",
        record_type: "RECYCLE_ORDER",
      }),
    ).toBe("dispatches.state.SETTLED");
    expect(
      filterOptionKey("recycling", "record_type", { value: "DISPOSAL", label: "DISPOSAL" }),
    ).toBe("wasteClearance.kind.disposal");
    expect(filterOptionKey("progress", "actor", { value: "u1", label: "Ali" })).toBeNull();
    expect(filterOptionKey("equipment", "equipment", { value: "e1", label: "EQ-1 - Crane" })).toBeNull();
  });
});
