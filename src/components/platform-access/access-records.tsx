"use client";

/**
 * 「MSE 查看记录」 (JB220-3, 客户 11-18; Lucas's approved point 「每次查看都留记录，
 * 客户自己查得到」): every time MSE looked at a customer's records, was stopped,
 * changed an account or asked for access - and every time the customer opened
 * or closed the door. The customer reads it on 公司设置; MSE reads the same
 * list on the company page.
 *
 * Four columns, as the plan names them: 时间 · MSE 人员 · 做了什么 · 看了哪里,
 * with a date range and 「做了什么」 to narrow it, and pages of twenty. On a
 * phone each row is a small card instead of a table scrolled sideways.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FilterX, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper, LoadFailed, StatusBadge, type StatusTone } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PLATFORM_ACCESS_OUTCOMES,
  type PlatformAccessOutcome,
  type PlatformAccessRecord,
} from "@/interfaces/platform-access";
import { useDateFormat } from "@/lib/dates";
import { getPlatformAccessRecords } from "@/services/platform-access.service";

export const RECORDS_PAGE_SIZE = 20;

const OUTCOME_TONE: Record<PlatformAccessOutcome, StatusTone> = {
  OPENED: "info",
  REFUSED: "neutral",
  ACCOUNT_CHANGED: "warning",
  REQUESTED: "info",
  GRANT_OPENED: "warning",
  GRANT_CLOSED: "positive",
};

type Words = ReturnType<typeof useTranslations<"mseAccess">>;

/** 「看了哪里」 in words: the module and the record's number, or what was opened, changed or asked. */
export function recordWhere(row: PlatformAccessRecord, t: Words): string {
  const kindName = (kind: string) =>
    kind === "MANAGE_ACCOUNTS" ? t("accounts.name") : kind === "VIEW_RECORDS" ? t("view.name") : "";
  if (row.outcome === "GRANT_OPENED" || row.outcome === "GRANT_CLOSED") {
    return kindName(row.detail) || moduleWords(row.module, t);
  }
  // A request carries the reason MSE typed (contract §1.5 (c)), which the
  // customer reads beside what was asked for.
  if (row.outcome === "REQUESTED") {
    return [kindName(row.detail) || moduleWords(row.module, t), row.record_label].filter(Boolean).join(" · ");
  }
  if (row.outcome === "ACCOUNT_CHANGED") {
    const operation = t.has(`operation.${row.detail}`) ? t(`operation.${row.detail}`) : t("operation.other");
    return [operation, row.record_label].filter(Boolean).join(" · ");
  }
  return [moduleWords(row.module, t), row.record_label].filter(Boolean).join(" · ");
}

/** The small line under 「看了哪里」: how it was looked at, or what was not open. */
export function recordHow(row: PlatformAccessRecord, t: Words): string {
  if (row.outcome === "OPENED" && t.has(`records.lookedAt.${row.kind}`)) return t(`records.lookedAt.${row.kind}`);
  if (row.outcome === "REFUSED" && t.has(`records.refused.${row.detail}`)) return t(`records.refused.${row.detail}`);
  return "";
}

function moduleWords(key: string, t: Words): string {
  return t.has(`module.${key}`) ? t(`module.${key}`) : t("module.other");
}

export function PlatformAccessRecords({
  company,
  audience,
}: {
  /** MSE names the company; the customer reads its own. */
  company?: string;
  audience: "customer" | "mse";
}) {
  const t = useTranslations("mseAccess");
  const common = useTranslations("common");
  const df = useDateFormat();
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<PlatformAccessOutcome | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filtered = Boolean(outcome || dateFrom || dateTo);

  const query = {
    ...(company ? { company } : {}),
    ...(outcome ? { outcome } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    page,
    page_size: RECORDS_PAGE_SIZE,
  };
  const records = useQuery({
    queryKey: ["platform-access", "records", query],
    queryFn: () => getPlatformAccessRecords(query),
  });
  const rows = records.data?.results ?? [];
  const count = records.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / RECORDS_PAGE_SIZE));

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
  };
  const actor = (row: PlatformAccessRecord) =>
    row.actor_is_mse
      ? row.actor_name
      : t(audience === "customer" ? "records.customerActor" : "records.customerActorMse", { name: row.actor_name });

  return (
    <div className="space-y-3" data-access-records={audience}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <History className="size-4 text-primary" aria-hidden />
          {t("records.title")}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(audience === "customer" ? "records.help" : "records.helpMse")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(3,minmax(0,12rem))_auto] sm:items-end">
        <FieldWrapper label={t("records.filter.from")}>
          <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => reset(() => setDateFrom(event.target.value))} />
        </FieldWrapper>
        <FieldWrapper label={t("records.filter.to")}>
          <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => reset(() => setDateTo(event.target.value))} />
        </FieldWrapper>
        <FieldWrapper label={t("records.filter.outcome")} className="col-span-2 sm:col-span-1">
          <Select value={outcome || "all"} onValueChange={(value) => reset(() => setOutcome(value === "all" ? "" : (value as PlatformAccessOutcome)))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("records.filter.all")}</SelectItem>
              {PLATFORM_ACCESS_OUTCOMES.map((value) => (
                <SelectItem key={value} value={value}>{t(`records.outcome.${value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <Button
          variant="outline"
          className="col-span-2 sm:col-span-1"
          disabled={!filtered}
          disabledReason={t("records.filter.nothingToClear")}
          onClick={() => reset(() => { setOutcome(""); setDateFrom(""); setDateTo(""); })}
        >
          <FilterX />
          {t("records.filter.clear")}
        </Button>
      </div>

      <div className="surface-panel overflow-hidden rounded-xl">
        {records.isError ? (
          <LoadFailed what={t("records.what")} onRetry={() => void records.refetch()} className="m-4 sm:m-6" />
        ) : records.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground sm:p-6">{t("records.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="m-4 rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground sm:m-6" data-access-records-empty>
            {filtered ? t("records.emptyFiltered") : t(audience === "customer" ? "records.empty" : "records.emptyMse")}
          </p>
        ) : (
          <>
            {/* A phone: one card a row (no sideways scrolling at 390 px). */}
            <ul className="divide-y sm:hidden">
              {rows.map((row) => (
                <li key={row.id} className="space-y-1 px-4 py-3 text-sm" data-access-record-card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge label={t(`records.outcome.${row.outcome}`)} tone={OUTCOME_TONE[row.outcome] ?? "neutral"} />
                    <span className="tabular text-xs text-muted-foreground">{df.dateTime(row.occurred_at)}</span>
                  </div>
                  <p className="font-medium text-foreground">{recordWhere(row, t)}</p>
                  {recordHow(row, t) && <p className="text-xs text-muted-foreground">{recordHow(row, t)}</p>}
                  <p className="text-xs text-muted-foreground">{actor(row)}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("records.column.time")}</TableHead>
                    <TableHead>{t("records.column.actor")}</TableHead>
                    <TableHead>{t("records.column.outcome")}</TableHead>
                    <TableHead>{t("records.column.where")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-access-record-row>
                      <TableCell className="tabular whitespace-nowrap text-muted-foreground">{df.dateTime(row.occurred_at)}</TableCell>
                      <TableCell>
                        <span className="block max-w-56 truncate font-medium" title={row.actor_email || undefined}>{actor(row)}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={t(`records.outcome.${row.outcome}`)} tone={OUTCOME_TONE[row.outcome] ?? "neutral"} />
                      </TableCell>
                      <TableCell>
                        <span className="block">{recordWhere(row, t)}</span>
                        {recordHow(row, t) && <span className="block text-xs text-muted-foreground">{recordHow(row, t)}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-panel-border px-4 py-3">
              <span className="tabular text-xs text-muted-foreground">{t("records.page", { page, pages, count })}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  disabledReason={common("alreadyFirstPage")}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft />
                  {t("records.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  disabledReason={common("alreadyLastPage")}
                  onClick={() => setPage((current) => Math.min(pages, current + 1))}
                >
                  {t("records.next")}
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
