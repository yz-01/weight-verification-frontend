"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LoadFailed } from "@/components/shared/page-primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
