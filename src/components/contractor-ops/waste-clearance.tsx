"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { SiteDisposalOffice } from "@/components/contractor-ops/site-disposal-workspaces";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { DISPATCH_STATE_TONE, Dispatches } from "@/components/dispatches/dispatches";
import { useAuth } from "@/components/providers/auth-provider";
import {
  ListHeader,
  QueryFailedNote,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { clearanceFigureFilters } from "@/lib/waste-clearance-figures";
import { getDispatchSummary, getDispatches } from "@/services/contractor.service";
import { getDisposalRequests, getDisposalTotals } from "@/services/contractor-ops.service";

type Kind = "all" | "disposal" | "dispatch";

const PER_KIND = 10;

/**
 * 垃圾清运: the contractor's one column for waste leaving site (B08).
 *
 * The 29.09 meeting: 「废料订单和工地清运本质上是同一个东西，两个栏目要合起来，
 * 名字叫"垃圾清运"」. Only the entry is merged. A waste order (a load sold
 * to a partner recycler) and a site disposal (rubbish taken away) stay two
 * kinds of record, each with its own number, flow, evidence and figures -
 * nothing underneath was joined, renamed or moved (DEV_BRIEF Q7, D06).
 *
 * 全部 lists both, newest first, each row saying which kind it is and opening
 * the original detail. The other two tabs are the original screens, whole:
 * filters, export, creating, every step. The counts stay apart.
 *
 * The recycler's own order book (废料订单 in their console) is a different
 * screen and is not touched.
 */
export function WasteClearance() {
  const t = useTranslations("wasteClearance");
  const { user, can } = useAuth();
  const searchParams = useSearchParams();
  const hasDisposals = user?.features.includes("site_disposals") ?? false;
  const hasDispatches = user?.features.includes("waste_dispatches") ?? false;

  const kinds: Kind[] = [
    ...(hasDisposals && hasDispatches ? (["all"] as const) : []),
    ...(hasDisposals ? (["disposal"] as const) : []),
    ...(hasDispatches ? (["dispatch"] as const) : []),
  ];
  const asked = searchParams.get("kind") as Kind | null;
  const kind: Kind = asked && kinds.includes(asked) ? asked : kinds[0] ?? "all";

  // The header describes the list under it: opened from a head-office card
  // (`counted=1`, one project) it counts what that list shows (F8).
  // The page's project is the top bar's 「当前项目」 when it is in force (B13).
  const topBar = useCurrentProject();
  const figureParams = new URLSearchParams(searchParams.toString());
  if (topBar.active) {
    figureParams.delete("project");
    if (topBar.projectId) figureParams.set("project", topBar.projectId);
  }
  const figureFilters = clearanceFigureFilters(kind, figureParams);
  if (kind === "all" && topBar.active && topBar.projectId) {
    figureFilters.disposal.project = topBar.projectId;
    figureFilters.dispatch.project = topBar.projectId;
  }
  // The two counts, apart (D06). Page size 1: only `count` is read.
  const disposalCount = useQuery({
    queryKey: ["site-disposals", "count", "waste-clearance", figureFilters.disposal],
    queryFn: () => getDisposalRequests({ page_size: 1, ...figureFilters.disposal }),
    enabled: hasDisposals,
  });
  const dispatchCount = useQuery({
    queryKey: ["dispatches", "count", "waste-clearance", figureFilters.dispatch],
    queryFn: () => getDispatches({ page_size: 1, ...figureFilters.dispatch }),
    enabled: hasDispatches,
  });
  const countText = (query: typeof disposalCount | typeof dispatchCount) =>
    query.isError ? "—" : query.isLoading ? "…" : String(query.data?.count ?? 0);
  // D06: each kind's own 数量 / 车次 / 重量, read from its own module and
  // shown on its own line - never added together.
  const disposalTotals = useQuery({
    queryKey: ["site-disposals", "totals", "waste-clearance", figureFilters.disposal],
    queryFn: () => getDisposalTotals(figureFilters.disposal),
    enabled: hasDisposals && can("disposal.view"),
  });
  const dispatchTotals = useQuery({
    queryKey: ["dispatches", "summary", "waste-clearance", figureFilters.dispatch],
    queryFn: () => getDispatchSummary(figureFilters.dispatch),
    enabled: hasDispatches && can("dispatch.view"),
  });
  const dispatchFigures = dispatchTotals.data?.clearance_totals;

  if (kinds.length === 0) return null;

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("title")}
        subtitle={[
          hasDisposals ? t("countDisposals", { count: countText(disposalCount) }) : null,
          hasDispatches ? t("countDispatches", { count: countText(dispatchCount) }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          kind === "all" ? (
            <div className="flex flex-wrap gap-2">
              {can("disposal.submit") && (
                <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
                  <Link href="/waste-clearance?kind=disposal&create=1">
                    <Plus className="h-4 w-4" />
                    {t("newDisposal")}
                  </Link>
                </Button>
              )}
              {can("dispatch.create") && (
                <Button asChild size="sm" variant="outline" className="rounded-full px-4">
                  <Link href="/dispatches/create">
                    <Plus className="h-4 w-4" />
                    {t("newDispatch")}
                  </Link>
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <QueryFailedNote query={disposalCount} what={t("kind.disposal")} />
      <QueryFailedNote query={dispatchCount} what={t("kind.dispatch")} />
      <QueryFailedNote query={disposalTotals} what={t("kind.disposal")} />
      <QueryFailedNote query={dispatchTotals} what={t("kind.dispatch")} />

      {(disposalTotals.data || dispatchFigures) && (
        <section data-clearance-totals className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
          {disposalTotals.data && (
            <p>
              {t("totals.disposals", {
                records: disposalTotals.data.records,
                trips: disposalTotals.data.trips,
                weight: disposalTotals.data.weight_kg,
              })}
            </p>
          )}
          {dispatchFigures && (
            <p>
              {t("totals.dispatches", {
                records: dispatchFigures.records,
                trips: dispatchFigures.trips,
                weight: dispatchFigures.weighed_kg,
              })}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{t("totals.apart")}</p>
        </section>
      )}

      {kinds.length > 1 && (
        <nav aria-label={t("title")} className="flex w-fit flex-wrap gap-1 rounded-lg border bg-card p-1 shadow-sm">
          {kinds.map((option) => (
            <Link
              key={option}
              href={`/waste-clearance?kind=${option}`}
              aria-current={option === kind ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                option === kind && "bg-primary/10 text-primary",
              )}
            >
              {t(`tab.${option}`)}
            </Link>
          ))}
        </nav>
      )}

      {kind === "all" ? (
        <MergedList />
      ) : kind === "disposal" ? (
        <SiteDisposalOffice />
      ) : (
        <Dispatches />
      )}
    </div>
  );
}

interface MergedRow {
  kind: "disposal" | "dispatch";
  id: string;
  reference: string;
  statusBadge: React.ReactNode;
  project: string;
  content: string;
  at: string | null;
  href: string;
}

/**
 * Both kinds in one list, newest first. Each page holds up to ten of each
 * kind, merged by time; the arrows move both together.
 */
function MergedList() {
  const t = useTranslations("wasteClearance");
  const disposalT = useTranslations("siteDisposal");
  const root = useTranslations();
  const df = useDateFormat();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  // On the top bar's 「当前项目」 (B13); 全部项目 leaves it out.
  const topBar = useCurrentProject();
  const project = (topBar.active ? topBar.projectId : "") || undefined;

  const disposals = useQuery({
    queryKey: ["site-disposals", "waste-clearance", project, page],
    queryFn: () => getDisposalRequests({ page, page_size: PER_KIND, project }),
  });
  const dispatches = useQuery({
    queryKey: ["dispatches", "waste-clearance", project, page],
    queryFn: () => getDispatches({ page, page_size: PER_KIND, project }),
  });

  const rows: MergedRow[] = [
    ...(disposals.data?.results ?? []).map((row) => ({
      kind: "disposal" as const,
      id: row.id,
      reference: row.reference_no,
      statusBadge: <StatusBadge label={disposalT(`status.${row.status}`)} />,
      project: row.project_name,
      content: row.waste_description,
      at: row.created_at,
      href: `/waste-clearance?kind=disposal&record=${row.id}`,
    })),
    ...(dispatches.data?.results ?? []).map((row) => ({
      kind: "dispatch" as const,
      id: row.id,
      reference: row.dispatch_no,
      statusBadge: (
        <StatusBadge
          label={root(`dispatches.state.${row.state}`)}
          tone={DISPATCH_STATE_TONE[row.state]}
        />
      ),
      project: row.project_name,
      content: `${root(`dispatches.wasteType.${row.waste_type}`)} · ${row.recycler_name}`,
      at: row.created_at ?? null,
      href: `/dispatches/${row.id}`,
    })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const pages = Math.max(
    1,
    Math.ceil((disposals.data?.count ?? 0) / PER_KIND),
    Math.ceil((dispatches.data?.count ?? 0) / PER_KIND),
  );
  const loading = disposals.isLoading || dispatches.isLoading;
  const pageHref = (target: number) => `/waste-clearance?kind=all&page=${target}`;

  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <QueryFailedNote query={disposals} what={t("kind.disposal")} />
      <QueryFailedNote query={dispatches} what={t("kind.dispatch")} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("column.kind")}</TableHead>
            <TableHead>{t("column.reference")}</TableHead>
            <TableHead>{t("column.status")}</TableHead>
            <TableHead>{t("column.project")}</TableHead>
            <TableHead>{t("column.content")}</TableHead>
            <TableHead>{t("column.at")}</TableHead>
            <TableHead className="text-right">{t("column.open")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 justify-center">
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : rows.map((row) => (
            <TableRow key={`${row.kind}-${row.id}`}>
              <TableCell>
                <TypeBadge label={t(`kind.${row.kind}`)} />
              </TableCell>
              <TableCell className="tabular font-medium">{row.reference}</TableCell>
              <TableCell>{row.statusBadge}</TableCell>
              <TableCell className="max-w-[180px] truncate">{row.project}</TableCell>
              <TableCell className="max-w-[260px] truncate">{row.content}</TableCell>
              <TableCell className="tabular text-muted-foreground">
                {row.at ? df.dateTime(row.at) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={row.href}>{t("column.open")}</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm text-muted-foreground">
        <span>{t("pageOf", { page, pages })}</span>
        <div className="flex gap-2">
          <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1} disabledReason={page <= 1 ? root("common.alreadyFirstPage") : undefined}>
            {page > 1 ? (
              <Link href={pageHref(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
                {root("table.previous")}
              </Link>
            ) : (
              <span>
                <ChevronLeft className="h-4 w-4" />
                {root("table.previous")}
              </span>
            )}
          </Button>
          <Button asChild={page < pages} variant="outline" size="sm" disabled={page >= pages} disabledReason={page >= pages ? t("lastPage") : undefined}>
            {page < pages ? (
              <Link href={pageHref(page + 1)}>
                {root("table.next")}
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                {root("table.next")}
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
