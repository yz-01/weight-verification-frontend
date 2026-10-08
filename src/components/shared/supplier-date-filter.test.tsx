/**
 * The supplier picker searches the server as you type (2026-10).
 *
 * It used to load one list of `page_size: 200` and filter it in the browser,
 * but `core/pagination.py` caps a page at 100 - so a company's 101st supplier
 * could never be found. Now what is typed goes out as `?search=` (debounced),
 * and the chosen supplier keeps its name on the button even when the current
 * page of results does not include it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { SUPPLIER_PAGE_SIZE, SupplierDateFilter, supplierOptions, supplierSearchQuery } =
  await import("@/components/shared/supplier-date-filter");

const read = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8").replace(/\r\n/g, "\n");

function page(rows: { id: string; name: string }[]) {
  return { results: rows, count: rows.length, page: 1, page_size: SUPPLIER_PAGE_SIZE };
}

function render(node: React.ReactNode, seed: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("supplier search", () => {
  it("asks the server for what was typed, one page at the server's own ceiling", () => {
    expect(supplierSearchQuery("  rebar ")).toEqual({ page_size: 100, sort_by: "name", search: "rebar" });
    expect(supplierSearchQuery("")).toEqual({ page_size: 100, sort_by: "name" });
    // Never more than the server gives: asking 200 got 100 and looked complete.
    expect(SUPPLIER_PAGE_SIZE).toBeLessThanOrEqual(100);
  });

  it("lists 'every supplier' first, then this page", () => {
    expect(supplierOptions([{ id: "s1", name: "Alpha" }], "全部供应商").map((o) => o.label)).toEqual([
      "全部供应商",
      "Alpha",
    ]);
  });

  it("debounces the typing and sends it, with the list searched by the server", () => {
    const source = read("components/shared/supplier-date-filter.tsx");
    expect(source).toMatch(/useDebounce\(term\.trim\(\), 300\)/);
    expect(source).toMatch(/queryKey: \["suppliers", "filter-options", search\]/);
    expect(source).toMatch(/getSuppliers\(supplierSearchQuery\(search\)\)/);
    expect(source).toMatch(/onSearch=\{setTerm\}/);
    expect(source).not.toMatch(/page_size: 200/);
    // The combobox hands the term over instead of filtering the page itself.
    const combobox = read("components/material-requests/option-combobox.tsx");
    expect(combobox).toMatch(/if \(onSearch \|\| !needle\) return options;/);
    expect(combobox).toMatch(/onSearch\?\.\(next\)/);
  });

  it("keeps the chosen supplier's name when this page does not include it", () => {
    const html = render(
      <SupplierDateFilter value={{ supplier: "far" }} onChange={() => {}} showDates={false} />,
      (client) => {
        client.setQueryData(["suppliers", "filter-options", ""], page([{ id: "s1", name: "Alpha" }]));
        client.setQueryData(["suppliers", "filter-label", "far"], { id: "far", name: "Zeta Steel" });
      },
    );
    expect(html).toContain("Zeta Steel");
    expect(html).not.toMatch(/>far</);
  });

  it("names the chosen supplier from the page when it is on it", () => {
    const html = render(
      <SupplierDateFilter value={{ supplier: "s1" }} onChange={() => {}} showDates={false} />,
      (client) => client.setQueryData(["suppliers", "filter-options", ""], page([{ id: "s1", name: "Alpha" }])),
    );
    expect(html).toContain("Alpha");
  });
});
