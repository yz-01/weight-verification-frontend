"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { LoadFailed } from "@/components/shared/page-primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MATERIAL_UNITS } from "@/interfaces/contractor";
import { getReceiptNetTotals } from "@/services/contractor.service";

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

export function MaterialTabs() {
  const t = useTranslations("receipts.tabs");
  const active = useMaterialTab();
  const params = useSearchParams();
  // The project the reader was looking at travels with them between tabs.
  const project = params.get("project");
  const withProject = (href: string) =>
    project ? `${href}${href.includes("?") ? "&" : "?"}project=${project}` : href;
  const tabs: Array<[MaterialTab, string]> = [
    ["in", "/receipts"],
    ["out", "/material-outgoing"],
    ["reject", "/receipts?acceptance=REJECTED"],
    ["totals", "/receipts?view=totals"],
  ];
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" aria-label={t("label")}>
      {tabs.map(([key, href]) => (
        <Link
          key={key}
          href={withProject(href)}
          aria-current={active === key ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            active === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The net quantity per project, material, specification and unit (B09).
 *
 * In (rejected deliveries left out), less what was returned - each return
 * once, against the delivery it points at - per unit and never across units.
 */
export function NetTotalsView({ project }: { project?: string }) {
  const t = useTranslations();
  const totals = useQuery({
    queryKey: ["receipts", "net-totals", project ?? ""],
    queryFn: () => getReceiptNetTotals(project ? { project } : {}),
  });
  if (totals.isError) {
    return <LoadFailed what={t("receipts.tabs.totals")} onRetry={() => totals.refetch()} />;
  }
  const rows = totals.data?.results ?? [];
  const unitLabel = (unit: string) =>
    (MATERIAL_UNITS as readonly string[]).includes(unit) ? t(`receipts.unit.${unit as (typeof MATERIAL_UNITS)[number]}`) : unit;
  return (
    <section className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("receipts.net.note")}</p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("receipts.field.project")}</TableHead>
              <TableHead>{t("receipts.field.materialName")}</TableHead>
              <TableHead>{t("receipts.field.materialSpecification")}</TableHead>
              <TableHead>{t("receipts.field.unit")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.received")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.returned")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.net")}</TableHead>
              <TableHead className="text-right">{t("receipts.net.rejected")}</TableHead>
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
              rows.map((row) => (
                <TableRow key={`${row.project}:${row.material_name}:${row.material_specification}:${row.unit}`}>
                  <TableCell>{row.project_name}</TableCell>
                  <TableCell className="font-medium">{row.material_name}</TableCell>
                  <TableCell>{row.material_specification || "—"}</TableCell>
                  <TableCell>{unitLabel(row.unit)}</TableCell>
                  <TableCell className="tabular text-right">{row.received}</TableCell>
                  <TableCell className="tabular text-right">{row.returned}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{row.net}</TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">{row.rejected}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
