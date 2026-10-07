/**
 * 累计净数量 (2026-10 C9, C11, Q4): grouped by supplier, searchable by
 * material, each line opening onto its deliveries and returns with the DO,
 * supplier and manufacturer; exported through the same server lines.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import zh from "@/messages/zh.json";
import type { MaterialNetTotalRow } from "@/services/contractor.service";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/receipts",
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams("view=totals"),
}));

const { NetTotalsView, NetLineItems, groupBySupplier } = await import("@/components/receipts/material-tabs");

function line(overrides: Partial<MaterialNetTotalRow>): MaterialNetTotalRow {
  return {
    project: "p-1",
    project_name: "Site",
    supplier: "s-1",
    supplier_name: "Rebar Supply",
    material_name: "钢筋",
    material_specification: "",
    unit: "TONNE",
    received: "10.000",
    rejected: "0.000",
    returned: "4.000",
    net: "6.000",
    deliveries: 1,
    items: [],
    ...overrides,
  };
}

const ROWS = [
  line({
    items: [
      { kind: "DELIVERY", id: "r-1", reference: "RC-1", date: "2026-10-01T02:00:00Z", quantity: "10.000", unit: "TONNE", delivery_note_no: "DO-11", vehicle_plate: "ABC 1", supplier_name: "Rebar Supply", manufacturer_name: "Ann Joo", return_note_no: "" },
      { kind: "RETURN", id: "o-1", reference: "MO-1", date: "2026-10-05T02:00:00Z", quantity: "4.000", unit: "TONNE", delivery_note_no: "DO-R", vehicle_plate: "WXY 1", supplier_name: "Rebar Supply", manufacturer_name: "", return_note_no: "RN-1" },
    ],
  }),
  line({ supplier: "", supplier_name: "", material_name: "Sand", received: "5.000", returned: "0.000", net: "5.000" }),
  line({ supplier: "s-0", supplier_name: "Aggregate Co", material_name: "Gravel", received: "3.000", returned: "0.000", net: "3.000" }),
];

function render(node: React.ReactNode, rows = ROWS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["receipts", "net-totals", { project: "p-1" }], { results: rows });
  qc.setQueryData(["material-units", "all"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("累计净数量 by supplier", () => {
  it("groups by supplier name, the lines naming none last, and counts each group's returns", () => {
    const groups = groupBySupplier(ROWS);
    expect(groups.map((group) => group.supplierName)).toEqual(["Aggregate Co", "Rebar Supply", ""]);
    expect(groups.find((group) => group.supplier === "s-1")?.returnCount).toBe(1);
  });

  it("shows gross and net side by side, under each supplier, with a material search and export", () => {
    const html = render(<NetTotalsView project="p-1" />);
    expect(html).toContain("累计进场");
    expect(html).toContain("累计净数量");
    expect(html).toContain("Rebar Supply");
    expect(html).toContain("未填供应商");
    expect(html).toContain("搜索材料");
    expect(html).toContain("导出");
    // The gross stays what came in; the net is what is left.
    expect(html).toContain(">10.000<");
    expect(html).toContain(">6.000<");
    // DO is per delivery: not a column of the totals, in each line's detail.
    expect(html).not.toContain("DO-11");
    expect(html).toContain("查看逐笔");
  });

  it("opens each line onto its deliveries and returns with DO, supplier and manufacturer", () => {
    const html = render(<NetLineItems items={ROWS[0].items ?? []} unitName={(code?: string | null) => code ?? ""} df={{ date: (value: string) => value.slice(0, 10) } as never} />);
    for (const text of ["DO-11", "ABC 1", "Ann Joo", "Rebar Supply", "RN-1", "MO-1", "进场", "退场"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("/receipts/r-1");
    expect(html).toContain("/material-outgoing?record=o-1");
  });
});
