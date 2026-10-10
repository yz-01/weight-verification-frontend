"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileClock, FileSpreadsheet, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import {
  ReportSelector,
  useReportLevelName,
} from "@/components/reports/report-selector";
import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { PhotoThumb, recordKindIcon, recordPhotos } from "@/components/shared/photo-thumb";
import { opensInPlace } from "@/components/shared/in-place-record";
import { useRecordOpener } from "@/components/shared/record-opener";
import { BusinessTargetManagement } from "@/components/contractor-ops/business-target-management";
import { Button } from "@/components/ui/button";
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
import { groupPhotoSources, photoSourceValue } from "@/lib/report-menu";
import {
  exportContractorReport,
  getContractorReport,
  getContractorReportHistory,
  getContractorReportOptions,
} from "@/services/contractor-report.service";
import { NOT_LIVE } from "@/lib/live-refresh";
import { photoMeta } from "@/lib/photo-meta";

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
const PHOTO_COLUMN_WIDTH = 80;

const REPORT_DATE_TIME_COLUMNS = new Set([
  "captured_at",
  "uploaded_at",
  "occurred_at",
  "completed_at",
  "confirmed_at",
  "submitted_at",
  "verified_at",
]);

const REPORT_DATE_ONLY_COLUMNS = new Set([
  "application_date",
  "planned_start",
  "planned_end",
  "period_start",
  "period_end",
  "rectification_due_at",
]);

const REPORT_LONG_COLUMNS = new Set([
  "description",
  "file_name",
  "review_note",
  "source",
  "target_name",
  "task",
  "title",
]);

function reportColumnWidth(key: string): number {
  if (key === "latitude" || key === "longitude") {
    return 136;
  }
  if (REPORT_DATE_TIME_COLUMNS.has(key)) {
    return 216;
  }
  if (REPORT_DATE_ONLY_COLUMNS.has(key)) {
    return 152;
  }
  if (key === "device_id") {
    return 216;
  }
  if (key === "file_name") {
    return 304;
  }
  if (REPORT_REFERENCE_COLUMNS.has(key)) {
    return 224;
  }
  if (REPORT_LONG_COLUMNS.has(key)) {
    return 264;
  }
  return 176;
}

function reportCellClass(key: string): string {
  if (key === "latitude" || key === "longitude") {
    return "whitespace-nowrap tabular-nums";
  }
  if (REPORT_DATE_TIME_COLUMNS.has(key) || REPORT_DATE_ONLY_COLUMNS.has(key)) {
    return "whitespace-nowrap tabular-nums";
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

export function ContractorReportWorkspace({
  reportType,
}: {
  reportType: ContractorReportType;
}) {
  const t = useTranslations("contractorReports");
  const tRoot = useTranslations();
  const common = useTranslations("common");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const opener = useRecordOpener();
  const now = new Date();
  // Project, dates and the report menu's levels live in the address (D6):
  // 【选择报表】 opens a report at a category by writing them there, and keeps
  // the reader's project and dates when they move to another report.
  const list = useListQuery(["project", "date_from", "date_to", "category", "subcategory"]);
  const topBar = useCurrentProject();
  const dateFrom =
    list.filters.date_from ?? dateValue(new Date(now.getFullYear(), now.getMonth(), 1));
  const dateTo = list.filters.date_to ?? dateValue(now);
  const project = list.filters.project ?? "all";
  // A photo source is read as its whole module, as the menu names it (B3 #6).
  const category =
    reportType === "photos" && list.filters.category
      ? photoSourceValue(list.filters.category)
      : (list.filters.category ?? "");
  const subcategory = list.filters.subcategory ?? "";
  const setDateFrom = (value: string) => list.setFilter("date_from", value || undefined);
  const setDateTo = (value: string) => list.setFilter("date_to", value || undefined);
  // Another project's categories are not this one's: a new project starts
  // from the whole report.
  const setProject = (value: string) =>
    list.setFilters({
      project: value === "all" ? undefined : value,
      category: undefined,
      subcategory: undefined,
    });
  const level = useReportLevelName(
    reportType,
    list.filters.project,
    category || undefined,
    subcategory || undefined,
  );
  const [actor, setActor] = useState("all");
  const [keyword, setKeyword] = useState("");
  const options = useQuery({
    queryKey: ["contractor-reports", "options"],
    queryFn: getContractorReportOptions,
  });
  const filters = useMemo<ContractorReportFilters>(
    () => ({
      report_type: reportType,
      date_from: dateFrom,
      date_to: dateTo,
      project: project === "all" ? undefined : project,
      category: category || undefined,
      subcategory: subcategory || undefined,
      actor: reportType === "photos" && actor !== "all" ? actor : undefined,
      keyword:
        reportType === "photos" && keyword.trim() ? keyword.trim() : undefined,
    }),
    [actor, category, dateFrom, dateTo, keyword, project, reportType, subcategory],
  );
  const report = useQuery({
    queryKey: ["contractor-reports", "report", filters],
    queryFn: () => getContractorReport(filters),
    // An aggregation: refreshed by the person, not by the realtime layer (S1).
    meta: NOT_LIVE,
    enabled: Boolean(dateFrom && dateTo && dateFrom <= dateTo),
  });
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
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["contractor-reports", "history"] }),
  });
  // The same module names as the menu's 照片来源 level.
  const photoSources = useMemo(
    () =>
      groupPhotoSources(
        (options.data?.photo_categories ?? []).map((row) => ({
          value: row.value,
          label: row.label,
          project_code: "",
          has_children: false,
        })),
        (key) => tRoot(key),
      ),
    [options.data?.photo_categories, tRoot],
  );
  const previewWidth = (report.data?.columns ?? []).reduce(
    (total, key) => total + reportColumnWidth(key),
    PHOTO_COLUMN_WIDTH,
  );

  function formatReportValue(
    key: string,
    value: string | number | boolean | null,
    row: Record<string, string | number | boolean | null>,
    record: ContractorReportRecord | null,
  ): string {
    // A code is shown in the reader's words, as its own module names it.
    const message = reportValueKey(reportType, key, value, row, record);
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
      <section className="surface-panel grid gap-3 rounded-xl p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-[minmax(14rem,1fr)_11rem_11rem_auto]">
        {/* The top bar's 「当前项目」 is this filter when it is in force (B13). */}
        {!topBar.active && (
        <label className="space-y-1.5 text-sm font-medium">
          {t("filter.project")}
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filter.allProjects")}</SelectItem>
              {(options.data?.projects ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} - {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        )}
        <label className="space-y-1.5 text-sm font-medium">
          {t("filter.dateFrom")}
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          {t("filter.dateTo")}
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-end gap-2 max-sm:[&>*]:flex-1">
          <Button
            variant="outline"
            disabledReason={!report.data ? common("noReportYet") : undefined}
            disabled={exportMutation.isPending || !report.data}
            onClick={() => exportMutation.mutate("EXCEL")}
          >
            <FileSpreadsheet />{t("action.excel")}
          </Button>
          <Button
            variant="outline"
            disabledReason={!report.data ? common("noReportYet") : undefined}
            disabled={exportMutation.isPending || !report.data}
            onClick={() => exportMutation.mutate("PDF")}
          >
            <FileText />{t("action.pdf")}
          </Button>
        </div>
        {reportType === "photos" ? (
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-3">
            <label className="space-y-1.5 text-sm font-medium">
              {t("filter.category")}
              <Select
                value={category || "all"}
                onValueChange={(value) =>
                  list.setFilter("category", value === "all" ? undefined : value)
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filter.allCategories")}</SelectItem>
                  {photoSources.map((row) => (
                    <SelectItem key={row.value} value={row.value}>{row.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              {t("filter.uploader")}
              <Select value={actor} onValueChange={setActor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filter.allUploaders")}</SelectItem>
                  {(options.data?.photo_uploaders ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              {t("filter.keyword")}
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </label>
          </div>
        ) : reportType === "target" ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-xs leading-5 text-muted-foreground">
              {t("targetReport.filterHelp")}
            </p>
          </div>
        ) : null}
        <QueryFailedNote query={options} what={t("what.filterOptions")} className="sm:col-span-2 lg:col-span-4" />
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
          <div className="max-h-[60dvh] overflow-auto">
            <Table
              className="table-fixed"
              style={{ width: previewWidth, minWidth: "100%" }}
            >
              <colgroup>
                <col style={{ width: PHOTO_COLUMN_WIDTH }} />
                {report.data?.columns.map((key) => (
                  <col key={key} style={{ width: reportColumnWidth(key) }} />
                ))}
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="whitespace-normal">{t("photo")}</TableHead>
                  {report.data?.columns.map((key) => (
                    <TableHead
                      key={key}
                      className="whitespace-normal [overflow-wrap:anywhere]"
                    >
                      {t(`column.${key}`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data?.rows.map((row, index) => {
                  const record = report.data.records?.[index] ?? null;
                  const reference = reportRowReference(row);
                  const open = rowOpener(record);
                  const openRow = open
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
                            reportType === "photos" && record?.cover_photo_url
                              ? // A row of the photo report is one photograph,
                                // its time and GPS in its own columns.
                                [
                                  {
                                    id: record.id ?? `${index}`,
                                    url: record.cover_photo_url,
                                    label: reference,
                                    ...photoMeta({
                                      captured_at: row.captured_at == null ? null : String(row.captured_at),
                                      latitude: row.latitude == null ? null : String(row.latitude),
                                      longitude: row.longitude == null ? null : String(row.longitude),
                                    }),
                                  },
                                ]
                              : (reportType !== "photos" && record?.kind && record.id
                                  ? recordPhotos(record.kind, record.id, reference)
                                  : undefined) ?? []
                          }
                        />
                      </TableCell>
                      {report.data.columns.map((key) => {
                        const text = formatReportValue(key, row[key] ?? null, row, record);
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
          </div>
        )}
      </section>
      {opener.sheet}
    </div>
  );
}

export function ContractorReportHistoryWorkspace() {
  const t = useTranslations("contractorReports");
  const df = useDateFormat();
  const history = useQuery({
    queryKey: ["contractor-reports", "history"],
    queryFn: () => getContractorReportHistory({ page_size: 100 }),
  });

  return (
    <div className="flex flex-col gap-4">
      <CompanyBanner scope="reports" />
      <ReportSelector />
      <ListHeader title={t("history.title")} subtitle={t("history.subtitle")} />
      <section className="surface-panel overflow-hidden rounded-xl">
        {history.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
          </div>
        ) : history.isError ? (
          <p className="p-8 text-center text-sm text-destructive">{t("loadError")}</p>
        ) : (history.data?.results.length ?? 0) === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{t("history.empty")}</p>
        ) : (
          <div className="overflow-auto">
            <Table className="min-w-260 table-fixed">
              <colgroup>
                <col className="w-64" />
                <col className="w-36" />
                <col className="w-48" />
                <col className="w-48" />
                <col className="w-24" />
                <col className="w-48" />
                <col className="w-52" />
              </colgroup>
              <TableHeader><TableRow>
                <TableHead>{t("history.file")}</TableHead>
                <TableHead>{t("history.report")}</TableHead>
                <TableHead>{t("history.project")}</TableHead>
                <TableHead>{t("history.period")}</TableHead>
                <TableHead className="text-right tabular">{t("history.rows")}</TableHead>
                <TableHead>{t("history.generatedBy")}</TableHead>
                <TableHead>{t("history.generatedAt")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {history.data?.results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="overflow-hidden">
                      <span className="flex min-w-0 items-start gap-2" title={row.file_name}>
                        <FileClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-2 min-w-0 break-all">{row.file_name}</span>
                      </span>
                    </TableCell>
                    <TableCell>{t(`type.${row.report_type}`)}</TableCell>
                    <TableCell>{row.project_name || t("filter.allProjects")}</TableCell>
                    <TableCell className="whitespace-nowrap tabular">{row.date_from} - {row.date_to}</TableCell>
                    <TableCell className="text-right tabular">{row.metric_count}</TableCell>
                    <TableCell>{row.generated_by_name || row.generated_by_email}</TableCell>
                    <TableCell className="whitespace-nowrap tabular">{df.dateTime(row.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
