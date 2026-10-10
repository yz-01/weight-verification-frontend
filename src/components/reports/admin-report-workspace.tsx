"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { exportedReportName } from "@/components/reports/exported-report-name";
import {
  ArchivedReportActions,
  ArchivedReportName,
  ArchivedReportNote,
  useReportArchive,
} from "@/components/reports/report-archive";
import { ExportButton } from "@/components/shared/export-button";
import { FilterBar, ListHeader, LoadFailed, QueryFailedNote } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
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
  AdminReportFilters,
  AdminReportMetric,
  AdminReportType,
} from "@/interfaces/admin-report";
import { useDateFormat } from "@/lib/dates";
import {
  exportAdminReport,
  getAdminReport,
  getAdminReportFilterOptions,
  getAdminReportHistory,
} from "@/services/admin-report.service";
import { NOT_LIVE } from "@/lib/live-refresh";

export type AdminReportSection =
  | "overview"
  | "search"
  | "history";

const REPORT_TYPES: AdminReportType[] = [
  "contractors",
  "recyclers",
  "business",
  "saas",
  "commission",
  "cwe",
  "operations",
];

const SUBMODULES: Array<{
  section: Exclude<AdminReportSection, "overview">;
  number: string;
}> = [
  { section: "search", number: "9.2.8" },
  { section: "history", number: "9.2.10" },
];

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AdminReportWorkspace({
  section = "overview",
}: {
  section?: AdminReportSection;
}) {
  const t = useTranslations("adminReports");

  if (section === "history") {
    return <ReportHistory />;
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={section === "overview" ? t("title") : t(`section.${section}.title`)}
        subtitle={
          section === "overview"
            ? t("subtitle")
            : t(`section.${section}.subtitle`)
        }
      />
      {section === "overview" ? (
        <div className="surface-panel min-h-0 flex-1 overflow-hidden rounded-xl">
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            {SUBMODULES.map((module) => (
              <Link
                key={module.section}
                href={`/reports/${module.section}`}
                className="flex min-h-20 items-center gap-3 border-b border-r border-panel-border px-4 py-4 transition-colors hover:bg-muted/40 sm:px-6"
              >
                
                <span className="min-w-0 flex-1 font-medium">
                  {t(`section.${module.section}.title`)}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <ReportPanel section={section} />
      )}
    </div>
  );
}

function ReportPanel({
  section,
}: {
  section: Exclude<AdminReportSection, "overview" | "history">;
}) {
  const t = useTranslations("adminReports");
  const common = useTranslations("common");
  const format = useFormatter();
  const now = new Date();
  const [reportType, setReportType] = useState<AdminReportType>(
    REPORT_TYPES.includes(section as AdminReportType)
      ? (section as AdminReportType)
      : "contractors",
  );
  const [dateFrom, setDateFrom] = useState(
    dateValue(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [dateTo, setDateTo] = useState(dateValue(now));
  const [company, setCompany] = useState("");
  const [project, setProject] = useState("");
  const [state, setState] = useState("");
  const options = useQuery({
    queryKey: ["admin-reports", "options"],
    queryFn: getAdminReportFilterOptions,
  });
  const filters = useMemo<AdminReportFilters>(
    () => ({
      report_type: reportType,
      date_from: dateFrom,
      date_to: dateTo,
      company: company || undefined,
      project: project || undefined,
      state: state || undefined,
    }),
    [company, dateFrom, dateTo, project, reportType, state],
  );
  const report = useQuery({
    queryKey: ["admin-reports", filters],
    queryFn: () => getAdminReport(filters),
    // An aggregation: refreshed by the person, not by the realtime layer (S1).
    meta: NOT_LIVE,
  });
  const exportMutation = useMutation({
    mutationFn: (exportFormat: "PDF" | "EXCEL") =>
      exportAdminReport({
        ...filters,
        format: exportFormat,
        title: t(`reportType.${reportType}`),
        subtitle: t("exportSubtitle", { from: dateFrom, to: dateTo }),
        metric_label: t("field.metric"),
        value_label: t("field.value"),
        unit_label: t("field.unit"),
        metric_labels: Object.fromEntries(
          (report.data?.metrics ?? []).map((metric) => [
            metric.key,
            t(`metric.${metric.key}`),
          ]),
        ),
      }),
  });
  const projects = (options.data?.projects ?? []).filter(
    (row) => !company || row.company === company,
  );
  const showType = section === "search";

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <FilterBar>
        {showType && (
          <FilterSelect
            label={t("filter.reportType")}
            value={reportType}
            onChange={(value) => setReportType(value as AdminReportType)}
            options={REPORT_TYPES.map((value) => ({
              value,
              label: t(`reportType.${value}`),
            }))}
          />
        )}
        <FilterSelect
          label={t("filter.company")}
          value={company}
          onChange={(value) => {
            setCompany(value);
            setProject("");
          }}
          allLabel={t("filter.allCompanies")}
          options={(options.data?.companies ?? []).map((row) => ({
            value: row.id,
            label: `${row.code} - ${row.name}`,
          }))}
        />
        <FilterSelect
          label={t("filter.project")}
          value={project}
          onChange={setProject}
          allLabel={t("filter.allProjects")}
          options={projects.map((row) => ({
            value: row.id,
            label: `${row.code} - ${row.name}`,
          }))}
        />
        <FilterSelect
          label={t("filter.state")}
          value={state}
          onChange={setState}
          allLabel={t("filter.allStates")}
          options={(options.data?.states ?? []).map((value) => ({
            value,
            label: value,
          }))}
        />
        <DateFilter label={t("filter.dateFrom")} value={dateFrom} onChange={setDateFrom} />
        <DateFilter label={t("filter.dateTo")} value={dateTo} onChange={setDateTo} />
        <QueryFailedNote query={options} what={t("what.filterOptions")} className="basis-full" />
      </FilterBar>

      <div className="flex flex-wrap justify-end gap-2">
        {/* 预览 · 打印 · 导出 · 发送 (PDF 统一操作规则). */}
        <ExportButton
          onExport={(format) => exportMutation.mutateAsync(format === "pdf" ? "PDF" : "EXCEL")}
          disabled={!report.data}
          disabledReason={common("noReportYet")}
          title={t(`reportType.${reportType}`)}
        />
      </div>

      {report.isError ? (
        <div className="surface-panel rounded-xl px-6 py-12 text-center text-sm text-muted-foreground">
          {t("loadError")}
        </div>
      ) : report.isLoading || !report.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {report.data.metrics.map((metric) => (
            <div key={metric.key} className="surface-panel min-h-28 min-w-0 rounded-xl p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {t(`metric.${metric.key}`)}
              </p>
              <p className="kpi-figure mt-3 break-words text-2xl text-foreground">
                {formatMetric(metric, format)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-48">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="native-control"
      >
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
      <span>{label}</span>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReportHistory() {
  const t = useTranslations("adminReports");
  const archiveT = useTranslations("reportArchive");
  // Every export on the platform is listed, so a row may be a contractor's
  // or a recycler's report (`exportedReportName`).
  const root = useTranslations();
  const df = useDateFormat();
  // Each row opens the file generated at the time (`report-archive`).
  const archive = useReportArchive();
  const history = useQuery({
    queryKey: ["admin-reports", "history"],
    queryFn: () => getAdminReportHistory({ page_size: 100 }),
  });

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={t("section.history.title")}
        subtitle={t("section.history.subtitle")}
      />
      <div className="surface-panel min-h-0 flex-1 overflow-auto rounded-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("field.file")}</TableHead>
              <TableHead>{t("filter.reportType")}</TableHead>
              <TableHead>{t("field.format")}</TableHead>
              <TableHead>{t("field.period")}</TableHead>
              <TableHead>{t("field.generatedBy")}</TableHead>
              <TableHead>{t("field.generatedAt")}</TableHead>
              <TableHead>{archiveT("column")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(history.data?.results ?? []).map((row) => (
              <TableRow key={row.id} className="align-top">
                <TableCell className="min-w-64 whitespace-normal">
                  <ArchivedReportName row={row} archive={archive} />
                  <ArchivedReportNote row={row} className="pl-6" />
                </TableCell>
                <TableCell>{exportedReportName(root, row.report_type)}</TableCell>
                <TableCell>{row.export_format}</TableCell>
                <TableCell className="tabular-nums">
                  {row.date_from} - {row.date_to}
                </TableCell>
                <TableCell>
                  <p>{row.generated_by_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.generated_by_email}
                  </p>
                </TableCell>
                <TableCell>{df.dateTime(row.created_at)}</TableCell>
                <TableCell>
                  <ArchivedReportActions row={row} archive={archive} />
                </TableCell>
              </TableRow>
            ))}
            {history.isError && (
              <TableRow>
                <TableCell colSpan={7} className="whitespace-normal p-4">
                  <LoadFailed what={t("what.history")} onRetry={() => void history.refetch()} />
                </TableCell>
              </TableRow>
            )}
            {!history.isLoading && !history.isError && (history.data?.results.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  {t("emptyHistory")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {archive.element}
    </div>
  );
}

function formatMetric(
  metric: AdminReportMetric,
  format: ReturnType<typeof useFormatter>,
): string {
  const value = Number(metric.value);
  if (metric.unit === "MYR") {
    return format.number(value, { style: "currency", currency: "MYR" });
  }
  if (metric.unit === "kg") {
    return `${format.number(value, { maximumFractionDigits: 3 })} kg`;
  }
  if (metric.unit === "percent") {
    return `${format.number(value, { maximumFractionDigits: 2 })}%`;
  }
  return format.number(value);
}
