"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { LoadFailed } from "@/components/shared/page-primitives";
import { SupplierReturnBadge } from "@/components/suppliers/supplier-return-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { useUnitExportValues, useUnitName } from "@/hooks/use-material-units";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  exportReceiptNetTotals,
  getReceiptNetTotals,
  type MaterialNetTotalItem,
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
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={active}
        onValueChange={(next) => router.push(withFilters(hrefs[next as MaterialTab]))}
      >
        <SelectTrigger size="sm" className="w-[170px]" aria-label={t("choose")}>
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
    </div>
  );
}

/**
 * 累计净数量 (B09, 2026-10 C9, C11): per supplier, material, specification and
 * unit - never across units.
 *
 * 「累计进场」 never goes down; the net is what came in (rejected loads not
 * counted) less the returns the office has confirmed as complete, matched on
 * material category and unit (Q4). Grouped under each supplier, searchable by
 * material, and each line opens onto its own deliveries and returns - the DO,
 * the plate, the supplier and the manufacturer of each (DO is per delivery,
 * so it is in the detail, not a column of the totals). The export asks the
 * server for exactly these lines.
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
  const df = useDateFormat();
  const { can } = useAuth();
  const unitName = useUnitName();
  const unitValues = useUnitExportValues();
  const [term, setTerm] = useState("");
  const material = useDebounce(term.trim(), 300);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
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
  const toggle = (key: string) =>
    setOpen((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
            className="h-8 pl-8 text-sm"
          />
        </div>
        {can("report.export") ? (
          <div className="ml-auto">
            <ExportButton onExport={runExport} disabled={!rows.length} />
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("receipts.net.note")}</p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>{t("receipts.field.materialName")}</TableHead>
              <TableHead>{t("receipts.field.materialSpecification")}</TableHead>
              <TableHead>{t("receipts.field.unit")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.received")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.returned")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.net")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.rejected")}</TableHead>
              <TableHead>{t("receipts.field.project")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">{t("common.loading")}</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">{t("table.noResults")}</TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <Fragment key={group.supplier || "-"}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40" data-slot="net-supplier">
                    <TableCell colSpan={9} className="py-1.5">
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
                  {group.rows.map((row) => {
                    const key = keyOf(row);
                    const expanded = open.has(key);
                    return (
                      <Fragment key={key}>
                        <TableRow>
                          <TableCell className="w-8 px-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-expanded={expanded}
                              aria-label={expanded ? t("receipts.net.collapse") : t("receipts.net.expand")}
                              title={expanded ? t("receipts.net.collapse") : t("receipts.net.expand")}
                              onClick={() => toggle(key)}
                            >
                              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{row.material_name}</TableCell>
                          <TableCell>{row.material_specification || "—"}</TableCell>
                          <TableCell>{unitName(row.unit)}</TableCell>
                          <TableCell className="tabular text-right">{row.received}</TableCell>
                          <TableCell className="tabular text-right">{row.returned}</TableCell>
                          <TableCell className="tabular text-right font-semibold">{row.net}</TableCell>
                          <TableCell className="tabular text-right text-muted-foreground">{row.rejected}</TableCell>
                          <TableCell className="text-muted-foreground">{row.project_name}</TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell />
                            <TableCell colSpan={8} className="p-2">
                              <NetLineItems items={row.items ?? []} unitName={unitName} df={df} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
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

export function NetLineItems({
  items,
  unitName,
  df,
}: {
  items: readonly MaterialNetTotalItem[];
  unitName: ReturnType<typeof useUnitName>;
  df: ReturnType<typeof useDateFormat>;
}) {
  const t = useTranslations("receipts.net");
  if (!items.length) {
    return <p className="text-xs text-muted-foreground">—</p>;
  }
  return (
    <Table className="text-xs" data-slot="net-items">
      <TableHeader>
        <TableRow>
          <TableHead>{t("item.date")}</TableHead>
          <TableHead />
          <TableHead>{t("item.reference")}</TableHead>
          <TableHead className="text-right">{t("item.quantity")}</TableHead>
          <TableHead>{t("item.doNo")}</TableHead>
          <TableHead>{t("item.plate")}</TableHead>
          <TableHead>{t("supplier")}</TableHead>
          <TableHead>{t("item.manufacturer")}</TableHead>
          <TableHead>{t("item.returnNote")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const href =
            item.kind === "RETURN"
              ? `/material-outgoing?record=${item.id}`
              : `/receipts/${item.id}`;
          const out = item.kind === "RETURN" || item.kind === "RETURN_RECEIPT";
          return (
            <TableRow key={`${item.kind}:${item.id}`}>
              <TableCell className="tabular">{item.date ? df.date(item.date) : "—"}</TableCell>
              <TableCell>
                <span className={cn("rounded px-1.5 py-0.5", out ? "bg-warning/10" : item.kind === "REJECTED" ? "bg-destructive/10" : "bg-success/10")}>
                  {t(`item.kind.${item.kind}`)}
                </span>
              </TableCell>
              <TableCell>
                <Link href={href} className="text-primary underline-offset-2 hover:underline">
                  {item.reference}
                </Link>
              </TableCell>
              <TableCell className="tabular text-right">
                {out ? "−" : ""}
                {item.quantity} {unitName(item.unit)}
              </TableCell>
              <TableCell>{item.delivery_note_no || "—"}</TableCell>
              <TableCell>{item.vehicle_plate || "—"}</TableCell>
              <TableCell>{item.supplier_name || "—"}</TableCell>
              <TableCell>{item.manufacturer_name || "—"}</TableCell>
              <TableCell>{item.return_note_no || "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
