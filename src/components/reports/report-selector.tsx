"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
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
import type {
  ContractorReportType,
  ReportLevelRow,
} from "@/interfaces/contractor-report";
import {
  isRouteAllowed,
  navLeaves,
  visibleNavigation,
  type FeatureNavChild,
} from "@/lib/navigation";
import {
  PROGRESS_MENU,
  groupPhotoSources,
  levelRowName,
  progressMenuHref,
  reportHref,
  reportMenuKind,
  type ProgressMenuEntry,
  type ReportLevels,
} from "@/lib/report-menu";
import { supplierFilterValue, supplierShown } from "@/lib/receipt-supplier";
import { cn } from "@/lib/utils";
import { getProjects, getReceiptSummary } from "@/services/contractor.service";
import { getProjectCategories } from "@/services/contractor-ops.service";
import { categoryTree, showsGroups } from "@/lib/category-tree";
import { getReportCategories } from "@/services/contractor-report.service";

/**
 * 【选择报表】: the one report menu (B04, D6, B12).
 *
 * 报表 → its categories → (for some) their sub-categories, as listed in
 * `lib/report-menu.ts`. Hovering a row opens the level beside it - and only
 * then is that level fetched - while clicking a row at *any* level opens the
 * report at exactly that level and closes the whole menu (D6, B9: 「我要混凝土
 * 点下去混凝土就出来」). The page behind stays as it is (no dim, nothing
 * blocked), and the report's figures, records, photos and export all read the
 * same address.
 *
 * The reports come from the menu registry (the same list and permissions as
 * the sidebar), so a report the reader cannot open is not offered here.
 */
export function ReportSelector({ summary }: { summary?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Controlled, so a click on a row that also opens a level can close the
  // whole menu (D6).
  const [open, setOpen] = useState(false);

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
  // 工程进度's own reports (I8): the ones this reader may open.
  const progressEntries = useMemo(
    () =>
      user
        ? PROGRESS_MENU.filter((entry) =>
            isRouteAllowed(
              user.portal,
              user.features,
              entry.href,
              user.permissions,
              user.is_superuser,
            ),
          )
        : [],
    [user],
  );

  if (reports.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ReportMenu
        reports={reports}
        progressEntries={progressEntries}
        open={open}
        onOpenChange={setOpen}
        pathname={pathname}
        searchParams={searchParams}
        navigate={(href) => router.push(href)}
      />
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
 * The menu itself, its open state held by the caller: every pick closes it
 * (`onOpenChange(false)`) and then goes to the report.
 */
export function ReportMenu({
  reports,
  progressEntries = [],
  open,
  onOpenChange,
  pathname,
  searchParams,
  navigate,
}: {
  reports: readonly FeatureNavChild[];
  /**
   * 工程进度's own reports (I8, ID24) - 日报告, 往日报告, 施工计划, 项目进度
   * 摘要 - listed under 工程进度 above its 施工分类.
   */
  progressEntries?: readonly ProgressMenuEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  searchParams: URLSearchParams | ReadonlyURLSearchParams;
  navigate: (href: string) => void;
}) {
  const t = useTranslations("reportSelector");
  const tRoot = useTranslations();
  // The reader's project: the top bar's 「当前项目」 when it is in force (B13).
  const topBar = useCurrentProject();
  const project =
    (topBar.active ? topBar.projectId : searchParams.get("project")) || undefined;

  return (
    // Not modal: the report behind has to stay readable while the menu is
    // open (「背景保持可见，不整页变黑」).
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 border-primary bg-primary/12 px-4 text-foreground shadow-glow-sm pointer-coarse:h-11">
          <BarChart3 className="size-4 text-primary" />
          {t("choose")}
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56 max-w-72">
        {reports.map((report) => {
          const label = tRoot(report.labelKey);
          const current = pathname === report.href.split("?", 1)[0];
          const className = current ? "h-8 font-medium text-primary" : "h-8";
          const kind = reportMenuKind(report.href);
          const choose = (levels: ReportLevels = {}) => {
            onOpenChange(false);
            navigate(reportHref(report.href, levels, new URLSearchParams(searchParams.toString())));
          };
          if (kind.kind === "none") {
            return (
              <DropdownMenuItem
                key={`${report.key}:${report.href}`}
                className={className}
                onSelect={() => choose()}
              >
                {label}
              </DropdownMenuItem>
            );
          }
          return (
            <PickableSub
              key={`${report.key}:${report.href}`}
              label={label}
              className={className}
              onPick={() => choose()}
            >
              {kind.kind === "material" ? (
                <MaterialLevel project={project} onPick={choose} />
              ) : kind.kind === "categories" && kind.reportType === "progress" ? (
                <>
                  {progressEntries.map((entry) => (
                    <DropdownMenuItem
                      key={entry.key}
                      className="h-8"
                      onSelect={() => {
                        onOpenChange(false);
                        navigate(
                          progressMenuHref(entry, new URLSearchParams(searchParams.toString())),
                        );
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{tRoot(entry.labelKey)}</span>
                    </DropdownMenuItem>
                  ))}
                  {progressEntries.length > 0 && <DropdownMenuSeparator />}
                  <CategoryLevel
                    reportType={kind.reportType}
                    label={tRoot(kind.label)}
                    project={project}
                    onPick={choose}
                  />
                </>
              ) : (
                <CategoryLevel
                  reportType={kind.reportType}
                  label={tRoot(kind.label)}
                  childLabel={kind.childLabel ? tRoot(kind.childLabel) : undefined}
                  project={project}
                  onPick={choose}
                />
              )}
            </PickableSub>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A row that is both a choice and the way to the level under it (D6, B9).
 *
 * The mouse hovers to open the level and clicks to choose the row itself;
 * the keyboard opens the level with → and chooses with Enter. A finger has
 * no hover, so its first tap opens the level and a second tap on the row
 * chooses it.
 */
export function PickableSub({
  label,
  className,
  onPick,
  children,
}: {
  label: ReactNode;
  className?: string;
  onPick: () => void;
  children: ReactNode;
}) {
  const [subOpen, setSubOpen] = useState(false);
  const pointer = useRef<string>("mouse");
  return (
    <DropdownMenuSub open={subOpen} onOpenChange={setSubOpen}>
      <DropdownMenuSubTrigger
        className={className}
        onPointerDown={(event) => {
          pointer.current = event.pointerType;
        }}
        onClick={(event) => {
          if (pointer.current === "touch" && !subOpen) return;
          event.preventDefault();
          onPick();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onPick();
        }}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-[70dvh] min-w-52 overflow-y-auto">
          {/* Mounted only while open, so its rows are fetched on hover. */}
          {children}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

/**
 * The material level: 「全部材料」, then the project's material columns. With
 * no project chosen the columns of every project are listed, and a name two
 * projects share says which project it is. Both the material and 「全部材料」
 * open the report when clicked (B9) and list their suppliers on hover.
 */
function MaterialLevel({
  project,
  onPick,
}: {
  project?: string;
  onPick: (levels: ReportLevels) => void;
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
  const tRoot = useTranslations();
  const tree = categoryTree(rows);
  const headed = showsGroups(tree);
  // 材料 → 规格 (I11, I19): a material's sub-categories ARE its specifications,
  // so only the top level is a material here; its children are listed under it.
  const ordered = tree.flatMap((group) =>
    group.entries.filter((entry) => entry.depth === 0).map((entry) => entry.row),
  );
  const specsOf = (id: string) =>
    tree.flatMap((group) =>
      group.entries.filter((entry) => entry.depth === 1 && entry.row.parent === id).map((entry) => entry.row),
    );
  const shared = new Set(
    rows
      .map((row) => row.name)
      .filter((name, index, names) => names.indexOf(name) !== index),
  );

  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">{t("material")}</DropdownMenuLabel>
      <PickableSub label={t("allMaterials")} className="h-8 font-medium" onPick={() => onPick({})}>
        <SupplierLevel project={project} onPick={(supplier) => onPick({ supplier })} />
      </PickableSub>
      {categories.isLoading && <Waiting />}
      {categories.isError && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("materialsFailed")}</p>
      )}
      {rows.length > 0 && <DropdownMenuSeparator />}
      {/* I11 (ID27): with a 分类组 of the project's own, the groups first -
          each one a choice of its own (every material in it). */}
      {headed &&
        tree.map((group) =>
          group.key ? (
            <DropdownMenuItem
              key={`group:${group.key}`}
              className="h-8 font-medium"
              onSelect={() => onPick({ category: `group:${group.key}` })}
            >
              <span className="min-w-0 flex-1 truncate">
                {t("allOfGroup", { name: group.name || tRoot("categoryManagement.module.material") })}
              </span>
            </DropdownMenuItem>
          ) : null,
        )}
      {headed && <DropdownMenuSeparator />}
      {ordered.map((row) => (
        <PickableSub
          key={row.id}
          className="h-8"
          onPick={() => onPick({ category: row.id })}
          label={
            <>
              {row.name}
              {!project && shared.has(row.name) && projectCode(row.project) ? (
                <span className="text-muted-foreground"> · {projectCode(row.project)}</span>
              ) : null}
            </>
          }
        >
          <SupplierLevel
            project={project}
            category={row.id}
            onPick={(supplier) => onPick({ category: row.id, supplier })}
          />
          <SpecLevel
            specs={specsOf(row.id)}
            project={project}
            category={row.id}
            onPick={(levels) => onPick({ category: row.id, ...levels })}
          />
        </PickableSub>
      ))}
    </>
  );
}

/**
 * The specification level (I11, I19): 「全部规格」, then the material's
 * specifications; each one lists whoever delivered it, so the supplier stays
 * reachable. Nothing is drawn for a material with no specification.
 */
function SpecLevel({
  specs,
  project,
  category,
  onPick,
}: {
  specs: readonly { id: string; name: string }[];
  project?: string;
  category: string;
  onPick: (levels: { spec_category?: string; supplier?: string }) => void;
}) {
  const t = useTranslations("reportSelector");
  if (specs.length === 0) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">{t("specification")}</DropdownMenuLabel>
      <DropdownMenuItem className="h-8 font-medium" onSelect={() => onPick({})}>
        {t("allSpecifications")}
      </DropdownMenuItem>
      {specs.map((spec) => (
        <PickableSub
          key={spec.id}
          className="h-8"
          label={spec.name}
          onPick={() => onPick({ spec_category: spec.id })}
        >
          <SupplierLevel
            project={project}
            category={category}
            spec={spec.id}
            onPick={(supplier) => onPick({ spec_category: spec.id, supplier })}
          />
        </PickableSub>
      ))}
    </>
  );
}

/** The supplier level: 「全部供应商」, then whoever delivered this material. */
function SupplierLevel({
  project,
  category,
  spec,
  onPick,
}: {
  project?: string;
  category?: string;
  spec?: string;
  onPick: (supplier?: string) => void;
}) {
  const t = useTranslations("reportSelector");
  const tRoot = useTranslations();
  // Mounted only when this level opens, so a long list of materials does not
  // ask for every material's suppliers up front.
  const summary = useQuery({
    queryKey: [
      "receipts", "summary", "report-selector", project ?? "", category ?? "",
      ...(spec ? [spec] : []),
    ],
    queryFn: () => getReceiptSummary({ project, category, spec_category: spec }),
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
        // The deliveries 「未填供应商」 (2026-10-15 I23) open as `supplier=none`.
        <DropdownMenuItem
          key={supplierFilterValue(row.supplier)}
          className="h-8"
          onSelect={() => onPick(supplierFilterValue(row.supplier))}
        >
          <span className={cn("min-w-0 flex-1 truncate", !row.supplier && "text-muted-foreground")}>
            {supplierShown(row.supplier_name, tRoot("receipts.supplierUnfilled"))}
          </span>
        </DropdownMenuItem>
      ))}
      {summary.isSuccess && suppliers.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("noSuppliers")}</p>
      )}
    </>
  );
}

/**
 * A report centre level: the report's categories, or one category's
 * sub-categories (`parent`). A row with a level under it opens it on hover
 * and is itself clickable; the rest are plain choices.
 */
function CategoryLevel({
  reportType,
  label,
  childLabel,
  project,
  parent,
  onPick,
}: {
  reportType: ContractorReportType;
  label: string;
  childLabel?: string;
  project?: string;
  parent?: string;
  onPick: (levels: ReportLevels) => void;
}) {
  const t = useTranslations("reportSelector");
  const { query, rows } = useReportLevel(reportType, project, parent);
  // I11 (ID27): 分类组 → 分类 → 子分类. A group's value is `group:<id>`; a
  // category under a group opens like a first-level one.
  const underCategory = Boolean(parent && !parent.startsWith("group:"));

  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
      {query.isLoading && <Waiting />}
      {query.isError && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("categoriesFailed")}</p>
      )}
      {query.isSuccess && rows.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("noCategories")}</p>
      )}
      {rows.map((row) => {
        const name = levelRowName(row, rows, Boolean(project));
        const isGroup = row.value.startsWith("group:");
        const chosen = underCategory
          ? { category: parent, subcategory: row.value }
          : { category: row.value };
        return row.has_children && (isGroup || (childLabel && !underCategory)) ? (
          <PickableSub
            key={row.value}
            label={name}
            className="h-8"
            onPick={() => onPick(chosen)}
          >
            <CategoryLevel
              reportType={reportType}
              label={isGroup ? label : (childLabel ?? label)}
              childLabel={childLabel}
              project={project}
              parent={row.value}
              onPick={onPick}
            />
          </PickableSub>
        ) : (
          <DropdownMenuItem
            key={row.value}
            className="h-8"
            onSelect={() => onPick(chosen)}
          >
            <span className="min-w-0 flex-1 truncate">{name}</span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/**
 * One level's rows, worded for the reader: photo sources by their module's
 * name, the four application types (Q2) in the reader's language.
 */
export function useReportLevel(
  reportType: ContractorReportType,
  project?: string,
  parent?: string,
  enabled = true,
) {
  const tRoot = useTranslations();
  // query-failure: returned to the caller - CategoryLevel shows 「无法载入分类列表」, useReportLevelName shows "-".
  const query = useQuery({
    queryKey: ["contractor-reports", "levels", reportType, project ?? "", parent ?? ""],
    queryFn: () => getReportCategories({ report_type: reportType, project, parent }),
    enabled,
  });
  const rows = useMemo<ReportLevelRow[]>(() => {
    // A system 分类组 is named by its module; a category that is off but
    // still has records says 「已停用」 (I11).
    const data = (query.data ?? []).map((row) => ({
      ...row,
      label:
        (row.label ||
          (row.module ? tRoot(`reportSelector.groupModule.${row.module}`) : row.value)) +
        (row.is_active === false ? ` · ${tRoot("reportSelector.inactive")}` : ""),
    }));
    if (reportType === "photos") return groupPhotoSources(data, (key) => tRoot(key));
    if (reportType === "consultant") {
      return data.map((row) => ({
        ...row,
        label: tRoot(`reportSelector.consultantType.${row.value}`),
      }));
    }
    return data;
  }, [query.data, reportType, tRoot]);
  return { query, rows };
}

/**
 * The name of the level a report is open at, for the line beside
 * 【选择报表】 and the export's subtitle: 「混凝土」, 「车类 › 罗里」. Reads the
 * same cache as the menu.
 */
export function useReportLevelName(
  reportType: ContractorReportType,
  project: string | undefined,
  category: string | undefined,
  subcategory: string | undefined,
): { name?: string; failed: boolean } {
  const top = useReportLevel(reportType, project, undefined, Boolean(category));
  const below = useReportLevel(
    reportType,
    project,
    category,
    Boolean(category && subcategory),
  );
  if (!category) return { name: undefined, failed: false };
  const first = top.rows.find((row) => row.value === category);
  const second = subcategory
    ? below.rows.find((row) => row.value === subcategory)
    : undefined;
  const names = [first?.label, second?.label].filter(Boolean);
  return {
    name: names.length ? names.join(" › ") : undefined,
    failed: top.query.isError || below.query.isError,
  };
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
