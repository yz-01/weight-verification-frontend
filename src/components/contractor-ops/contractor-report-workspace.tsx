"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import { DailyReportBook } from "@/components/progress/daily-reports";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import {
  ReportSelector,
  useReportLevelName,
} from "@/components/reports/report-selector";
import { ExportButton } from "@/components/shared/export-button";
import {
  FieldWrapper,
  FilterField,
  ListHeader,
  QueryFailedNote,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { PhotoThumb, recordKindIcon, recordPhotos } from "@/components/shared/photo-thumb";
import { opensInPlace } from "@/components/shared/in-place-record";
import { useRecordOpener } from "@/components/shared/record-opener";
import { BusinessTargetManagement } from "@/components/contractor-ops/business-target-management";
import {
  ContractorReportFilterFields,
  ReportClearButton,
} from "@/components/reports/report-filter-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ContractorReportFilters,
  ContractorReportRecord,
  ContractorReportType,
} from "@/interfaces/contractor-report";
import { useListQuery } from "@/hooks/use-list-query";
import { useDateFormat } from "@/lib/dates";
import { isRouteAllowed } from "@/lib/navigation";
import {
  REPORT_REFERENCE_COLUMNS,
  reportRowReference,
  reportRowRoute,
  reportRowTarget,
  reportValueKey,
} from "@/lib/report-preview";
import {
  ALL_REPORT_FILTERS,
  PROJECT_BOUND_FILTERS,
  REPORT_FILTERS,
} from "@/lib/report-filters";
import {
  exportContractorReport,
  getContractorReport,
  getContractorReportOptions,
  getLatestReportDay,
} from "@/services/contractor-report.service";
import { NOT_LIVE } from "@/lib/live-refresh";

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayValue(value: string | number | boolean | null): string {
  if (value === null || value === "") return "-";
  return String(value);
}

/** The preview's photograph column, before the report's own columns. */

const REPORT_DATE_TIME_COLUMNS = new Set([
  "generated_at",
  "updated_at",
  "captured_at",
  "uploaded_at",
  "occurred_at",
  "completed_at",
  "confirmed_at",
  "submitted_at",
  "verified_at",
  "due_at",
  "reviewed_at",
  // J29: the day a return left, a delivery's own day.
  "returned_at",
  "business_at",
]);

const REPORT_DATE_ONLY_COLUMNS = new Set([
  "report_date",
  "claim_period",
  "end_date",
  "application_date",
  "planned_start",
  "planned_end",
  "period_start",
  "period_end",
  "rectification_due_at",
]);

/**
 * How a preview cell reads (I39: the preview fits the page width). A date
 * with its time may take two lines - date over time - rather than widen the
 * table; every other cell stops at two lines with the whole text on hover.
 */
function reportCellClass(key: string): string {
  if (key === "latitude" || key === "longitude") {
    return "whitespace-nowrap tabular-nums";
  }
  if (REPORT_DATE_TIME_COLUMNS.has(key) || REPORT_DATE_ONLY_COLUMNS.has(key)) {
    return "line-clamp-2 tabular-nums";
  }
  if (key === "device_id" || key === "file_name") {
    return "line-clamp-2 break-all";
  }
  // A reference number is read whole: it wraps, it is never cut off.
  if (REPORT_REFERENCE_COLUMNS.has(key)) {
    return "break-all font-medium tabular-nums";
  }
  return "line-clamp-2 break-words [overflow-wrap:anywhere]";
}

/**
 * The reports on business records whose PDF is a contents page followed by
 * each record's complete evidence pages (JB48) - the server's
 * ``EVIDENCE_REPORTS``.
 */
export const EVIDENCE_PDF_REPORTS: ReadonlySet<ContractorReportType> = new Set([
  "progress", "safety", "consultant", "equipment", "recycling", "field_tasks",
  "material_outgoing", "sundry_claims", "material_returns", "material_rejections",
]);

/** This page's address, for a background report's 「重新导出」 (JB48). */
function currentPage(): string {
  return typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;
}

export function ContractorReportWorkspace({
  reportType,
}: {
  reportType: ContractorReportType;
}) {
  const t = useTranslations("contractorReports");
  const tRoot = useTranslations();
  const common = useTranslations("common");
  const locale = useLocale();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const opener = useRecordOpener();
  const now = new Date();
  // 「往日报告」 offers the last seven days when the address names none (I8).
  const weekAgo = dateValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  // Project, dates and the report menu's levels live in the address (D6):
  // 【选择报表】 opens a report at a category by writing them there, and keeps
  // the reader's project and dates when they move to another report. So do
  // the filter bar's choices and keyword (2026-10-10): the preview and the
  // export both read them from there.
  const list = useListQuery([
    "project", "date_from", "date_to", "category", "subcategory", "keyword",
    ...ALL_REPORT_FILTERS,
  ]);
  const topBar = useCurrentProject();
  const dateFrom =
    list.filters.date_from ?? dateValue(new Date(now.getFullYear(), now.getMonth(), 1));
  const dateTo = list.filters.date_to ?? dateValue(now);
  const project = list.filters.project ?? "all";
  const category = list.filters.category ?? "";
  const subcategory = list.filters.subcategory ?? "";
  const setDateFrom = (value: string) => list.setFilter("date_from", value || undefined);
  const setDateTo = (value: string) => list.setFilter("date_to", value || undefined);
  // Another project's categories, machines and plans are not this one's: a
  // new project starts from the whole report.
  const setProject = (value: string) =>
    list.setFilters({
      project: value === "all" ? undefined : value,
      ...Object.fromEntries(PROJECT_BOUND_FILTERS.map((key) => [key, undefined])),
    });
  const level = useReportLevelName(
    reportType,
    list.filters.project,
    category || undefined,
    subcategory || undefined,
  );
  const options = useQuery({
    queryKey: ["contractor-reports", "options"],
    queryFn: getContractorReportOptions,
  });
  // 工程进度 → 「日报告」 opens on the latest day a report covers; 「往日报告」
  // asks for the days first (I8, ID24). Both arrive as a flag in the address.
  const dailyReport = reportType === "daily_report";
  const wantsLatest = dailyReport && searchParams.get("latest") === "1";
  const asksDays = dailyReport && searchParams.get("range") === "1";
  const latest = useQuery({
    queryKey: ["contractor-reports", "latest-day", project],
    queryFn: () =>
      getLatestReportDay({
        report_type: "daily_report",
        project: project === "all" ? undefined : project,
      }),
    enabled: wantsLatest,
    staleTime: 0,
    meta: NOT_LIVE,
  });
  const { setFilters } = list;
  useEffect(() => {
    if (!wantsLatest || !latest.isSuccess || !latest.isFetchedAfterMount) return;
    // No report yet: today, which says so.
    const day = latest.data.day ?? dateValue(new Date());
    setFilters({ latest: undefined, date_from: day, date_to: day });
  }, [latest.data, latest.isFetchedAfterMount, latest.isSuccess, setFilters, wantsLatest]);
  // A daily report opens in the book of the reports listed, by date (I9).
  const [book, setBook] = useState<number | null>(null);
  const filters = useMemo<ContractorReportFilters>(
    () => ({
      report_type: reportType,
      date_from: dateFrom,
      date_to: dateTo,
      project: project === "all" ? undefined : project,
      category: category || undefined,
      subcategory: subcategory || undefined,
      keyword: list.filters.keyword,
      // Only this report's own filters (`lib/report-filters`).
      ...Object.fromEntries(
        REPORT_FILTERS[reportType].map((key) => [key, list.filters[key]]),
      ),
    }),
    [category, dateFrom, dateTo, list.filters, project, reportType, subcategory],
  );
  const report = useQuery({
    queryKey: ["contractor-reports", "report", filters],
    queryFn: () => getContractorReport(filters),
    // An aggregation: refreshed by the person, not by the realtime layer (S1).
    meta: NOT_LIVE,
    // Not before the days 「日报告」 / 「往日报告」 are about to set.
    enabled:
      Boolean(dateFrom && dateTo && dateFrom <= dateTo) && !wantsLatest && !asksDays,
  });
  const bookIds = useMemo(
    () => (report.data?.records ?? []).map((entry) => entry.id ?? ""),
    [report.data],
  );
  const exportMutation = useMutation({
    mutationFn: (format: "PDF" | "EXCEL") =>
      exportContractorReport({
        ...filters,
        format,
        title: t(`type.${reportType}`),
        // The file says what it was narrowed to, as the screen does.
        subtitle: [t("period", { from: dateFrom, to: dateTo }), level.name]
          .filter(Boolean)
          .join(" · "),
        column_labels: Object.fromEntries(
          (report.data?.columns ?? []).map((key) => [key, t(`column.${key}`)]),
        ),
        // 日报告 and 项目进度摘要 print each document whole, in these words.
        lang: locale,
        // A report made in the background (JB48) comes back here for 「重新导出」.
        return_to: currentPage(),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["contractor-reports", "history"] }),
  });

  function formatReportValue(
    key: string,
    value: string | number | boolean | null,
    row: Record<string, string | number | boolean | null>,
  ): string {
    // A code is shown in the reader's words, as its own module names it.
    const message = reportValueKey(reportType, key, value, row);
    if (message && tRoot.has(message)) return tRoot(message);
    if (value === null || value === "") return "-";
    if (REPORT_DATE_TIME_COLUMNS.has(key)) {
      return df.precise(String(value)) || displayValue(value);
    }
    if (REPORT_DATE_ONLY_COLUMNS.has(key)) {
      return df.date(String(value)) || displayValue(value);
    }
    return displayValue(value);
  }

  /**
   * Where a row opens, or `null`: a row is a link only to a record the
   * reader's console would open (the same route rules as the sidebar).
   */
  function rowOpener(record: ContractorReportRecord | null) {
    const target = reportRowTarget(record);
    const route = reportRowRoute(target);
    if (!target || !route || !user) return null;
    if (!isRouteAllowed(user.portal, user.features, route, user.permissions, user.is_superuser)) {
      return null;
    }
    return (reference: string, projectName: string) => {
      // A record whose module popup stands on its own opens over the
      // report, which stays where it was (Lucas 2026-10-10); the rest open
      // on their module's screen.
      if ("href" in target && !opensInPlace(record?.kind)) {
        router.push(target.href);
        return;
      }
      opener.open(record?.kind ?? "", record?.id, {
        reference,
        project_id: record?.project_id ?? null,
        project_name: projectName,
        submitted_at: null,
        photo: record?.cover_photo_url ?? null,
      });
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <CompanyBanner scope="reports" />
      <ReportSelector
        summary={
          category
            ? [t(`type.${reportType}`), level.name ?? (level.failed ? "-" : "…")].join(" › ")
            : undefined
        }
      />
      {reportType === "target" && <BusinessTargetManagement />}
      <ListHeader
        title={
          reportType === "target"
            ? t("targetReport.title")
            : t(`type.${reportType}`)
        }
        subtitle={t(`description.${reportType}`)}
      />
      {/* One bar for every report (2026-10-10, 图11): the project, the
          period, the report's own filters and a keyword, wrapping on a phone;
          「清除筛选」 puts all of it back. */}
      <section
        data-slot="filter-bar"
        className="surface-panel flex flex-wrap items-end gap-3 rounded-xl px-4 py-3 sm:px-6 sm:py-4 max-sm:[&>*]:w-full"
      >
        {/* The top bar's 「当前项目」 is this filter when it is in force (B13). */}
        {!topBar.active && (
          <FilterField label={t("filter.project")} className="sm:w-64">
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filter.allProjects")}</SelectItem>
                {(options.data?.projects ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} - {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}
        <FilterField label={t("filter.dateFrom")} className="sm:w-40">
          <Input type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} />
        </FilterField>
        <FilterField label={t("filter.dateTo")} className="sm:w-40">
          <Input type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} />
        </FilterField>
        <ContractorReportFilterFields
          reportType={reportType}
          project={list.filters.project}
          values={{ ...list.filters, category: category || undefined }}
          onChange={list.setFilters}
        />
        <ReportClearButton active={list.hasFilters} onClear={list.clearFilters} />
        <div className="flex flex-wrap items-end gap-2 max-sm:[&>*]:flex-1">
          {/* 预览 · 打印 · 导出 · 发送 (PDF 统一操作规则). */}
          <ExportButton
            onExport={(format) => exportMutation.mutateAsync(format === "pdf" ? "PDF" : "EXCEL")}
            disabled={!report.data}
            disabledReason={common("noReportYet")}
            title={t(`type.${reportType}`)}
          />
        </div>
        {reportType === "target" && (
          <p className="w-full text-xs leading-5 text-muted-foreground">
            {t("targetReport.filterHelp")}
          </p>
        )}
        {EVIDENCE_PDF_REPORTS.has(reportType) && (
          <p className="w-full text-xs leading-5 text-muted-foreground" data-slot="evidence-pdf-help">
            {t("evidencePdfHelp")}
          </p>
        )}
        <QueryFailedNote query={options} what={t("what.projects")} className="w-full" />
        <QueryFailedNote query={latest} what={t("what.latestDay")} className="w-full" />
      </section>

      <section className="surface-panel overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-panel-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 className="panel-title">{t("preview")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("records", { count: report.data?.total ?? 0 })}
            </p>
          </div>
          {report.data?.truncated && (
            <StatusBadge label={t("previewLimited")} tone="warning" />
          )}
        </div>
        {report.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
          </div>
        ) : report.isError ? (
          <p className="p-8 text-center text-sm text-destructive">{t("loadError")}</p>
        ) : (report.data?.rows.length ?? 0) === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          // The table's own box scrolls (IB3), so its header stays on top;
          // the columns fit the page width (I39) - no sideways scroll at
          // 1366 px - each at least as wide as its one-line header.
          <Table fit containerClassName="max-h-[60dvh]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("photo")}</TableHead>
                  {report.data?.columns.map((key) => (
                    <TableHead key={key}>{t(`column.${key}`)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data?.rows.map((row, index) => {
                  const record = report.data.records?.[index] ?? null;
                  const reference = reportRowReference(row);
                  const open = rowOpener(record);
                  const openRow =
                    dailyReport && record?.id
                      ? () => setBook(index)
                      : open
                        ? () => open(reference, String(row.project ?? ""))
                        : undefined;
                  return (
                    // 每一项都可以点进去操作: the row opens its record, where
                    // its module lets the reader act on it.
                    <TableRow
                      key={record?.id ?? index}
                      data-report-row={openRow ? "link" : "plain"}
                      role={openRow ? "link" : undefined}
                      tabIndex={openRow ? 0 : undefined}
                      aria-label={openRow ? t("openRecord", { reference }) : undefined}
                      className={
                        openRow
                          ? "cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                          : undefined
                      }
                      onClick={openRow}
                      onKeyDown={
                        openRow
                          ? (event) => {
                              if (event.target !== event.currentTarget) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openRow();
                              }
                            }
                          : undefined
                      }
                    >
                      <TableCell className="align-top">
                        {/* The record's first photograph as its small stamped
                            copy; tapping it opens the photographs, not the row. */}
                        <PhotoThumb
                          coverUrl={record?.cover_photo_url}
                          count={record?.photo_count}
                          icon={recordKindIcon(record?.kind)}
                          reference={reference}
                          photos={
                            (record?.kind && record.id
                              ? recordPhotos(record.kind, record.id, reference)
                              : undefined) ?? []
                          }
                        />
                      </TableCell>
                      {report.data.columns.map((key) => {
                        const text = formatReportValue(key, row[key] ?? null, row);
                        return (
                          <TableCell
                            key={key}
                            className="overflow-hidden align-top leading-5"
                          >
                            <span className={`block ${reportCellClass(key)}`} title={text}>
                              {text}
                            </span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
          </Table>
        )}
      </section>
      {opener.sheet}
      {book !== null && (
        <DailyReportBook
          source={{ kind: "ids", ids: bookIds }}
          start={book}
          onClose={() => setBook(null)}
          onChanged={() =>
            queryClient.invalidateQueries({ queryKey: ["contractor-reports", "report"] })
          }
        />
      )}
      {asksDays && (
        <ReportDaysPrompt
          from={list.filters.date_from ?? weekAgo}
          to={dateTo}
          onDone={(from, to) => setFilters({ range: undefined, date_from: from, date_to: to })}
          onCancel={() => setFilters({ range: undefined })}
        />
      )}
    </div>
  );
}

/**
 * 「往日报告」 (I8, ID24): the same report as 「日报告」, opened by first asking
 * which days to read. The reader's current days are offered.
 */
function ReportDaysPrompt({
  from,
  to,
  onDone,
  onCancel,
}: {
  from: string;
  to: string;
  onDone: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("contractorReports");
  const common = useTranslations("common");
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const backwards = Boolean(start && end && start > end);
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("days.title")}</DialogTitle>
          <DialogDescription>{t("days.help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("filter.dateFrom")}>
            <Input
              type="date"
              value={start}
              max={end || undefined}
              onChange={(event) => setStart(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("filter.dateTo")}>
            <Input
              type="date"
              value={end}
              min={start || undefined}
              onChange={(event) => setEnd(event.target.value)}
            />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {common("cancel")}
          </Button>
          <Button
            disabled={!start || !end || backwards}
            disabledReason={backwards ? t("days.backwards") : t("days.choose")}
            onClick={() => onDone(start, end)}
          >
            {t("days.show")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 报表导出历史, its search and its operation log (JB27): its own file. */
export { ContractorReportHistoryWorkspace } from "@/components/contractor-ops/contractor-report-history";
