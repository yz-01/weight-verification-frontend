/**
 * JB215B-6 (Lucas 11-17, jb202 #35 / #36 「left」): two English layouts that
 * needed more than a wrap, fixed without moving the Chinese one.
 *
 * - 操作记录's 动作 cell is an operation name over its badge. In English the
 *   name takes two lines and the fitted table's two-line clamp hid the badge
 *   (「Updated」) under them. A column may now keep its own lines
 *   (`meta.unclamped`); this one does, and clamps the name itself to two lines
 *   on a desktop, so the badge always shows.
 * - 分类管理's material table: in English three columns and the row buttons
 *   slid off the right of the table on a desktop. The row buttons may wrap;
 *   where they fit on one line (Chinese) nothing moves.
 *
 * Rendered to static markup (the runner has no DOM) or read in the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ColumnDef } from "@tanstack/react-table";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => "/audit-logs",
  useSearchParams: () => new URLSearchParams(),
}));

const { DataTable, columnUnclamped } = await import("@/components/shared/data-table");

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

type Row = { id: string; name: string; action: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", meta: { label: "名称" }, header: () => "名称" },
  {
    accessorKey: "action",
    meta: { label: "动作", unclamped: true },
    header: () => "动作",
    cell: ({ row }) => (
      <div data-marker="action-cell">
        <p>{row.original.action}</p>
        <span data-marker="badge" />
      </div>
    ),
  },
];

const render = () =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>
        <DataTable
          columns={columns}
          rows={[{ id: "1", name: "Crane 50t", action: "Updated the site worker's details" }]}
          totalCount={1}
          page={1}
          pageSize={25}
          isLoading={false}
          isError={false}
          hasFilters={false}
          search=""
          sortBy=""
          sortOrder="asc"
          storageKey="jb215b-unclamped"
          onSearchChange={() => {}}
          onSortChange={() => {}}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          onClearFilters={() => {}}
        />
      </TooltipProvider>
    </NextIntlClientProvider>,
  );

describe("JB215B-6 a column that keeps its own lines", () => {
  it("is read from meta.unclamped", () => {
    expect(columnUnclamped({ label: "x", unclamped: true })).toBe(true);
    expect(columnUnclamped({ label: "x" })).toBe(false);
    expect(columnUnclamped(undefined)).toBe(false);
  });

  it("is not put under the two-line clamp; the other cells still are", () => {
    const markup = render();
    expect(markup).toContain('<div data-slot="cell-fit" class="min-w-0">Crane 50t</div>');
    expect(markup).not.toMatch(/data-slot="cell-fit"[^>]*><div data-marker="action-cell"/);
    expect(markup).toContain('data-marker="action-cell"');
  });
});

describe("JB215B-6 操作记录's 动作 cell", () => {
  const source = read("src/components/audit/audit-logs.tsx");

  it("keeps its badge in sight under a two-line operation name", () => {
    expect(source).toContain('meta: { label: t("audit.field.action"), unclamped: true },');
    expect(source).toContain('className="max-w-52 text-sm font-medium leading-snug sm:line-clamp-2"');
  });
});

describe("JB215B-6 分类管理's row buttons", () => {
  const source = read("src/components/contractor-ops/category-management.tsx");

  it("may wrap instead of pushing the table off the page", () => {
    expect(source).toContain('<div className="flex flex-wrap items-center gap-1" data-slot="category-row-actions">');
    expect(source).not.toMatch(/<TableCell>\n\s+<div className="flex items-center gap-1">\n\s+\{\/\* For every reader/);
  });
});
