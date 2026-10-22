/**
 * 报表中心 speed (2026-10-22): the material report opens with two requests,
 * not one per row.
 *
 * Its 「收货明细」 drew each row's photographs by fetching the whole delivery
 * (`getReceipt`) - up to 100 requests a page, each loading full-size stamped
 * photographs into 32 px boxes - and asked for the rows only after the
 * figures had arrived.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sameProjectPlaceholder } from "@/components/reports/material-report";

const source = readFileSync(
  path.join(process.cwd(), "src", "components/reports/material-report.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("material report requests", () => {
  it("never fetches a delivery per row: the strip is the row's own photo_thumbs", () => {
    expect(source).not.toMatch(/\bgetReceipt\(/);
    expect(source).toMatch(/<PhotoStrip\s+thumbs=\{record\.photo_thumbs\}/);
    // The photographs are read only when one is opened.
    expect(source).toMatch(/photos=\{recordPhotos\("MATERIAL_RECEIPT", record\.id, record\.receipt_no\)\}/);
  });

  it("asks for the rows beside the figures, not after them", () => {
    const body = source.slice(source.indexOf("export function MaterialReport("));
    const summary = body.indexOf('queryKey: ["receipts", "summary", mode, filters]');
    const rows = body.indexOf("useDeliveryRecords(filters, list.page, list.pageSize");
    const gate = body.indexOf("(summary.data?.total_receipts ?? 0) > 0 && (");
    expect(summary).toBeGreaterThan(-1);
    // Called in the report itself, before the table that waits on the figures.
    expect(rows).toBeGreaterThan(summary);
    expect(rows).toBeLessThan(gate);
  });
});

describe("sameProjectPlaceholder", () => {
  const page = { results: [1] };

  it("keeps the last page while the next loads in the same project", () => {
    const keep = sameProjectPlaceholder<typeof page>({ project: "p1" });
    expect(keep(page, { queryKey: ["receipts", "report-records", { project: "p1" }, 2, 25] })).toBe(page);
  });

  it("drops another project's rows when the top bar moves", () => {
    const keep = sameProjectPlaceholder<typeof page>({ project: "p2" });
    expect(keep(page, { queryKey: ["receipts", "report-records", { project: "p1" }, 1, 25] })).toBeUndefined();
  });
});
