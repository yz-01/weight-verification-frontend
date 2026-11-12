"use client";

/**
 * 公司通用分类 › 一个材料一页填完 (JB181, 客户 11-12 追加 5).
 *
 * 「请参考现有『项目专属分类』的材料管理方式，完善材料名称、规格、单位、供应商关联
 * 及单价管理」「新增或编辑时，所有资料在同一个页面一次性填写完成，包括多个规格、对应
 * 供应商及各自单价，最后统一保存，不要分开多个窗口操作」.
 *
 * Not a dialog: the list makes way for this page (【← 返回列表】 on top), and
 * one 【保存】 at the bottom sends everything at once (`save_material`): the
 * material, its specifications - added, renamed, switched off, removed - and
 * each row's suppliers and unit price. The first row of the table is fixed,
 * 「整个材料」: the price a specification without its own uses, as in the
 * project's 【单价】 window.
 *
 * Prices as the project's (JB167): a price once set is changed, never
 * cleared; one effective day for every price of the save, asked only when a
 * price was typed or changed; the six-digit sign-off PIN once for such a
 * save (the server asks; `api-client` opens the dialog). A reader without
 * 金额查看 sees no price box at all.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { isValidUnitPrice } from "@/components/contractor-ops/material-prices";
import { money, SuppliersText } from "@/components/contractor-ops/company-material-list";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { MultiPickList } from "@/components/shared/multi-pick-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { useSeesAmounts } from "@/hooks/use-sees-amounts";
import { ApiError } from "@/interfaces/api";
import type { CompanyCategory, CompanyMaterialPayload, MaterialPriceSummary } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { isSignOffCancelled } from "@/lib/sign-off";
import { getSuppliers } from "@/services/contractor.service";
import {
  deleteCompanyCategory,
  getCompanyPriceHistory,
  saveCompanyMaterial,
} from "@/services/contractor-ops.service";

/** One row of 「规格、供应商和单价」: 「整个材料」 or a specification. */
export interface PriceRow {
  /** 「whole」 for 「整个材料」; a specification's id, or a new row's own key. */
  key: string;
  id?: string;
  name: string;
  unit: string;
  active: boolean;
  suppliers: { id: string; name: string }[];
  /** As typed. */
  price: string;
  /** What the box started with: the price in force today. */
  initialPrice: string;
  summary?: MaterialPriceSummary | null;
}

export interface MaterialForm {
  id?: string;
  name: string;
  description: string;
  unit: string;
  active: boolean;
  whole: PriceRow;
  specs: PriceRow[];
  /** Specifications of the material removed on this page; gone on 【保存】. */
  removed: string[];
  effectiveFrom: string;
}

let lastKey = 0;
const newKey = () => `new-${(lastKey += 1)}`;

/** Today on this computer, as a date box wants it. */
export function todayText(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const priceNow = (summary?: MaterialPriceSummary | null) => summary?.current?.unit_price ?? "";

export function blankSpec(unit: string): PriceRow {
  return { key: newKey(), name: "", unit, active: true, suppliers: [], price: "", initialPrice: "" };
}

/** The page for ``row`` (none: a new material); 【＋ 规格】 adds a blank row waiting (做法 4). */
export function formOf(
  row: CompanyCategory | null,
  { addSpec = false, today = todayText() }: { addSpec?: boolean; today?: string } = {},
): MaterialForm {
  const unit = row?.default_unit ?? "";
  const specs: PriceRow[] = (row?.specs ?? []).map((spec) => ({
    key: spec.id,
    id: spec.id,
    name: spec.name,
    unit: spec.default_unit,
    active: spec.is_active,
    suppliers: spec.suppliers ?? [],
    price: priceNow(spec.price),
    initialPrice: priceNow(spec.price),
    summary: spec.price,
  }));
  return {
    id: row?.id,
    name: row?.name ?? "",
    description: row?.description ?? "",
    unit,
    active: row?.is_active ?? true,
    whole: {
      key: "whole",
      id: row?.id,
      name: row?.name ?? "",
      unit,
      active: true,
      suppliers: row?.suppliers ?? [],
      price: priceNow(row?.price),
      initialPrice: priceNow(row?.price),
      summary: row?.price,
    },
    specs: addSpec ? [...specs, blankSpec(unit)] : specs,
    removed: [],
    effectiveFrom: today,
  };
}

const plain = (value: string) => value.replace(/,/g, "").trim();

/** A price typed or changed on this page: what the PIN and the effective day are for. */
export function priceChanged(row: PriceRow): boolean {
  const typed = plain(row.price);
  if (!typed || !isValidUnitPrice(typed)) return false;
  return !row.initialPrice || Number(typed) !== Number(row.initialPrice);
}

export const changedPrices = (form: MaterialForm): PriceRow[] =>
  [form.whole, ...form.specs].filter(priceChanged);

export type RowProblem = "specNameMissing" | "specNameTwice" | "priceRule" | "priceCleared";

/** What is not right yet, row by row - said under the row before anything is sent. */
export function rowProblems(form: MaterialForm, seesAmounts: boolean): Record<string, RowProblem> {
  const problems: Record<string, RowProblem> = {};
  const seen = new Set<string>();
  for (const spec of form.specs) {
    const name = spec.name.trim().replace(/\s+/g, " ").toLowerCase();
    if (!name) problems[spec.key] = "specNameMissing";
    else if (seen.has(name)) problems[spec.key] = "specNameTwice";
    seen.add(name);
  }
  if (seesAmounts) {
    for (const row of [form.whole, ...form.specs]) {
      if (problems[row.key]) continue;
      const typed = plain(row.price);
      if (!typed && row.initialPrice) problems[row.key] = "priceCleared";
      else if (typed && !isValidUnitPrice(typed)) problems[row.key] = "priceRule";
    }
  }
  return problems;
}

/** What 【保存】 sends: everything, a price only where it was typed or changed. */
export function payloadOf(form: MaterialForm, seesAmounts: boolean): CompanyMaterialPayload {
  const price = (row: PriceRow) => (seesAmounts && priceChanged(row) ? plain(row.price) : "");
  const changed = seesAmounts && changedPrices(form).length > 0;
  return {
    ...(form.id ? { id: form.id } : {}),
    name: form.name.trim(),
    description: form.description.trim(),
    default_unit: form.unit,
    is_active: form.active,
    suppliers: form.whole.suppliers.map((supplier) => supplier.id),
    unit_price: price(form.whole),
    specs: form.specs.map((spec) => ({
      ...(spec.id ? { id: spec.id } : {}),
      name: spec.name.trim(),
      default_unit: spec.unit,
      is_active: spec.active,
      suppliers: spec.suppliers.map((supplier) => supplier.id),
      unit_price: price(spec),
    })),
    removed_specs: form.removed,
    ...(changed ? { effective_from: form.effectiveFrom } : {}),
  };
}

/** The row a refusal names (`specs.2.name`, `unit_price`), to mark it red. */
export function rowOfError(errors: Record<string, string>, form: MaterialForm): string | null {
  for (const key of Object.keys(errors)) {
    const match = /^specs\.(\d+)/.exec(key);
    if (match) return form.specs[Number(match[1])]?.key ?? null;
    if (key === "unit_price" || key === "suppliers") return "whole";
  }
  return null;
}

export function CompanyMaterialForm({
  row,
  addSpec = false,
  onBack,
  onSaved,
}: {
  row: CompanyCategory | null;
  addSpec?: boolean;
  onBack: () => void;
  /** The material saved (its id), or removed (null). */
  onSaved: (id: string | null) => void;
}) {
  const t = useTranslations("categoryManagement");
  const prices = useTranslations("materialPrices");
  const seesAmounts = useSeesAmounts();
  const unitName = useUnitName();
  const qc = useQueryClient();
  // query-failure: the unit list stays at the units already chosen; the name and specifications still save
  const units = useMaterialUnits();
  const [form, setForm] = useState<MaterialForm>(() => formOf(row, { addSpec }));
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [badRow, setBadRow] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  const changed = seesAmounts ? changedPrices(form) : [];
  const problems = rowProblems(form, seesAmounts);
  const hasProblems = Object.keys(problems).length > 0;
  const dateLabel = t("company.form.pricesChanged", { count: changed.length });
  const unitOptions = [
    ...(units.data ?? []).map((option) => ({ code: option.code, label: unitName(option.code, option.label) })),
  ];
  const unitChoices = (current: string) =>
    current && !unitOptions.some((option) => option.code === current)
      ? [...unitOptions, { code: current, label: unitName(current) }]
      : unitOptions;

  const setRow = (key: string, change: Partial<PriceRow>) => {
    setBadRow(null);
    setForm((current) =>
      key === "whole"
        ? { ...current, whole: { ...current.whole, ...change } }
        : { ...current, specs: current.specs.map((spec) => (spec.key === key ? { ...spec, ...change } : spec)) },
    );
  };
  const removeRow = (spec: PriceRow) =>
    setForm((current) => ({
      ...current,
      specs: current.specs.filter((other) => other.key !== spec.key),
      removed: spec.id ? [...current.removed, spec.id] : current.removed,
    }));

  const save = useMutation({
    mutationFn: () => saveCompanyMaterial(payloadOf(form, seesAmounts)),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["company-price-history"] });
      onSaved(saved.id);
    },
    onError: (reason) => {
      if (isSignOffCancelled(reason)) return;
      setError(reason instanceof ApiError ? reason.message : t("saveFailed"));
      setBadRow(reason instanceof ApiError ? rowOfError(reason.errors, form) : null);
    },
  });
  const removal = useMutation({
    mutationFn: () => deleteCompanyCategory(row!.id),
    onSuccess: () => onSaved(null),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("saveFailed")),
  });

  const rows: PriceRow[] = [form.whole, ...form.specs];
  const columns = seesAmounts ? 6 : 5;

  return (
    <section className="surface-panel flex min-w-0 flex-col gap-4 rounded-xl p-4 sm:p-6">
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          {t("company.form.back")}
        </Button>
      </div>
      <header className="flex flex-col gap-1">
        <h2 className="panel-title">
          {row ? t("company.form.editTitle", { name: row.name }) : t("company.form.newTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("company.codeAuto")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper label={t("company.form.name")} required>
          <Input
            value={form.name}
            maxLength={150}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </FieldWrapper>
        <FieldWrapper label={t("company.description")} hint={t("company.descriptionHint")}>
          <Input
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
        </FieldWrapper>
        <FieldWrapper label={t("company.unit")} required>
          <Select
            value={form.unit || undefined}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                unit: value,
                // A specification still on the material's unit follows it.
                specs: current.specs.map((spec) => (spec.unit === current.unit ? { ...spec, unit: value } : spec)),
              }))
            }
          >
            <SelectTrigger className="w-full" aria-label={t("company.unit")}>
              <SelectValue placeholder={t("company.form.chooseUnit")} />
            </SelectTrigger>
            <SelectContent>
              {unitChoices(form.unit).map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <label className="flex min-h-10 items-center justify-between gap-3 self-end rounded-lg border px-3 py-2 text-sm">
          <span>
            {t("active")}
            <span className="block text-xs text-muted-foreground">{t("company.activeHint")}</span>
          </span>
          <Switch
            checked={form.active}
            onCheckedChange={(active) => setForm((current) => ({ ...current, active }))}
            aria-label={t("active")}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t("company.form.table")}</h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("company.form.specName")}</TableHead>
                <TableHead>{t("company.unit")}</TableHead>
                <TableHead>{t("company.col.suppliers")}</TableHead>
                {seesAmounts && <TableHead>{t("company.form.price")}</TableHead>}
                <TableHead>{t("active")}</TableHead>
                <TableHead>{t("column.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((line, index) => {
                const whole = line.key === "whole";
                const problem = problems[line.key];
                const label = whole ? t("company.form.wholeMaterial") : line.name || t("company.form.rowNumber", { row: index });
                const hasHistory = Boolean(line.id && (line.summary?.current || line.summary?.upcoming.length));
                const red = problem || badRow === line.key;
                return [
                  <TableRow key={line.key} className={red ? "bg-destructive/5" : whole ? "bg-muted/30" : undefined}>
                    <TableCell className="align-top">
                      {whole ? (
                        <div className="max-w-56 whitespace-normal">
                          <p className="font-medium">{t("company.form.wholeMaterial")}</p>
                          <p className="text-xs text-muted-foreground">{t("company.form.wholeMaterialHint")}</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Input
                            value={line.name}
                            maxLength={150}
                            className="w-40"
                            aria-label={t("company.form.specNameOf", { row: index })}
                            aria-invalid={problem === "specNameMissing" || problem === "specNameTwice" || undefined}
                            onChange={(event) => setRow(line.key, { name: event.target.value })}
                          />
                          {(problem === "specNameMissing" || problem === "specNameTwice") && (
                            <p className="text-xs text-destructive">{t(`company.form.${problem}`)}</p>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {whole ? (
                        form.unit ? unitName(form.unit) : "—"
                      ) : (
                        <Select value={line.unit || form.unit || undefined} onValueChange={(unit) => setRow(line.key, { unit })}>
                          <SelectTrigger className="w-32" aria-label={`${t("company.unit")} · ${label}`}>
                            <SelectValue placeholder={t("company.form.chooseUnit")} />
                          </SelectTrigger>
                          <SelectContent>
                            {unitChoices(line.unit || form.unit).map((option) => (
                              <SelectItem key={option.code} value={option.code}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <SupplierPick
                        value={line.suppliers}
                        label={`${t("company.col.suppliers")} · ${label}`}
                        onChange={(suppliers) => setRow(line.key, { suppliers })}
                      />
                    </TableCell>
                    {seesAmounts && (
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            className="w-32"
                            value={line.price}
                            placeholder={whole ? prices("none") : prices("usesMaterial")}
                            aria-label={`${t("company.form.price")} · ${label}`}
                            aria-invalid={problem === "priceRule" || problem === "priceCleared" || undefined}
                            onChange={(event) => setRow(line.key, { price: event.target.value })}
                          />
                          {(line.summary?.upcoming ?? []).map((next) => (
                            <UpcomingLine key={next.id} price={next.unit_price} unit={next.unit} day={next.effective_from} />
                          ))}
                          {(problem === "priceRule" || problem === "priceCleared") && (
                            <p className="text-xs text-destructive">
                              {problem === "priceRule" ? prices("priceRule") : t("company.form.priceCleared")}
                            </p>
                          )}
                          {hasHistory && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-expanded={historyOf === line.key}
                              onClick={() => setHistoryOf((open) => (open === line.key ? null : line.key))}
                            >
                              <History />
                              {prices("history")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="align-top">
                      {whole ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Switch
                          checked={line.active}
                          onCheckedChange={(active) => setRow(line.key, { active })}
                          aria-label={`${t("active")} · ${label}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {whole ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeRow(line)}>
                          <X />
                          {t("company.form.remove")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>,
                  historyOf === line.key && line.id ? (
                    <TableRow key={`${line.key}-history`}>
                      <TableCell colSpan={columns} className="bg-muted/20">
                        <InlineHistory category={line.id} unit={line.unit || form.unit} />
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })}
            </TableBody>
          </Table>
        </div>
        <div>
          <Button variant="outline" onClick={() => setForm((current) => ({ ...current, specs: [...current.specs, blankSpec(current.unit)] }))}>
            <Plus />
            {t("company.form.addRow")}
          </Button>
        </div>
      </div>

      {/* 「这次填了 / 改了 N 个单价。从哪一天开始用？」 - only when a price was typed or changed. */}
      {changed.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-3 sm:max-w-md">
          <FieldWrapper label={dateLabel} required>
            <Input
              type="date"
              value={form.effectiveFrom}
              aria-label={dateLabel}
              onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))}
            />
          </FieldWrapper>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <footer className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        {row ? (
          <div className="flex items-center gap-2" title={t("company.removeHint")}>
            <Switch checked={armed} onCheckedChange={setArmed} aria-label={t("company.armRemove", { name: row.name })} />
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={!armed || removal.isPending}
              disabledReason={armed ? undefined : t("armFirst")}
              onClick={() => removal.mutate()}
            >
              <Trash2 />
              {t("company.remove")}
            </Button>
          </div>
        ) : (
          <span />
        )}
        <Button
          requires={[
            [form.name.trim(), t("company.form.name")],
            [form.unit, t("company.unit")],
            [changed.length === 0 || form.effectiveFrom, dateLabel],
          ]}
          disabled={save.isPending || hasProblems}
          disabledReason={hasProblems ? t("company.form.fixRows") : undefined}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t("company.form.save")}
        </Button>
      </footer>
    </section>
  );
}

function UpcomingLine({ price, unit, day }: { price: string | null; unit: string; day: string }) {
  const prices = useTranslations("materialPrices");
  const unitName = useUnitName();
  const when = useDateFormat();
  return (
    <p className="text-xs text-warning">
      {prices("upcoming", { price: money(price), unit: unitName(unit), date: when.date(day) })}
    </p>
  );
}

/** Pick several from the company's supplier list - the project material dialog's picker. */
function SupplierPick({
  value,
  label,
  onChange,
}: {
  value: { id: string; name: string }[];
  label: string;
  onChange: (next: { id: string; name: string }[]) => void;
}) {
  const t = useTranslations("categoryManagement");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const choices = useQuery({
    queryKey: ["suppliers", "company-category", search],
    queryFn: () => getSuppliers({ page_size: 100, sort_by: "name", ...(search ? { search } : {}) }),
    enabled: open,
  });
  const chosen = new Set(value.map((supplier) => supplier.id));
  const options = (choices.data?.results ?? [])
    .filter((option) => option.is_active || chosen.has(option.id))
    .map((option) => ({ id: option.id, name: option.name }));
  const names: Record<string, string> = Object.fromEntries(value.map((supplier) => [supplier.id, supplier.name]));
  for (const option of options) names[option.id] = option.name;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={label}
          className="h-auto min-h-8 max-w-56 justify-start py-1 text-left whitespace-normal"
        >
          {value.length ? <SuppliersText suppliers={value} /> : t("company.form.chooseSuppliers")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <MultiPickList
          selected={value.map((supplier) => supplier.id)}
          onChange={(ids) => onChange(ids.map((id) => ({ id, name: names[id] ?? "" })))}
          options={options}
          knownNames={names}
          search={search}
          onSearch={setSearch}
          searchPlaceholder={t("material.search")}
          ariaLabel={label}
        />
        <QueryFailedNote query={choices} what={t("company.col.suppliers")} />
      </PopoverContent>
    </Popover>
  );
}

/** 价格历史 under its row, not in a window: 生效日期｜旧价格 → 新价格｜谁｜什么时间. */
function InlineHistory({ category, unit }: { category: string; unit: string }) {
  const prices = useTranslations("materialPrices");
  const when = useDateFormat();
  const unitName = useUnitName();
  const history = useQuery({
    queryKey: ["company-price-history", category],
    queryFn: () => getCompanyPriceHistory(category),
  });
  const rows = history.data?.results ?? [];
  return (
    <div className="space-y-2">
      <QueryFailedNote query={history} what={prices("history")} />
      {history.isLoading ? (
        <p className="text-sm text-muted-foreground">{prices("loading")}</p>
      ) : rows.length === 0 ? (
        !history.isError && <p className="text-sm text-muted-foreground">{prices("historyEmpty")}</p>
      ) : (
        <Table fit>
          <TableHeader>
            <TableRow>
              <TableHead>{prices("col.from")}</TableHead>
              <TableHead>{`${prices("col.oldPrice")} → ${prices("col.newPrice")}`}</TableHead>
              <TableHead>{prices("col.by")}</TableHead>
              <TableHead>{prices("col.at")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => {
              const name = unitName(entry.unit || unit);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">{when.date(entry.effective_from)}</TableCell>
                  <TableCell className="tabular-nums">
                    {entry.previous_price ? prices("perUnit", { price: money(entry.previous_price), unit: name }) : "—"}
                    {" → "}
                    <span className="font-medium">{prices("perUnit", { price: money(entry.unit_price), unit: name })}</span>
                  </TableCell>
                  <TableCell>{entry.created_by_name || "—"}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{when.dateTime(entry.created_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
