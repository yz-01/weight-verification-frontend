import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 「材料进场没有日期显示」 (Lucas, 2026-10-09). The list shows the delivery's
 * date, the same one its detail shows, as a column the 字段 picker can hide.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("材料进场 list date", () => {
  const list = read("src/components/receipts/receipts.tsx");
  const detail = read("src/components/receipts/view-receipt.tsx");

  it("is the date the detail shows", () => {
    expect(detail).toContain("df.dateTime(data.business_at ?? data.captured_at)");
    expect(list).toContain("df.dateTime(row.original.business_at ?? row.original.captured_at)");
  });

  it("is a named, sortable column right after the receipt number", () => {
    const number = list.indexOf('accessorKey: "receipt_no"');
    const date = list.indexOf('accessorKey: "business_at"');
    const acceptance = list.indexOf('id: "acceptance"');
    expect(number).toBeGreaterThan(-1);
    expect(date).toBeGreaterThan(number);
    expect(date).toBeLessThan(acceptance);
    const column = list.slice(date, acceptance);
    // A label is what the column picker lists it by; no enableHiding: false.
    expect(column).toContain('meta: { label: t("receipts.field.businessAt") }');
    expect(column).not.toContain("enableHiding");
    expect(column).toContain("<SortableHeader");
  });
});
