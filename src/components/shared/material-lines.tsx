"use client";

/**
 * 「材料明细」 (J35): the materials of one MI or one MR, shared by both.
 *
 * The client (10-22): 「后台MI 给它加一个填写框+增加材料跟规格，因为有时候一张DO来货
 * 里面有三种材料，不同规格……MR也是需要申请几种材料」, and 「MI 与 MR 尽量共用相同的
 * 多材料明细设计」. One editor, one table, one chip:
 *
 * - `MaterialLinesEditor` - each line picks its material and specification
 *   from the project's material data (I19); 「其他材料」 and 「其他」 are typed
 *   (J14); the unit comes with the specification. 「+ 增加材料」 adds a line.
 *   Office only: the phone still files one material.
 * - `MaterialLinesTable` - the lines, read-only, on a record's page.
 * - `MaterialLinesChip` - 「3 种材料」 on a list row, the lines on a press.
 */

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Layers, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { OptionCombobox, type ComboOption } from "@/components/material-requests/option-combobox";
import { FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnitName } from "@/hooks/use-material-units";
import { useDateFormat } from "@/lib/dates";
import { categoryManagementLink, isOtherMaterial, materialOption, offeredSpecs } from "@/lib/material-catalogue";
import {
  changesWhatIsPriced,
  emptyLine,
  lineProblems,
  listPriceFor,
  resolveLine,
  withListPrice,
  type CatalogueRow,
  type LinePrice,
  type MaterialLineDraft,
} from "@/lib/material-lines";
import { getMaterialCatalogue } from "@/services/material-request.service";

/**
 * The project's material data, read once for the editor and its form. With
 * a delivery (JB275): each material and specification carries its unit price
 * on that delivery's day, so a form shows it as soon as a material is chosen.
 */
export function useMaterialCatalogue(project: string, receipt?: string) {
  return useQuery({
    queryKey: ["material-catalogue", project, receipt ?? ""],
    queryFn: () => getMaterialCatalogue(project, receipt),
    enabled: Boolean(project),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** A line as the read-only table and the chip show it. */
export interface ShownMaterialLine {
  position: number;
  material_name: string;
  specification: string;
  quantity: string | null;
  unit: string;
  unit_label?: string | null;
  unit_price?: string | null;
  amount?: string | null;
}

/**
 * 成本 = 数量 × 单价 of one line (JB167, 客户 11-11 第 2 点) - the figure the cost
 * report and 材料分类's 花费 add up (`receiving/costs.py`) - to two decimals with
 * thousands separators; ``null`` when either is missing. Worked in whole
 * thousandths × cents so no float rounding creeps in.
 */
export function lineCost(quantity?: string | null, unitPrice?: string | null): string | null {
  const scaled = (value: string | null | undefined, places: number): bigint | null => {
    const text = String(value ?? "").replace(/,/g, "").trim();
    const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) return null;
    const fraction = (match[2] ?? "").padEnd(places, "0");
    if (fraction.length > places) return null;
    return BigInt(match[1] + fraction);
  };
  const qty = scaled(quantity, 3);
  const price = scaled(unitPrice, 2);
  if (qty === null || price === null || price === BigInt(0)) return null;
  const sen = (qty * price + BigInt(500)) / BigInt(1000); // thousandths × cents → cents, half up
  const whole = (sen / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(sen % BigInt(100)).toString().padStart(2, "0")}`;
}

/** The materials of a record, one row each (J35). */
export function MaterialLinesTable({
  lines,
  money = false,
}: {
  lines: readonly ShownMaterialLine[];
  /** Unit price and amount columns (a delivery's DO). */
  money?: boolean;
}) {
  const t = useTranslations("materialLines");
  const unitName = useUnitName();
  return (
    <Table data-material-lines>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>{t("material")}</TableHead>
          <TableHead>{t("specification")}</TableHead>
          <TableHead className="text-right">{t("quantity")}</TableHead>
          {money && <TableHead className="text-right">{t("unitPrice")}</TableHead>}
          {money && <TableHead className="text-right">{t("cost")}</TableHead>}
          {money && <TableHead className="text-right">{t("amount")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.position}>
            <TableCell className="text-muted-foreground tabular">{line.position}</TableCell>
            <TableCell className="font-medium">{line.material_name || "—"}</TableCell>
            <TableCell>{line.specification || "—"}</TableCell>
            <TableCell className="text-right tabular whitespace-nowrap">
              {line.quantity ?? "—"} {unitName(line.unit, line.unit_label ?? null)}
            </TableCell>
            {money && <TableCell className="text-right tabular">{line.unit_price || "—"}</TableCell>}
            {money && (
              <TableCell className="text-right tabular">{lineCost(line.quantity, line.unit_price) ?? "—"}</TableCell>
            )}
            {money && <TableCell className="text-right tabular">{line.amount || "—"}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** 「3 种材料」 on a list row; pressed, the lines (J35). Nothing for one material. */
export function MaterialLinesChip({ lines }: { lines: readonly ShownMaterialLine[] }) {
  const t = useTranslations("materialLines");
  if (lines.length < 2) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-info/40 bg-info/10 px-1.5 py-0.5 text-xs font-medium text-info"
          onClick={(event) => event.stopPropagation()}
          data-material-lines-chip
        >
          <Layers className="size-3" />
          {t("count", { count: lines.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))]" onClick={(event) => event.stopPropagation()}>
        <p className="mb-2 text-sm font-semibold">{t("title")}</p>
        <MaterialLinesTable lines={lines} />
      </PopoverContent>
    </Popover>
  );
}

type Problem = ReturnType<typeof lineProblems>[number];

/**
 * The words under a line's 单价 box (JB275): where the price came from, or
 * why 材料分类 gave none - so the link between 材料分类 and the record can be
 * checked on the form itself (客户 11-26 事项 2: 「请检查分类管理与材料进场记录
 * 之间的单价数据关联是否正常」).
 */
export function usePriceHint() {
  const t = useTranslations("materialLines");
  const jb = useTranslations("jb275");
  const unitName = useUnitName();
  const when = useDateFormat();
  return (found: LinePrice, unitPrice: string, typed = false): string => {
    if (typed) return jb("priceTyped");
    if (!found.known) return t("unitPriceHint");
    const listed = found.listed;
    const shown = listed ? { price: listed.unit_price, unit: unitName(listed.unit, listed.unit_label || null) } : null;
    if (found.price && unitPrice === found.price && shown) return jb("priceFromList", shown);
    if (found.why === "unit" && shown) return jb("priceOtherUnit", shown);
    if (found.why === "later" && listed) return jb("priceLater", { date: when.date(listed.effective_from) });
    if (found.why === "none") return jb("priceNone");
    if (unitPrice.trim()) return jb("priceTyped");
    return found.why === null && !found.price ? jb("pickFirst") : t("unitPriceHint");
  };
}

/**
 * The lines, editable (J35). Controlled: ``lines`` and ``onChange``. The
 * first line can be kept from removal (a delivery's own material).
 */
export function MaterialLinesEditor({
  project,
  lines,
  onChange,
  money = false,
  keepFirst = false,
  showProblems = false,
  storedIds = [],
  readOnlyFirst = false,
  receipt,
}: {
  project: string;
  lines: readonly MaterialLineDraft[];
  onChange: (lines: MaterialLineDraft[]) => void;
  money?: boolean;
  keepFirst?: boolean;
  /** Every line says what it still needs, started or not. */
  showProblems?: boolean;
  /** Lines already stored: a switched-off material stays as it was. */
  storedIds?: readonly string[];
  /** Line 1 shown, not edited - the form around it edits it (J35). */
  readOnlyFirst?: boolean;
  /** The delivery these lines are on: its day decides the unit prices shown (JB275). */
  receipt?: string;
}) {
  const t = useTranslations("materialLines");
  const unitName = useUnitName();
  const priceHint = usePriceHint();
  const catalogue = useMaterialCatalogue(project, receipt);
  const materials: CatalogueRow[] = catalogue.data?.materials ?? [];
  const canSetUp = Boolean(catalogue.data?.can_manage_categories);

  // Another material, specification or unit (JB275, 客户 11-26 事项 16): the
  // price box shows that material's price at once, or empties - never keeps
  // the old material's price.
  const update = (key: string, patch: Partial<MaterialLineDraft>) =>
    onChange(
      lines.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        return money && changesWhatIsPriced(patch) ? withListPrice(next, materials) : next;
      }),
    );
  const remove = (key: string) => onChange(lines.filter((line) => line.key !== key));

  return (
    <div className="space-y-3" data-material-lines-editor>
      {catalogue.isError && <LoadFailed what={t("materialData")} onRetry={() => void catalogue.refetch()} />}
      {catalogue.isSuccess && materials.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
          <span>{t("notSetUp")}</span>
          {canSetUp && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.open(categoryManagementLink(project), "_blank", "noopener")}
            >
              <ExternalLink className="size-4" />
              {t("goToCategories")}
            </Button>
          )}
        </div>
      )}
      {lines.map((line, index) => {
        const resolved = resolveLine(line, materials);
        const stored = Boolean(line.id && storedIds.includes(line.id));
        // What a line still needs, once somebody has started it (a new,
        // untouched line is not shouted at).
        const started = Boolean(line.id || line.category || line.quantity || line.material_name);
        const problems = new Set<Problem>(
          showProblems || started ? lineProblems(line, materials, { stored }) : [],
        );
        const message = (problem: Problem) => (problems.has(problem) ? t("needed") : undefined);
        const materialOptions: ComboOption[] = materials.map(materialOption);
        if (line.category && !materials.some((row) => row.id === line.category) && line.known_material) {
          materialOptions.push({ value: line.category, label: line.known_material });
        }
        const specOptions = offeredSpecs(resolved.material, line.spec_category).map((row) => ({
          value: row.id,
          label: row.name,
        }));
        if (line.spec_category && !specOptions.some((row) => row.value === line.spec_category) && line.known_spec) {
          specOptions.push({ value: line.spec_category, label: line.known_spec });
        }
        const unitLocked = resolved.choice.unitLocked;
        if (readOnlyFirst && index === 0) {
          return (
            <section key={line.key} className="rounded-xl border border-dashed border-panel-border p-3" data-material-line={1}>
              <p className="text-sm font-semibold">
                {t("line", { n: 1 })}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{t("firstLineInForm")}</span>
              </p>
              <p className="mt-1 text-sm">
                {[resolved.name, resolved.specification].filter(Boolean).join(" · ")} · {line.quantity}{" "}
                {unitName(resolved.unit, null)}
              </p>
            </section>
          );
        }
        return (
          <section
            key={line.key}
            className="rounded-xl border border-panel-border p-3"
            data-material-line={index + 1}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {t("line", { n: index + 1 })}
                {keepFirst && index === 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{t("firstLine")}</span>
                )}
              </p>
              {!(keepFirst && index === 0) && lines.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(line.key)}
                  aria-label={t("remove", { n: index + 1 })}
                >
                  <Trash2 className="size-4" />
                  {t("removeShort")}
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label={t("material")} error={message("material")}>
                <OptionCombobox
                  ariaLabel={t("material")}
                  value={line.category}
                  onChange={(next) =>
                    next === line.category
                      ? undefined
                      : update(line.key, {
                          category: next,
                          // The specification belongs to the material.
                          spec_category: "",
                          specification: "",
                          material_name: "",
                          unit: "",
                          known_material: undefined,
                          known_spec: undefined,
                        })
                  }
                  options={materialOptions}
                  placeholder={t("chooseMaterial")}
                  searchPlaceholder={t("search")}
                  emptyLabel={t("notSetUp")}
                  disabled={!project}
                />
              </FieldWrapper>
              <FieldWrapper label={t("specification")} error={message("specification")}>
                <OptionCombobox
                  ariaLabel={t("specification")}
                  value={line.spec_category}
                  onChange={(next) =>
                    update(line.key, { spec_category: next, specification: "", known_spec: undefined })
                  }
                  options={specOptions}
                  placeholder={line.category ? t("chooseSpecification") : t("materialFirst")}
                  searchPlaceholder={t("search")}
                  emptyLabel={t("noSpecifications")}
                  disabled={!line.category || (!resolved.hasSpecs && specOptions.length === 0)}
                />
              </FieldWrapper>
              {(isOtherMaterial(resolved.material) || (!line.category && line.material_name)) && (
                <FieldWrapper label={t("materialName")} error={message("materialName")} hint={t("otherMaterialHint")}>
                  <Input
                    value={line.material_name}
                    maxLength={150}
                    onChange={(event) => update(line.key, { material_name: event.target.value })}
                  />
                </FieldWrapper>
              )}
              {resolved.typedSpec && line.category && (
                <FieldWrapper
                  label={t("specificationName")}
                  error={message("specificationName")}
                  hint={t("otherSpecHint")}
                >
                  <Input
                    value={line.specification}
                    maxLength={150}
                    onChange={(event) => update(line.key, { specification: event.target.value })}
                  />
                </FieldWrapper>
              )}
              <FieldWrapper label={t("quantity")} error={message("quantity")} hint={t("quantityRule")}>
                <Input
                  inputMode="decimal"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={line.quantity}
                  onChange={(event) => update(line.key, { quantity: event.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper
                label={t("unit")}
                error={message("unit")}
                hint={unitLocked ? t("unitFromSpec") : undefined}
              >
                {unitLocked ? (
                  <Input aria-label={t("unit")} value={unitName(resolved.unit, resolved.choice.spec?.default_unit_label)} readOnly disabled />
                ) : (
                  <Select value={resolved.unit || undefined} onValueChange={(unit) => update(line.key, { unit })}>
                    <SelectTrigger className="w-full" aria-label={t("unit")}>
                      <SelectValue placeholder={t("chooseUnit")} />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {(catalogue.data?.units ?? []).map((row) => (
                        <SelectItem key={row.code} value={row.code}>
                          {unitName(row.code, row.label)}
                        </SelectItem>
                      ))}
                      {resolved.unit && !(catalogue.data?.units ?? []).some((row) => row.code === resolved.unit) && (
                        <SelectItem value={resolved.unit}>{unitName(resolved.unit, null)}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </FieldWrapper>
              {money && (
                <FieldWrapper
                  label={t("unitPrice")}
                  optional={t("optional")}
                  hint={priceHint(
                    listPriceFor(resolved.material, line.spec_category, resolved.unit),
                    line.unit_price,
                    line.unit_price_typed,
                  )}
                >
                  <Input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={t("unitPrice")}
                    value={line.unit_price}
                    onChange={(event) =>
                      update(line.key, { unit_price: event.target.value, unit_price_typed: true })
                    }
                    data-line-price
                  />
                </FieldWrapper>
              )}
              {money && (
                // 成本 = 数量 × 单价 (客户 11-26 事项 2 第 2 点), as the table shows it - live.
                <FieldWrapper label={t("cost")}>
                  <Input
                    aria-label={t("cost")}
                    value={lineCost(line.quantity, line.unit_price) ?? "—"}
                    readOnly
                    disabled
                    data-line-cost
                  />
                </FieldWrapper>
              )}
              {money && (
                <FieldWrapper label={t("amount")} optional={t("optional")} hint={t("amountHint")}>
                  <Input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.amount}
                    onChange={(event) => update(line.key, { amount: event.target.value })}
                  />
                </FieldWrapper>
              )}
            </div>
          </section>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyLine()])}>
        <Plus className="size-4" />
        {t("add")}
      </Button>
    </div>
  );
}
