/**
 * 累计进场与退场 (2026-10 C9, C11, Q4): grouped by supplier, searchable by
 * material, exported through the same server lines. Since the client's
 * 2026-10-09 request each number opens onto the records behind it, and a
 * line with returns says 「有退货资料」 (`net-breakdown.test.tsx` for what
 * opens). No 累计净数量 column since 2026-10-10 (Lucas: 「累计净数量可以移除，
 * 不需要进场减退场」).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";
import type { MaterialNetTotalRow } from "@/services/contractor.service";

const MESSAGES = { zh, "zh-TW": zhTW, en, ms };

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

const { NetTotalsView, groupBySupplier, netTotalsExportColumns } = await import("@/components/receipts/material-tabs");

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

function render(node: React.ReactNode, rows = ROWS, locale: "zh" | "zh-TW" | "en" | "ms" = "zh") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["receipts", "net-totals", { project: "p-1" }], { results: rows });
  qc.setQueryData(["material-units", "all"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("累计进场与退场 by supplier", () => {
  it("groups by supplier name, the lines naming none last, and badges each by the supplier's returns", () => {
    const groups = groupBySupplier(ROWS);
    expect(groups.map((group) => group.supplierName)).toEqual(["Aggregate Co", "Rebar Supply", ""]);
    expect(groups.find((group) => group.supplier === "s-1")?.returnCount).toBe(4);
  });

  it("shows received and returned side by side, no net, under each supplier, with a material search and export", () => {
    const html = render(<NetTotalsView project="p-1" />);
    expect(html).toContain("送来工地");
    expect(html).toContain("退回供应商");
    // Lucas 2026-10-10: no 进场 − 退场 column, nor a sentence about one.
    expect(html).not.toContain("累计净数量");
    expect(html).toContain("Rebar Supply");
    expect(html).toContain("未填供应商");
    expect(html).toContain("搜索材料");
    expect(html).toContain("导出");
    // The gross stays what came in; the net (6.000) is not shown.
    expect(html).toContain(">10<");
    expect(html).toContain(">4<");
    expect(html).not.toContain(">6<");
    expect(html).not.toContain(">6.000<");
    // DO is per delivery: not a column of the totals, in the drill-down.
    expect(html).not.toContain("DO-11");
    // Nothing is open until a number is pressed.
    expect(html).not.toContain("data-drill");
  });
});

describe("plain words (I41, IB20)", () => {
  it("heads the columns in plain words and explains them in three short lines", () => {
    const html = render(<NetTotalsView project="p-1" />);
    for (const text of ["送来工地", "退回供应商", "验收不合格（不算）", "规格"]) {
      expect(html).toContain(`>${text}</th>`);
    }
    for (const old of ["累计进场", "已退场", "Reject（不计入）", "材料规格"]) expect(html).not.toContain(old);
    expect(html).toContain("送来工地：验收合格的数量，一直累计。");
    expect(html).toContain("退回供应商：后台确认完成的退货。");
    expect(html).toContain("验收不合格：没有收下，不算进去。");
    expect(html).toContain("搜索材料或供应商");
  });

  it("has the new headings in all four languages, and the export says the same words", () => {
    const heads = {
      zh: ["送来工地", "退回供应商", "验收不合格（不算）", "规格"],
      "zh-TW": ["送來工地", "退回供應商", "驗收不合格（不算）", "規格"],
      en: ["Delivered to site", "Sent back to supplier", "Failed check (not counted)", "Spec"],
      ms: ["Dihantar ke tapak", "Dipulangkan kepada pembekal", "Gagal semakan (tidak dikira)", "Spesifikasi"],
    } as const;
    for (const locale of ["zh", "zh-TW", "en", "ms"] as const) {
      const html = render(<NetTotalsView project="p-1" />, ROWS, locale);
      for (const text of heads[locale]) expect(html).toContain(`>${text}</th>`);
      const t = (key: string) =>
        key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], MESSAGES[locale]) as string;
      const labels = netTotalsExportColumns(t, {}).map((column) => column.label);
      for (const text of heads[locale]) expect(labels).toContain(text);
    }
  });

  it("reads numbers plainly: 22.000 is 22, 50350 is 50,350, nothing is a dash", () => {
    const html = render(<NetTotalsView project="p-1" />, [
      line({ received: "50350.000", returned: "12.700", rejected: "0.000" }),
      line({ material_name: "Sand", received: "22.000", returned: "0.000", rejected: "1.500" }),
    ]);
    expect(html).toContain(">50,350<");
    expect(html).toContain(">12.7<");
    expect(html).toContain(">22<");
    expect(html).toContain(">1.5<");
    expect(html).toContain(">—<");
    expect(html).not.toContain("22.000");
    expect(html).not.toContain("50350");
  });

  it("makes each supplier a collapsible heading naming how many materials, apart from the material rows", () => {
    const html = render(<NetTotalsView project="p-1" />, [
      line({ material_name: "钢筋" }),
      line({ material_name: "水泥" }),
      line({ supplier: "s-0", supplier_name: "Aggregate Co", material_name: "Gravel" }),
    ]);
    expect(html).toContain("供应商：Rebar Supply · 2 种材料");
    expect(html).toContain("供应商：Aggregate Co · 1 种材料");
    expect(html).toContain('data-slot="net-supplier-toggle"');
    expect(html).toContain('aria-expanded="true"');
    // Not a record: not the material rows' background.
    const heading = (html.match(/<tr[^>]*>/g) ?? []).find((tag) => tag.includes('data-slot="net-supplier"'));
    expect(heading?.split(" ")).toContain("bg-primary/10");
    const materialRow = (html.match(/<tr[^>]*>/g) ?? []).find((tag) => tag.includes('data-slot="net-line"'));
    expect(materialRow?.split(" ")).not.toContain("bg-primary/10");
    expect(html.match(/data-slot="net-line"/g)).toHaveLength(3);
  });

  it("shows only the headings, with the count, when the groups are closed", () => {
    const html = render(<NetTotalsView project="p-1" defaultCollapsed />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("供应商：Rebar Supply · 1 种材料");
    expect(html).not.toContain('data-slot="net-line"');
    // The supplier's 有退货资料 stays on the heading.
    expect(html).toContain("有退货资料");
  });

  it("searches the server for material or supplier (IB20) and says plainly when nothing is found", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/receipts/material-tabs.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    // One box, one `material` term: the server matches the supplier's name too,
    // so the screen, the export and the breakdown share it.
    expect(source).toMatch(/Object\.entries\(\{ project, material, \.\.\.filters \}\)/);
    expect(source).toContain("receipts.net.searchEmpty");
    expect(zh.receipts.net.searchEmpty.replace("{term}", "best")).toBe(
      "找不到「best」。可以搜材料名称或供应商名称。",
    );
  });
});

describe("leftovers of the plain-words pass (I41 review)", () => {
  it("clears the closed groups when the search changes, and names the Material In summary in plain words", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/receipts/material-tabs.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(source).toContain("pressed.search === material");
    expect(zh.receipts.net.title).toBe("按供应商看总数");
    expect(zhTW.receipts.net.title).toBe("按供應商看總數");
    expect(en.receipts.net.title).toBe("Totals by supplier");
    expect(ms.receipts.net.title).toBe("Jumlah mengikut pembekal");
  });

  it("joins the Chinese note sentences without an ASCII space", () => {
    for (const note of [zh.receipts.net.note, zhTW.receipts.net.note]) {
      expect(note).not.toContain("。 ");
    }
  });
});

describe("每个数字点进去 (client, 2026-10-09)", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/receipts/material-tabs.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("draws 累计进场 and 已退场 of every line as buttons naming what they open", () => {
    const html = render(<NetTotalsView project="p-1" />);
    const numbers = html.match(/<button[^>]*data-slot="net-number"[^>]*>/g) ?? [];
    expect(numbers).toHaveLength(ROWS.length * 2);
    expect(html).toContain('aria-label="查看送来工地 10 是哪些记录"');
    expect(html).toContain('aria-label="查看退回供应商 4 是哪些记录"');
    expect(html).toContain('title="点一下看是哪几笔"');
    // Reject is not a number the client asked to open.
    expect(html).not.toContain("查看Reject");
  });

  it("presses each number into the dialog on its own tab, and the dialog into the page's filters", () => {
    for (const focus of ["received", "returned"]) {
      expect(source).toMatch(new RegExp(`onOpen=\\{\\(\\) => setDrill\\(\\{ row, focus: "${focus}" \\}\\)\\}`));
    }
    expect(source).toMatch(/<NetBreakdownDialog[\s\S]{0,200}row=\{drill\.row\}[\s\S]{0,40}query=\{query\}[\s\S]{0,40}focus=\{drill\.focus\}/);
  });

  it("tags only a line with completed returns 「有退货资料」, and the tag opens its returns", () => {
    const html = render(<NetTotalsView project="p-1" />);
    const tags = html.match(/<button[^>]*data-slot="net-return-tag"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain("这一行有 1 笔已完成的退场，点开查看");
    expect(html).toContain("有退货资料");
    expect(html).not.toContain("有退场记录");
    expect(source).toMatch(/data-slot="net-return-tag"[\s\S]{0,500}onClick=\{\(\) => setDrill\(\{ row, focus: "returned" \}\)\}/);
  });
});
