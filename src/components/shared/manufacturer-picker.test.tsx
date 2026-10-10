/**
 * 指定厂商（MR） is a supplier (2026-10-10).
 *
 * The client, on 「全部厂商」: 「这个厂商也是同样是供应商，只是在MR 业主要求著名
 * 订购厂」. The picker offers the supplier list (what `get_manufacturers` now
 * returns) and adds nothing of its own; the 指定厂商（MR） column of a list
 * shows only when a row in view names one - day to day the supplier column
 * is what matters.
 *
 * Rendered to static markup like the other screen tests - the runner has no DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ManufacturerPicker,
  anyNamedManufacturer,
  hideEmptyManufacturerColumn,
} from "@/components/shared/manufacturer-picker";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

const SUPPLIER = { id: "s-ykgi", code: "S-2", name: "YKGI Sdn Bhd", is_active: true };

function picker(props: Partial<React.ComponentProps<typeof ManufacturerPicker>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["manufacturers", "picker", ""], { results: [SUPPLIER], count: 1 });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <ManufacturerPicker value="" onChange={() => {}} {...props} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("the 指定厂商（MR） picker reads the supplier list", () => {
  it("is named 指定厂商（MR） and shows the chosen supplier", () => {
    expect(picker()).toContain('aria-label="指定厂商（MR）"');
    expect(picker({ value: SUPPLIER.id })).toContain("YKGI Sdn Bhd");
  });

  it("shows a chosen one that is not on the first page by the name it was saved with", () => {
    expect(picker({ value: "s-far", knownName: "Far Away Steel" })).toContain("Far Away Steel");
  });

  it("adds nothing of its own - no second list to keep", () => {
    const html = picker();
    expect(html).not.toContain("名单里没有？新增");
    const source = readFileSync(
      path.join(process.cwd(), "src/components/shared/manufacturer-picker.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/quickAddManufacturer|quick_add_manufacturer/);
  });
});

describe("the 指定厂商（MR） column shows only when a row in view names one", () => {
  const columns = [
    { accessorKey: "receipt_no" },
    { accessorKey: "supplier_name" },
    { accessorKey: "manufacturer_name" },
    { id: "actions" },
  ];

  it("is left out when no row names a manufacturer", () => {
    const rows = [{ manufacturer_name: null }, { manufacturer_name: "" }, {}];
    expect(anyNamedManufacturer(rows)).toBe(false);
    expect(hideEmptyManufacturerColumn(columns, rows)).toEqual([
      { accessorKey: "receipt_no" },
      { accessorKey: "supplier_name" },
      { id: "actions" },
    ]);
    expect(hideEmptyManufacturerColumn(columns, undefined)).toHaveLength(3);
  });

  it("is kept when one row names one", () => {
    const rows = [{ manufacturer_name: null }, { manufacturer_name: "YKGI Sdn Bhd" }];
    expect(anyNamedManufacturer(rows)).toBe(true);
    expect(hideEmptyManufacturerColumn(columns, rows)).toEqual(columns);
  });

  it("is applied on every list and report that had the column", () => {
    for (const file of [
      "src/components/receipts/receipts.tsx",
      "src/components/contractor-ops/office-module-lists.tsx",
      "src/components/material-requests/material-requests-office.tsx",
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).toMatch(/hideEmptyManufacturerColumn\(columns, /);
    }
    const report = readFileSync(
      path.join(process.cwd(), "src/components/reports/material-report.tsx"),
      "utf8",
    );
    expect(report).toMatch(/showManufacturer && <TableHead>/);
  });
});
