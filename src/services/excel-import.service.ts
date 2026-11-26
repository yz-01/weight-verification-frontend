/**
 * 导入 Excel (JB244, 客户 11-23 事项 16): 供应商资料 and 公司通用分类 › 材料分类.
 *
 * Nothing is kept on the server between the steps: every preview and
 * 【确认导入】 sends the file again with the column choices, so nothing is
 * stored before the client confirms.
 */

import { api, download } from "@/services/api-client";

export type ExcelImportKind = "supplier" | "material";

export type ImportRowStatus = "new" | "exists" | "problem";

export interface ImportProblem {
  /** `missing` | `invalid` | `too_long`. */
  code: string;
  field: string;
}

export interface ImportNote {
  /** `supplier_not_found` | `material_added`. */
  code: string;
  name: string;
}

export interface ImportColumn {
  index: number;
  letter: string;
  header: string;
  samples: string[];
}

export interface ImportRow {
  /** The row's number in the Excel file. */
  line: number;
  status: ImportRowStatus;
  values: Record<string, string>;
  problems: ImportProblem[];
  notes?: ImportNote[];
  /** What the company already has: the reason the row is skipped. */
  match: { code: string; name: string } | null;
  /** The earlier row of the same file it repeats. */
  same_as_line: number | null;
  /** Materials: the unit as read and what it was matched to. */
  unit?: { text: string; code: string | null; new: boolean } | null;
  price?: string | null;
  company_types?: string[];
}

export interface ImportUnit {
  key: string;
  text: string;
  lines: number[];
  /** A unit code of the list, or `__new__`. */
  choice: string;
}

export interface ImportPreview {
  file_name: string;
  header_row: number;
  columns: ImportColumn[];
  fields: { key: string; required: boolean; available: boolean }[];
  mapping: Record<string, number | null>;
  suggested: Record<string, number | null>;
  rows: ImportRow[];
  counts: { new: number; exists: number; problem: number; total: number } & Record<string, number>;
  /** Suppliers: the 「这一批都是」 choices as applied. */
  choices?: SupplierImportChoices;
  /** Materials. */
  shows_prices?: boolean;
  category_column?: ImportColumn | null;
  units?: ImportUnit[];
}

export interface ImportResult extends ImportPreview {
  added_count: number;
  skipped_count: number;
  problem_count: number;
  units_added?: string[];
}

export interface SupplierImportChoices {
  company_types: string[];
  industry: string;
  main_products: string;
}

export interface ImportOptions {
  mapping?: Record<string, number | null> | null;
  choices?: SupplierImportChoices;
  units?: Record<string, string>;
}

export const NEW_UNIT = "__new__";

/** Each path written out whole, so the backend's reachability guard finds it. */
const PATHS: Record<ExcelImportKind, { preview: string; confirm: string; template: string }> = {
  supplier: {
    preview: "/api/suppliers/import_preview/",
    confirm: "/api/suppliers/import_confirm/",
    template: "/api/suppliers/import_template/",
  },
  material: {
    preview: "/api/company-categories/import_preview/",
    confirm: "/api/company-categories/import_confirm/",
    template: "/api/company-categories/import_template/",
  },
};

export function importBody(file: File, options: ImportOptions = {}): FormData {
  const body = new FormData();
  body.append("file", file);
  if (options.mapping) body.append("mapping", JSON.stringify(options.mapping));
  if (options.choices) body.append("choices", JSON.stringify(options.choices));
  if (options.units) body.append("units", JSON.stringify(options.units));
  return body;
}

export function previewImport(kind: ExcelImportKind, file: File, options: ImportOptions = {}) {
  return api.post<ImportPreview>(PATHS[kind].preview, importBody(file, options));
}

/** With prices in a material file the server asks for the sign-off PIN; the PIN dialog opens by itself. */
export function confirmImport(kind: ExcelImportKind, file: File, options: ImportOptions = {}) {
  return api.post<ImportResult>(PATHS[kind].confirm, importBody(file, options));
}

export function downloadImportTemplate(kind: ExcelImportKind, lang: string): Promise<void> {
  return download(PATHS[kind].template, {
    method: "GET",
    query: { lang },
    fallbackFilename: kind === "supplier" ? "suppliers-template.xlsx" : "materials-template.xlsx",
  });
}
