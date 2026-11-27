"use client";

/**
 * 人员名单 (I20): 「在现有「电子围栏 / 人员进场」增加「人员名单」」.
 *
 * Two tabs, as the client listed them: the roster (one search box over name,
 * phone, CIDB and other document numbers, a company dropdown, the 在场状态 of
 * each person) and 进出场记录 (each stay, in and out). Both preview, print and
 * export exactly what the search and filters show. 「查看」 opens a person:
 * profile, documents, the location link, the last position and their stays.
 *
 * Nothing here can change a location record - there is no such endpoint.
 *
 * JB91 (10-31): each person's 「施工工种」, and above the roster 「按工种汇总」 -
 * per trade 登记 and 在场, a card pressed filters the roster by its trade.
 * The roster and the cards ask again every minute, so 在场 follows the
 * fence without a reload (「在场人数根据现有电子围栏定位状态自动更新」).
 *
 * JB295b (客户 11-28 事项 2): 「在现有人员名单页面上方，完善人工费用统计及人工
 * 月结单两个栏目，直接关联现有人员进出场记录」 - two more tabs, 人工费用统计
 * (`?tab=labour`, `labour.view`) and 人工月结单 (`?tab=statements`,
 * `labour.manage`), each shown only to whoever may open it.
 */

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { officeMay } from "@/components/contractor-ops/return-checks";
import { LabourCostsPage } from "@/components/labour/labour-costs";
import { LABOUR_MANAGE, LABOUR_VIEW } from "@/components/labour/labour-shared";
import { LabourStatementsPage } from "@/components/labour/labour-statements";
import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useTradeLabel } from "@/components/site-workers/trade-select";
import { ROSTER_REFRESH_MS, TradeSummaryPanel } from "@/components/site-workers/trade-summary";
import { VisitExit } from "@/components/site-workers/visit-exit";
import { WorkerDetailDialog } from "@/components/site-workers/worker-detail";
import { WorkerFormDialog } from "@/components/site-workers/worker-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useListQuery } from "@/hooks/use-list-query";
import type { SiteWorker, SiteWorkerVisit } from "@/interfaces/site-workers";
import { useDateFormat } from "@/lib/dates";
import {
  BUILT_IN_TRADE_CODES,
  BUILT_IN_TRADE_NAMES,
  WORKER_STATUSES,
  workerStatusTone,
} from "@/lib/site-workers";
import {
  exportSiteWorkerVisits,
  exportSiteWorkers,
  getSiteWorkerVisits,
  getSiteWorkers,
  getWorkerCompanyOptions,
} from "@/services/site-workers.service";
import { LIST_FITS } from "@/lib/list-fits";

type Tab = "roster" | "visits" | "labour" | "statements";
const TABS: readonly Tab[] = ["roster", "visits", "labour", "statements"];
const ALL = "all";

/** The tabs this reader may open: the two labour ones by their rights (JB295b). */
export function siteWorkerTabs(may: (permission: string) => boolean): Tab[] {
  return TABS.filter(
    (tab) => (tab !== "labour" || may(LABOUR_VIEW)) && (tab !== "statements" || may(LABOUR_MANAGE)),
  );
}

export function SiteWorkers() {
  const t = useTranslations("siteWorkers");
  const t295 = useTranslations("jb295");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, user } = useAuth();
  const tabs = siteWorkerTabs((permission) => officeMay(user, can, permission));
  const asked = searchParams.get("tab") as Tab | null;
  const tab: Tab = asked && tabs.includes(asked) ? asked : "roster";
  const [viewing, setViewing] = useState<string | null>(null);

  const go = (next: Tab, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.set("tab", next);
    const project = searchParams.get("project");
    if (project) params.set("project", project);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => go(value as Tab)}>
        <TabsList>
          {tabs.map((key) => (
            <TabsTrigger key={key} value={key} data-slot={`site-workers-tab-${key}`}>
              {key === "labour" || key === "statements" ? t295(`tab.${key}`) : t(`tab.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "roster" ? <WorkerRoster onView={setViewing} /> : null}
      {tab === "visits" ? <WorkerVisits onView={setViewing} /> : null}
      {/* The labour tabs are long pages: they scroll inside the tab. */}
      {tab === "labour" ? (
        <div className="min-h-0 flex-1 overflow-y-auto" data-slot="site-workers-labour">
          <LabourCostsPage />
        </div>
      ) : null}
      {tab === "statements" ? (
        <div className="min-h-0 flex-1 overflow-y-auto" data-slot="site-workers-statements">
          <LabourStatementsPage />
        </div>
      ) : null}
      <WorkerDetailDialog
        workerId={viewing}
        onClose={() => setViewing(null)}
        onAllVisits={(workerId) => {
          setViewing(null);
          go("visits", { worker: workerId });
        }}
      />
    </div>
  );
}

/** 「所属公司」 filter: the companies on this roster. */
function CompanyFilter({ project, value, onChange }: {
  project?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const t = useTranslations("siteWorkers");
  const options = useQuery({
    queryKey: ["site-workers", "company-options", "used", project || ALL],
    queryFn: () => getWorkerCompanyOptions({ used: "1", active: "all", ...(project ? { project } : {}) }),
    staleTime: 30_000,
  });
  return (
    <div className="min-w-0">
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
        <SelectTrigger className="w-full sm:w-56" aria-label={t("filter.company")}>
          <SelectValue placeholder={t("filter.company")} />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={ALL}>{t("filter.allCompanies")}</SelectItem>
          {(options.data ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <QueryFailedNote query={options} what={t("what.companies")} />
    </div>
  );
}

function OpenWorkerButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("siteWorkers");
  return (
    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-primary" onClick={onClick}>
      <Eye className="h-4 w-4" />
      {t("action.view")}
    </Button>
  );
}

function WorkerRoster({ onView }: { onView: (id: string) => void }) {
  const t = useTranslations("siteWorkers");
  const t295 = useTranslations("jb295");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { can } = useAuth();
  const tradeLabel = useTradeLabel();
  const list = useListQuery(["project", "company", "status", "active", "trade"]);
  const [creating, setCreating] = useState(false);
  const inactive = list.filters.active === "0";
  const query = useMemo(() => ({ ...list.query, active: inactive ? "0" : "1" }), [list.query, inactive]);
  const workers = useQuery({
    queryKey: ["site-workers", "list", query],
    queryFn: () => getSiteWorkers(query),
    refetchInterval: ROSTER_REFRESH_MS,
  });
  const total = workers.data?.count ?? 0;
  const counts = workers.data?.status_counts;
  const allProjects = !list.filters.project;

  const columns = useMemo<ColumnDef<SiteWorker, unknown>[]>(() => {
    const rows: ColumnDef<SiteWorker, unknown>[] = [
      {
        accessorKey: "name",
        meta: { label: t("field.name") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.name")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="flex flex-col items-start gap-0.5">
            <span className="font-medium text-foreground">{row.original.name}</span>
            {/* JB295b: the same phone's app account on this project is the same person. */}
            {row.original.linked_user ? (
              <span className="text-xs text-primary" data-slot="worker-linked-user">
                {t295("twin.linkedTag", { name: row.original.linked_user.name })}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "phone",
        meta: { label: t("field.phone") },
        header: () => t("field.phone"),
        cell: ({ row }) => <span className="tabular">{row.original.phone || "—"}</span>,
      },
      {
        accessorKey: "passport_no",
        meta: { label: t("field.passportNo") },
        header: () => t("field.passportNo"),
        cell: ({ row }) => <span className="tabular">{row.original.passport_no || "—"}</span>,
      },
      {
        accessorKey: "cidb_no",
        meta: { label: t("field.cidb") },
        header: () => t("field.cidb"),
        cell: ({ row }) => row.original.cidb_no || "—",
      },
      {
        accessorKey: "company_name",
        meta: { label: t("field.company") },
        header: () => t("field.company"),
        cell: ({ row }) => row.original.company_name || "—",
      },
      {
        id: "trade",
        accessorKey: "trade_name",
        meta: { label: t("field.trade") },
        header: () => t("field.trade"),
        cell: ({ row }) =>
          row.original.trade ? (
            tradeLabel({ code: row.original.trade_code, name: row.original.trade_name })
          ) : (
            <span className="text-muted-foreground">{t("trade.none")}</span>
          ),
      },
    ];
    if (allProjects) {
      rows.push({
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => t("field.project"),
      });
    }
    rows.push(
      {
        accessorKey: "status",
        meta: { label: t("field.status") },
        header: () => t("field.status"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(`status.${row.original.status}`)}
            tone={workerStatusTone(row.original.status)}
          />
        ),
      },
      {
        accessorKey: "last_position_at",
        meta: { label: t("field.lastPositionAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.lastPositionAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.last_position_at ? df.dateTime(row.original.last_position_at) : "—"}
          </span>
        ),
      },
      {
        id: "view",
        enableSorting: false,
        meta: { label: t("field.view") },
        header: () => t("field.view"),
        cell: ({ row }) => <OpenWorkerButton onClick={() => onView(row.original.id)} />,
      },
    );
    return rows;
  }, [allProjects, df, onView, t, t295, tradeLabel]);

  const statusValues = Object.fromEntries(WORKER_STATUSES.map((status) => [status, t(`status.${status}`)]));
  // The file carries a built-in trade's stored name; say it in the reader's language.
  const tradeValues = Object.fromEntries(
    BUILT_IN_TRADE_CODES.map((code) => [BUILT_IN_TRADE_NAMES[code], t(`trade.builtIn.${code}`)]),
  );
  const title = inactive ? `${t("title")} · ${t("filter.inactive")}` : t("title");

  return (
    <>
      <ListHeader
        title={t("title")}
        subtitle={workers.isLoading ? common("loading") : t("count", { count: total })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectPicker
              value={list.filters.project ?? ALL}
              onValueChange={(value) => list.setFilter("project", value === ALL ? undefined : value)}
              placeholder={t("filter.project")}
              allowAll
              allLabel={t("filter.allProjects")}
              className="hidden w-56 sm:flex"
            />
            {/* 预览 · 打印 · 导出 PDF / Excel: the rows the filters show. */}
            <ExportButton
              disabled={total === 0}
              disabledReason={t("count", { count: 0 })}
              title={title}
              onExport={(format) =>
                exportSiteWorkers({
                  format,
                  title,
                  subtitle: t("count", { count: total }),
                  query,
                  columns: [
                    { key: "name", label: t("field.name") },
                    { key: "phone", label: t("field.phone") },
                    { key: "passport_no", label: t("field.passportNo") },
                    { key: "nationality", label: t("field.nationality") },
                    { key: "date_of_birth", label: t("field.dateOfBirth") },
                    { key: "passport_expiry", label: t("field.passportExpiry") },
                    { key: "cidb_no", label: t("field.cidb") },
                    { key: "company_name", label: t("field.company") },
                    { key: "trade_name", label: t("field.trade"), values: tradeValues },
                    { key: "status", label: t("field.status"), values: statusValues },
                    { key: "last_position_at", label: t("field.lastPositionAt") },
                    { key: "documents_text", label: t("field.documents") },
                    ...(allProjects ? [{ key: "project_name", label: t("field.project") }] : []),
                  ],
                })
              }
            />
            {can("site_worker.manage") && (
              <Button onClick={() => setCreating(true)}>
                <UserPlus className="h-4 w-4" />
                {t("action.add")}
              </Button>
            )}
            {/* JB61-1: ten, twenty, two thousand at a time - a whole page. */}
            {can("site_worker.manage") && (
              <Button asChild variant="outline">
                <Link
                  href={
                    list.filters.project
                      ? `/site-workers/bulk?project=${encodeURIComponent(list.filters.project)}`
                      : "/site-workers/bulk"
                  }
                >
                  <Users className="h-4 w-4" />
                  {t("action.bulkAdd")}
                </Link>
              </Button>
            )}
          </div>
        }
      />
      {workers.data?.fence_set === false && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("noFence")}
        </p>
      )}
      <TradeSummaryPanel list={list} />
      <p className="text-xs text-muted-foreground">{t("searchHint")}</p>
      <DataTable
        columns={columns}
        rows={workers.data?.results ?? []}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={workers.isLoading}
        isError={workers.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey={LIST_FITS.siteWorkers.storageKey}
        defaultHidden={LIST_FITS.siteWorkers.hidden}
        toolbarActions={
          <CompanyFilter
            project={list.filters.project}
            value={list.filters.company}
            onChange={(value) => list.setFilter("company", value)}
          />
        }
        filterPills={[
          {
            key: "all",
            label: common("all"),
            active: !list.filters.status,
            onSelect: () => list.setFilter("status", undefined),
          },
          ...WORKER_STATUSES.map((status) => ({
            key: status,
            label: counts ? `${t(`status.${status}`)} ${counts[status] ?? 0}` : t(`status.${status}`),
            active: list.filters.status === status,
            onSelect: () => list.setFilter("status", status),
          })),
          {
            key: "inactive",
            label: t("filter.inactive"),
            active: inactive,
            onSelect: () => list.setFilter("active", inactive ? undefined : "0"),
          },
        ]}
        onRowClick={(row) => onView(row.id)}
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
      <WorkerFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        defaultProject={list.filters.project}
        onSaved={(worker) => {
          setCreating(false);
          onView(worker.id);
        }}
      />
    </>
  );
}

function WorkerVisits({ onView }: { onView: (id: string) => void }) {
  const t = useTranslations("siteWorkers");
  const t295 = useTranslations("jb295");
  const common = useTranslations("common");
  const df = useDateFormat();
  const list = useListQuery(["project", "company", "worker", "date_from", "date_to"]);
  const visits = useQuery({
    queryKey: ["site-workers", "visits", list.query],
    queryFn: () => getSiteWorkerVisits(list.query),
  });
  const total = visits.data?.count ?? 0;
  const allProjects = !list.filters.project;

  const columns = useMemo<ColumnDef<SiteWorkerVisit, unknown>[]>(() => {
    const rows: ColumnDef<SiteWorkerVisit, unknown>[] = [
      {
        accessorKey: "worker_name",
        meta: { label: t("field.name") },
        header: () => t("field.name"),
        cell: ({ row }) => (
          <span className="flex flex-col items-start gap-0.5">
            <span className="font-medium text-foreground">{row.original.worker_name}</span>
            {row.original.linked_user_name ? (
              <span className="text-xs text-muted-foreground" data-slot="visit-linked-user">
                {t295("twin.appName", { name: row.original.linked_user_name })}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "phone",
        meta: { label: t("field.phone") },
        header: () => t("field.phone"),
        cell: ({ row }) => <span className="tabular">{row.original.phone || "—"}</span>,
      },
      {
        accessorKey: "cidb_no",
        meta: { label: t("field.cidb") },
        header: () => t("field.cidb"),
        cell: ({ row }) => row.original.cidb_no || "—",
      },
      {
        accessorKey: "company_name",
        meta: { label: t("field.company") },
        header: () => t("field.company"),
        cell: ({ row }) => row.original.company_name || "—",
      },
    ];
    if (allProjects) {
      rows.push({
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => t("field.project"),
      });
    }
    rows.push(
      {
        accessorKey: "entered_at",
        meta: { label: t("field.enteredAt") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.enteredAt")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{df.dateTime(row.original.entered_at)}</span>,
      },
      {
        accessorKey: "exited_at",
        meta: { label: t("field.exitedAt") },
        header: () => t("field.exitedAt"),
        cell: ({ row }) => (
          <span className="flex flex-col items-start gap-0.5">
            <VisitExit visit={row.original} />
            <VisitFlags flags={row.original.flags} />
          </span>
        ),
      },
      // JB295b: where the stay comes from - the worker's link or the app account's AT- records.
      {
        id: "source",
        accessorKey: "source",
        enableSorting: false,
        meta: { label: t295("visits.source") },
        header: () => t295("visits.source"),
        cell: ({ row }) => <VisitSource visit={row.original} />,
      },
      {
        id: "view",
        enableSorting: false,
        meta: { label: t("field.view") },
        header: () => t("field.view"),
        cell: ({ row }) =>
          row.original.worker ? <OpenWorkerButton onClick={() => onView(row.original.worker)} /> : null,
      },
    );
    return rows;
  }, [allProjects, df, onView, t, t295]);

  const workerName = list.filters.worker
    ? visits.data?.results.find((row) => row.worker === list.filters.worker)?.worker_name ?? "…"
    : "";
  const title = t("visitsTitle");

  return (
    <>
      <ListHeader
        title={title}
        subtitle={visits.isLoading ? common("loading") : t("visitCount", { count: total })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectPicker
              value={list.filters.project ?? ALL}
              onValueChange={(value) => list.setFilter("project", value === ALL ? undefined : value)}
              placeholder={t("filter.project")}
              allowAll
              allLabel={t("filter.allProjects")}
              className="hidden w-56 sm:flex"
            />
            <ExportButton
              disabled={total === 0}
              disabledReason={t("visitCount", { count: 0 })}
              title={title}
              onExport={(format) =>
                exportSiteWorkerVisits({
                  format,
                  title,
                  subtitle: t("visitCount", { count: total }),
                  query: list.query,
                  columns: [
                    { key: "worker_name", label: t("field.name") },
                    { key: "phone", label: t("field.phone") },
                    { key: "cidb_no", label: t("field.cidb") },
                    { key: "company_name", label: t("field.company") },
                    ...(allProjects ? [{ key: "project_name", label: t("field.project") }] : []),
                    { key: "entered_at", label: t("field.enteredAt") },
                    { key: "exited_at", label: t("field.exitedAt") },
                    {
                      key: "exit_state",
                      label: t("field.exitState"),
                      values: {
                        EXITED: t("visit.EXITED"),
                        ON_SITE: t("status.ON_SITE"),
                        SIGNAL_LOST: t("status.STALE"),
                      },
                    },
                    { key: "last_seen_at", label: t("field.lastPositionAt") },
                    {
                      key: "source",
                      label: t295("visits.source"),
                      values: { visit: t295("visits.sourceVisit"), app: t295("visits.sourceApp") },
                    },
                    { key: "refs", label: t295("visits.refs") },
                    { key: "flags", label: t295("visits.flags") },
                    { key: "linked_user_name", label: t295("visits.appAccount") },
                  ],
                })
              }
            />
          </div>
        }
      />
      <p className="text-xs text-muted-foreground">
        {t("visitsHint")} {t295("visits.hint")}
      </p>
      <DataTable
        columns={columns}
        rows={visits.data?.results ?? []}
        onRowClick={(row) => (row.worker ? onView(row.worker) : undefined)}
        totalCount={total}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={visits.isLoading}
        isError={visits.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey={LIST_FITS.siteWorkerVisits.storageKey}
        defaultHidden={LIST_FITS.siteWorkerVisits.hidden}
        toolbarActions={
          <div className="flex flex-wrap items-center gap-2">
            <CompanyFilter
              project={list.filters.project}
              value={list.filters.company}
              onChange={(value) => list.setFilter("company", value)}
            />
            <Input
              type="date"
              aria-label={t("filter.dateFrom")}
              title={t("filter.dateFrom")}
              className="w-40"
              value={list.filters.date_from ?? ""}
              onChange={(event) => list.setFilter("date_from", event.target.value || undefined)}
            />
            <Input
              type="date"
              aria-label={t("filter.dateTo")}
              title={t("filter.dateTo")}
              className="w-40"
              value={list.filters.date_to ?? ""}
              onChange={(event) => list.setFilter("date_to", event.target.value || undefined)}
            />
          </div>
        }
        filterPills={
          list.filters.worker
            ? [
                {
                  key: "person",
                  label: t("filter.onePerson", { name: workerName }),
                  active: true,
                  onSelect: () => list.setFilter("worker", undefined),
                },
              ]
            : []
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
    </>
  );
}

/** 「系统结束，离开时间要核对」 / 「缺离场」 on a stay (JB295b, as in 人工费用). */
export function VisitFlags({ flags }: { flags?: SiteWorkerVisit["flags"] }) {
  const t295 = useTranslations("jb295");
  if (!flags?.length) return null;
  return (
    <>
      {flags.includes("system_exit") ? (
        <span className="text-xs font-medium text-warning" data-slot="visit-system-exit">
          {t295("day.systemExit")}
        </span>
      ) : null}
      {flags.includes("missing_exit") ? (
        <span className="text-xs font-medium text-warning" data-slot="visit-missing-exit">
          {t295("visits.missingExit")}
        </span>
      ) : null}
    </>
  );
}

/** 「人员名单链接」, or 「App 打卡」 with its AT numbers. */
export function VisitSource({ visit }: { visit: SiteWorkerVisit }) {
  const t295 = useTranslations("jb295");
  if (visit.source === "app") {
    return (
      <span className="flex flex-col items-start gap-0.5" data-slot="visit-source-app">
        <span>{t295("visits.sourceApp")}</span>
        {visit.refs?.length ? <span className="tabular text-xs text-muted-foreground">{visit.refs.join(" · ")}</span> : null}
      </span>
    );
  }
  return <span data-slot="visit-source-visit">{t295("visits.sourceVisit")}</span>;
}
