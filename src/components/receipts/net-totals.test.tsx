/**
 * 累计净数量 (2026-10 C9, C11, Q4): grouped by supplier, searchable by
 * material, exported through the same server lines. Since the client's
 * 2026-10-09 request each number opens onto the records behind it, and a
 * line with returns says 「有退场记录」 (`net-breakdown.test.tsx` for what
 * opens).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

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

// What a number opens, drawn as a marker: the dialog has its own test.
vi.mock("@/components/receipts/net-breakdown", () => ({
  NetBreakdownDialog: ({ focus }: { focus: string }) => <div data-drill={focus} />,
}));

const { NetTotalsView, groupBySupplier } = await import("@/components/receipts/material-tabs");

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
    // All time, from the server (audit #23) - not the one return in view.
    supplier_return_count: 4,
    return_count: 1,
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
  it("groups by supplier name, the lines naming none last, and badges each by the supplier's returns", () => {
    const groups = groupBySupplier(ROWS);
    expect(groups.map((group) => group.supplierName)).toEqual(["Aggregate Co", "Rebar Supply", ""]);
    expect(groups.find((group) => group.supplier === "s-1")?.returnCount).toBe(4);
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
    // DO is per delivery: not a column of the totals, in the drill-down.
    expect(html).not.toContain("DO-11");
    // Nothing is open until a number is pressed.
    expect(html).not.toContain("data-drill");
  });
});

describe("每个数字点进去 (client, 2026-10-09)", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/receipts/material-tabs.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("draws 累计进场, 已退场 and 累计净数量 of every line as buttons naming what they open", () => {
    const html = render(<NetTotalsView project="p-1" />);
    const numbers = html.match(/<button[^>]*data-slot="net-number"[^>]*>/g) ?? [];
    expect(numbers).toHaveLength(ROWS.length * 3);
    expect(html).toContain('aria-label="查看累计进场 10.000 是哪些记录"');
    expect(html).toContain('aria-label="查看已退场 4.000 是哪些记录"');
    expect(html).toContain('aria-label="查看累计净数量 6.000 是哪些记录"');
    // Reject is not a number the client asked to open.
    expect(html).not.toContain("查看Reject");
  });

  it("presses each number into the dialog on its own tab, and the dialog into the page's filters", () => {
    for (const focus of ["received", "returned", "net"]) {
      expect(source).toMatch(new RegExp(`onOpen=\\{\\(\\) => setDrill\\(\\{ row, focus: "${focus}" \\}\\)\\}`));
    }
    expect(source).toMatch(/<NetBreakdownDialog[\s\S]{0,200}row=\{drill\.row\}[\s\S]{0,40}query=\{query\}[\s\S]{0,40}focus=\{drill\.focus\}/);
  });

  it("tags only a line with completed returns 「有退场记录」, and the tag opens its returns", () => {
    const html = render(<NetTotalsView project="p-1" />);
    const tags = html.match(/<button[^>]*data-slot="net-return-tag"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain("这一行有 1 笔已完成的退场，点开查看");
    expect(html).toContain("有退场记录");
    expect(source).toMatch(/data-slot="net-return-tag"[\s\S]{0,500}onClick=\{\(\) => setDrill\(\{ row, focus: "returned" \}\)\}/);
  });
});
