"use client";

/**
 * 材料进场's per-material management (JB260, JB262, JB263; 客户 11-26 事项 1、3、4).
 *
 * 事项 1: 「在『材料进场』主页面设置『按材料查询』按钮，通过搜索及选择材料名称，
 * 直接打开对应材料的现有完整统计页面，所有统计、筛选及查看功能保持不变」 -
 * `MaterialLookupButton` opens the very window 分类管理's 【查看记录】 opens
 * (`ColumnRecordsDialog`, its endpoints, its permissions), for the material
 * picked.
 *
 * 事项 3、4: 「材料分类负责基础设置，材料进场负责记录、查询及统计」「总部管理人员
 * 不应该为了查看一种材料的实际收货、MR申请数量、批准数量、目标数量及预算成本，在
 * 几个不同的页面之间跳来跳去」 - `MaterialOverview` is one row per material of
 * the project with all of them side by side, each figure from the endpoint
 * that already makes it (so it is the same number as before):
 *
 * - 累计进场, 记录 / 已归档: the material category (`get_categories`), as
 *   分类管理 showed them;
 * - MR 待审 / 已批准: 申请累计 (`material-requests/get_summary`, JB243), only
 *   for whoever holds `material_request.view` - the server refuses anyone else;
 * - 目标: 材料目标 (`material-targets/get_targets`), not for a consultant
 *   without 材料目标 ticked;
 * - 花费／预算: the category's spend and budget (the server blanks amounts for
 *   a reader without 金额查看).
 *
 * Each row opens: 【查看记录】 the statistics window (records, history, 查看),
 * 【材料目标】 this material's targets and its budget, 【MR 申请】 申请累计 for
 * this material (each figure there opens the MRs and their approval), and
 * 【供应商统计】 按供应商看总数 for this material.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Eye, PackageSearch, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ColumnRecordsDialog,
  QuantityCell,
  SpendCell,
} from "@/components/contractor-ops/category-management";
import { useAuth } from "@/components/providers/auth-provider";
import { useProjectMaterials } from "@/components/receipts/material-budget";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnitName } from "@/hooks/use-material-units";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import type { MaterialRequestTotal } from "@/interfaces/material-request";
import type { MaterialTarget } from "@/interfaces/material-target";
import { consultantLacks } from "@/lib/consultant-modules";
import { targetTone } from "@/lib/material-targets";
import { getMaterialRequestTotals } from "@/services/material-request.service";
import { getMaterialTargets } from "@/services/material-target.service";

/** 「 Rebar  y10 」 → 「rebar y10」: how 申请累计 matches names (JB243 `material_key`). */
export function sameWords(text: string | null | undefined): string {
  return String(text ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** The materials whose name, code or a specification holds what was typed. */
export function filterMaterials(rows: readonly ProjectCategory[], typed: string): ProjectCategory[] {
  const term = sameWords(typed);
  if (!term) return [...rows];
  return rows.filter((row) =>
    [row.name, row.code, ...(row.specs ?? []).map((spec) => spec.name)].some((text) =>
      sameWords(text).includes(term),
    ),
  );
}

/** 申请累计's lines of one material (same project, same name). */
export function requestLinesOf(
  material: Pick<ProjectCategory, "project" | "name">,
  totals: readonly MaterialRequestTotal[],
): MaterialRequestTotal[] {
  const name = sameWords(material.name);
  return totals.filter((row) => row.project === material.project && sameWords(row.material_name) === name);
}

/** 材料目标's targets of one material. */
export function targetsOf(materialId: string, targets: readonly MaterialTarget[]): MaterialTarget[] {
  return targets.filter((row) => row.category === materialId);
}

/** The records window of one material, as 分类管理's 【查看记录】 opens it. */
function RecordsWindow({ material, onClose }: { material: ProjectCategory; onClose: () => void }) {
  return (
    <ColumnRecordsDialog
      moduleKey="material"
      column={{ id: material.id, name: material.name, column: material }}
      onClose={onClose}
    />
  );
}

/**
 * 【按材料查询】 (JB260): type, pick a material, and its statistics window
 * opens. A material is a project's, so the button waits for one.
 */
export function MaterialLookupButton({ project }: { project?: string }) {
  const t = useTranslations("jb260");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [viewing, setViewing] = useState<ProjectCategory | null>(null);
  const materials = useProjectMaterials(open ? project : undefined);
  const found = filterMaterials(materials.data ?? [], typed);
  return (
    <>
      <Button
        variant="outline"
        disabled={!project}
        disabledReason={project ? undefined : t("chooseProject")}
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        data-slot="material-lookup"
      >
        <PackageSearch />
        {t("button")}
      </Button>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackageSearch className="size-5" />
                {t("title")}
              </DialogTitle>
              <DialogDescription>{t("help")}</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                type="search"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="pl-8"
              />
            </div>
            {materials.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : materials.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {t("failed")}
              </p>
            ) : found.length === 0 ? (
              <p className="text-sm text-muted-foreground">{typed ? t("noMatch") : t("none")}</p>
            ) : (
              <ul className="divide-y rounded-lg border" data-slot="material-lookup-results">
                {found.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => {
                        setOpen(false);
                        setViewing(row);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{row.name}</span>
                        {(row.specs ?? []).length > 0 && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {(row.specs ?? [])
                              .filter((spec) => spec.is_active)
                              .map((spec) => spec.name)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      )}
      {viewing && <RecordsWindow material={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** 材料统计: one row per material of the project, every figure side by side. */
export function MaterialOverview({ project }: { project?: string }) {
  const t = useTranslations("jb262");
  const { can, user } = useAuth();
  const unitName = useUnitName();
  // Open on every visit (the client looks here first); 收起 for this visit.
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed((value) => !value);
  const [viewing, setViewing] = useState<ProjectCategory | null>(null);
  // 「按照现有权限分别显示及操作」: each part asks with its own permission, and
  // the server answers only what that permission allows.
  const seesRequests = can("material_request.view");
  const seesTargets =
    (can("receipt.view") || can("material_target.manage")) && !consultantLacks(user?.features, "materials.targets");
  const seesSupplierTotals = !consultantLacks(user?.features, "materials.supplier_totals");
  const materials = useProjectMaterials(project);
  const targets = useQuery({
    queryKey: ["material-targets", project ?? "", ""],
    queryFn: () => getMaterialTargets({ project }),
    enabled: Boolean(project) && seesTargets && !collapsed,
  });
  const requests = useQuery({
    queryKey: ["material-requests", "totals", { project }],
    queryFn: () => getMaterialRequestTotals({ project }),
    enabled: Boolean(project) && seesRequests && !collapsed,
  });
  const rows = useMemo(() => (materials.data ?? []).filter((row) => row.is_active || row.record_count > 0), [materials.data]);
  const showsRequests = seesRequests && !requests.isError;
  const showsTargets = seesTargets && !targets.isError;
  // A reader without the categories (no `category.view`) has no table here.
  if (materials.isError) return null;
  const query = project ? `project=${encodeURIComponent(project)}` : "";

  return (
    <section className="rounded-xl border border-panel-border bg-card/40" data-slot="material-overview">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-semibold"
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          {t("overview.title")}
          {project && materials.data ? (
            <span className="font-normal text-muted-foreground">{t("overview.count", { count: rows.length })}</span>
          ) : null}
        </button>
        {!collapsed && <p className="text-xs text-muted-foreground">{t("overview.help")}</p>}
      </header>
      {collapsed ? null : !project ? (
        <p className="border-t px-3 py-3 text-sm text-muted-foreground">{t("overview.chooseProject")}</p>
      ) : materials.isLoading ? (
        <p className="border-t px-3 py-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="border-t px-3 py-3 text-sm text-muted-foreground">{t("overview.empty")}</p>
      ) : (
        <div className="border-t">
          {/* The table's own box scrolls past ~8 rows, so the list below
              keeps its room and the header sticks to this box (I39-2). */}
          <Table fit containerClassName="max-h-80">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.material")}</TableHead>
                <TableHead>{t("col.received")}</TableHead>
                {showsRequests && <TableHead>{t("col.requests")}</TableHead>}
                {showsTargets && <TableHead>{t("col.target")}</TableHead>}
                <TableHead>{t("col.spend")}</TableHead>
                <TableHead pin="end">{t("col.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const lines = requestLinesOf(row, requests.data ?? []);
                const goals = targetsOf(row.id, targets.data?.results ?? []);
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer align-top"
                    data-material={row.code}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a,button")) return;
                      setViewing(row);
                    }}
                  >
                    <TableCell className="font-medium">
                      {row.name}
                      <span className="block text-2xs font-normal text-muted-foreground">
                        {row.code}
                        {" · "}
                        {t("overview.records", { count: row.record_count })}
                        {row.archived_deliveries != null
                          ? ` · ${t("overview.archived", { count: row.archived_deliveries })}`
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <QuantityCell quantities={row.quantities ?? []} />
                    </TableCell>
                    {showsRequests && (
                      <TableCell className="text-xs tabular-nums" data-slot="overview-requests">
                        {requests.isLoading ? (
                          "…"
                        ) : lines.length === 0 ? (
                          <span className="text-muted-foreground">{t("overview.noRequests")}</span>
                        ) : (
                          lines.map((line) => (
                            <span key={`${line.specification}|${line.unit}`} className="block">
                              {line.specification ? `${line.specification}：` : ""}
                              {t("overview.requestLine", {
                                pending: line.pending_quantity,
                                approved: line.approved_quantity,
                                unit: unitName(line.unit),
                              })}
                            </span>
                          ))
                        )}
                      </TableCell>
                    )}
                    {showsTargets && (
                      <TableCell className="text-xs tabular-nums" data-slot="overview-targets">
                        {targets.isLoading ? (
                          "…"
                        ) : goals.length === 0 ? (
                          <span className="text-muted-foreground">{t("overview.noTarget")}</span>
                        ) : (
                          goals.map((goal) => (
                            <span key={goal.id} className="flex flex-wrap items-center gap-1">
                              {goal.spec_name ? `${goal.spec_name}：` : ""}
                              {t("overview.targetLine", {
                                net: goal.net,
                                target: goal.target_quantity,
                                unit: unitName(goal.unit, goal.unit_label),
                              })}
                              <StatusBadge
                                label={goal.percent === null ? "—" : `${goal.percent}%`}
                                tone={targetTone(goal.status)}
                              />
                            </span>
                          ))
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {row.spend_amount == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <SpendCell column={row} />
                      )}
                    </TableCell>
                    <TableCell pin="end">
                      <div className="flex flex-wrap gap-1" data-slot="overview-actions">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setViewing(row)}>
                          <Eye />
                          {t("action.records")}
                        </Button>
                        {showsTargets && (
                          <Button size="sm" variant="outline" className="h-7" asChild>
                            <Link href={`/material-targets?${query}&category=${encodeURIComponent(row.id)}`}>
                              {t("action.targets")}
                            </Link>
                          </Button>
                        )}
                        {seesRequests && (
                          <Button size="sm" variant="outline" className="h-7" asChild>
                            <Link
                              href={`/material-requests?tab=totals&${query}&material=${encodeURIComponent(row.name)}`}
                            >
                              {t("action.requests")}
                            </Link>
                          </Button>
                        )}
                        {seesSupplierTotals && (
                          <Button size="sm" variant="outline" className="h-7" asChild>
                            <Link href={`/receipts?view=totals&${query}&material=${encodeURIComponent(row.name)}`}>
                              {t("action.suppliers")}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {viewing && <RecordsWindow material={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
