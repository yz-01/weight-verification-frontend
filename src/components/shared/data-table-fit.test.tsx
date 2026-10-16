/**
 * I39 on the shared DataTable, rendered to static markup (the runner has no
 * DOM): the table fits the page, each cell stops at two lines, the row's
 * 「查看 / 更改」 stays at the right edge, and a list's default-hidden columns
 * are off but still offered under 「字段」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ColumnDef } from "@tanstack/react-table";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => "/equipment",
  useSearchParams: () => new URLSearchParams(),
}));

const { DataTable } = await import("@/components/shared/data-table");

type Row = { id: string; name: string; supplier: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "id", meta: { label: "编号" }, header: () => "编号" },
  { accessorKey: "name", meta: { label: "名称" }, header: () => "名称" },
  { accessorKey: "supplier", meta: { label: "供应商" }, header: () => "供应商" },
  {
    id: "actions",
    enableHiding: false,
    header: () => <span className="sr-only">操作</span>,
    cell: () => <button type="button">查看</button>,
  },
];

const render = (defaultHidden?: readonly string[]) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>
        <DataTable
          columns={columns}
          rows={[{ id: "EI-001", name: "Crane 50t", supplier: "win hardware" }]}
          totalCount={1}
          page={1}
          pageSize={25}
          isLoading={false}
          isError={false}
          hasFilters={false}
          search=""
          sortBy=""
          sortOrder="asc"
          storageKey="fit-test"
          defaultHidden={defaultHidden}
          onSearchChange={() => {}}
          onSortChange={() => {}}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          onClearFilters={() => {}}
        />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );

describe("DataTable fits the page (I39-3)", () => {
  it("marks its table to fit and keeps the phone's one-line rows", () => {
    expect(render()).toMatch(/<table data-slot="table" data-fit=""[^>]*class="[^"]*max-sm:min-w-max/);
  });

  it("clamps each cell to two lines, but never the row's buttons", () => {
    const markup = render();
    expect(markup).toContain('<div data-slot="cell-fit" class="min-w-0">Crane 50t</div>');
    expect(markup).not.toMatch(/data-slot="cell-fit"[^>]*><button/);
  });
});

describe("the row's 「查看 / 更改」 stays at the right (I39-4)", () => {
  it("pins the actions head and cell", () => {
    const markup = render();
    expect(markup).toMatch(/<th data-slot="table-head" data-pin="end"/);
    expect(markup).toMatch(/<td data-slot="table-cell" data-pin="end"[^>]*><button type="button">查看<\/button>/);
  });

  it("pins nothing else", () => {
    expect(render().match(/data-pin="end"/g)).toHaveLength(2);
  });
});

describe("a list's default-hidden columns (I39-5)", () => {
  it("are off until the reader turns them on, and the rest stay", () => {
    const markup = render(["supplier"]);
    expect(markup).not.toContain("win hardware");
    expect(markup).not.toMatch(/<th[^>]*>供应商<\/th>/);
    expect(markup).toContain("EI-001");
    expect(markup).toContain("Crane 50t");
  });

  it("are all shown when a list hides none", () => {
    expect(render()).toContain("win hardware");
  });
});

describe("「整改分类」 on the hazard list, its filter, export and PDF (I39-6, ID79)", () => {
  const safety = readFileSync(
    path.join(process.cwd(), "src/components/site-operations/safety.tsx"),
    "utf8",
  );

  it("is the column's name in all four languages", () => {
    expect(messages.safety.field.category).toBe("整改分类");
    expect(zhTW.safety.field.category).toBe("整改分類");
    expect(en.safety.field.category).toBe("Rectification category");
    expect(ms.safety.field.category).toBe("Kategori pembetulan");
  });

  it("is the filter's wording too", () => {
    expect(messages.safety.filter.allCategories).toBe("全部整改分类");
    expect(zhTW.safety.filter.allCategories).toBe("全部整改分類");
    expect(en.safety.filter.allCategories).toBe("All rectification categories");
    expect(ms.safety.filter.allCategories).toBe("Semua kategori pembetulan");
  });

  it("heads the list's column and the export / PDF column from the same words", () => {
    expect(safety).toMatch(/accessorKey: "category_name",\s*meta: \{ label: t\("safety\.field\.category"\) \}/);
    expect(safety).toContain('{ key: "category_name", label: t("safety.field.category") }');
  });

  it("leaves no 「事项分类」 or 「安全分类」 in any language", () => {
    for (const file of ["zh", "zh-TW", "en", "ms"]) {
      const text = readFileSync(path.join(process.cwd(), `src/messages/${file}.json`), "utf8");
      expect(text, file).not.toMatch(/事项分类|事項分類|安全分类|安全分類/);
    }
  });
});
