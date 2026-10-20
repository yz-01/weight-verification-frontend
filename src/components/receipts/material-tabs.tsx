"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { NetBreakdownDialog, type NetFocus } from "@/components/receipts/net-breakdown";
import { ExportButton } from "@/components/shared/export-button";
import { FilterBar, LoadFailed } from "@/components/shared/page-primitives";
import { SupplierReturnBadge } from "@/components/suppliers/supplier-return-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { useUnitExportValues, useUnitName } from "@/hooks/use-material-units";
import { formatNetQuantity } from "@/lib/net-quantity";
import {
  exportReceiptNetTotals,
  getReceiptNetTotals,
  type MaterialNetTotalRow,
} from "@/services/contractor.service";

const EMPTY_KEYS: ReadonlySet<string> = new Set();

export type MaterialTab = "in" | "out" | "reject" | "totals" | "targets";

/**
 * 材料管理's one set of tabs (10-02 A01, B09, E01): Material In, Material
 * Out, Reject - not two big modules - and the net quantity they add up to.
 *
 * In and Reject are the receipts list filtered; Out is the 材料出场 list
 * (returns to the supplier); the totals are `get_net_totals`.
 */
export function useMaterialTab(): MaterialTab {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname.startsWith("/material-outgoing")) return "out";
  // 材料目标 (I18): its own address, so the sidebar can open it too.
  if (pathname.startsWith("/material-targets")) return "targets";
  if (params.get("view") === "totals") return "totals";
  if (params.get("acceptance") === "REJECTED") return "reject";
  if (params.get("direction") === "OUT") return "out";
  return "in";
}

/**
 * The four views as one dropdown (2026-10 C14), with the supplier and date
 * filter beside it.
 *
 * Four tabs in a row pushed the page sideways on a phone. A dropdown keeps the
 * same four addresses - choosing one goes where the tab went - so a bookmark,
 * a notification link and the back button behave exactly as before.
 *
 * `children` is what stands beside it: the shared supplier and date filter
 * (B5) on the lists, nothing on the totals.
 */
export function MaterialTabs({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("receipts.tabs");
  const active = useMaterialTab();
  const params = useSearchParams();
  const router = useRouter();
  // The project, supplier and dates the reader was looking at travel with
  // them between the views; each list reads the same parameters.
  const carried = ["project", "supplier", "date_from", "date_to"]
    .map((key) => [key, params.get(key)] as const)
    .filter(([, value]) => value);
  const withFilters = (href: string) =>
    carried.reduce(
      (target, [key, value]) =>
        `${target}${target.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value ?? "")}`,
      href,
    );
  const tabs: Array<[MaterialTab, string]> = [
    ["in", "/receipts"],
    ["out", "/material-outgoing"],
    ["reject", "/receipts?acceptance=REJECTED"],
    ["totals", "/receipts?view=totals"],
    ["targets", "/material-targets"],
  ];
  const hrefs = Object.fromEntries(tabs) as Record<MaterialTab, string>;
  return (
    <FilterBar>
      <Select
        value={active}
        onValueChange={(next) => router.push(withFilters(hrefs[next as MaterialTab]))}
      >
        <SelectTrigger className="w-full border-tone-blue/50 sm:w-44" aria-label={t("choose")}>
          <SelectValue placeholder={t("choose")} />
        </SelectTrigger>
        <SelectContent>
          {tabs.map(([key]) => (
            <SelectItem key={key} value={key}>
              {t(key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {children}
    </FilterBar>
  );
}

/**
 * 累计进场与退场 (B09, 2026-10 C9, C11): per supplier, material, specification
 * and unit - never across units.
 *
 * 「累计进场」 never goes down (rejected loads not counted); 「已退场」 is the
 * returns the office has confirmed as complete, matched on material category
 * and unit (Q4). The two stand side by side: the 「累计净数量」 column (进场 −
 * 退场) is gone (Lucas 2026-10-10: 「累计净数量可以移除，不需要进场减退场」).
 * Grouped under each supplier (a collapsible heading, I41); inside it each
 * material heads its specifications and closes with its own subtotal per unit
 * (J5-2) - no total of the whole table. Searched by material name and by
 * specification, each its own box, with the supplier filter beside them
 * (J5-1: a supplier's name no longer finds its every material). Numbers read
 * plainly (`formatNetQuantity`). Each number opens onto
 * the records it adds up (client request 2026-10-09): 「累计进场」 every
 * delivery, 「已退场」 every completed return (`NetBreakdownDialog`); a line
 * with returns says 「有退货资料」, which opens them too. DO is per delivery,
 * so it is in the drill-down, not a column of the totals. The export asks the
 * server for exactly these lines.
 */
export function NetTotalsView({
  project,
  filters = {},
  defaultCollapsed = false,
}: {
  project?: string;
  /** Start with every supplier heading closed (the test's way to press ▼). */
  defaultCollapsed?: boolean;
  /** Supplier, manufacturer (2026-10 D1) and dates, as the list filters them. */
  filters?: Record<string, string | undefined>;
}) {
  const t = useTranslations();
  const { can } = useAuth();
  const unitName = useUnitName();
  const unitValues = useUnitExportValues();
  // Three independent filters (J5-1, Q5-1): the material's name (across every
  // supplier, never a supplier's name), the specification, and the supplier
  // the page's own filter chose. Changing one never clears another.
  const [term, setTerm] = useState("");
  const material = useDebounce(term.trim(), 300);
  const [specTerm, setSpecTerm] = useState("");
  const specification = useDebounce(specTerm.trim(), 300);
  const searched = `${material}\u0000${specification}`;
  // Which supplier headings were pressed - for this search only (IB20): a new
  // search starts with every group as it comes, so a group closed before
  // never hides what the search found.
  const [pressed, setPressed] = useState<{ search: string; keys: ReadonlySet<string> }>({
    search: "",
    keys: new Set(),
  });
  const toggled = pressed.search === searched ? pressed.keys : EMPTY_KEYS;
  const [drill, setDrill] = useState<{ row: MaterialNetTotalRow; focus: NetFocus } | null>(null);
  const query = Object.fromEntries(
    Object.entries({ project, material, specification, ...filters }).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
  const totals = useQuery({
    queryKey: ["receipts", "net-totals", query],
    queryFn: () => getReceiptNetTotals(query),
    // Not another project's totals while the top bar's next one loads (B13).
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2] as Record<string, string> | undefined)?.project === query.project
        ? keepPreviousData(previous)
        : undefined,
  });
  if (totals.isError) {
    return <LoadFailed what={t("receipts.tabs.totals")} onRetry={() => totals.refetch()} />;
  }
  const rows = totals.data?.results ?? [];
  const groups = groupBySupplier(rows);
  const subtotals = totals.data?.subtotals ?? [];
  // A group is open unless it was toggled away from the starting state.
  const isOpen = (group: { supplier: string }) => toggled.has(group.supplier) === defaultCollapsed;
  const toggle = (group: { supplier: string }) =>
    setPressed({
      search: searched,
      keys: (() => {
        const next = new Set(toggled);
        if (!next.delete(group.supplier)) next.add(group.supplier);
        return next;
      })(),
    });
  const keyOf = (row: MaterialNetTotalRow) =>
    `${row.project}:${row.supplier}:${row.material_name}:${row.material_specification}:${row.unit}`;
  const runExport = (format: "xlsx" | "pdf") =>
    exportReceiptNetTotals({
      format,
      title: t("receipts.tabs.totals"),
      subtitle: t("receipts.net.note"),
      emptyLabel: t("table.noResults"),
      query,
      columns: netTotalsExportColumns(t, unitValues),
    });
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("receipts.net.searchMaterial")}
            aria-label={t("receipts.net.searchMaterial")}
            className="pl-8 text-sm"
          />
        </div>
        <Input
          value={specTerm}
          onChange={(event) => setSpecTerm(event.target.value)}
          placeholder={t("receipts.net.searchSpec")}
          aria-label={t("receipts.net.searchSpec")}
          className="w-full text-sm sm:w-40"
        />
        {can("report.export") ? (
          <div className="ml-auto">
            <ExportButton onExport={runExport} disabled={!rows.length} />
          </div>
        ) : null}
      </div>
      <ul className="space-y-0.5 text-xs text-muted-foreground" data-slot="net-notes">
        <li>{t("receipts.net.noteReceived")}</li>
        <li>{t("receipts.net.noteReturned")}</li>
        <li>{t("receipts.net.noteRejected")}</li>
      </ul>
      <div className="surface-panel overflow-hidden rounded-xl">
        {/* Fits the page (I39). */}
        <Table fit>
          <TableHeader>
            <TableRow>
              <TableHead>{t("receipts.field.materialName")}</TableHead>
              <TableHead>{t("receipts.net.specification")}</TableHead>
              <TableHead>{t("receipts.field.unit")}</TableHead>
              <TableHead className="tabular text-right">{t("receipts.net.received")}</TableHead>
              <TableHead className="tabular text-right">{t("receipts.net.returned")}</TableHead>
              <TableHead className="tabular text-right">{t("receipts.net.rejected")}</TableHead>
              <TableHead>{t("receipts.field.project")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">{t("common.loading")}</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {material || specification
                    ? t("receipts.net.searchEmpty", { term: [material, specification].filter(Boolean).join(" · ") })
                    : t("table.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <Fragment key={group.supplier || "-"}>
                  <TableRow
                    className="border-y-2 border-primary/25 bg-primary/10 hover:bg-primary/10"
                    data-slot="net-supplier"
                  >
                    <TableCell colSpan={7} className="py-2">
                      <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <button
                          type="button"
                          data-slot="net-supplier-toggle"
                          aria-expanded={isOpen(group)}
                          onClick={() => toggle(group)}
                          className="-my-1 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 text-left text-base focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {isOpen(group) ? <ChevronDown className="size-6 shrink-0" /> : <ChevronRight className="size-6 shrink-0" />}
                          {t("receipts.net.groupTitle", {
                            name: group.supplierName || t("receipts.net.noSupplier"),
                            count: group.rows.length,
                          })}
                        </button>
                        {group.supplier ? (
                          <SupplierReturnBadge
                            supplier={{
                              id: group.supplier,
                              name: group.supplierName,
                              completed_return_count: group.returnCount,
                            }}
                          />
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                  {(isOpen(group) ? group.rows : []).map((row, index, shown) => (
                    <Fragment key={keyOf(row)}>
                    <TableRow data-slot="net-line">
                      <TableCell className="font-medium">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {/* The material heads its specifications (J5-2). */}
                          {index === 0 || shown[index - 1].material_name !== row.material_name
                            ? row.material_name
                            : null}
                          {(row.return_count ?? 0) > 0 ? (
                            <button
                              type="button"
                              data-slot="net-return-tag"
                              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-tone-amber/35 bg-tone-amber/12 px-1.5 py-0 text-2xs font-medium leading-5 text-tone-amber-fg hover:bg-tone-amber/20"
                              title={t("receipts.net.returnTagHint", { count: row.return_count ?? 0 })}
                              aria-label={t("receipts.net.returnTagHint", { count: row.return_count ?? 0 })}
                              onClick={() => setDrill({ row, focus: "returned" })}
                            >
                              <Undo2 className="size-3" />
                              {t("receipts.net.returnTag")}
                            </button>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell>{row.material_specification || "—"}</TableCell>
                      <TableCell>{unitName(row.unit)}</TableCell>
                      <TableCell className="tabular text-right">
                        <NetNumber label={t("receipts.net.received")} value={row.received} onOpen={() => setDrill({ row, focus: "received" })} />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        <NetNumber label={t("receipts.net.returned")} value={row.returned} onOpen={() => setDrill({ row, focus: "returned" })} />
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{formatNetQuantity(row.rejected)}</TableCell>
                      <TableCell className="text-muted-foreground">{row.project_name}</TableCell>
                    </TableRow>
                    {/* 「该材料小计」 after its last line, per unit (J5-2, Q5-2):
                        one material only, never one added to another. */}
                    {index === shown.length - 1 || shown[index + 1].material_name !== row.material_name
                      ? subtotals
                          .filter(
                            (entry) =>
                              entry.supplier === row.supplier && entry.material_name === row.material_name,
                          )
                          .map((entry) => (
                            <TableRow
                              key={`subtotal:${keyOf(row)}:${entry.unit}`}
                              data-slot="net-subtotal"
                              className="bg-muted/40 hover:bg-muted/40"
                            >
                              <TableCell className="text-xs font-semibold">
                                {t("receipts.net.subtotal", { material: entry.material_name })}
                              </TableCell>
                              <TableCell />
                              <TableCell>{unitName(entry.unit)}</TableCell>
                              <TableCell className="tabular text-right font-semibold">
                                {formatNetQuantity(entry.received)}
                              </TableCell>
                              <TableCell className="tabular text-right font-semibold">
                                {formatNetQuantity(entry.returned)}
                              </TableCell>
                              <TableCell className="text-right" />
                              <TableCell />
                            </TableRow>
                          ))
                      : null}
                    </Fragment>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {drill ? (
        <NetBreakdownDialog
          key={`${keyOf(drill.row)}:${drill.focus}`}
          row={drill.row}
          query={query}
          focus={drill.focus}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </section>
  );
}

/** A number of the totals that opens the records behind it (2026-10-09). */
function NetNumber({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) {
  const t = useTranslations();
  const shown = formatNetQuantity(value);
  // A zero reads 「—」 on screen but is still said as a number to a screen reader.
  const name = t("receipts.net.openNumber", { label, value: shown === "—" ? "0" : shown });
  return (
    <button
      type="button"
      data-slot="net-number"
      onClick={onOpen}
      aria-label={name}
      title={t("receipts.net.clickHint")}
      className="tabular cursor-pointer rounded px-1 text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown}
    </button>
  );
}

/**
 * The export's columns: the screen's lines, in the screen's words. A line
 * naming no supplier prints 「未填供应商」 as the screen does (Q29.9).
 */
export function netTotalsExportColumns(
  t: (key: string) => string,
  unitValues: Record<string, string>,
) {
  return [
    { key: "supplier_name", label: t("receipts.net.supplier"), values: { "": t("receipts.net.noSupplier") } },
    { key: "material_name", label: t("receipts.field.materialName") },
    { key: "material_specification", label: t("receipts.net.specification") },
    { key: "unit", label: t("receipts.field.unit"), values: unitValues },
    { key: "received", label: t("receipts.net.received") },
    { key: "returned", label: t("receipts.net.returned") },
    { key: "rejected", label: t("receipts.net.rejected") },
    { key: "project_name", label: t("receipts.field.project") },
  ];
}

/**
 * The supplier groups, in the server's order, with how many finished returns
 * each supplier has - all time, the count every other 「有退货资料」 reads
 * (audit #23), not just the returns that fall in this view.
 */
export function groupBySupplier(rows: readonly MaterialNetTotalRow[]) {
  const groups: Array<{
    supplier: string;
    supplierName: string;
    returnCount: number;
    rows: MaterialNetTotalRow[];
  }> = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  for (const row of rows) {
    let group = byKey.get(row.supplier);
    if (!group) {
      group = { supplier: row.supplier, supplierName: row.supplier_name, returnCount: 0, rows: [] };
      byKey.set(row.supplier, group);
      groups.push(group);
    }
    group.rows.push(row);
    group.returnCount = Math.max(group.returnCount, row.supplier_return_count ?? 0);
  }
  // By supplier name; the lines that name none last.
  return groups.sort((a, b) =>
    !a.supplier ? 1 : !b.supplier ? -1 : a.supplierName.localeCompare(b.supplierName),
  );
}
