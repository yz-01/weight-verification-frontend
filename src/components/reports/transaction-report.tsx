"use client";

import { useQuery } from "@tanstack/react-query";
import { FilterX } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListQuery } from "@/hooks/use-list-query";
import { WASTE_TYPES } from "@/interfaces/contractor";
import {
  SETTLEMENT_STATES,
  type SettlementState,
  type TransactionReport as TransactionReportData,
} from "@/interfaces/recycler";
import {
  exportTransactions,
  getTransactionReport,
} from "@/services/recycler.service";

const ALL_STATES = "__all__";

const STATE_TONE: Record<
  SettlementState,
  "neutral" | "positive" | "info"
> = {
  DRAFT: "neutral",
  ISSUED: "info",
  LOCKED: "positive",
};

export function TransactionReport() {
  const t = useTranslations();
  const formatter = useFormatter();
  const { can } = useAuth();
  const list = useListQuery(["state", "currency", "date_from", "date_to"]);

  const filters = {
    state: list.filters.state,
    currency: list.filters.currency,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
  };
  const report = useQuery({
    queryKey: ["transactions", "report", filters],
    queryFn: () => getTransactionReport(filters),
  });

  async function handleExport(format: "xlsx" | "pdf") {
    await exportTransactions({
      format,
      title: t("reports.transaction.title"),
      subtitle: t("reports.transaction.subtitle"),
      emptyLabel: t("common.emptyValue"),
      query: filters,
      columns: [
        { key: "settlement_no", label: t("settlements.field.settlementNo") },
        {
          key: "state",
          label: t("settlements.field.state"),
          values: Object.fromEntries(
            SETTLEMENT_STATES.map((state) => [
              state,
              t(`settlements.state.${state}`),
            ]),
          ),
        },
        { key: "dispatch_no", label: t("settlements.field.dispatchNo") },
        {
          key: "waste_type",
          label: t("dispatches.field.wasteType"),
          values: Object.fromEntries(
            WASTE_TYPES.map((kind) => [
              kind,
              t(`dispatches.wasteType.${kind}`),
            ]),
          ),
        },
        { key: "project_name", label: t("settlements.field.project") },
        { key: "contractor_name", label: t("settlements.field.contractor") },
        { key: "recycler_name", label: t("settlements.field.recycler") },
        { key: "net_weight_kg", label: t("settlements.field.netWeight") },
        {
          key: "deduction_weight_kg",
          label: t("settlements.field.deductionWeight"),
        },
        {
          key: "settled_weight_kg",
          label: t("settlements.field.settledWeight"),
        },
        { key: "unit_price", label: t("settlements.field.unitPrice") },
        { key: "total_amount", label: t("settlements.field.totalAmount") },
        { key: "currency", label: t("reports.transaction.currency") },
        { key: "amount_paid", label: t("settlements.field.amountPaid") },
        { key: "outstanding", label: t("settlements.field.outstanding") },
        { key: "issued_at", label: t("settlements.field.issuedAt") },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <ListHeader
        title={t("reports.transaction.title")}
        subtitle={t("reports.transaction.subtitle")}
        action={
          can("report.export") ? (
            <ExportButton
              onExport={handleExport}
              disabled={report.isLoading}
            />
          ) : undefined
        }
      />

      <section
        aria-label={t("reports.transaction.filters")}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5">
            <Label>{t("reports.transaction.state")}</Label>
            <Select
              value={list.filters.state ?? ALL_STATES}
              onValueChange={(value) =>
                list.setFilter(
                  "state",
                  value === ALL_STATES ? undefined : value,
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATES}>
                  {t("reports.transaction.allStates")}
                </SelectItem>
                {SETTLEMENT_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {t(`settlements.state.${state}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-currency">
              {t("reports.transaction.currency")}
            </Label>
            <Input
              id="report-currency"
              inputMode="text"
              maxLength={3}
              placeholder={t("reports.transaction.currencyPlaceholder")}
              value={list.filters.currency ?? ""}
              onChange={(event) =>
                list.setFilter(
                  "currency",
                  event.target.value.toUpperCase() || undefined,
                )
              }
            />
          </div>

          <DateFilter
            id="transaction-date-from"
            label={t("reports.filter.dateFrom")}
            value={list.filters.date_from ?? ""}
            onChange={(value) => list.setFilter("date_from", value)}
          />
          <DateFilter
            id="transaction-date-to"
            label={t("reports.filter.dateTo")}
            value={list.filters.date_to ?? ""}
            onChange={(value) => list.setFilter("date_to", value)}
          />

          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              disabledReason={
                !list.hasFilters ? t("common.noFiltersSet") : undefined
              }
              disabled={!list.hasFilters}
              onClick={list.clearFilters}
            >
              <FilterX className="h-3.5 w-3.5" />
              {t("reports.filter.clear")}
            </Button>
          </div>
        </div>
      </section>

      {report.isLoading ? (
        <ReportSkeleton />
      ) : report.isError ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-sm text-destructive">
          {t("errors.genericBody")}
        </p>
      ) : (
        <ReportBody data={report.data} formatter={formatter} />
      )}
    </div>
  );
}

function DateFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ReportBody({
  data,
  formatter,
}: {
  data: TransactionReportData | undefined;
  formatter: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations();
  const report = data ?? {
    total_transactions: 0,
    by_currency: [],
    by_state: [],
    by_waste_type: [],
  };

  if (report.total_transactions === 0) {
    return (
      <p className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
        {t("reports.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-7">
      <section
        aria-label={t("reports.transaction.summary")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Metric
          label={t("reports.transaction.transactions")}
          value={formatter.number(report.total_transactions)}
        />
        {report.by_currency.map((row) => (
          <Metric
            key={row.currency}
            label={`${row.currency} ${t("reports.transaction.totalAmount")}`}
            value={money(formatter, row.total_amount, row.currency)}
            detail={`${t("reports.transaction.outstanding")}: ${money(
              formatter,
              row.outstanding,
              row.currency,
            )}`}
          />
        ))}
      </section>

      <ReportTable
        title={t("reports.transaction.byCurrency")}
        headers={[
          t("reports.transaction.currency"),
          t("reports.transaction.transactions"),
          t("reports.transaction.netWeight"),
          t("reports.transaction.deductions"),
          t("reports.transaction.settledWeight"),
          t("reports.transaction.totalAmount"),
          t("reports.transaction.paid"),
          t("reports.transaction.outstanding"),
        ]}
        rows={report.by_currency.map((row) => [
          row.currency,
          formatter.number(row.transactions),
          weight(formatter, row.net_weight_kg),
          weight(formatter, row.deduction_weight_kg),
          weight(formatter, row.settled_weight_kg),
          money(formatter, row.total_amount, row.currency),
          money(formatter, row.amount_paid, row.currency),
          money(formatter, row.outstanding, row.currency),
        ])}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t("reports.transaction.byState")}
        </h2>
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.transaction.state")}</TableHead>
                <TableHead>{t("reports.transaction.currency")}</TableHead>
                <TableHead className="text-right">
                  {t("reports.transaction.transactions")}
                </TableHead>
                <TableHead className="text-right">
                  {t("reports.transaction.settledWeight")}
                </TableHead>
                <TableHead className="text-right">
                  {t("reports.transaction.totalAmount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.by_state.map((row) => (
                <TableRow key={`${row.state}-${row.currency}`}>
                  <TableCell>
                    <StatusBadge
                      label={t(`settlements.state.${row.state}`)}
                      tone={STATE_TONE[row.state]}
                    />
                  </TableCell>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatter.number(row.transactions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {weight(formatter, row.settled_weight_kg)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(formatter, row.total_amount, row.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <ReportTable
        title={t("reports.transaction.byWasteType")}
        headers={[
          t("dispatches.field.wasteType"),
          t("reports.transaction.currency"),
          t("reports.transaction.transactions"),
          t("reports.transaction.settledWeight"),
          t("reports.transaction.totalAmount"),
        ]}
        rows={report.by_waste_type.map((row) => [
          t(`dispatches.wasteType.${row.waste_type}`),
          row.currency,
          formatter.number(row.transactions),
          weight(formatter, row.settled_weight_kg),
          money(formatter, row.total_amount, row.currency),
        ])}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-h-28 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      {detail && (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

function ReportTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header, index) => (
                <TableHead key={header} className={index ? "text-right" : ""}>
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={`${row[0]}-${rowIndex}`}>
                {row.map((value, index) => (
                  <TableCell
                    key={`${index}-${value}`}
                    className={
                      index ? "text-right tabular-nums" : "font-medium"
                    }
                  >
                    {value}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function weight(
  formatter: ReturnType<typeof useFormatter>,
  value: string | null,
): string {
  return `${formatter.number(Number(value ?? 0), {
    maximumFractionDigits: 2,
  })} kg`;
}

function money(
  formatter: ReturnType<typeof useFormatter>,
  value: string | null,
  currency: string,
): string {
  try {
    return formatter.number(Number(value ?? 0), {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${formatter.number(Number(value ?? 0), {
      maximumFractionDigits: 2,
    })}`;
  }
}
