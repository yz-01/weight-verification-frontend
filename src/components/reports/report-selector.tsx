"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navLeaves, visibleNavigation } from "@/lib/navigation";
import { getProjects, getReceiptSummary } from "@/services/contractor.service";
import { getProjectCategories } from "@/services/contractor-ops.service";

/** The two reports whose next levels are a material and then a supplier. */
const MATERIAL_REPORTS = new Set(["/reports/material-quantity", "/reports/material-cost"]);

/** Filters a report keeps when the reader picks a different one. */
const KEPT = ["project", "date_from", "date_to"] as const;

/**
 * 【选择报表】: one cascading menu instead of a page of report cards and a row
 * of fixed drop-downs (B04, 图7, 扫描 S7).
 *
 * 报表 → 材料 → 供应商, with 「全部材料」 and 「全部供应商」 at the top of
 * their levels. Each level opens beside the row under the pointer, the page
 * behind stays as it is (no dim, nothing blocked), and picking the last level
 * closes the whole menu and reloads the report - figures, records, photos and
 * export all read the same address.
 *
 * The levels are data, so more can be added: the reports come from the menu
 * registry (the same list and permissions as the sidebar), the materials from
 * the project's material columns, the suppliers from who actually delivered
 * that material. A report with no further levels is a single row.
 */
export function ReportSelector({ summary }: { summary?: string }) {
  const t = useTranslations("reportSelector");
  const tRoot = useTranslations();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const reports = useMemo(() => {
    const entry = visibleNavigation(
      user?.portal,
      user?.features,
      user?.permissions,
      user?.is_superuser,
    )
      .flatMap((group) => group.items)
      .find((item) => item.feature === "report_center");
    return navLeaves(entry?.children);
  }, [user?.features, user?.is_superuser, user?.permissions, user?.portal]);

  /** Where a choice leads: the report, carrying the reader's own filters. */
  const go = (href: string, levels: { category?: string; supplier?: string } = {}) => {
    const next = new URLSearchParams();
    for (const key of KEPT) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    if (levels.category) next.set("category", levels.category);
    if (levels.supplier) next.set("supplier", levels.supplier);
    const query = next.toString();
    router.push(query ? `${href}?${query}` : href);
  };

  if (reports.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {/* Not modal: the report behind has to stay readable while the menu is
          open (「背景保持可见，不整页变黑」). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2 border-primary/40 bg-card shadow-sm">
            <BarChart3 className="size-4 text-primary" />
            {t("choose")}
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-56 max-w-72">
          {reports.map((report) => {
            const label = tRoot(report.labelKey);
            const current = pathname === report.href.split("?", 1)[0];
            return MATERIAL_REPORTS.has(report.href) ? (
              <DropdownMenuSub key={`${report.key}:${report.href}`}>
                <DropdownMenuSubTrigger
                  className={current ? "h-8 font-medium text-primary" : "h-8"}
                >
                  {label}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="max-h-[70dvh] min-w-52 overflow-y-auto">
                    <MaterialLevel
                      project={searchParams.get("project") ?? undefined}
                      onPick={(levels) => go(report.href, levels)}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem
                key={`${report.key}:${report.href}`}
                className={current ? "h-8 font-medium text-primary" : "h-8"}
                onSelect={() => go(report.href)}
              >
                {label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {summary && (
        <p className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="size-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">{summary}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The material level: 「全部材料」, then the project's material columns. With
 * no project chosen the columns of every project are listed, and a name two
 * projects share says which project it is.
 */
function MaterialLevel({
  project,
  onPick,
}: {
  project?: string;
  onPick: (levels: { category?: string; supplier?: string }) => void;
}) {
  const t = useTranslations("reportSelector");
  const categories = useMaterialColumns(project);
  // query-failure: it only adds a project code beside a name two projects share; the name still shows.
  const projects = useQuery({
    queryKey: ["projects", "report-selector"],
    queryFn: () => getProjects({ page_size: 200 }),
    enabled: !project,
  });
  const projectCode = (id: string) =>
    projects.data?.results.find((row) => row.id === id)?.code ?? "";
  const rows = categories.data?.results ?? [];
  const shared = new Set(
    rows
      .map((row) => row.name)
      .filter((name, index, names) => names.indexOf(name) !== index),
  );

  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">{t("material")}</DropdownMenuLabel>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="h-8 font-medium">{t("allMaterials")}</DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="max-h-[70dvh] min-w-56 overflow-y-auto">
            <SupplierLevel project={project} onPick={(supplier) => onPick({ supplier })} />
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
      {categories.isLoading && <Waiting />}
      {categories.isError && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("materialsFailed")}</p>
      )}
      {rows.length > 0 && <DropdownMenuSeparator />}
      {rows.map((row) => (
        <DropdownMenuSub key={row.id}>
          <DropdownMenuSubTrigger className="h-8">
            <span className="min-w-0 flex-1 truncate">
              {row.name}
              {!project && shared.has(row.name) && projectCode(row.project) ? (
                <span className="text-muted-foreground"> · {projectCode(row.project)}</span>
              ) : null}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-[70dvh] min-w-56 overflow-y-auto">
              <SupplierLevel
                project={project}
                category={row.id}
                onPick={(supplier) => onPick({ category: row.id, supplier })}
              />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      ))}
    </>
  );
}

/** The supplier level: 「全部供应商」, then whoever delivered this material. */
function SupplierLevel({
  project,
  category,
  onPick,
}: {
  project?: string;
  category?: string;
  onPick: (supplier?: string) => void;
}) {
  const t = useTranslations("reportSelector");
  // Mounted only when this level opens, so a long list of materials does not
  // ask for every material's suppliers up front.
  const summary = useQuery({
    queryKey: ["receipts", "summary", "report-selector", project ?? "", category ?? ""],
    queryFn: () => getReceiptSummary({ project, category }),
  });
  const suppliers = summary.data?.by_supplier ?? [];
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">{t("supplier")}</DropdownMenuLabel>
      <DropdownMenuItem className="h-8 font-medium" onSelect={() => onPick(undefined)}>
        {t("allSuppliers")}
      </DropdownMenuItem>
      {summary.isLoading && <Waiting />}
      {summary.isError && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("suppliersFailed")}</p>
      )}
      {suppliers.length > 0 && <DropdownMenuSeparator />}
      {suppliers.map((row) => (
        <DropdownMenuItem key={row.supplier} className="h-8" onSelect={() => onPick(row.supplier)}>
          <span className="min-w-0 flex-1 truncate">{row.supplier_name}</span>
        </DropdownMenuItem>
      ))}
      {summary.isSuccess && suppliers.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("noSuppliers")}</p>
      )}
    </>
  );
}

function Waiting() {
  return (
    <div className="flex items-center justify-center py-2">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

/** The material columns a report can be narrowed to, shared with its title. */
export function useMaterialColumns(project?: string) {
  return useQuery({
    queryKey: ["project-categories", "material-report", project ?? ""],
    queryFn: () =>
      getProjectCategories({ kind: "MATERIAL", page_size: 200, project }),
  });
}
