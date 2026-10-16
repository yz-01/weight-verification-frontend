import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LIST_FITS } from "@/lib/list-fits";

/**
 * I39 guard (I39-1, I39-2, I39-4): every back-office list keeps its header
 * on top while the rows scroll, fits the page, and keeps its 「查看 / 更改」
 * at the right edge - including lists written after this one.
 *
 * The client (2026-10-16): 「所有电脑后台业务列表页面采用相同规则，不要只修改
 * 单一模块」. Read from the source, the way the other layout guards are.
 */

const ROOT = process.cwd();
const read = (file: string) =>
  readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [rel] : [];
  });
}

const COMPONENTS = walk("src/components");

/**
 * The only hand-written HTML tables left, none of them a list: the printed
 * emergency list's own HTML, the Excel import preview inside a dialog, and
 * the weighbridge gateway's raw readings.
 */
const RAW_TABLE_ALLOWED = new Set([
  "src/components/ui/table.tsx",
  "src/components/site-access/emergency-list-workspace.tsx",
  "src/components/schedule-planning/schedule-planning-workspace.tsx",
  "src/components/scales/gateway-panel.tsx",
]);

/** Shared tables with no header row at all: label / value sheets, not lists. */
const HEADERLESS_ALLOWED = new Set([
  "src/components/shared/doc-view.tsx",
  "src/components/shared/file-actions.tsx",
  "src/components/cloud-services/cloud-service-management-workspace.tsx",
]);

/**
 * The business lists drawn on the shared Table rather than DataTable, and
 * whether a row there has its own buttons, which then stay at the right.
 */
const SHARED_TABLE_LISTS: Record<string, { pinned: boolean }> = {
  "src/components/receipts/material-targets.tsx": { pinned: true },
  "src/components/receipts/material-tabs.tsx": { pinned: false },
  "src/components/equipment-hours/equipment-operator-hours.tsx": { pinned: true },
  "src/components/progress/daily-reports.tsx": { pinned: true },
  "src/components/contractor-ops/waste-clearance.tsx": { pinned: true },
  "src/components/contractor-ops/claim-engine.tsx": { pinned: true },
  "src/components/contractor-ops/archive-queue.tsx": { pinned: true },
  "src/components/contractor-ops/contractor-report-workspace.tsx": { pinned: true },
  "src/components/contractor-ops/equipment-supplier-counts.tsx": { pinned: false },
  "src/components/site-operations/presence-summary.tsx": { pinned: false },
};

describe("the shared table keeps its header and its actions in sight", () => {
  const table = read("src/components/ui/table.tsx");
  const css = read("src/app/globals.css");
  const dataTable = read("src/components/shared/data-table.tsx");

  it("has a sticky, opaque header inside a box no taller than the screen (IB3)", () => {
    expect(table).toMatch(/data-slot="table-header"[\s\S]*?"sticky top-0 z-10 bg-card/);
    expect(table).toMatch(/data-slot="table-container"[\s\S]*?overflow-auto/);
    expect(css).toMatch(/\[data-slot="table-container"\] \{\s*max-height: var\(--table-max-h/);
  });

  it("pins a head or cell marked pin=\"end\" to the right edge, over the rows", () => {
    expect(table).toMatch(/data-slot="table-head"\s+data-pin=\{pin\}/);
    expect(table).toMatch(/data-slot="table-cell"\s+data-pin=\{pin\}/);
    expect(css).toMatch(
      /\[data-slot="table"\] :is\(th, td\)\[data-pin="end"\] \{\s*position: sticky;\s*right: 0;[\s\S]*?background-color: var\(--card\)/,
    );
  });

  it("fits a marked table to the page on a desktop: no one-line minimum, wrapping cells, 13 px", () => {
    expect(table).toMatch(/data-fit=\{fit \? "" : undefined\}/);
    const fit = css.slice(css.indexOf("@media (min-width: 40rem) {\n  [data-slot=\"table\"][data-fit]"));
    expect(fit).toMatch(/\[data-fit\] \{\s*min-width: 0;\s*width: 100%;\s*table-layout: auto;\s*font-size: 13px;/);
    expect(fit).toMatch(/> td \{\s*padding-inline: 0\.5rem;\s*font-size: 13px;\s*white-space: normal;/);
    expect(fit).toMatch(/\[data-slot="cell-fit"\] \{[\s\S]*?-webkit-line-clamp: 2;[\s\S]*?overflow: hidden;/);
  });

  it("DataTable fits, clamps cells to two lines and pins its actions column", () => {
    expect(dataTable).toMatch(/<Table fit containerClassName="min-h-0 flex-1" className="w-full max-sm:min-w-max/);
    expect(dataTable).toMatch(/PINNED_END_COLUMNS = \["actions", "view"\] as const/);
    expect(dataTable).toMatch(/pin=\{header\.column\.id === pinnedId \? "end" : undefined\}/);
    expect(dataTable).toMatch(/pin=\{cell\.column\.id === pinnedId \? "end" : undefined\}/);
    expect(dataTable).toMatch(/<CellFit>\s*\{flexRender\(cell\.column\.columnDef\.cell/);
    // The header stays the table's own sticky header.
    expect(dataTable).toMatch(/<TableHeader className="sticky top-0 z-10 bg-card/);
  });

  it("the module frame always ends a row with the eye, so there is something to pin", () => {
    const frame = read("src/components/shared/module-records-table.tsx");
    expect(frame).toMatch(/id: "actions",\s*enableHiding: false/);
    expect(frame).toMatch(/defaultHidden=\{defaultHidden\}/);
  });
});

describe("no back-office list escapes the rule (I39-2)", () => {
  it("draws no hand-written HTML table outside the allowed few", () => {
    const raw = COMPONENTS.filter(
      (file) => !RAW_TABLE_ALLOWED.has(file) && /<table\b/.test(read(file)),
    );
    expect(raw).toEqual([]);
  });

  it("gives every shared table a header row", () => {
    const headerless = COMPONENTS.filter((file) => {
      if (HEADERLESS_ALLOWED.has(file)) return false;
      const source = read(file);
      const tables = source.match(/<Table\b/g)?.length ?? 0;
      const headers = source.match(/<TableHeader\b/g)?.length ?? 0;
      return headers < tables;
    });
    expect(headerless).toEqual([]);
  });

  it("never un-sticks a header", () => {
    const loose = COMPONENTS.filter((file) =>
      /<TableHeader[^>]*className="[^"]*\b(static|relative)\b/.test(read(file)),
    );
    expect(loose).toEqual([]);
  });

  it("never wraps a table in a short scroll box of its own, which the header would stick to instead", () => {
    const nested: string[] = [];
    for (const file of COMPONENTS) {
      const source = read(file);
      for (const match of source.matchAll(/<Table\b/g)) {
        const before = source.slice(Math.max(0, (match.index ?? 0) - 300), match.index);
        const classes = [...before.matchAll(/className="([^"]*)"/g)];
        const parent = classes[classes.length - 1]?.[1] ?? "";
        if (/overflow-(y-)?auto/.test(parent) && /\bmax-h-/.test(parent)) nested.push(file);
      }
    }
    expect(nested).toEqual([]);
  });

  it("every list the fit check measures is a shared-table list", () => {
    for (const fit of Object.values(LIST_FITS)) {
      expect(read(fit.file), fit.file).toMatch(/<(ModuleRecordsTable|DataTable)\b/);
    }
  });

  it.each(Object.entries(SHARED_TABLE_LISTS))(
    "%s fits the page and keeps its row buttons at the right",
    (file, { pinned }) => {
      const source = read(file);
      expect(source).toMatch(/<Table fit\b/);
      expect(source).not.toMatch(/<Table fit[^>]*className="[^"]*min-w-/);
      if (pinned) {
        expect(source).toMatch(/<TableHead pin="end"/);
        expect(source).toMatch(/<TableCell pin="end"/);
      }
    },
  );
});
