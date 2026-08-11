"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileClock, FileSpreadsheet, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
  ContractorReportType,
} from "@/interfaces/contractor-report";
import { useDateFormat } from "@/lib/dates";
import {
  exportContractorReport,
  getContractorReport,
  getContractorReportHistory,
  getContractorReportOptions,
} from "@/services/contractor-report.service";

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayValue(value: string | number | boolean | null): string {
  if (value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function ContractorReportWorkspace({
  reportType,
}: {
  reportType: ContractorReportType;
}) {
  const t = useTranslations("contractorReports");
  const queryClient = useQueryClient();
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    dateValue(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [dateTo, setDateTo] = useState(dateValue(now));
  const [project, setProject] = useState("all");
  const [category, setCategory] = useState("all");
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
      category:
        reportType === "photos" && category !== "all" ? category : undefined,
      actor: reportType === "photos" && actor !== "all" ? actor : undefined,
      keyword:
        reportType === "photos" && keyword.trim() ? keyword.trim() : undefined,
    }),
    [actor, category, dateFrom, dateTo, keyword, project, reportType],
  );
  const report = useQuery({
    queryKey: ["contractor-reports", "report", filters],
    queryFn: () => getContractorReport(filters),
    enabled: Boolean(dateFrom && dateTo && dateFrom <= dateTo),
  });
  const exportMutation = useMutation({
    mutationFn: (format: "PDF" | "EXCEL") =>
      exportContractorReport({
        ...filters,
        format,
        title: t(`type.${reportType}`),
        subtitle: t("period", { from: dateFrom, to: dateTo }),
        column_labels: Object.fromEntries(
          (report.data?.columns ?? []).map((key) => [key, t(`column.${key}`)]),
        ),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["contractor-reports", "history"] }),
  });

  return (
    <div className="space-y-5">
      <ListHeader
        title={t(`type.${reportType}`)}
        subtitle={t(`description.${reportType}`)}
      />
      <section className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_11rem_11rem_auto]">
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
        <label className="space-y-1.5 text-sm font-medium">
          {t("filter.dateFrom")}
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          {t("filter.dateTo")}
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <Button
            variant="outline"
            disabled={exportMutation.isPending || !report.data}
            onClick={() => exportMutation.mutate("EXCEL")}
          >
            <FileSpreadsheet />{t("action.excel")}
          </Button>
          <Button
            variant="outline"
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
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filter.allCategories")}</SelectItem>
                  {(options.data?.photo_categories ?? []).map((row) => (
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
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">{t("preview")}</h2>
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
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {report.data?.columns.map((key) => (
                    <TableHead key={key} className="whitespace-nowrap">{t(`column.${key}`)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data?.rows.map((row, index) => (
                  <TableRow key={index}>
                    {report.data.columns.map((key) => (
                      <TableCell key={key} className="max-w-80 whitespace-nowrap">
                        {displayValue(row[key] ?? null)}
                      </TableCell>
                    ))}
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

export function ContractorReportHistoryWorkspace() {
  const t = useTranslations("contractorReports");
  const df = useDateFormat();
  const history = useQuery({
    queryKey: ["contractor-reports", "history"],
    queryFn: () => getContractorReportHistory({ page_size: 100 }),
  });

  return (
    <div className="space-y-5">
      <ListHeader title={t("history.title")} subtitle={t("history.subtitle")} />
      <section className="overflow-hidden rounded-lg border bg-card">
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
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("history.file")}</TableHead>
                <TableHead>{t("history.report")}</TableHead>
                <TableHead>{t("history.project")}</TableHead>
                <TableHead>{t("history.period")}</TableHead>
                <TableHead>{t("history.rows")}</TableHead>
                <TableHead>{t("history.generatedBy")}</TableHead>
                <TableHead>{t("history.generatedAt")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {history.data?.results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><span className="flex items-center gap-2 whitespace-nowrap"><FileClock className="size-4 text-muted-foreground" />{row.file_name}</span></TableCell>
                    <TableCell>{t(`type.${row.report_type}`)}</TableCell>
                    <TableCell>{row.project_name || t("filter.allProjects")}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.date_from} - {row.date_to}</TableCell>
                    <TableCell>{row.metric_count}</TableCell>
                    <TableCell>{row.generated_by_name || row.generated_by_email}</TableCell>
                    <TableCell className="whitespace-nowrap">{df.dateTime(row.created_at)}</TableCell>
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
