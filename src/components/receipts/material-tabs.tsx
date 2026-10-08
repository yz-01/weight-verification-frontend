"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Undo2 } from "lucide-react";
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
import {
  exportReceiptNetTotals,
  getReceiptNetTotals,
  type MaterialNetTotalRow,
} from "@/services/contractor.service";

export type MaterialTab = "in" | "out" | "reject" | "totals";

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
 * 累计净数量 (B09, 2026-10 C9, C11): per supplier, material, specification and
 * unit - never across units.
 *
 * 「累计进场」 never goes down; the net is what came in (rejected loads not
 * counted) less the returns the office has confirmed as complete, matched on
 * material category and unit (Q4). Grouped under each supplier, searchable by
 * material. Each number opens onto the records it adds up (client request
 * 2026-10-09): 「累计进场」 every delivery, 「已退场」 every completed return,
 * 「累计净数量」 the sum of both (`NetBreakdownDialog`); a line with returns
 * says 「有退场记录」, which opens them too. DO is per delivery, so it is in
 * the drill-down, not a column of the totals. The export asks the server for
 * exactly these lines.
 */
export function NetTotalsView({
  project,
  filters = {},
}: {
  project?: string;
  /** Supplier, manufacturer (2026-10 D1) and dates, as the list filters them. */
  filters?: Record<string, string | undefined>;
}) {
  const t = useTranslations();
  const { can } = useAuth();
  const unitName = useUnitName();
  const unitValues = useUnitExportValues();
  const [term, setTerm] = useState("");
  const material = useDebounce(term.trim(), 300);
  const [drill, setDrill] = useState<{ row: MaterialNetTotalRow; focus: NetFocus } | null>(null);
  const query = Object.fromEntries(
    Object.entries({ project, material, ...filters }).filter(([, value]) => Boolean(value)),
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
        {can("report.export") ? (
          <div className="ml-auto">
            <ExportButton onExport={runExport} disabled={!rows.length} />
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("receipts.net.note")}</p>
      <div className="surface-panel overflow-x-auto rounded-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("receipts.field.materialName")}</TableHead>
              <TableHead>{t("receipts.field.materialSpecification")}</TableHead>
              <TableHead>{t("receipts.field.unit")}</TableHead>
              <TableHead className="tabular text-right">{t("receipts.net.received")}</TableHead>
              <TableHead className="tabular text-right">{t("receipts.net.returned")}</TableHead>
              <TableHead className="tabular text-right">{t("receipts.net.net")}</TableHead>
              <TableHead className="tabular text-right">{t("receipts.net.rejected")}</TableHead>
              <TableHead>{t("receipts.field.project")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">{t("common.loading")}</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">{t("table.noResults")}</TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <Fragment key={group.supplier || "-"}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40" data-slot="net-supplier">
                    <TableCell colSpan={8} className="py-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                        {group.supplierName || t("receipts.net.noSupplier")}
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
                  {group.rows.map((row) => (
                    <TableRow key={keyOf(row)} data-slot="net-line">
                      <TableCell className="font-medium">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {row.material_name}
                          {(row.return_count ?? 0) > 0 ? (
                            <button
                              type="button"
                              data-slot="net-return-tag"
                              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0 text-2xs font-medium leading-5 text-warning-foreground hover:bg-warning/20"
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
                      <TableCell className="tabular text-right font-semibold">
                        <NetNumber label={t("receipts.net.net")} value={row.net} onOpen={() => setDrill({ row, focus: "net" })} />
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{row.rejected}</TableCell>
                      <TableCell className="text-muted-foreground">{row.project_name}</TableCell>
                    </TableRow>
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
  const name = t("receipts.net.openNumber", { label, value });
  return (
    <button
      type="button"
      data-slot="net-number"
      onClick={onOpen}
      aria-label={name}
      title={name}
      className="tabular cursor-pointer rounded px-1 text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring"
    >
      {value}
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
    { key: "material_specification", label: t("receipts.field.materialSpecification") },
    { key: "unit", label: t("receipts.field.unit"), values: unitValues },
    { key: "received", label: t("receipts.net.received") },
    { key: "returned", label: t("receipts.net.returned") },
    { key: "net", label: t("receipts.net.net") },
    { key: "rejected", label: t("receipts.net.rejected") },
    { key: "project_name", label: t("receipts.field.project") },
  ];
}

/**
 * The supplier groups, in the server's order, with how many finished returns
 * each supplier has - all time, the count every other 「有退场资料」 reads
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
