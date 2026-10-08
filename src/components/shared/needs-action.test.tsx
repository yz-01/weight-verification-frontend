/**
 * 「待处理」 on every list a sidebar badge opens (Lucas 2026-10-09):
 * 「在旁边那里弄多一个提示显示哪些是还没有处理的写号码出来，加起来就等于sidebar的号码」.
 *
 * The rows marked and the header's N come from the list endpoint
 * (`needs_action`, `needs_action_count`) - the backend's own badge
 * definition, checked against the badge in `test_sidebar_badges`. These pin
 * the screen half: the pill, the header chip, where the pill sits, and that
 * every counted page wires them.
 *
 * Rendered to static markup (the runner has no DOM).
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
  usePathname: () => "/receipts",
  useSearchParams: () => new URLSearchParams(),
}));

const { DataTable } = await import("@/components/shared/data-table");
const { BADGE_FEATURES } = await import("@/hooks/use-unread-badges");
const {
  NeedsActionChip,
  NeedsActionMarker,
  needsActionActive,
  withNeedsActionColumn,
} = await import("@/components/shared/needs-action");

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <TooltipProvider>{node}</TooltipProvider>
    </NextIntlClientProvider>,
  );

const source = (file: string) =>
  readFileSync(path.join(process.cwd(), "src", "components", file), "utf8");

describe("the row's 「待处理」 pill", () => {
  it("shows on a row the badge counts, and on no other", () => {
    const shown = html(<NeedsActionMarker show />);
    expect(shown).toContain("待处理");
    expect(shown).toContain('data-needs-action="true"');
    expect(html(<NeedsActionMarker show={false} />)).toBe("");
    // An older response without the field: no pill, not an error.
    expect(html(<NeedsActionMarker show={undefined} />)).toBe("");
  });
});

describe("the header's 「待处理 N」", () => {
  it("says the page's number and is a switch", () => {
    const chip = html(<NeedsActionChip count={3} active={false} onToggle={() => {}} />);
    expect(chip).toContain("待处理 3");
    expect(chip).toContain('aria-pressed="false"');
    expect(chip).toContain('data-needs-action-chip="true"');
    expect(chip).toContain("只看等你审批或验收的记录");
    const on = html(<NeedsActionChip count={3} active onToggle={() => {}} />);
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain("显示全部记录");
  });

  it("shows nothing with nothing waiting - unless the filter is on, so it can be turned off", () => {
    expect(html(<NeedsActionChip count={0} active={false} onToggle={() => {}} />)).toBe("");
    expect(html(<NeedsActionChip count={undefined} active={false} onToggle={() => {}} />)).toBe("");
    expect(html(<NeedsActionChip count={0} active onToggle={() => {}} />)).toContain("待处理 0");
  });

  it("is on exactly when the list's URL says needs_action=1", () => {
    expect(needsActionActive({ needs_action: "1" })).toBe(true);
    expect(needsActionActive({})).toBe(false);
    expect(needsActionActive({ needs_action: "0" })).toBe(false);
  });

  it.each(["zh", "zh-TW", "en", "ms"])("%s names the marker and the chip", (locale) => {
    const all = JSON.parse(
      readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"),
    );
    for (const key of ["marker", "chip", "chipHint", "chipClear", "column"]) {
      expect(all.needsAction[key], key).toBeTruthy();
    }
    expect(all.needsAction.chip).toContain("{count}");
    expect(all.needsAction.chip.startsWith(all.needsAction.marker)).toBe(true);
  });
});

describe("where the pill sits", () => {
  type Row = { id: string; needs_action?: boolean };
  const columns: ColumnDef<Row, unknown>[] = [
    { id: "reference", header: "No.", cell: ({ row }) => row.original.id },
    { id: "actions", header: "", cell: () => <button type="button">→</button> },
  ];

  it("is the column just left of the row's buttons", () => {
    const ids = withNeedsActionColumn(columns, "待处理").map((column) => column.id);
    expect(ids).toEqual(["reference", "needs_action", "actions"]);
    // A table with no buttons: at the end.
    expect(withNeedsActionColumn([columns[0]], "待处理").map((column) => column.id)).toEqual([
      "reference",
      "needs_action",
    ]);
  });

  it("marks the counted rows, with a stripe on the first cell for the phone", () => {
    const markup = html(
      <DataTable
        columns={withNeedsActionColumn(columns, "待处理")}
        rows={[{ id: "RC-1", needs_action: true }, { id: "RC-2", needs_action: false }, { id: "RC-3" }]}
        totalCount={3}
        page={1}
        pageSize={25}
        isLoading={false}
        isError={false}
        hasFilters={false}
        search=""
        sortBy=""
        sortOrder="asc"
        storageKey="needs-action-test"
        onSearchChange={() => {}}
        onSortChange={() => {}}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        onClearFilters={() => {}}
      />,
    );
    const rows = [...markup.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((match) => match[0]);
    const row = (id: string) => rows.find((text) => text.includes(`>${id}<`)) ?? "";
    expect(row("RC-1")).toContain('data-needs-action="true"');
    expect(row("RC-1")).toContain("border-l-primary");
    expect(row("RC-1")).toMatch(/待处理[\s\S]*→/);
    for (const id of ["RC-2", "RC-3"]) {
      expect(row(id)).not.toContain("data-needs-action");
      expect(row(id)).not.toContain("待处理<");
    }
  });
});

describe("every page a badge opens shows them (2026-10-09)", () => {
  // Badge key -> the component its page renders. The number on each page is
  // the list response's `needs_action_count`, never worked out here.
  const PAGES: Record<string, string[]> = {
    material_receipts: ["receipts/receipts.tsx"],
    material_outgoing: ["contractor-ops/office-module-lists.tsx"],
    material_requests: ["material-requests/material-requests-office.tsx"],
    field_tasks: ["contractor-ops/operations-workspaces.tsx"],
    equipment: ["contractor-ops/office-module-lists.tsx"],
    waste_outgoing: ["contractor-ops/waste-outgoing-workspace.tsx"],
    site_disposals: ["contractor-ops/site-disposal-workspaces.tsx", "contractor-ops/waste-clearance.tsx"],
    consultant_applications: ["consultant-workflow/applications-list.tsx"],
    approvals: ["document-workflow/approvals.tsx"],
    sundry_claims: ["sundry-claims/sundry-claims-office.tsx"],
    site_access: ["site-access/site-access-workspace.tsx"],
    safety: ["site-operations/safety.tsx"],
  };

  it("has a page for every key the sidebar counts", () => {
    expect(Object.keys(PAGES).sort()).toEqual([...BADGE_FEATURES].sort());
  });

  it.each(Object.entries(PAGES))("%s: header N and row pill from the list response", (_feature, files) => {
    for (const file of files) {
      const text = source(file);
      expect(text, file).toContain("needs_action_count");
      expect(text, file).toMatch(/NeedsActionChip|needsActionCount=/);
      expect(text, file).toMatch(/NeedsActionMarker|withNeedsActionColumn|needsActionCount=/);
    }
  });

  it("the shared office table puts both on any list that passes its number", () => {
    const table = source("shared/module-records-table.tsx");
    expect(table).toContain("withNeedsActionColumn(columns");
    expect(table).toContain("<NeedsActionChip");
    expect(table).toContain("needsActionCount");
  });

  it("every useListQuery list sends needs_action from the URL", () => {
    const hook = readFileSync(path.join(process.cwd(), "src", "hooks", "use-list-query.ts"), "utf8");
    expect(hook).toMatch(/"needs_action",\s*\]\.join/);
  });
});
