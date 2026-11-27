"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MATERIAL_UNITS_QUERY_KEY, useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import {
  confirmImport,
  downloadImportTemplate,
  NEW_UNIT,
  previewImport,
  type ExcelImportKind,
  type ImportColumn,
  type ImportPreview,
  type ImportResult,
  type ImportRow,
  type ImportRowStatus,
  type SupplierImportChoices,
} from "@/services/excel-import.service";

/**
 * 导入 Excel (JB244, 客户 11-23 事项 16): 「上传客户原有 Excel 文件」「自动识别或
 * 手动匹配对应栏目」「导入前检查重复资料，并提供预览确认」「导入后自动保存到对应管理
 * 栏目」 - for 供应商资料 and 公司通用分类 › 材料分类.
 *
 * One window: choose the file; the server reads it, recognises the columns
 * by their headers and judges every row; the client changes a column, the
 * batch's 公司类型 / 行业 / 主要产品 (suppliers) or a unit the list lacks
 * (materials) and the preview is judged again; 【确认导入】 saves the new
 * rows. Nothing is saved before it, and nothing already there is changed.
 */

const NOT_IMPORTED = "-";
/** Rows the preview table shows at once. */
const SHOWN_ROWS = 300;

/** The words of each system field, as the manual forms already say them. */
export const FIELD_LABEL_KEYS: Record<ExcelImportKind, Record<string, string>> = {
  supplier: {
    name: "suppliers.field.name",
    registration_no: "suppliers.field.registrationNo",
    contact_person: "suppliers.field.contactPerson",
    contact_phone: "suppliers.field.contactPhone",
    contact_email: "suppliers.field.contactEmail",
    address_line_1: "suppliers.field.addressLine1",
    city: "suppliers.field.city",
    state: "suppliers.field.state",
    industry: "suppliers.field.industry",
    main_products: "suppliers.field.mainProducts",
    company_types: "suppliers.companyTypes.label",
  },
  material: {
    material: "categoryManagement.company.col.material",
    spec: "categoryManagement.company.col.specs",
    unit: "categoryManagement.company.unit",
    unit_price: "categoryManagement.company.form.price",
    suppliers: "categoryManagement.company.col.suppliers",
    description: "categoryManagement.company.description",
    // An optional 英文名称 column (JB293, 客户 11-27g).
    name_en: "jb293.nameEn",
  },
};

/** The columns of the preview table, after 行 and 结果. */
const TABLE_FIELDS: Record<ExcelImportKind, string[]> = {
  supplier: ["name", "registration_no", "contact_person", "contact_phone", "industry", "main_products", "company_types"],
  material: ["material", "name_en", "spec", "unit", "unit_price", "suppliers", "description"],
};

const STATUS_TONE: Record<ImportRowStatus, "positive" | "neutral" | "danger"> = {
  new: "positive",
  exists: "neutral",
  problem: "danger",
};

const DEFAULT_CHOICES: SupplierImportChoices = { company_types: ["SUPPLIER"], industry: "", main_products: "" };

/** A file's identity for the preview's cache: a new file is a new preview. */
const fileKey = (file: File | null) => (file ? `${file.name}|${file.size}|${file.lastModified}` : "");

export function ExcelImportDialog({
  kind,
  onClose,
  onAddToProjects,
}: {
  kind: ExcelImportKind;
  onClose: () => void;
  /** 材料: the existing projects do not get the new materials by themselves -
   * 【加到现有项目】 right here after the import (QA1 audit #9). */
  onAddToProjects?: () => void;
}) {
  const t = useTranslations();
  const w = useTranslations("jb244");
  const locale = useLocale();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const unitName = useUnitName();
  // query-failure: without the unit list a unit the list lacks can still be added (「新增这个单位」, the default)
  const unitList = useMaterialUnits({ enabled: kind === "material" });

  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null> | null>(null);
  const [choices, setChoices] = useState<SupplierImportChoices>(DEFAULT_CHOICES);
  // The two text boxes are sent when the client leaves them, not on every key.
  const [draft, setDraft] = useState({ industry: "", main_products: "" });
  const [units, setUnits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ImportRowStatus | "all">("all");
  const [result, setResult] = useState<ImportResult | null>(null);

  const options = { mapping, choices: kind === "supplier" ? choices : undefined, units };
  const preview = useQuery({
    queryKey: ["excel-import", kind, fileKey(file), JSON.stringify(options)],
    queryFn: () => previewImport(kind, file as File, options),
    enabled: Boolean(file) && !result,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: Infinity,
  });
  const data: ImportPreview | undefined = file ? preview.data : undefined;
  // The columns the server chose first become the client's to change.
  const shownMapping = mapping ?? data?.mapping ?? {};

  const template = useMutation({ mutationFn: () => downloadImportTemplate(kind, locale) });
  const confirm = useMutation({
    // What the boxes say now, even if the click came before they were left.
    mutationFn: () =>
      confirmImport(kind, file as File, {
        ...options,
        mapping: shownMapping,
        choices:
          kind === "supplier"
            ? { ...choices, industry: draft.industry.trim(), main_products: draft.main_products.trim() }
            : undefined,
      }),
    onSuccess: (answer) => {
      setResult(answer);
      const keys =
        kind === "supplier"
          ? [["suppliers"]]
          : [["company-categories"], ["category-management"], [...MATERIAL_UNITS_QUERY_KEY]];
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
    },
  });

  const label = (field: string) => t(FIELD_LABEL_KEYS[kind][field]);
  const columnName = (column: ImportColumn) =>
    column.header
      ? w("columnOption", { letter: column.letter, header: column.header })
      : w("columnNoHeader", { letter: column.letter });

  const pick = (chosen: File | undefined | null) => {
    if (!chosen) return;
    setFile(chosen);
    setMapping(null);
    setUnits({});
    setFilter("all");
    setResult(null);
  };

  const requiredMissing = (data?.fields ?? []).filter(
    (field) => field.required && field.available && shownMapping[field.key] == null,
  );
  const rows = (data?.rows ?? []).filter((row) => filter === "all" || row.status === filter);
  const newCount = data?.counts.new ?? 0;
  const prices = data?.counts.prices ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[94dvh] flex-col overflow-hidden sm:max-w-6xl" data-testid="excel-import">
        <DialogHeader>
          <DialogTitle>{w(`title.${kind}`)}</DialogTitle>
          <DialogDescription>{w(`intro.${kind}`)}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {result ? (
            <ResultPanel kind={kind} result={result} onAddToProjects={onAddToProjects} />
          ) : (
            <>
              <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
                  <FileSpreadsheet className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  {file ? (
                    <p className="truncate font-medium">{file.name}</p>
                  ) : (
                    <p className="font-medium">{w("chooseFirst")}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {data
                      ? w("fileLine", { row: data.header_row, total: data.counts.total })
                      : w("xlsxOnly")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => template.mutate()} disabled={template.isPending}>
                    {template.isPending ? <Loader2 className="animate-spin" /> : <Download />}
                    {w("template")}
                  </Button>
                  <input
                    ref={input}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    data-testid="excel-import-file"
                    onChange={(event) => {
                      pick(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <Button onClick={() => input.current?.click()}>
                    <Upload />
                    {file ? w("changeFile") : w("chooseFile")}
                  </Button>
                </div>
              </section>

              {file && preview.isFetching && !data && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {w("reading")}
                </p>
              )}
              {file && preview.isError && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
                  {preview.error instanceof Error && preview.error.message ? preview.error.message : w("readFailed")}
                </p>
              )}

              {data && (
                <>
                  <section className="space-y-3">
                    <div>
                      <h3 className="font-semibold">{w("columnsTitle")}</h3>
                      <p className="text-sm text-muted-foreground">{w("columnsHelp")}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {data.fields.map((field) => {
                        const index = shownMapping[field.key];
                        const column = index == null ? null : data.columns[index];
                        return (
                          <FieldWrapper
                            key={field.key}
                            label={label(field.key)}
                            required={field.required}
                            hint={
                              !field.available
                                ? w("noPrices")
                                : column?.samples.length
                                  ? w("example", { values: column.samples.join("、") })
                                  : undefined
                            }
                          >
                            <Select
                              value={index == null ? NOT_IMPORTED : String(index)}
                              disabled={!field.available}
                              onValueChange={(value) =>
                                setMapping({
                                  ...shownMapping,
                                  [field.key]: value === NOT_IMPORTED ? null : Number(value),
                                })
                              }
                            >
                              <SelectTrigger className="w-full" data-testid={`excel-import-map-${field.key}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NOT_IMPORTED}>{w("notImported")}</SelectItem>
                                {data.columns.map((option) => (
                                  <SelectItem key={option.index} value={String(option.index)}>
                                    {columnName(option)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldWrapper>
                        );
                      })}
                    </div>
                    {requiredMissing.map((field) => (
                      <p key={field.key} className="text-sm text-destructive" role="alert">
                        {w("requiredMissing", { field: label(field.key) })}
                      </p>
                    ))}
                    {kind === "material" && (
                      <p className="rounded-lg border border-panel-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground" data-testid="excel-import-two-levels">
                        {data.category_column
                          ? w("categoryLeftOut", {
                              letter: data.category_column.letter,
                              header: data.category_column.header,
                            })
                          : data.category_description_column
                            ? w("categoryAsDescription", {
                                letter: data.category_description_column.letter,
                                header: data.category_description_column.header,
                              })
                            : w("twoLevels")}
                      </p>
                    )}
                  </section>

                  {kind === "supplier" && (
                    <section className="space-y-3" data-testid="excel-import-batch">
                      <div>
                        <h3 className="font-semibold">{w("batchTitle")}</h3>
                        <p className="text-sm text-muted-foreground">{w("batchHelp")}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <FieldWrapper label={t("suppliers.companyTypes.label")} required>
                          <div className="flex min-h-10 flex-wrap items-center gap-4">
                            {(["SUPPLIER", "SUBCONTRACTOR"] as const).map((type) => (
                              <label key={type} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={choices.company_types.includes(type)}
                                  onCheckedChange={(checked) => {
                                    const next = checked
                                      ? [...choices.company_types, type]
                                      : choices.company_types.filter((item) => item !== type);
                                    // At least one, as the form asks.
                                    if (next.length) setChoices({ ...choices, company_types: next });
                                  }}
                                />
                                {t(`suppliers.companyTypes.${type}`)}
                              </label>
                            ))}
                          </div>
                        </FieldWrapper>
                        {(["industry", "main_products"] as const).map((key) => (
                          <FieldWrapper key={key} label={w(`batch.${key}`)}>
                            <Input
                              value={draft[key]}
                              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                              onBlur={() => setChoices({ ...choices, [key]: draft[key].trim() })}
                              data-testid={`excel-import-batch-${key}`}
                            />
                          </FieldWrapper>
                        ))}
                      </div>
                    </section>
                  )}

                  {kind === "material" && (data.units?.length ?? 0) > 0 && (
                    <section className="space-y-3" data-testid="excel-import-units">
                      <div>
                        <h3 className="font-semibold">{w("unitsTitle")}</h3>
                        <p className="text-sm text-muted-foreground">{w("unitsHelp")}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {data.units?.map((unit) => (
                          <FieldWrapper
                            key={unit.key}
                            label={w("unitLabel", { unit: unit.text })}
                            hint={w("unitLines", { lines: unit.lines.join("、") })}
                          >
                            <Select
                              value={units[unit.text] ?? unit.choice}
                              onValueChange={(value) => setUnits({ ...units, [unit.text]: value })}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NEW_UNIT}>{w("unitNew", { unit: unit.text })}</SelectItem>
                                {(unitList.data ?? []).map((option) => (
                                  <SelectItem key={option.code} value={option.code}>
                                    {w("unitMapTo", { unit: unitName(option.code, option.label) })}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldWrapper>
                        ))}
                      </div>
                    </section>
                  )}

                  {kind === "material" && prices > 0 && (
                    <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm" data-testid="excel-import-prices">
                      {w("pricesPin", { count: prices })}
                    </p>
                  )}

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{w("previewTitle")}</h3>
                      {preview.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      <p className="text-sm text-muted-foreground" data-testid="excel-import-counts">
                        {w("counts", {
                          new: data.counts.new,
                          exists: data.counts.exists,
                          problem: data.counts.problem,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["all", "new", "exists", "problem"] as const).map((key) => (
                        <Button
                          key={key}
                          size="sm"
                          variant={filter === key ? "default" : "outline"}
                          onClick={() => setFilter(key)}
                        >
                          {w(`filter.${key}`, {
                            count: key === "all" ? data.counts.total : data.counts[key],
                          })}
                        </Button>
                      ))}
                    </div>
                    <ImportPreviewTable kind={kind} rows={rows.slice(0, SHOWN_ROWS)} showsPrices={Boolean(data.shows_prices)} />
                    {rows.length > SHOWN_ROWS && (
                      <p className="text-xs text-muted-foreground">
                        {w("moreRows", { shown: SHOWN_ROWS, total: rows.length })}
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>{w("close")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                {w("cancel")}
              </Button>
              <Button
                data-testid="excel-import-confirm"
                requires={requiredMissing.map((field) => [null, label(field.key)] as const)}
                disabled={!file || newCount === 0 || confirm.isPending || preview.isFetching}
                disabledReason={!file ? w("needFile") : newCount === 0 ? w("nothingNew") : undefined}
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {w("confirm", { count: newCount })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Why a row is 新增 / 已经有，跳过 / 有问题, in the reader's words. */
export function importReasons(
  kind: ExcelImportKind,
  row: ImportRow,
  w: (key: string, values?: Record<string, string | number>) => string,
  t: (key: string) => string,
): string[] {
  const reasons: string[] = [];
  if (row.status === "exists") {
    reasons.push(
      row.match
        ? w("existsMatch", { code: row.match.code, name: row.match.name })
        : w("sameAsLine", { line: row.same_as_line ?? "" }),
    );
  }
  for (const problem of row.problems) {
    reasons.push(w(`problem.${problem.code}`, { field: t(FIELD_LABEL_KEYS[kind][problem.field]) }));
  }
  if (row.status === "new") {
    if (row.unit?.new) reasons.push(w("unitAdded", { unit: row.unit.text }));
    for (const note of row.notes ?? []) reasons.push(w(`note.${note.code}`, { name: note.name }));
  }
  return reasons;
}

/** The preview: each row's number, 新增 / 已经有，跳过 / 有问题 and why, and its values. */
export function ImportPreviewTable({
  kind,
  rows,
  showsPrices,
}: {
  kind: ExcelImportKind;
  rows: ImportRow[];
  showsPrices: boolean;
}) {
  const t = useTranslations();
  const w = useTranslations("jb244");
  const unitName = useUnitName();
  const fields = TABLE_FIELDS[kind].filter(
    (field) =>
      (field !== "unit_price" || showsPrices) &&
      // 英文名称 (JB293) only when the file has one.
      (field !== "name_en" || rows.some((row) => String(row.values.name_en ?? "").trim())),
  );
  const cell = (row: ImportRow, field: string) => {
    if (field === "unit" && row.unit) return row.unit.code ? unitName(row.unit.code) : row.unit.text;
    if (field === "unit_price") return row.price ?? row.values.unit_price ?? "";
    if (field === "company_types" && row.company_types?.length) {
      return row.company_types.map((type) => t(`suppliers.companyTypes.${type}`)).join("、");
    }
    return row.values[field] ?? "";
  };
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{w("col.line")}</TableHead>
            <TableHead>{w("col.status")}</TableHead>
            {fields.map((field) => (
              <TableHead key={field}>{t(FIELD_LABEL_KEYS[kind][field])}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.line} className="align-top" data-testid={`excel-import-row-${row.line}`}>
              <TableCell className="tabular-nums text-muted-foreground">{row.line}</TableCell>
              <TableCell className="min-w-44 whitespace-normal">
                <StatusBadge label={w(`status.${row.status}`)} tone={STATUS_TONE[row.status]} />
                {importReasons(kind, row, w, t).map((reason) => (
                  <p
                    key={reason}
                    className={`mt-1 text-xs ${row.status === "problem" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {reason}
                  </p>
                ))}
              </TableCell>
              {fields.map((field) => (
                <TableCell key={field} className="max-w-56 truncate" title={cell(row, field)}>
                  {cell(row, field)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ResultPanel({
  kind,
  result,
  onAddToProjects,
}: {
  kind: ExcelImportKind;
  result: ImportResult;
  onAddToProjects?: () => void;
}) {
  const w = useTranslations("jb244");
  return (
    <section className="space-y-2 rounded-lg border border-success/40 bg-success/10 p-4" data-testid="excel-import-done">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="size-5 text-success" />
        {w("done", {
          added: result.added_count,
          skipped: result.skipped_count,
          problems: result.problem_count,
        })}
      </p>
      <p className="text-sm text-muted-foreground">{w(`doneWhere.${kind}`)}</p>
      {kind === "material" && (result.units_added?.length ?? 0) > 0 && (
        <p className="text-sm">{w("doneUnits", { names: (result.units_added ?? []).join("、") })}</p>
      )}
      {kind === "material" && onAddToProjects && (result.materials_added ?? 0) + (result.specs_added ?? 0) > 0 && (
        <Button variant="outline" size="sm" onClick={onAddToProjects} data-testid="excel-import-add-to-projects">
          {w("addToProjects")}
        </Button>
      )}
    </section>
  );
}
