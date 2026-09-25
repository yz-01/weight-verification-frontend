"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Filter, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ListHeader, LoadFailed, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  RecyclerReportFilters,
  RecyclerReportType,
} from "@/interfaces/recycler-report";
import {
  exportRecyclerReport,
  getRecyclerReport,
  getRecyclerReportExports,
  getRecyclerReportOptions,
} from "@/services/recycler-report.service";

function initialDates() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const local = (value: Date) => {
    const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 10);
  };
  return { date_from: local(start), date_to: local(today) };
}

const FILTER_STATE_TYPES = new Set<RecyclerReportType>([
  "orders",
  "outbound",
  "commission",
  "weighing",
  "inventory",
  "customers",
  "fleet",
  "exceptions",
]);

const PROJECT_FILTER_TYPES = new Set<RecyclerReportType>([
  "orders", "weights", "sources", "weighing", "inventory", "fleet", "exceptions",
]);
const CUSTOMER_FILTER_TYPES = new Set<RecyclerReportType>([
  "orders", "weights", "sources", "weighing", "inventory", "customers", "exceptions",
]);
const FLEET_FILTER_TYPES = new Set<RecyclerReportType>([
  "orders", "weights", "sources", "weighing", "inventory", "fleet",
]);
const SCALE_FILTER_TYPES = new Set<RecyclerReportType>([
  "orders", "weights", "sources", "weighing", "inventory", "exceptions",
]);
const SOURCE_FILTER_TYPES = new Set<RecyclerReportType>([
  "weights", "sources", "inventory", "outbound", "customers", "exceptions",
]);
const MATERIAL_FILTER_TYPES = new Set<RecyclerReportType>([
  "orders", "weights", "sources", "weighing", "inventory", "outbound", "fleet", "exceptions",
]);

const REPORT_TYPES: RecyclerReportType[] = [
  "orders",
  "weights",
  "sources",
  "commission",
  "weighing",
  "inventory",
  "outbound",
  "customers",
  "fleet",
  "exceptions",
];

export function RecyclerReportCenter() {
  const t = useTranslations("recyclerReports");
  const common = useTranslations("common");
  const dates = useMemo(() => initialDates(), []);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<RecyclerReportFilters>({
    report_type: "orders",
    ...dates,
  });
  const [search, setSearch] = useState("");

  const options = useQuery({
    queryKey: ["recycler-reports", "options"],
    queryFn: getRecyclerReportOptions,
    staleTime: 5 * 60_000,
  });
  const report = useQuery({
    queryKey: ["recycler-reports", filters],
    queryFn: () => getRecyclerReport(filters),
  });
  const exportHistory = useQuery({
    queryKey: ["recycler-reports", "exports"],
    queryFn: getRecyclerReportExports,
    staleTime: 30_000,
  });
  const exporting = useMutation({
    mutationFn: (format: "PDF" | "EXCEL") =>
      exportRecyclerReport(filters, format),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recycler-reports", "exports"] });
    },
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return report.data?.rows ?? [];
    return (report.data?.rows ?? []).filter((row) =>
      Object.values(row).some((value) =>
        String(value).toLocaleLowerCase().includes(needle),
      ),
    );
  }, [report.data?.rows, search]);

  const set = <K extends keyof RecyclerReportFilters>(
    key: K,
    value: RecyclerReportFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value || undefined }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={t("count", { count: report.data?.count ?? 0 })}
        action={
          <div className="flex gap-2 print:hidden">
            <Button
              variant="outline"
              disabled={exporting.isPending || report.isLoading}
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              {t("action.print")}
            </Button>
            <Button
              variant="outline"
              disabled={exporting.isPending || report.isLoading}
              onClick={() => exporting.mutate("PDF")}
            >
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button
              disabled={exporting.isPending || report.isLoading}
              onClick={() => exporting.mutate("EXCEL")}
            >
              {exporting.isPending ? (
                <Download className="h-4 w-4 animate-pulse" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Excel
            </Button>
          </div>
        }
      />

      <section className="rounded-lg border bg-card p-4 print:hidden">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4 text-primary" />
          {t("filter.title")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectFilter
            label={t("filter.reportType")}
            value={filters.report_type}
            onChange={(value) => setFilters((current) => ({
              report_type: value as RecyclerReportType,
              date_from: current.date_from,
              date_to: current.date_to,
            }))}
            options={(options.data?.report_types ?? REPORT_TYPES).map((value) => ({
              value,
              label: t(`type.${value}`),
            }))}
          />
          <InputFilter
            label={t("filter.from")}
            type="date"
            value={filters.date_from}
            max={filters.date_to}
            onChange={(value) => set("date_from", value)}
          />
          <InputFilter
            label={t("filter.to")}
            type="date"
            value={filters.date_to}
            min={filters.date_from}
            onChange={(value) => set("date_to", value)}
          />
          <InputFilter
            label={t("filter.search")}
            value={search}
            onChange={setSearch}
          />
          {PROJECT_FILTER_TYPES.has(filters.report_type) && (
            <SelectFilter
              label={t("filter.project")}
              value={filters.project ?? "all"}
              onChange={(value) => set("project", value === "all" ? undefined : value)}
              options={[
                { value: "all", label: t("filter.all") },
                ...(options.data?.projects ?? []).map((row) => ({
                  value: row.id,
                  label: `${row.code} - ${row.name}`,
                })),
              ]}
            />
          )}
          {MATERIAL_FILTER_TYPES.has(filters.report_type) && (
            <SelectFilter
              label={t("filter.material")}
              value={filters.material_type ?? "all"}
              onChange={(value) => set("material_type", value === "all" ? undefined : value)}
              options={[
                { value: "all", label: t("filter.all") },
                ...(options.data?.materials ?? []).map((row) => ({
                  value: row.value,
                  label: row.label,
                })),
              ]}
            />
          )}
          {SOURCE_FILTER_TYPES.has(filters.report_type) && (
            <SelectFilter
              label={t("filter.source")}
              value={filters.business_source ?? "all"}
              onChange={(value) => set("business_source", value === "all" ? undefined : value)}
              options={[
                { value: "all", label: t("filter.all") },
                ...(options.data?.business_sources ?? []).map((value) => ({
                  value,
                  label: t(`source.${value}`),
                })),
              ]}
            />
          )}
          {CUSTOMER_FILTER_TYPES.has(filters.report_type) && (
            <SelectFilter
              label={t("filter.customer")}
              value={filters.customer ?? "all"}
              onChange={(value) => set("customer", value === "all" ? undefined : value)}
              options={[
                { value: "all", label: t("filter.all") },
                ...(options.data?.customers ?? []).map((row) => ({
                  value: row.id,
                  label: `${row.customer_no} - ${row.company_name}`,
                })),
              ]}
            />
          )}
          {FLEET_FILTER_TYPES.has(filters.report_type) && (
            <>
              <SelectFilter
                label={t("filter.driver")}
                value={filters.driver ?? "all"}
                onChange={(value) => set("driver", value === "all" ? undefined : value)}
                options={[
                  { value: "all", label: t("filter.all") },
                  ...(options.data?.drivers ?? []).map((row) => ({
                    value: row.id,
                    label: row.full_name,
                  })),
                ]}
              />
              <SelectFilter
                label={t("filter.vehicle")}
                value={filters.vehicle ?? "all"}
                onChange={(value) => set("vehicle", value === "all" ? undefined : value)}
                options={[
                  { value: "all", label: t("filter.all") },
                  ...(options.data?.vehicles ?? []).map((row) => ({
                    value: row.id,
                    label: row.plate_no,
                  })),
                ]}
              />
            </>
          )}
          {SCALE_FILTER_TYPES.has(filters.report_type) && (
            <SelectFilter
              label={t("filter.scale")}
              value={filters.scale ?? "all"}
              onChange={(value) => set("scale", value === "all" ? undefined : value)}
              options={[
                { value: "all", label: t("filter.all") },
                ...(options.data?.scales ?? []).map((row) => ({
                  value: row.id,
                  label: `${row.code} - ${row.name}`,
                })),
              ]}
            />
          )}
          {FILTER_STATE_TYPES.has(filters.report_type) && (
            <SelectFilter
              label={t("filter.status")}
              value={filters.state ?? "all"}
              onChange={(value) => set("state", value === "all" ? undefined : value)}
              options={[
                { value: "all", label: t("filter.all") },
                ...(options.data?.states_by_report?.[filters.report_type] ?? []).map((value) => ({
                  value,
                  label: value,
                })),
              ]}
            />
          )}
        </div>
        <QueryFailedNote query={options} what={t("what.filterOptions")} className="mt-3" />
      </section>

      {!!report.data?.summary.length && (
        <section className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {report.data.summary.map((metric) => (
            <div key={metric.key} className="min-h-24 border-b p-4 last:border-b-0 sm:border-r xl:border-b-0">
              <p className="text-xs font-medium text-muted-foreground">
                {t.has(`summary.${metric.key}`) ? t(`summary.${metric.key}`) : metric.key}
              </p>
              <p className="mt-2 break-words text-2xl font-semibold tabular-nums">
                {formatMetric(metric.value, metric.unit)}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
        {report.isError ? (
          <EmptyState
            title={t("error.title")}
            description={t("error.description")}
            action={
              <Button variant="outline" onClick={() => void report.refetch()}>
                {t("action.retry")}
              </Button>
            }
          />
        ) : report.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <>
            <div className="hidden overflow-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {(["reference", "date", "category", "party", "status", "quantity", "detail"] as const).map(
                      (key) => <TableHead key={key}>{t(`column.${key}`)}</TableHead>,
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.reference}-${index}`}>
                      <TableCell className="font-medium tabular-nums">{row.reference}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{row.date}</TableCell>
                      <TableCell>{displayCategory(row.category, t)}</TableCell>
                      <TableCell>{row.party}</TableCell>
                      <TableCell><StatusBadge label={displayStatus(row.status, t)} /></TableCell>
                      <TableCell className="tabular-nums">{row.quantity || "-"}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal break-words">{row.detail || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {rows.map((row, index) => (
                <article key={`${row.reference}-${index}`} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{row.reference}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.date}</p>
                    </div>
                    <StatusBadge label={displayStatus(row.status, t)} />
                  </div>
                  <p className="text-sm">{row.party}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{displayCategory(row.category, t)}</span>
                    {row.quantity && <span>{row.quantity}</span>}
                    {row.detail && <span className="break-all">{row.detail}</span>}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 print:hidden">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t("history.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("history.description")}</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{exportHistory.isError ? common("emptyValue") : exportHistory.data?.count ?? 0}</span>
        </div>
        {exportHistory.isError ? (
          <LoadFailed what={t("what.history")} onRetry={() => void exportHistory.refetch()} />
        ) : exportHistory.data?.results.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t("history.file")}</TableHead><TableHead>{t("history.period")}</TableHead><TableHead>{t("history.format")}</TableHead><TableHead>{t("history.generated")}</TableHead></TableRow></TableHeader>
              <TableBody>{exportHistory.data.results.slice(0, 10).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-64 truncate font-medium">{row.file_name}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.date_from} - {row.date_to}</TableCell>
                  <TableCell>{row.export_format}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
        )}
      </section>
    </div>
  );
}

function formatMetric(value: string | number, unit: "count" | "kg" | "money") {
  const numeric = Number(value);
  const formatted = Number.isFinite(numeric)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: unit === "count" ? 0 : 3 }).format(numeric)
    : String(value);
  if (unit === "kg") return `${formatted} kg`;
  if (unit === "money") return `MYR ${formatted}`;
  return formatted;
}

function displayStatus(value: string, t: ReturnType<typeof useTranslations>): string {
  const key = `dispatches.state.${value}`;
  return t.has(key) ? t(key) : value;
}

function displayCategory(value: string, t: ReturnType<typeof useTranslations>): string {
  const key = `dispatches.wasteType.${value}`;
  return t.has(key) ? t(key) : value;
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InputFilter({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
