/**
 * Audit #13 (F8): 垃圾清运's header figures describe the list under them.
 * Opened from the head office's 原工地清运 card for one project, the header
 * used to count every record of the company.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { clearanceFigureFilters } from "@/lib/waste-clearance-figures";

const params = (query: string) => new URLSearchParams(query);

describe("垃圾清运 header figures follow the list's filters", () => {
  it("drilled from 原工地清运 for one project: that project, counted only", () => {
    expect(
      clearanceFigureFilters("disposal", params("kind=disposal&counted=1&project=p1")),
    ).toEqual({
      disposal: { project: "p1", counted: "1" },
      dispatch: { project: "p1", counted: "1" },
    });
  });

  it("drilled from 原废料订单 for every project: counted only", () => {
    expect(clearanceFigureFilters("dispatch", params("kind=dispatch&counted=1"))).toEqual({
      disposal: { counted: "1" },
      dispatch: { counted: "1" },
    });
  });

  it("a status chosen on one kind's list narrows that kind only", () => {
    expect(
      clearanceFigureFilters(
        "disposal",
        params("kind=disposal&status=COMPLETED&state=SETTLED&page=2"),
      ),
    ).toEqual({ disposal: { status: "COMPLETED" }, dispatch: {} });
    expect(
      clearanceFigureFilters(
        "dispatch",
        params("kind=dispatch&state=SETTLED&waste_type=METAL&status=COMPLETED"),
      ),
    ).toEqual({ disposal: {}, dispatch: { state: "SETTLED", waste_type: "METAL" } });
  });

  it("全部 has no filters, so the header counts everything", () => {
    expect(clearanceFigureFilters("all", params("kind=all&project=p1&counted=1"))).toEqual({
      disposal: {},
      dispatch: {},
    });
  });

  it("is what the page reads its header with", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/contractor-ops/waste-clearance.tsx"),
      "utf8",
    );
    expect(source).toContain("clearanceFigureFilters(kind, searchParams)");
    for (const call of [
      "getDisposalRequests({ page_size: 1, ...figureFilters.disposal })",
      "getDispatches({ page_size: 1, ...figureFilters.dispatch })",
      "getDisposalTotals(figureFilters.disposal)",
      "getDispatchSummary(figureFilters.dispatch)",
    ]) {
      expect(source).toContain(call);
    }
  });
});
