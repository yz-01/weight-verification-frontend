"use client";

/**
 * 报表导出历史 - the contractor's archive of generated reports (2026-10-10),
 * with its search and its operation log (JB27, 客户 10-26 事项 3).
 *
 * The client: 「历史报表无法点击打开查看 · 打印、下载、发送等操作无法正常使用 ·
 * 没有搜索及筛选功能」「增加四项搜索筛选：日期（单日）、操作员名称、操作类型、
 * 报表 / 资料名称 · 支持组合筛选」「可以查看每份报表的打印、下载及发送操作记录」
 * 「能否直接完善以上功能，并集中查询整个系统打印、下载、发送的操作日志？」
 * 「优先利用现有页面及系统功能，不要重复开发」.
 *
 * So this one page has two tabs: 「报表」, the history as before - searched
 * and paged on the server, no longer only the newest 100 - and 「操作记录」,
 * every print, download and send in the back office, with the same four
 * filters and the project. Each report opens its own records.
 *
 * Rows from before files were kept (before 2026-10-10) have nothing stored
 * to open. 「按当时条件重新生成」 generates them again from the conditions the
 * row saved - with the data as it is now, which the file says - into a new
 * row the usual 查看 · 打印 · 导出 · 发送 work on. The old row stays.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import {
  ArchivedReportActions,
  ArchivedReportName,
  ArchivedReportNote,
  previewArchived,
  useReportArchive,
  type ReportArchive,
} from "@/components/reports/report-archive";
import { ReportJobs } from "@/components/reports/report-jobs";
import { ReportSelector } from "@/components/reports/report-selector";
import { clickOpensRow } from "@/components/shared/inside-row-control";
import { FilterBar, FilterField, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, type ListQuery } from "@/interfaces/api";
import type {
  ContractorReportExportRecord,
  ContractorReportFilters,
  ContractorReportType,
} from "@/interfaces/contractor-report";
import {
  FILE_ACTION_TYPES,
  type FileActionRecord,
  type FileActionType,
  type FileShare,
} from "@/interfaces/file-action";
import { useDateFormat } from "@/lib/dates";
import { messageCodes, reportColumnValues } from "@/lib/report-preview";
import { useUnitExportValues } from "@/hooks/use-material-units";
import { isSignOffCancelled } from "@/lib/sign-off";
import { captureDownload } from "@/services/api-client";
import {
  exportContractorReport,
  getContractorReport,
  getContractorReportHistory,
} from "@/services/contractor-report.service";
import { getFileActionRecords } from "@/services/file-action.service";

const PAGE_SIZE = 20;

/** The reports a name typed in 「报表 / 资料名称」 can match (by their words). */
const REPORT_TYPES: ReadonlyArray<ContractorReportType | "material_report"> = [
  "progress", "safety", "consultant", "attendance", "equipment", "recycling", "schedule", "target",
  "photos", "documents", "daily_report", "progress_summary", "field_tasks", "material_outgoing",
  "claims", "sundry_claims", "material_returns", "material_rejections",
  // 材料报表's PDF of more than 20 deliveries, made in the background (JB48).
  "material_report",
];

/** The filter keys a history row may have saved, sent back as they were. */
const SAVED_KEYS = [
  "category", "subcategory", "keyword", "actor", "status", "event", "geofence", "equipment",
  "supplier", "direction", "record_type", "counterparty", "subcontractor", "plan", "target_type",
] as const;

interface Filters {
  date: string;
  operator: string;
  action: "" | FileActionType;
  name: string;
  project: string;
  /** JB65: 「可以按接收方搜索」 - the operation log only. */
  recipient: string;
}

const NO_FILTERS: Filters = { date: "", operator: "", action: "", name: "", project: "all", recipient: "" };

export function ContractorReportHistoryWorkspace() {
  const t = useTranslations("contractorReports");
  const h = useTranslations("contractorReports.history");
  const search = useSearchParams();
  const [tab, setTab] = useState(search.get("tab") === "log" ? "log" : "reports");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const set = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
    setLogPage(1);
  };
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="flex flex-col gap-4">
      <CompanyBanner scope="reports" />
      <ReportSelector />
      <ListHeader title={h("title")} subtitle={h("subtitle")} />
      {/* 「准备中」 and the ones not made (JB48): above the finished files. */}
      <ReportJobs />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="reports" data-slot="history-tab-reports">{h("tabReports")}</TabsTrigger>
          <TabsTrigger value="log" data-slot="history-tab-log">{h("tabLog")}</TabsTrigger>
        </TabsList>
        <FilterBar className="mt-3">
          <FilterField label={h("filter.date")}>
            <Input
              type="date"
              className="sm:w-44"
              value={filters.date}
              onChange={(event) => set({ date: event.target.value })}
              data-slot="history-filter-date"
            />
          </FilterField>
          <FilterField label={h("filter.operator")}>
            <Input
              className="sm:w-48"
              value={filters.operator}
              placeholder={h("filter.operatorHint")}
              onChange={(event) => set({ operator: event.target.value })}
              data-slot="history-filter-operator"
            />
          </FilterField>
          <FilterField label={h("filter.action")}>
            <select
              aria-label={h("filter.action")}
              className="native-control sm:w-44"
              value={filters.action}
              onChange={(event) => set({ action: event.target.value as Filters["action"] })}
              data-slot="history-filter-action"
            >
              <option value="">{h("filter.anyAction")}</option>
              {FILE_ACTION_TYPES.map((value) => (
                <option key={value} value={value}>{h(`action.${value}`)}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label={h("filter.name")} className="sm:min-w-56 sm:flex-1">
            <Input
              value={filters.name}
              placeholder={h("filter.nameHint")}
              onChange={(event) => set({ name: event.target.value })}
              data-slot="history-filter-name"
            />
          </FilterField>
          {tab === "log" ? (
            <FilterField label={h("filter.recipient")}>
              <Input
                className="sm:w-56"
                value={filters.recipient}
                placeholder={h("filter.recipientHint")}
                onChange={(event) => set({ recipient: event.target.value })}
                data-slot="history-filter-recipient"
              />
            </FilterField>
          ) : null}
          {tab === "log" ? (
            <FilterField label={t("history.project")}>
              <ProjectPicker
                value={filters.project}
                onValueChange={(value) => set({ project: value })}
                placeholder={t("filter.allProjects")}
                allowAll
                allLabel={t("filter.allProjects")}
                className="sm:w-56"
              />
            </FilterField>
          ) : null}
          {filtering ? (
            <Button variant="ghost" onClick={() => set(NO_FILTERS)}>{h("filter.clear")}</Button>
          ) : null}
        </FilterBar>
        <p className="mt-2 text-xs text-muted-foreground">
          {tab === "log" ? h("logHint") : h("actionFilterHint")}
        </p>
        <TabsContent value="reports" className="mt-3">
          <ReportRows filters={filters} page={page} onPage={setPage} />
        </TabsContent>
        <TabsContent value="log" className="mt-3">
          <ActionLog filters={filters} page={logPage} onPage={setLogPage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The report types whose name, in the reader's words, holds what was typed. */
function useMatchingTypes(name: string): string[] {
  const t = useTranslations("contractorReports");
  const dashboard = useTranslations("contractorDashboard");
  const wanted = name.trim().toLowerCase();
  if (!wanted) return [];
  const matches: string[] = REPORT_TYPES.filter((type) => t(`type.${type}`).toLowerCase().includes(wanted));
  if (dashboard("export.title").toLowerCase().includes(wanted)) matches.push("dashboard");
  return matches;
}

/* --------------------------------------------------------------- reports */

function ReportRows({ filters, page, onPage }: { filters: Filters; page: number; onPage: (page: number) => void }) {
  const t = useTranslations("contractorReports");
  const h = useTranslations("contractorReports.history");
  const dashboard = useTranslations("contractorDashboard");
  const archiveT = useTranslations("reportArchive");
  const df = useDateFormat();
  const archive = useReportArchive();
  const [showing, setShowing] = useState<ContractorReportExportRecord | null>(null);
  const operator = useDeferredValue(filters.operator.trim());
  const name = useDeferredValue(filters.name.trim());
  const types = useMatchingTypes(name);
  const query: ListQuery = {
    page,
    page_size: PAGE_SIZE,
    date: filters.date || undefined,
    operator: operator || undefined,
    action: filters.action || undefined,
    name: name || undefined,
    report_types: types.length ? types.join(",") : undefined,
  };
  const history = useQuery({
    queryKey: ["contractor-reports", "history", query],
    queryFn: () => getContractorReportHistory(query),
  });
  // The 现场看板 export shares this history; it is not one of the report types.
  const reportName = (row: ContractorReportExportRecord) =>
    row.report_type === "dashboard" ? dashboard("export.title") : t(`type.${row.report_type}`);
  const previewTitle = (row: ContractorReportExportRecord) =>
    `${reportName(row)} · ${row.date_from} - ${row.date_to}`;
  const rows = history.data?.results ?? [];

  return (
    <section className="surface-panel overflow-hidden rounded-xl">
      {history.isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
        </div>
      ) : history.isError ? (
        <p className="p-8 text-center text-sm text-destructive">{t("loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {page === 1 && !filters.date && !operator && !filters.action && !name ? h("empty") : h("noMatch")}
        </p>
      ) : (
        <>
          {/* Fits the page (I39): the file name wraps, the dates stack. */}
          <Table fit>
            <TableHeader><TableRow>
              <TableHead>{h("file")}</TableHead>
              <TableHead>{h("report")}</TableHead>
              <TableHead>{h("project")}</TableHead>
              <TableHead>{h("period")}</TableHead>
              <TableHead className="text-right tabular">{h("rows")}</TableHead>
              <TableHead>{h("generatedBy")}</TableHead>
              <TableHead>{h("generatedAt")}</TableHead>
              <TableHead pin="end">{archiveT("column")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="align-top cursor-pointer"
                  onClick={(event) => {
                    if (clickOpensRow(event)) previewArchived(archive, row, previewTitle(row));
                  }}
                >
                  <TableCell className="overflow-hidden whitespace-normal">
                    <ArchivedReportName row={row} archive={archive} title={previewTitle(row)} />
                    <ArchivedReportNote row={row} className="pl-6" />
                    {row.regenerated_from_at ? (
                      <p className="mt-1 pl-6 text-xs text-muted-foreground" data-slot="history-regenerated">
                        {h("regeneratedNote", { when: df.dateTime(row.regenerated_from_at) })}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>{reportName(row)}</TableCell>
                  <TableCell>{row.project_name || t("filter.allProjects")}</TableCell>
                  <TableCell className="whitespace-nowrap tabular">{row.date_from} - {row.date_to}</TableCell>
                  <TableCell className="text-right tabular">{row.metric_count}</TableCell>
                  <TableCell>{row.generated_by_name || row.generated_by_email}</TableCell>
                  <TableCell className="whitespace-nowrap tabular">{df.dateTime(row.created_at)}</TableCell>
                  <TableCell pin="end">
                    <div className="flex flex-col items-start gap-1">
                      {row.has_file ? (
                        <ArchivedReportActions row={row} archive={archive} title={previewTitle(row)} />
                      ) : row.regenerated_as ? (
                        // Generated again once already: the new row is the
                        // one to open, not a second copy (JB27 review #5).
                        <p className="max-w-56 text-xs text-muted-foreground" data-slot="history-already-regenerated">
                          {h("alreadyRegenerated")}
                        </p>
                      ) : (
                        <RegenerateButton row={row} reportName={reportName(row)} />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowing(row)}
                        data-slot="history-row-actions"
                      >
                        <History />
                        {h("rowActions", { count: row.file_action_count ?? 0 })}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <Pager page={page} count={history.data?.count} totalPages={history.data?.total_pages ?? 0} onPage={onPage} />
      {showing ? (
        <ReportActionsDialog row={showing} title={previewTitle(showing)} onClose={() => setShowing(null)} />
      ) : null}
      {archive.element}
    </section>
  );
}

/** The conditions a history row saved, as the report centre's filters. */
export function savedConditions(row: ContractorReportExportRecord): ContractorReportFilters {
  const saved = (row.filters ?? {}) as Record<string, unknown>;
  const conditions: Record<string, string> = {};
  for (const key of SAVED_KEYS) {
    const value = saved[key];
    if (typeof value === "string" && value) conditions[key] = value;
  }
  const project = row.project ?? (typeof saved.project === "string" ? saved.project : "");
  return {
    ...conditions,
    report_type: row.report_type as ContractorReportType,
    date_from: row.date_from,
    date_to: row.date_to,
    project: project || undefined,
  };
}

/**
 * 「按当时条件重新生成」: the row's saved report, project, period and
 * filters, generated again with today's data into a new history row (JB27).
 * Nothing is saved to the computer and nothing leaves: no PIN here - the new
 * row's 打印 · 导出 · 发送 ask, as every other row's do.
 */
function RegenerateButton({ row, reportName }: { row: ContractorReportExportRecord; reportName: string }) {
  const t = useTranslations("contractorReports");
  const h = useTranslations("contractorReports.history");
  const archiveT = useTranslations("reportArchive");
  const tRoot = useTranslations();
  const units = useUnitExportValues();
  const locale = useLocale();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // The 现场看板 is exported from its own screen, with its own words: its
  // old rows cannot be generated here.
  if (row.report_type === "dashboard") {
    return (
      <p className="max-w-56 text-xs text-muted-foreground" data-slot="history-cannot-regenerate">
        {archiveT("missing")} {h("cannotRegenerate")}
      </p>
    );
  }
  const regenerate = async () => {
    setBusy(true);
    try {
      const conditions = savedConditions(row);
      // The columns the report has now, worded as the screen words them.
      const columns = await getContractorReport(conditions)
        .then((report) => report.columns ?? [])
        .catch(() => [] as string[]);
      await captureDownload(() =>
        exportContractorReport({
          ...conditions,
          format: row.export_format,
          title: reportName,
          subtitle: [
            t("period", { from: row.date_from, to: row.date_to }),
            h("regeneratedOnFile", { when: df.dateTime(row.created_at) }),
          ].join(" · "),
          column_labels: Object.fromEntries(columns.map((key) => [key, t(`column.${key}`)])),
          column_values: reportColumnValues(
            row.report_type as ContractorReportType,
            columns,
            (key) => (tRoot.has(key) ? tRoot(key) : null),
            (namespace) => messageCodes(tRoot, namespace),
            units,
          ),
          lang: locale,
          regenerated_from: row.id,
        }),
      );
      toast.success(h("regenerated"));
      await queryClient.invalidateQueries({ queryKey: ["contractor-reports", "history"] });
    } catch (error) {
      // The server's refusal is already toasted in the reader's words.
      if (!isSignOffCancelled(error) && !(error instanceof ApiError)) {
        toast.error(h("regenerateFailed"));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        disabledReason={h("regenerating")}
        title={h("regenerateHint")}
        onClick={() => void regenerate()}
        data-slot="history-regenerate"
      >
        {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        {h("regenerate")}
      </Button>
      <p className="max-w-56 text-xs leading-snug text-muted-foreground">{h("regenerateHint")}</p>
    </div>
  );
}

/** One report's own prints, downloads and sends (事项 3 第 4 点). */
function ReportActionsDialog({
  row,
  title,
  onClose,
}: {
  row: ContractorReportExportRecord;
  title: string;
  onClose: () => void;
}) {
  const h = useTranslations("contractorReports.history");
  const [page, setPage] = useState(1);
  // query-failure: `ActionTable` says the read failed (records.isError), never "no records"
  const records = useQuery({
    queryKey: ["file-actions", "report", row.id, page],
    queryFn: () => getFileActionRecords({ report_export: row.id, page, page_size: PAGE_SIZE }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl" data-slot="history-row-actions-dialog">
        <DialogHeader>
          <DialogTitle>{h("rowActionsTitle")}</DialogTitle>
          <DialogDescription className="break-all">{title} · {row.file_name}</DialogDescription>
        </DialogHeader>
        <ActionTable records={records} compact />
        <Pager page={page} count={records.data?.count} totalPages={records.data?.total_pages ?? 0} onPage={setPage} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ action log */

function ActionLog({ filters, page, onPage }: { filters: Filters; page: number; onPage: (page: number) => void }) {
  const operator = useDeferredValue(filters.operator.trim());
  const name = useDeferredValue(filters.name.trim());
  const recipient = useDeferredValue(filters.recipient.trim());
  const query: ListQuery = {
    page,
    page_size: PAGE_SIZE,
    date: filters.date || undefined,
    operator: operator || undefined,
    action: filters.action || undefined,
    name: name || undefined,
    project: filters.project === "all" ? undefined : filters.project,
    recipient: recipient || undefined,
  };
  // query-failure: `ActionTable` says the read failed (records.isError), never "no records"
  const records = useQuery({
    queryKey: ["file-actions", "log", query],
    queryFn: () => getFileActionRecords(query),
  });
  return (
    <section className="surface-panel overflow-hidden rounded-xl" data-slot="history-action-log">
      <ActionTable records={records} />
      <Pager page={page} count={records.data?.count} totalPages={records.data?.total_pages ?? 0} onPage={onPage} />
    </section>
  );
}

/**
 * The log's rows: 操作人员姓名及账号、日期及时间（24 小时制）、操作类型、所属
 * 项目、对应业务事项、报表或文件名称 - and where it opens.
 */
function ActionTable({
  records,
  compact = false,
}: {
  records: { isLoading: boolean; isError: boolean; data?: { results: FileActionRecord[] } };
  compact?: boolean;
}) {
  const h = useTranslations("contractorReports.history");
  const t = useTranslations("contractorReports");
  const archive = useReportArchive();
  const rows = records.data?.results ?? [];
  if (records.isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
    );
  }
  if (records.isError) return <p className="p-8 text-center text-sm text-destructive">{t("loadError")}</p>;
  if (!rows.length) return <p className="p-10 text-center text-sm text-muted-foreground">{h("logEmpty")}</p>;
  return (
    <>
      <Table fit>
        <TableHeader><TableRow>
          <TableHead>{h("log.at")}</TableHead>
          <TableHead>{h("log.operator")}</TableHead>
          <TableHead>{h("log.action")}</TableHead>
          {compact ? null : <TableHead>{h("project")}</TableHead>}
          <TableHead>{h("log.subject")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="align-top" data-slot="history-action-row">
              <TableCell className="whitespace-nowrap tabular">{dateTime24(row.created_at)}</TableCell>
              <TableCell className="whitespace-normal">
                <p>{row.actor_name || "-"}</p>
                <p className="break-all text-xs text-muted-foreground">{row.actor_account}</p>
              </TableCell>
              <TableCell className="whitespace-normal">
                <p>{h(`action.${row.action}`)}</p>
                {row.share ? (
                  <SentToCell share={row.share} />
                ) : row.channel ? (
                  <p className="text-xs text-muted-foreground">{h(`channel.${row.channel}`)}</p>
                ) : null}
              </TableCell>
              {compact ? null : <TableCell>{row.project_name || "-"}</TableCell>}
              <TableCell className="whitespace-normal">
                <ActionSubject row={row} archive={archive} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {archive.element}
    </>
  );
}

/**
 * A send's recipient, under 「发送 / 分享」 (JB65, 客户 10-29 事项 3 第 2 点):
 * 接收方姓名、公司、电话或 Email、发送方式, and 已打开分享窗口 / 已确认发送.
 * Print, download and export rows carry none and stay as they were.
 */
export function SentToCell({ share }: { share: FileShare }) {
  const s = useTranslations("fileActions.send");
  return (
    <div className="mt-1 space-y-0.5 text-xs" data-slot="history-send-details">
      <p className="font-medium text-foreground">
        {share.recipient_name || "-"}
        {share.recipient_company ? ` · ${share.recipient_company}` : ""}
      </p>
      <p className="break-all text-muted-foreground">
        {s(share.method)}
        {share.recipient_contact ? ` · ${share.recipient_contact}` : ""}
      </p>
      <StatusBadge
        label={s(`status.${share.status}`)}
        tone={share.status === "CONFIRMED" ? "positive" : "warning"}
      />
    </div>
  );
}

/** The business item and file, with a way back to the report or record. */
function ActionSubject({ row, archive }: { row: FileActionRecord; archive: ReportArchive }) {
  const h = useTranslations("contractorReports.history");
  const name = row.file_name || row.report_file_name || "";
  return (
    <div className="min-w-0 space-y-0.5">
      {row.subject ? <p className="break-all">{row.subject}</p> : null}
      {name && name !== row.subject ? <p className="break-all text-xs text-muted-foreground">{name}</p> : null}
      <div className="flex flex-wrap gap-2 text-xs">
        {row.report_export && row.report_has_file ? (
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() =>
              archive.open(
                {
                  id: row.report_export!,
                  file_name: row.report_file_name ?? name,
                  export_format: /\.pdf$/i.test(row.report_file_name ?? name) ? "PDF" : "EXCEL",
                  has_file: true,
                  file_size: 0,
                  file_sha256: "",
                },
                "preview",
                row.subject || name,
              )
            }
            data-slot="history-action-open-report"
          >
            {h("log.openReport")}
          </button>
        ) : null}
        {row.link ? (
          <a className="text-primary underline-offset-2 hover:underline" href={row.link} data-slot="history-action-link">
            {h("log.openRecord")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** 「操作日期及时间（24小时制）」: always 24-hour, whatever the reader's setting. */
export function dateTime24(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}:${two(when.getSeconds())}`;
}

function Pager({
  page,
  count,
  totalPages,
  onPage,
}: {
  page: number;
  count?: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const h = useTranslations("contractorReports.history");
  const table = useTranslations("table");
  const common = useTranslations("common");
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm" data-slot="history-pager">
      <span className="text-muted-foreground">{h("count", { count, page, pages: Math.max(totalPages, 1) })}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} disabledReason={common("alreadyFirstPage")} onClick={() => onPage(page - 1)}>
          {table("previous")}
        </Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} disabledReason={common("alreadyLastPage")} onClick={() => onPage(page + 1)}>
          {table("next")}
        </Button>
      </div>
    </div>
  );
}
