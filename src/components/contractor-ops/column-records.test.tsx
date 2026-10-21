/**
 * J34-6, J34-7: a column's records as the client's picture (图 6), on real data.
 * The figures say 较昨日 and 较上月同期 from what is counted, a column without
 * a target says so and has no completion card, the tabs carry their counts.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ColumnSummary, StageTabs, pageWindow } from "@/components/contractor-ops/column-records";
import type { CategorySummary } from "@/interfaces/contractor-ops";
import messages from "@/messages/zh.json";

const material: CategorySummary = {
  measure: "quantity",
  unit: "TONNE",
  unit_label: null,
  other_units: false,
  today: "200.000",
  yesterday: "120.000",
  month: "1850.000",
  last_month: "1530.000",
  total: "8650.000",
  target: { target_quantity: "10000.000", net: "8650.000", remaining: "1350.000", percent: 86.5, status: "APPROACHING" },
  suppliers: 8,
};

function wrap(node: React.ReactNode, summary?: CategorySummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (summary) client.setQueryData(["category-records", "summary", "material", "c1"], summary);
  client.setQueryData(["material-units"], []);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("a column's page as the client's picture (J34-6)", () => {
  it("draws the six figures with 较昨日, 较上月同期, the target and how far along", () => {
    const html = wrap(<ColumnSummary moduleKey="material" column="c1" />, material);
    expect(html).toContain("今日收货");
    expect(html).toContain("较昨日");
    expect(html).toContain("80");
    expect(html).toContain("较上月同期");
    expect(html).toContain("占项目目标 86.5%");
    expect(html).toContain("剩余 1,350");
    expect(html).toContain("完成率");
    expect(html).toContain("供应商数量");
    expect(html.match(/data-summary-card=/g)).toHaveLength(6);
  });

  it("says there is no target rather than showing one, and no completion card", () => {
    const html = wrap(<ColumnSummary moduleKey="material" column="c1" />, { ...material, target: null });
    expect(html).toContain("未设定目标");
    expect(html).not.toContain("完成率");
  });

  it("counts records where the column has no quantity, and no supplier card without suppliers", () => {
    const counts: CategorySummary = { ...material, measure: "count", unit: null, today: 3, yesterday: 3, month: 9, last_month: 0, total: 40, target: null, suppliers: null };
    const html = wrap(<ColumnSummary moduleKey="material" column="c1" />, counts);
    expect(html).toContain("今日记录");
    expect(html).toContain("持平");
    expect(html).not.toContain("供应商数量");
    expect(html).not.toContain("项目目标");
  });

  it("puts each tab's count beside it, in the words of acceptance for material", () => {
    const html = wrap(
      <StageTabs moduleKey="material" tabs={{ all: 158, pending: 8, done: 142, returned: 2 }} value={undefined} onChange={() => {}} />,
    );
    expect(html).toContain("全部记录 (158)");
    expect(html).toContain("待验收 (8)");
    expect(html).toContain("已验收 (142)");
    expect(html).toContain("已拒收 (2)");
  });

  it("numbers the pages the first, the last and two either side", () => {
    expect(pageWindow(1, 16)).toEqual([1, 2, 3, null, 16]);
    expect(pageWindow(8, 16)).toEqual([1, null, 6, 7, 8, 9, 10, null, 16]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});
