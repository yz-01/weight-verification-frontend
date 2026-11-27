"use client";

/**
 * 设备租赁设定 and the 按月 page's rental fees (JB255, 客户 11-24b 事项 2).
 *
 * 「在现有「设备绑定司机」按钮旁边，设置「设备租赁设定」按钮。点击后，采用与设备绑定
 * 司机相同的排列方式，显示供应商、设备编号及设备名称，每台设备右边设置「租赁条件」
 * 按钮。」 「在现有表头「后台修改次数」右边设置以下栏位：基本租金、超时费用、柴油费用、
 * 调整金额、租赁总金额（RM）。」
 *
 * The server works every amount out (``site_operations/equipment_rental.py``)
 * and asks for the six-digit PIN on every write; this screen only shows and
 * sends. A confirmed month is shown as the server kept it.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDollarSign, History, Loader2, Lock, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { money } from "@/components/contractor-ops/company-material-list";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type {
  DieselSupply,
  EquipmentHoursMonthRow,
  RentalMachine,
  RentalMethod,
  RentalTermsValues,
  RentalTotals,
} from "@/interfaces/equipment-hours";
import { useDateFormat } from "@/lib/dates";
import {
  confirmRentalMonth,
  listRentalMachines,
  setRentalMonthAmounts,
  setRentalTerms,
} from "@/services/equipment-rental.service";

export const RENTAL_KEY = "equipment-rental";
export const RENTAL_METHODS: readonly RentalMethod[] = ["HOURLY", "DAILY", "MONTHLY", "YEARLY", "FIXED"];
export const DIESEL_SUPPLIES: readonly DieselSupply[] = ["INCLUDED", "CONTRACTOR", "SUPPLIER_CHARGED"];
/** The five amounts, in the client's order (事项 2 三). */
export const FEE_KEYS = ["base_rent", "overtime_fee", "diesel_fee", "adjustment_amount", "rental_total"] as const;
export type FeeKey = (typeof FEE_KEYS)[number];

/** 「2,680.00」, or 「—」 when 金额查看 is off for the reader. */
export function rentalMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return money(value);
}

type Translate = ReturnType<typeof useTranslations>;

/**
 * One line saying what a machine's terms are: 「按月 · RM 18,000.00 · …」. When
 * the terms changed inside the month or dates (JB288, `pieces`) and `tj` (the
 * `jb288` words) is given: each set with its days, 「2026-09-01 至 2026-09-15：…」.
 */
export function termsSummary(t: Translate, terms: RentalTermsValues, tj?: Translate): string {
  if (tj && terms.pieces && terms.pieces.length > 1) {
    return terms.pieces
      .map((piece) => tj("piece", { from: piece.from, to: piece.to, terms: termsSummary(t, piece.terms) }))
      .join(" / ");
  }
  return termsParts(t, terms).join(" · ");
}

/** The parts of `termsSummary`, one per condition (QA288: 修改记录 compares them). */
export function termsParts(t: Translate, terms: RentalTermsValues): string[] {
  return [
    t(`method.${terms.method}`),
    t("summary.price", { amount: rentalMoney(terms.unit_price) }),
    terms.overtime_rate ? t("summary.overtime", { amount: rentalMoney(terms.overtime_rate) }) : "",
    terms.standard_days ? t("summary.standardDays", { days: terms.standard_days }) : "",
    // QA3 (JB255): the machine's own normal hours split its overtime, so the line says them.
    terms.normal_hours_per_day && Number(terms.normal_hours_per_day) > 0
      ? t("summary.normalHours", { hours: Number(terms.normal_hours_per_day) })
      : "",
    t(`diesel.${terms.diesel_supply}`),
    terms.end_date
      ? t("summary.period", { from: terms.start_date, to: terms.end_date })
      : t("summary.since", { from: terms.start_date }),
  ].filter(Boolean);
}

/** A part of a month in one short line (QA288): 「按月 · 单价 RM 18,000.00 · 超时 RM 120.00/小时」. */
export function pieceSummary(t: Translate, terms: RentalTermsValues): string {
  return termsParts(t, terms).slice(0, terms.overtime_rate ? 3 : 2).join(" · ");
}

/**
 * 修改记录 (QA288): only what changed, 「单价 RM 18,000.00 → 单价 RM 21,000.00」,
 * so an elderly reader does not hunt for it in two long lines; 「—」 for a
 * condition added or removed.
 */
export function changedParts(t: Translate, previous: RentalTermsValues, next: RentalTermsValues): { old: string; new: string } | null {
  const before = termsParts(t, previous);
  const after = termsParts(t, next);
  const gone = before.filter((part) => !after.includes(part));
  const added = after.filter((part) => !before.includes(part));
  if (gone.length === 0 && added.length === 0) return null;
  return { old: gone.join(" · ") || "—", new: added.join(" · ") || "—" };
}

function errorText(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : fallback;
}

// -- 设备租赁设定 ---------------------------------------------------------------

/**
 * 设备租赁设定 - also opened as 【租赁费用设定】 on 设备租赁月结单 (JB288, 客户
 * 11-27b: 「在「设备租赁月结单」页面右上方「生成月结单」旁边设置一个「租赁费用
 * 设定」按钮」): the same list and form, under that page's name. `pickProject`:
 * the page's top bar is on 全部项目, so the window asks for a project first.
 */
export function RentalTermsDialog({
  project,
  onClose,
  title,
  pickProject = false,
}: {
  project: string;
  onClose: () => void;
  title?: string;
  pickProject?: boolean;
}) {
  const t = useTranslations("equipmentRental");
  const tj = useTranslations("jb288");
  const [chosen, setChosen] = useState(project);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" data-testid="rental-terms">
        <DialogHeader>
          <DialogTitle>{title ?? t("title")}</DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        {pickProject && !project ? (
          <FieldWrapper label={tj("project")} required>
            <ProjectPicker value={chosen} placeholder={tj("chooseProject")} onValueChange={setChosen} />
          </FieldWrapper>
        ) : null}
        {pickProject && !chosen ? (
          <p className="text-sm text-muted-foreground" data-testid="rental-terms-choose-project">
            {tj("chooseProjectHelp")}
          </p>
        ) : (
          <RentalTermsBody project={chosen} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RentalTermsBody({ project }: { project: string }) {
  const t = useTranslations("equipmentRental");
  const tj = useTranslations("jb288");
  const df = useDateFormat();
  const query = useQuery({
    queryKey: [RENTAL_KEY, project],
    queryFn: () => listRentalMachines(project),
    enabled: Boolean(project),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const data = query.data;
  return (
    <div className="space-y-3">
      {!project ? <p className="text-sm text-muted-foreground">{t("chooseProject")}</p> : null}
      <QueryFailedNote query={query} what={t("title")} />
      {data && data.without_terms > 0 ? (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium">
          {t("withoutTerms", { count: data.without_terms })}
        </p>
      ) : null}
      {data && data.machines.length === 0 ? <p className="text-sm text-muted-foreground">{t("noMachines")}</p> : null}
      {data && data.machines.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {data.machines.map((machine) => (
            <li key={machine.id} className="space-y-2 p-3" data-testid="rental-machine">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {[machine.supplier_name || t("noSupplier"), t("machineLine", { number: machine.number, name: machine.name })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {machine.terms ? (
                    <p className="text-sm text-muted-foreground">
                      {termsSummary(t, machine.terms)}
                      {machine.terms.effective_from ? ` · ${tj("effectiveShort", { date: machine.terms.effective_from })}` : ""}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-warning">{t("noTerms")}</p>
                  )}
                </div>
                {editing !== machine.id ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {machine.history.length > 0 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowHistory(showHistory === machine.id ? null : machine.id)}
                      >
                        <History />
                        {t("history", { count: machine.history.length })}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setEditing(machine.id)}>
                      <Pencil />
                      {t("open")}
                    </Button>
                  </div>
                ) : null}
              </div>
              {showHistory === machine.id ? (
                <ul className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="rental-history">
                  {/* JB288: each change as 旧 → 新, with who, when and its 生效日期 - newest first. */}
                  {termsChanges(machine).map(({ next, previous }) => (
                    <li key={next.id ?? next.changed_at} className="space-y-0.5" data-testid="rental-history-change">
                      <p className="font-medium">
                        {[
                          t("changedBy", { name: next.changed_by ?? "", time: df.dateTime(next.changed_at ?? "") }),
                          next.effective_from ? tj("effectiveShort", { date: next.effective_from }) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-muted-foreground">
                        {previous
                          ? historyLine(t, tj, previous, next)
                          : tj("firstSet", { terms: termsSummary(t, next) })}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {editing === machine.id ? (
                <RentalTermsForm project={project} machine={machine} onDone={() => setEditing(null)} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface TermsDraft {
  method: RentalMethod;
  unit_price: string;
  standard_days: string;
  normal_hours_per_day: string;
  overtime_rate: string;
  extra_day_rate: string;
  stoppage_terms: string;
  start_date: string;
  end_date: string;
  diesel_supply: DieselSupply;
  remarks: string;
  /** 生效日期 (JB288); "" on a machine's first terms: then it follows 租赁开始日期. */
  effective_from: string;
  /** The machine has no terms yet (QA288: only then may 生效日期 follow 租赁开始日期). */
  first: boolean;
}

/** One 修改记录 line: what changed, 旧 → 新 - or 「条件没有改」 when only the 生效日期 moved. */
function historyLine(t: Translate, tj: Translate, previous: RentalTermsValues, next: RentalTermsValues): string {
  const changed = changedParts(t, previous, next);
  return changed ? tj("oldNew", changed) : tj("noChange");
}

/** 修改记录 (JB288): each saved version with the one before it, newest first. */
export function termsChanges(machine: RentalMachine): { next: RentalTermsValues; previous: RentalTermsValues | null }[] {
  const versions = machine.terms ? [machine.terms, ...machine.history] : [...machine.history];
  return versions.map((next, index) => ({ next, previous: versions[index + 1] ?? null }));
}

function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The form's starting values: the machine's terms, or a blank set. */
export function draftOf(terms: RentalTermsValues | null): TermsDraft {
  return {
    method: terms?.method ?? "MONTHLY",
    unit_price: terms?.unit_price ?? "",
    standard_days: terms?.standard_days ? String(terms.standard_days) : "",
    normal_hours_per_day: terms?.normal_hours_per_day ?? "",
    overtime_rate: terms?.overtime_rate ?? "",
    extra_day_rate: terms?.extra_day_rate ?? "",
    stoppage_terms: terms?.stoppage_terms ?? "",
    start_date: terms?.start_date || today(),
    end_date: terms?.end_date ?? "",
    diesel_supply: terms?.diesel_supply ?? "INCLUDED",
    remarks: terms?.remarks ?? "",
    // JB288: a change counts from today unless another day is chosen; the
    // first terms from the 租赁开始日期 (see `effectiveOf`).
    effective_from: terms ? today() : "",
    first: !terms,
  };
}

/**
 * The 生效日期 the form sends: the one chosen, else - on a machine's first
 * terms only - the 租赁开始日期. QA288: on a change an emptied 生效日期 stays
 * empty (保存 waits for it); falling back to the 租赁开始日期 would quietly
 * re-price every month since the rental began.
 */
export function effectiveOf(draft: TermsDraft): string {
  return draft.effective_from || (draft.first ? draft.start_date : "");
}

function RentalTermsForm({ project, machine, onDone }: { project: string; machine: RentalMachine; onDone: () => void }) {
  const t = useTranslations("equipmentRental");
  const tj = useTranslations("jb288");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TermsDraft>(() => draftOf(machine.terms));
  const [error, setError] = useState("");
  const set = (key: Exclude<keyof TermsDraft, "first">) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      setRentalTerms({
        project,
        equipment: machine.id,
        method: draft.method,
        unit_price: draft.unit_price,
        standard_days: draft.standard_days ? Number(draft.standard_days) : null,
        normal_hours_per_day: draft.normal_hours_per_day || null,
        overtime_rate: draft.overtime_rate || null,
        extra_day_rate: draft.extra_day_rate || null,
        stoppage_terms: draft.stoppage_terms,
        start_date: draft.start_date,
        end_date: draft.end_date || null,
        diesel_supply: draft.diesel_supply,
        remarks: draft.remarks,
        effective_from: effectiveOf(draft) || null,
      }),
    onSuccess: () => {
      setError("");
      void queryClient.invalidateQueries({ queryKey: [RENTAL_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "month"] });
      void queryClient.invalidateQueries({ queryKey: ["rental-statements"] });
      onDone();
    },
    onError: (reason) => setError(errorText(reason, t("failed"))),
  });
  const extraDays = draft.method === "MONTHLY" || draft.method === "YEARLY";
  const field = (key: Exclude<keyof TermsDraft, "first">, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Input value={draft[key]} onChange={(event) => set(key)(event.target.value)} {...props} />
    </label>
  );
  return (
    <fieldset className="space-y-3 rounded-lg border bg-muted/30 p-3" data-testid="rental-terms-form">
      <legend className="sr-only">{t("open")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t("field.method")}
          <Select value={draft.method} onValueChange={(value) => set("method")(value)}>
            <SelectTrigger aria-label={t("field.method")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RENTAL_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {t(`method.${method}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {field("unit_price", t(`field.unitPrice.${draft.method}`), { type: "number", min: 0, step: "0.01", inputMode: "decimal" })}
        {field("standard_days", t("field.standardDays"), { type: "number", min: 1, max: 31, step: 1, inputMode: "numeric" })}
        {field("normal_hours_per_day", t("field.normalHours"), { type: "number", min: 0.5, max: 24, step: "0.5", inputMode: "decimal" })}
        {field("overtime_rate", t("field.overtimeRate"), { type: "number", min: 0, step: "0.01", inputMode: "decimal" })}
        {field("extra_day_rate", t("field.extraDayRate"), {
          type: "number",
          min: 0,
          step: "0.01",
          inputMode: "decimal",
          disabled: !extraDays,
          title: extraDays ? undefined : t("field.extraDayOnly"),
        })}
        {field("start_date", t("field.startDate"), { type: "date" })}
        {field("end_date", t("field.endDate"), { type: "date" })}
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground" data-testid="rental-effective-from">
          {tj("effectiveFrom")}
          <Input type="date" value={effectiveOf(draft)} onChange={(event) => set("effective_from")(event.target.value)} />
          <span className="font-normal">{tj("effectiveHelp")}</span>
        </label>
        {machine.terms && draft.end_date && draft.end_date < effectiveOf(draft) ? (
          // JB288: every condition follows the 生效日期, the end date too.
          <p role="status" className="text-xs font-medium text-warning sm:col-span-2" data-testid="rental-end-before-effective">
            {tj("endBeforeEffective")}
          </p>
        ) : null}
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
          {t("field.diesel")}
          <Select value={draft.diesel_supply} onValueChange={(value) => set("diesel_supply")(value)}>
            <SelectTrigger aria-label={t("field.diesel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIESEL_SUPPLIES.map((supply) => (
                <SelectItem key={supply} value={supply}>
                  {t(`diesel.${supply}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
          {t("field.stoppage")}
          <Textarea value={draft.stoppage_terms} rows={2} onChange={(event) => set("stoppage_terms")(event.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
          {t("field.remarks")}
          <Textarea value={draft.remarks} rows={2} onChange={(event) => set("remarks")(event.target.value)} />
        </label>
      </div>
      <p className="text-sm text-muted-foreground" data-testid="rental-formula">
        {t(`formula.${draft.method}`)} {t("formula.common")}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={save.isPending || !draft.unit_price || !draft.start_date || !effectiveOf(draft)}
          disabledReason={draft.unit_price && draft.start_date && !effectiveOf(draft) ? tj("needEffective") : t("needPriceAndStart")}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {t("save")}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </fieldset>
  );
}

// -- the 按月 table's columns ----------------------------------------------------

/** The five headings right of 「后台修改次数」, then 「租赁金额」 actions. */
export function RentalFeeHeads() {
  const t = useTranslations("equipmentRental");
  return (
    <>
      {FEE_KEYS.map((key) => (
        <TableHead key={key} className="tabular text-right">
          {t(`fee.${key}`)}
        </TableHead>
      ))}
      <TableHead>{t("fee.state")}</TableHead>
    </>
  );
}

export const RENTAL_COLUMN_COUNT = FEE_KEYS.length + 1;

export function RentalFeeCells({
  row,
  canAdjust,
  onAmounts,
}: {
  row: EquipmentHoursMonthRow;
  canAdjust: boolean;
  onAmounts: (row: EquipmentHoursMonthRow) => void;
}) {
  const t = useTranslations("equipmentRental");
  const tj = useTranslations("jb288");
  const df = useDateFormat();
  const pieces = monthPieces(row);
  return (
    <>
      {FEE_KEYS.map((key) => (
        <TableCell
          key={key}
          className={key === "rental_total" ? "tabular text-right font-semibold" : "tabular text-right"}
          title={key === "adjustment_amount" && row.adjustment_reason ? row.adjustment_reason : undefined}
        >
          {row.rental_has_terms ? rentalMoney(row[key]) : "—"}
        </TableCell>
      ))}
      <TableCell>
        {!row.rental_has_terms ? (
          <span className="text-xs font-medium text-warning">{t("noTermsShort")}</span>
        ) : row.rental_confirmed ? (
          <span className="flex flex-col gap-0.5">
            <StatusBadge label={t("confirmed")} tone="positive" />
            <span className="text-xs text-muted-foreground">
              {t("confirmedBy", { name: row.rental_confirmed_by ?? "", time: df.dateTime(row.rental_confirmed_at ?? "") })}
            </span>
          </span>
        ) : canAdjust ? (
          <Button size="sm" variant="outline" onClick={() => onAmounts(row)}>
            <CircleDollarSign />
            {t("amounts.open")}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("notConfirmed")}</span>
        )}
        {/* JB288: the price changed inside the month - each part priced with its own terms. */}
        {pieces ? (
          <span className="mt-1 block text-xs text-muted-foreground" data-testid="rental-month-pieces">
            {tj("monthPieces", { count: pieces.length })}
            {pieces.map((piece) => (
              <span key={piece.from} className="block">
                {tj("piece", {
                  from: piece.from,
                  to: piece.to,
                  terms: `${pieceSummary(t, piece.terms)}${piece.base_rent ? ` · ${tj("pieceRent", { amount: rentalMoney(piece.base_rent) })}` : ""}`,
                })}
              </span>
            ))}
          </span>
        ) : null}
      </TableCell>
    </>
  );
}

/** The parts of a month priced with different terms (JB288), or null. */
export function monthPieces(row: EquipmentHoursMonthRow) {
  const terms = row.rental_terms;
  const pieces = terms && "pieces" in terms ? terms.pieces : undefined;
  return pieces && pieces.length > 1 ? pieces : null;
}

export function RentalTotalCells({ totals }: { totals: RentalTotals | undefined }) {
  return (
    <>
      {FEE_KEYS.map((key) => (
        <TableCell key={key} className="tabular text-right font-semibold">
          {totals ? rentalMoney(totals[key]) : ""}
        </TableCell>
      ))}
      <TableCell />
    </>
  );
}

/** The 按月 export's rental columns, after 「后台修改次数」. */
export function rentalExportColumns(t: Translate): { key: FeeKey; label: string }[] {
  return FEE_KEYS.map((key) => ({ key, label: t(`fee.${key}`) }));
}

// -- 柴油费用 / 调整金额 -------------------------------------------------------------

export function RentalAmountsDialog({
  row,
  month,
  onClose,
}: {
  row: EquipmentHoursMonthRow;
  month: string;
  onClose: () => void;
}) {
  const t = useTranslations("equipmentRental");
  const queryClient = useQueryClient();
  const terms = row.rental_terms as RentalTermsValues | undefined;
  const supplierDiesel = terms?.diesel_supply === "SUPPLIER_CHARGED";
  const [diesel, setDiesel] = useState(row.diesel_fee && Number(row.diesel_fee) ? String(row.diesel_fee) : "");
  const [adjustment, setAdjustment] = useState(
    row.adjustment_amount && Number(row.adjustment_amount) ? String(row.adjustment_amount) : "",
  );
  const [reason, setReason] = useState(row.adjustment_reason ?? "");
  const [error, setError] = useState("");
  const needsReason = Boolean(adjustment && Number(adjustment) !== 0 && !reason.trim());
  const save = useMutation({
    mutationFn: () =>
      setRentalMonthAmounts({
        project: row.project,
        equipment: row.equipment,
        month,
        ...(supplierDiesel ? { diesel_fee: diesel || "0" } : {}),
        adjustment: adjustment || "0",
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "month"] });
      onClose();
    },
    onError: (reason) => setError(errorText(reason, t("failed"))),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="rental-amounts">
        <DialogHeader>
          <DialogTitle>{t("amounts.title", { name: row.equipment_name, month })}</DialogTitle>
          <DialogDescription>{t("amounts.help")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {supplierDiesel ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("amounts.diesel")}
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={diesel} onChange={(event) => setDiesel(event.target.value)} />
            </label>
          ) : (
            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              {t("amounts.noDiesel", { supply: t(`diesel.${terms?.diesel_supply ?? "INCLUDED"}`) })}
            </p>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("amounts.adjustment")}
            <Input type="number" step="0.01" inputMode="decimal" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("amounts.reason")}
            <Textarea value={reason} rows={2} placeholder={t("amounts.reasonPlaceholder")} onChange={(event) => setReason(event.target.value)} />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={save.isPending || needsReason} disabledReason={t("amounts.needReason")} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- 确认本月金额 ----------------------------------------------------------------------

/** The rows 【确认本月金额】 would confirm: with terms, not confirmed yet. */
export function rowsToConfirm(rows: readonly EquipmentHoursMonthRow[]): EquipmentHoursMonthRow[] {
  return rows.filter((row) => row.rental_has_terms && !row.rental_confirmed);
}

export function ConfirmRentalMonthButton({
  project,
  month,
  rows,
}: {
  project: string;
  month: string;
  rows: readonly EquipmentHoursMonthRow[];
}) {
  const t = useTranslations("equipmentRental");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const pending = rowsToConfirm(rows);
  const incomplete = pending.reduce((sum, row) => sum + (row.incomplete_count || 0), 0);
  const confirm = useMutation({
    mutationFn: () => confirmRentalMonth({ project, month, equipment: pending.map((row) => row.equipment) }),
    onSuccess: () => {
      setOpen(false);
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["equipment-hours", "month"] });
    },
    onError: (reason) => setError(errorText(reason, t("failed"))),
  });
  return (
    <>
      <Button
        variant="outline"
        disabled={!project || !month || pending.length === 0}
        disabledReason={!project ? t("chooseProject") : t("confirm.nothing")}
        onClick={() => setOpen(true)}
      >
        <Lock />
        {t("confirm.open")}
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent className="sm:max-w-lg" data-testid="rental-confirm">
            <DialogHeader>
              <DialogTitle>{t("confirm.title", { month })}</DialogTitle>
              <DialogDescription>{t("confirm.help", { count: pending.length })}</DialogDescription>
            </DialogHeader>
            {incomplete > 0 ? (
              <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium">
                {t("confirm.incomplete", { count: incomplete })}
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>
                {confirm.isPending ? <Loader2 className="animate-spin" /> : <Lock />}
                {t("confirm.do")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
