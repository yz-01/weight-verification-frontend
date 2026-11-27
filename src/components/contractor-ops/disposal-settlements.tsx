"use client";

/**
 * 「清运结算管理」 (JB287, 客户 11-27) - the tab that replaces 「全部」.
 *
 * 「「全部」页面则按照之前提出的方案调整为「清运结算管理」，负责批量核对、生成结算
 * 编号、准备结算、结算完毕及历史归档。」 The plan he points to (parts 三–八):
 *
 * - 三: a plain list with no thumbnails, three lists 未核对｜准备结算｜结算完毕,
 *   the top bar's project, and only a supplier and a date range to filter;
 * - 四: 未核对 = every archived 垃圾清运 job not checked yet - 勾选框｜清运记录编号｜
 *   项目名称｜供应商名称｜清运日期｜实际验收车次｜每车费用｜费用金额, 全选 /
 *   个别勾选 / 【确认核对】, and the filtered sum apart from the ticked sum;
 * - 五: 确认核对 makes ONE item with its own 结算编号 - 结算编号｜项目名称｜供应商
 *   名称｜清运日期范围｜清运总车次｜结算总金额｜【准备结算】｜查看、预览及打印;
 *   only a click on the 结算编号 opens its jobs and their amounts;
 * - 六: 【准备结算】 → 六位数密码 → 【结算完毕】 → 确认 → 结算完毕, with who and
 *   when; then locked: no second 结算, no amount changed; 查询、预览、打印及
 *   追溯 stay;
 * - 七: the A4 结算单 with no photos; each 清运记录编号 opens the job with its
 *   photos;
 * - 八: six running figures that 核对 and 结算 never lower; the filter only
 *   changes the range shown; weight is counted, never priced.
 *
 * Office only: the phone is never offered 核对 or 结算 (the server refuses
 * `sign_off_office_only`). Amounts are the server's to hide (金额查看).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardCheck, Eye, HandCoins, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";

import { DisposalFeeButton } from "@/components/contractor-ops/disposal-fees";
import { DisposalInPlace } from "@/components/contractor-ops/site-disposal-workspaces";
import { useAuth } from "@/components/providers/auth-provider";
import { FileActionButtons } from "@/components/shared/file-actions";
import { QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { RecordWindowFailure } from "@/components/shared/record-window-failure";
import { SupplierDateFilter } from "@/components/shared/supplier-date-filter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import {
  DISPOSAL_FEES_HREF,
  DISPOSAL_SETTLE_PIN_ACTION,
  mayHandleDisposalFees,
  rmText,
  sameProjectAndSupplier,
  settlementStageOf,
  sumAmounts,
  type SettlementStage,
} from "@/lib/disposal-fees";
import { isSignOffCancelled } from "@/lib/sign-off";
import {
  createDisposalSettlement,
  disposalSettlementPdfFile,
  getDisposalPending,
  getDisposalSettlement,
  getDisposalSettlements,
  getDisposalSettlementSummary,
  settleDisposalSettlement,
  type DisposalPendingRow,
  type DisposalSettlement,
  type DisposalSettlementFilters,
  type DisposalSettlementRow,
} from "@/services/disposal-settlement.service";
import { signOffBeforeEditing } from "@/services/sign-off.service";

/** What 确认核对 / 结算完毕 change elsewhere. */
export const DISPOSAL_SETTLEMENT_STALE_KEYS = [
  ["disposal-settlements"],
  ["site-disposals"],
  ["site-cost-overview"],
  ["contractor-reports", "report"],
] as const;

const STAGES: readonly SettlementStage[] = ["unchecked", "ready", "settled"];

/** The 清运结算管理 tab: figures, filters, the three lists. */
export function ClearanceSettlement() {
  const t = useTranslations("jb287");
  const list = useListQuery(["project", "supplier", "date_from", "date_to", "stage"]);
  const stage = settlementStageOf(list.filters.stage ?? null);
  const filters: DisposalSettlementFilters = {
    project: list.filters.project,
    supplier: list.filters.supplier,
    date_from: list.filters.date_from,
    date_to: list.filters.date_to,
  };
  const [opened, setOpened] = useUrlSelection("settlement");
  const { can } = useAuth();
  return (
    <div className="flex flex-col gap-4" data-slot="clearance-settlement">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("tab.settlement")}</h2>
          <p className="text-sm text-muted-foreground">{t("settlement.help")}</p>
        </div>
        <DisposalFeeButton />
      </div>
      <SettlementFigures filters={filters} />
      <SupplierDateFilter
        value={{ supplier: list.filters.supplier, date_from: list.filters.date_from, date_to: list.filters.date_to }}
        onChange={(next) => list.setFilters(next as Record<string, string | undefined>)}
        showSupplier={can("supplier.view")}
      />
      <p className="-mt-2 text-xs text-muted-foreground">{t("settlement.filterHelp")}</p>
      <div
        role="tablist"
        aria-label={t("tab.settlement")}
        className="inline-flex self-start rounded-lg border bg-muted/40 p-1"
        data-slot="settlement-stages"
      >
        {STAGES.map((each) => (
          <Button
            key={each}
            role="tab"
            aria-selected={stage === each}
            variant={stage === each ? "default" : "ghost"}
            className="h-10 px-5 text-base"
            data-slot={`settlement-stage-${each}`}
            onClick={() => list.setFilter("stage", each === "unchecked" ? undefined : each)}
          >
            {t(`stage.${each}`)}
          </Button>
        ))}
      </div>
      {stage === "unchecked" ? (
        <PendingList filters={filters} onChecked={() => list.setFilter("stage", "ready")} />
      ) : (
        <SettlementList status={stage === "ready" ? "READY" : "SETTLED"} filters={filters} onOpen={(id) => setOpened(id)} />
      )}
      {opened ? <DisposalSettlementWindow id={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}

/** 页面上方累计统计: the six figures, and the jobs that have no fee yet. */
export function SettlementFigures({ filters }: { filters: DisposalSettlementFilters }) {
  const t = useTranslations("jb287");
  const summary = useQuery({
    queryKey: ["disposal-settlements", "summary", filters],
    queryFn: () => getDisposalSettlementSummary(filters),
  });
  const data = summary.data;
  const figures: { key: string; value: string }[] = [
    { key: "trips", value: data ? t("settlement.tripsValue", { count: data.trip_total }) : "…" },
    { key: "weight", value: data ? t("settlement.weightValue", { weight: data.weight_total_kg }) : "…" },
    { key: "amount", value: data ? rmText(data.amount_total) : "…" },
    { key: "unchecked", value: data ? rmText(data.unchecked_amount) : "…" },
    { key: "ready", value: data ? rmText(data.ready_amount) : "…" },
    { key: "settled", value: data ? rmText(data.settled_amount) : "…" },
  ];
  return (
    <section className="space-y-2" data-slot="settlement-figures">
      <QueryFailedNote query={summary} what={t("settlement.summaryWhat")} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {figures.map((figure) => (
          <div key={figure.key} className="surface-panel rounded-xl px-4 py-3" data-figure={figure.key}>
            <p className="text-sm text-muted-foreground">{t(`settlement.figure.${figure.key}`)}</p>
            <p className="tabular text-lg font-semibold">{summary.isError ? "—" : figure.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("settlement.figuresHelp")}</p>
      {data && data.no_fee_count > 0 ? <NoFeeLine count={data.no_fee_count} /> : null}
    </section>
  );
}

/** 「有 N 笔清运的供应商还没有设每车清运费用」 and the way to set it. */
export function NoFeeLine({ count }: { count: number }) {
  const t = useTranslations("jb287");
  return (
    <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm" data-slot="settlement-no-fee">
      {t("settlement.noFeeLine", { count })}{" "}
      <Link href={DISPOSAL_FEES_HREF} className="font-medium text-primary underline underline-offset-2">
        {t("settlement.noFeeLink")}
      </Link>
    </p>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground" data-slot="settlement-empty">
      {children}
    </p>
  );
}

/** Why a row cannot be ticked, in the reader's words. */
function useCannotTickText() {
  const t = useTranslations("jb287");
  return (reason: string | null) => {
    if (reason && t.has(`cannotTick.${reason}`)) return t(`cannotTick.${reason}`);
    return reason || t("panel.noFee");
  };
}

/**
 * 四、未核对: the archived jobs not checked yet, ticked and 【确认核对】. The
 * two sums apart: 「筛选范围累计」 (every row shown) and 「本次勾选」.
 */
function PendingList({ filters, onChecked }: { filters: DisposalSettlementFilters; onChecked: () => void }) {
  const t = useTranslations("jb287");
  const { can, user } = useAuth();
  const office = mayHandleDisposalFees(user, can);
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: ["disposal-settlements", "pending", filters],
    queryFn: () => getDisposalPending(filters),
  });
  const rows = useMemo(() => pending.data?.rows ?? [], [pending.data]);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<DisposalSettlement | null>(null);
  // Only rows still listed count: a filter change drops what left the list.
  const picked = rows.filter((row) => chosen.has(row.disposal_id));
  const tickable = rows.filter((row) => row.can_tick);
  const mixed = !sameProjectAndSupplier(picked);
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChosen = tickable.length > 0 && tickable.every((row) => chosen.has(row.disposal_id));
  const toggleAll = () => setChosen(allChosen ? new Set() : new Set(tickable.map((row) => row.disposal_id)));
  const pickedSum = sumAmounts(picked.map((row) => row.fee_amount));
  return (
    <section className="space-y-3" data-slot="settlement-pending">
      <QueryFailedNote query={pending} what={t("settlement.pendingWhat")} />
      {done ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm" data-slot="settlement-checked-done" role="status">
          <span>{t("settlement.checkedDone", { number: done.number })}</span>
          <Button size="sm" variant="outline" onClick={onChecked}>
            {t("settlement.toReady")}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm" data-slot="settlement-sums">
        <span data-slot="settlement-filtered-sum">
          {t("settlement.filteredTotal", { amount: rmText(pending.data?.filtered_amount) })}
        </span>
        <span className="font-semibold" data-slot="settlement-ticked-sum">
          {t("settlement.tickedTotal", { count: picked.length, amount: rmText(pickedSum) })}
        </span>
      </div>
      {pending.isLoading ? (
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
      ) : rows.length === 0 && !pending.isError ? (
        <EmptyNote>{t("settlement.emptyUnchecked")}</EmptyNote>
      ) : rows.length > 0 ? (
        <PendingRowsTable rows={rows} chosen={office ? chosen : undefined} allChosen={allChosen} onToggle={toggle} onToggleAll={toggleAll} />
      ) : null}
      {office && rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            data-slot="settlement-confirm-check"
            requires={[[picked.length > 0, t("settlement.tickFirst")]]}
            disabled={mixed}
            disabledReason={mixed ? t("settlement.mixed") : undefined}
            showReason={mixed}
            onClick={() => setConfirming(true)}
          >
            <ClipboardCheck />
            {t("settlement.confirm")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("settlement.confirmHint")}</span>
        </div>
      ) : null}
      {confirming ? (
        <ConfirmCheckDialog
          rows={picked}
          onClose={() => setConfirming(false)}
          onSaved={(settlement) => {
            setConfirming(false);
            setChosen(new Set());
            setDone(settlement);
            for (const key of DISPOSAL_SETTLEMENT_STALE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * 未核对's table: 勾选框｜清运记录编号｜项目名称｜供应商名称｜清运日期｜实际验收车次｜
 * 每车费用｜费用金额. No tick column without `chosen` (no right to check).
 * Each 清运记录编号 opens the job with its photos.
 */
export function PendingRowsTable({
  rows,
  chosen,
  allChosen,
  onToggle,
  onToggleAll,
}: {
  rows: readonly DisposalPendingRow[];
  chosen?: ReadonlySet<string>;
  allChosen: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const t = useTranslations("jb287");
  const df = useDateFormat();
  const cannotTick = useCannotTickText();
  const [opened, setOpened] = useState<string | null>(null);
  const some = chosen ? rows.some((row) => chosen.has(row.disposal_id)) : false;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {chosen ? (
              <TableHead className="w-24">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold">
                  <Checkbox
                    data-slot="settlement-select-all"
                    checked={allChosen ? true : some ? "indeterminate" : false}
                    onCheckedChange={onToggleAll}
                    aria-label={t("settlement.selectAll")}
                  />
                  {t("settlement.selectAll")}
                </label>
              </TableHead>
            ) : null}
            <TableHead>{t("col.reference")}</TableHead>
            <TableHead>{t("col.project")}</TableHead>
            <TableHead>{t("col.supplier")}</TableHead>
            <TableHead>{t("col.clearedOn")}</TableHead>
            <TableHead className="text-right">{t("col.trips")}</TableHead>
            <TableHead className="text-right">{t("col.feePerTrip")}</TableHead>
            <TableHead className="text-right">{t("col.feeAmount")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.disposal_id} data-slot="settlement-pending-row">
              {chosen ? (
                <TableCell>
                  <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center">
                    <Checkbox
                      data-slot="settlement-select-row"
                      checked={chosen.has(row.disposal_id)}
                      disabled={!row.can_tick}
                      onCheckedChange={() => onToggle(row.disposal_id)}
                      aria-label={t("settlement.selectRow", { reference: row.reference_no })}
                    />
                  </label>
                </TableCell>
              ) : null}
              <TableCell>
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  data-slot="settlement-open-record"
                  onClick={() => setOpened(row.disposal_id)}
                >
                  {row.reference_no}
                </button>
              </TableCell>
              <TableCell>{row.project.name}</TableCell>
              <TableCell>{row.supplier.name}</TableCell>
              <TableCell className="tabular whitespace-nowrap">{df.date(row.cleared_on)}</TableCell>
              <TableCell className="tabular text-right">{t("settlement.tripsValue", { count: row.trip_count })}</TableCell>
              {row.can_tick ? (
                <>
                  <TableCell className="tabular text-right">{rmText(row.fee_per_trip)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{rmText(row.fee_amount)}</TableCell>
                </>
              ) : (
                <TableCell colSpan={2} className="text-right text-sm text-destructive" data-slot="settlement-cannot-tick">
                  {cannotTick(row.cannot_tick_reason)}{" "}
                  <Link href={DISPOSAL_FEES_HREF} className="font-medium text-primary underline underline-offset-2">
                    {t("settlement.noFeeLink")}
                  </Link>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {opened ? <DisposalInPlace id={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}

/** 【确认核对】's window: what is being put into one 结算编号. */
function ConfirmCheckDialog({
  rows,
  onClose,
  onSaved,
}: {
  rows: readonly DisposalPendingRow[];
  onClose: () => void;
  onSaved: (settlement: DisposalSettlement) => void;
}) {
  const t = useTranslations("jb287");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => createDisposalSettlement(rows.map((row) => row.disposal_id)),
    onSuccess: onSaved,
    onError: (reason) => {
      if (isSignOffCancelled(reason)) return;
      setError(reason instanceof ApiError ? reason.message : t("settlement.failed"));
    },
  });
  const first = rows[0];
  const trips = rows.reduce((sum, row) => sum + row.trip_count, 0);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="settlement-confirm-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settlement.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("settlement.confirmBody", {
              count: rows.length,
              project: first?.project.name ?? "",
              supplier: first?.supplier.name ?? "",
              trips,
              amount: rmText(sumAmounts(rows.map((row) => row.fee_amount))),
            })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("settlement.confirmLock")}</p>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("settlement.cancel")}
          </Button>
          <Button data-slot="settlement-confirm-go" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            {t("settlement.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 五 / 六: 准备结算 or 结算完毕 - 结算编号｜项目名称｜供应商名称｜清运日期范围｜
 * 清运总车次｜结算总金额, then 【准备结算】 (READY) or 结算人 / 结算时间
 * (SETTLED), and 查看 · 预览 · 打印 (· 导出 when settled). A click on the 结算编号
 * opens its jobs right under it.
 */
function SettlementList({
  status,
  filters,
  onOpen,
}: {
  status: "READY" | "SETTLED";
  filters: DisposalSettlementFilters;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("jb287");
  const settlements = useQuery({
    queryKey: ["disposal-settlements", "list", status, filters],
    queryFn: () => getDisposalSettlements(status, filters),
  });
  const rows = settlements.data ?? [];
  return (
    <section className="space-y-3" data-slot={`settlement-list-${status.toLowerCase()}`}>
      <QueryFailedNote query={settlements} what={t("settlement.what")} />
      {status === "SETTLED" ? <p className="text-xs text-muted-foreground">{t("settlement.lockedNote")}</p> : null}
      {settlements.isLoading ? (
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
      ) : rows.length === 0 && !settlements.isError ? (
        <EmptyNote>{status === "READY" ? t("settlement.emptyReady") : t("settlement.emptySettled")}</EmptyNote>
      ) : rows.length > 0 ? (
        <SettlementRowsTable rows={rows} status={status} onOpen={onOpen} />
      ) : null}
    </section>
  );
}

export function SettlementRowsTable({
  rows,
  status,
  onOpen,
}: {
  rows: readonly DisposalSettlementRow[];
  status: "READY" | "SETTLED";
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("jb287");
  const df = useDateFormat();
  const [expanded, setExpanded] = useState<string | null>(null);
  const settled = status === "SETTLED";
  const columns = settled ? 10 : 8;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.settlementNo")}</TableHead>
            <TableHead>{t("col.project")}</TableHead>
            <TableHead>{t("col.supplier")}</TableHead>
            <TableHead>{t("col.dateRange")}</TableHead>
            <TableHead className="text-right">{t("col.tripTotal")}</TableHead>
            <TableHead className="text-right">{t("col.amountTotal")}</TableHead>
            {settled ? (
              <>
                <TableHead>{t("col.settledBy")}</TableHead>
                <TableHead>{t("col.settledAt")}</TableHead>
              </>
            ) : (
              <TableHead>{t("stage.ready")}</TableHead>
            )}
            <TableHead>{t("col.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const open = expanded === row.id;
            return (
              <Fragment key={row.id}>
                <TableRow data-slot="settlement-row">
                  <TableCell>
                    <button
                      type="button"
                      aria-expanded={open}
                      className="inline-flex items-center gap-1 font-semibold text-primary"
                      data-slot="settlement-expand"
                      title={open ? t("settlement.collapse") : t("settlement.expand")}
                      onClick={() => setExpanded(open ? null : row.id)}
                    >
                      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      {row.number}
                    </button>
                  </TableCell>
                  <TableCell>{row.project.name}</TableCell>
                  <TableCell>{row.supplier.name}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">
                    {df.date(row.date_from)} – {df.date(row.date_to)}
                  </TableCell>
                  <TableCell className="tabular text-right">{t("settlement.tripsValue", { count: row.trip_total })}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{rmText(row.amount_total)}</TableCell>
                  {settled ? (
                    <>
                      <TableCell>{row.settled_by_name || "—"}</TableCell>
                      <TableCell className="tabular whitespace-nowrap">{row.settled_at ? df.dateTime(row.settled_at) : "—"}</TableCell>
                    </>
                  ) : (
                    <TableCell>
                      <PrepareSettleButton row={row} />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" variant="outline" data-slot="settlement-view" onClick={() => onOpen(row.id)}>
                        <Eye className="size-3.5" />
                        {t("settlement.view")}
                      </Button>
                      <SettlementFileButtons row={row} />
                    </div>
                  </TableCell>
                </TableRow>
                {open ? (
                  <TableRow data-slot="settlement-lines-row">
                    <TableCell colSpan={columns} className="bg-muted/30">
                      <SettlementLines id={row.id} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** 预览 · 打印 (准备结算), and 导出 once 结算完毕. */
function SettlementFileButtons({ row }: { row: DisposalSettlementRow }) {
  const t = useTranslations("jb287");
  const locale = useLocale();
  return (
    <FileActionButtons
      className="flex flex-wrap gap-1.5"
      omit={row.status === "SETTLED" ? ["share"] : ["save", "share"]}
      source={{
        load: () => disposalSettlementPdfFile(row.id, locale, row.number),
        title: t("settlement.pdfTitle", { number: row.number }),
        exportedOnServer: true,
        recordKind: "DISPOSAL_SETTLEMENT",
        recordId: row.id,
        project: row.project.id,
      }}
    />
  );
}

/** The jobs in one settlement, frozen at 确认核对; each opens with its photos. */
export function SettlementLines({ id }: { id: string }) {
  const t = useTranslations("jb287");
  const settlement = useQuery({
    queryKey: ["disposal-settlements", "detail", id],
    queryFn: () => getDisposalSettlement(id),
  });
  if (settlement.isError) return <RecordWindowFailure query={settlement} what={t("settlement.what")} />;
  if (!settlement.data) return <Loader2 className="mx-auto size-5 animate-spin text-primary" />;
  return <SettlementLinesTable settlement={settlement.data} />;
}

export function SettlementLinesTable({ settlement }: { settlement: DisposalSettlement }) {
  const t = useTranslations("jb287");
  const df = useDateFormat();
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="space-y-2" data-slot="settlement-lines">
      <p className="text-sm font-medium">{t("settlement.lines", { count: settlement.lines.length })}</p>
      <p className="text-xs text-muted-foreground">{t("settlement.linesHelp")}</p>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.reference")}</TableHead>
              <TableHead>{t("col.clearedOn")}</TableHead>
              <TableHead className="text-right">{t("col.trips")}</TableHead>
              <TableHead className="text-right">{t("col.feePerTrip")}</TableHead>
              <TableHead className="text-right">{t("col.feeAmount")}</TableHead>
              <TableHead className="text-right">{t("col.weight")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlement.lines.map((line) => (
              <TableRow key={line.disposal_id} data-slot="settlement-line">
                <TableCell>
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    data-slot="settlement-open-record"
                    onClick={() => setOpened(line.disposal_id)}
                  >
                    {line.reference_no}
                  </button>
                </TableCell>
                <TableCell className="tabular whitespace-nowrap">{df.date(line.cleared_on)}</TableCell>
                <TableCell className="tabular text-right">{t("settlement.tripsValue", { count: line.trip_count })}</TableCell>
                <TableCell className="tabular text-right">{rmText(line.fee_per_trip)}</TableCell>
                <TableCell className="tabular text-right">{rmText(line.fee_amount)}</TableCell>
                <TableCell className="tabular text-right text-muted-foreground">
                  {line.weight_kg ? t("settlement.weightValue", { weight: line.weight_kg }) : "—"}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">{t("settlement.total")}</TableCell>
              <TableCell className="tabular text-right font-semibold">{t("settlement.tripsValue", { count: settlement.trip_total })}</TableCell>
              <TableCell />
              <TableCell className="tabular text-right font-semibold">{rmText(settlement.amount_total)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {opened ? <DisposalInPlace id={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}

/**
 * 六: 【准备结算】 → the six-digit PIN (checked at once) → 【结算完毕】 → 确认.
 * The PIN that was right goes with the settle call, which the server checks
 * again. Office only; a reader without the right sees it locked, saying why.
 */
export function PrepareSettleButton({ row }: { row: DisposalSettlementRow }) {
  const t = useTranslations("jb287");
  const { can, user } = useAuth();
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  if (user?.is_field_staff) return null;
  if (!mayHandleDisposalFees(user, can)) {
    return (
      <Button size="sm" disabled disabledReason={t("settlement.noRight")} showReason>
        <Lock />
        {t("settlement.prepare")}
      </Button>
    );
  }
  const prepare = async () => {
    setError("");
    setAsking(true);
    try {
      const typed = await signOffBeforeEditing(DISPOSAL_SETTLE_PIN_ACTION);
      if (typed !== null) setPin(typed);
    } catch (reason) {
      if (!isSignOffCancelled(reason)) setError(reason instanceof ApiError ? reason.message : t("settlement.failed"));
    } finally {
      setAsking(false);
    }
  };
  return (
    <>
      <Button size="sm" data-slot="settlement-prepare" title={t("settlement.prepareHint")} disabled={asking} onClick={() => void prepare()}>
        {asking ? <Loader2 className="animate-spin" /> : <HandCoins />}
        {t("settlement.prepare")}
      </Button>
      {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
      {pin !== null ? <SettleDialog row={row} pin={pin} onClose={() => setPin(null)} /> : null}
    </>
  );
}

/** After a right PIN: 【结算完毕】, then 确认. */
export function SettleDialog({ row, pin, onClose }: { row: DisposalSettlementRow; pin: string; onClose: () => void }) {
  const t = useTranslations("jb287");
  const queryClient = useQueryClient();
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState("");
  const settle = useMutation({
    mutationFn: () => settleDisposalSettlement(row.id, pin),
    onSuccess: () => {
      for (const key of DISPOSAL_SETTLEMENT_STALE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
      onClose();
    },
    onError: (reason) => {
      if (isSignOffCancelled(reason)) return;
      setError(reason instanceof ApiError ? reason.message : t("settlement.failed"));
    },
  });
  const facts = {
    number: row.number,
    supplier: row.supplier.name,
    trips: row.trip_total,
    amount: rmText(row.amount_total),
  };
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="settlement-settle-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settlement.settleTitle", { number: row.number })}</DialogTitle>
          <DialogDescription>{asked ? t("settlement.settleAsk", facts) : t("settlement.settleBody", facts)}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={asked ? () => setAsked(false) : onClose}>
            {t("settlement.cancel")}
          </Button>
          {asked ? (
            <Button data-slot="settlement-settle-confirm" disabled={settle.isPending} onClick={() => settle.mutate()}>
              {settle.isPending ? <Loader2 className="animate-spin" /> : <HandCoins />}
              {t("settlement.settleConfirm")}
            </Button>
          ) : (
            <Button data-slot="settlement-settle" onClick={() => setAsked(true)}>
              <HandCoins />
              {t("settlement.settleGo")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 【查看】: the settlement whole - facts, its jobs, the A4 结算单. */
export function DisposalSettlementWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("jb287");
  const df = useDateFormat();
  const settlement = useQuery({
    queryKey: ["disposal-settlements", "detail", id],
    queryFn: () => getDisposalSettlement(id),
  });
  const data = settlement.data;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="disposal-settlement-window" className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{data ? t("settlement.windowTitle", { number: data.number }) : t("tab.settlement")}</DialogTitle>
          <DialogDescription>{data ? `${data.project.name} · ${data.supplier.name}` : t("settlement.resultOnly")}</DialogDescription>
        </DialogHeader>
        {settlement.isError ? <RecordWindowFailure query={settlement} what={t("settlement.what")} /> : null}
        {settlement.isLoading ? <Loader2 className="mx-auto size-6 animate-spin text-primary" /> : null}
        {data ? (
          <div className="space-y-5">
            <SettlementFileButtons row={data} />
            <dl className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3" data-slot="settlement-facts">
              <Fact label={t("col.settlementNo")} value={data.number} />
              <Fact
                label={t("col.status")}
                value={<StatusBadge label={t(`status.${data.status}`)} tone={data.status === "SETTLED" ? "positive" : "info"} />}
              />
              <Fact label={t("col.dateRange")} value={`${df.date(data.date_from)} – ${df.date(data.date_to)}`} />
              <Fact label={t("col.project")} value={data.project.name} />
              <Fact label={t("col.supplier")} value={data.supplier.name} />
              <Fact label={t("col.amountTotal")} value={rmText(data.amount_total)} />
              <Fact label={t("col.checkedBy")} value={`${data.checked_by_name} · ${df.dateTime(data.checked_at)}`} />
              <Fact
                label={t("col.settledBy")}
                value={data.settled_at ? `${data.settled_by_name ?? ""} · ${df.dateTime(data.settled_at)}` : "—"}
              />
            </dl>
            {data.status === "SETTLED" ? <p className="text-xs text-muted-foreground">{t("settlement.lockedNote")}</p> : null}
            <SettlementLinesTable settlement={data} />
            <p className="text-xs text-muted-foreground">{t("settlement.resultOnly")}</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
