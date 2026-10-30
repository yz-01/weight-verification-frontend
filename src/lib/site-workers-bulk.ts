/**
 * 批量新增人员 (JB61-1): the table's own rules, kept out of the screen so they
 * can be tested - pasting from Excel or WhatsApp, Tab / Enter moving between
 * cells, which rows still have to reach the server, and merging the rows
 * phones add while the office types.
 *
 * The server is where a row lives (so phones can add to it and a closed tab
 * loses nothing); the page keeps its own copy to type into and sends what
 * changed, a second after the typing stops.
 */

import type { BatchRowData, BatchRowSource, BatchSyncRow, PassportReadStatus } from "@/interfaces/site-workers";

export const BULK_FIELDS = [
  "name",
  "phone",
  "passport_no",
  "nationality",
  "date_of_birth",
  "passport_expiry",
  "cidb_no",
  "company_text",
  // JB91: 「施工工种」, last, as in the Excel template.
  "trade_text",
] as const;
export type BulkField = (typeof BULK_FIELDS)[number];
export type BulkValues = Record<BulkField, string>;

/** Rows the table starts with, and adds with 「再加 20 行」. */
export const BLANK_ROWS = 20;
/** Rows shown on one page of the table (2,000 rows would be 16,000 boxes). */
export const PAGE_ROWS = 100;
/** Rows sent in one sync. The server takes up to 500. */
export const SYNC_CHUNK = 400;

export interface BulkRow {
  /** The page's own name for the row; stays the same once the server has it. */
  key: string;
  /** The server's id, once it has seen the row. */
  id?: string;
  position?: number;
  values: BulkValues;
  source: BatchRowSource;
  readStatus: PassportReadStatus;
  needsCheck: boolean;
  photoUrl: string | null;
  photoIsPdf: boolean;
  /** Bumped on every edit; a sync that carried an older one leaves it dirty. */
  version: number;
  /** The version the server has. */
  synced: number;
  /** 「核对好了」 pressed, not yet sent. */
  checked?: boolean;
}

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `row-${Date.now().toString(36)}-${counter}`;
}

export function emptyValues(): BulkValues {
  return {
    name: "",
    phone: "",
    passport_no: "",
    nationality: "",
    date_of_birth: "",
    passport_expiry: "",
    cidb_no: "",
    company_text: "",
    trade_text: "",
  };
}

export function blankRow(): BulkRow {
  return {
    key: newKey(),
    values: emptyValues(),
    source: "TYPED",
    readStatus: "NONE",
    needsCheck: false,
    photoUrl: null,
    photoIsPdf: false,
    version: 0,
    synced: 0,
  };
}

export function blankRows(count = BLANK_ROWS): BulkRow[] {
  return Array.from({ length: count }, blankRow);
}

export function rowFromServer(data: BatchRowData): BulkRow {
  const values = emptyValues();
  for (const field of BULK_FIELDS) values[field] = data[field] ?? "";
  return {
    key: data.id,
    id: data.id,
    position: data.position,
    values,
    source: data.source,
    readStatus: data.read_status,
    needsCheck: data.needs_check,
    photoUrl: data.photo_url,
    photoIsPdf: data.photo_is_pdf,
    version: 0,
    synced: 0,
  };
}

export function isBlank(row: BulkRow): boolean {
  return !row.photoUrl && BULK_FIELDS.every((field) => !row.values[field].trim());
}

export function isDirty(row: BulkRow): boolean {
  return row.version !== row.synced || Boolean(row.checked);
}

/** One cell typed. A yellow row whose passport number is typed is checked. */
export function editRow(row: BulkRow, field: BulkField, value: string): BulkRow {
  return {
    ...row,
    values: { ...row.values, [field]: value },
    needsCheck: field === "passport_no" ? false : row.needsCheck,
    version: row.version + 1,
  };
}

/** 「核对好了」 on a yellow row. */
export function confirmRow(row: BulkRow): BulkRow {
  return { ...row, needsCheck: false, checked: true, version: row.version + 1 };
}

// --- Paste -------------------------------------------------------------------

/**
 * Text copied from Excel, Google Sheets or WhatsApp as a grid of cells.
 *
 * Lines split rows and tabs split cells (Excel's own clipboard). A line with no
 * tab but two or more spaces between words - a list typed in WhatsApp - keeps
 * the whole line as one cell, since a name has single spaces in it. Excel puts
 * a cell holding a line break or a tab in double quotes; those are kept whole.
 */
export function parsePaste(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  const source = text.replace(/\r\n?/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .map((cells) => cells.map((value) => value.replace(/\s+/g, " ").trim()))
    .filter((cells) => cells.some((value) => value !== ""));
}

/** Whether a paste is a grid for the table rather than text for one box. */
export function isGridPaste(text: string): boolean {
  return /[\t\n]/.test(text.replace(/\n+$/, ""));
}

/**
 * The grid laid into the table from the cell the paste landed in, rightwards
 * and downwards, adding blank rows at the end when it runs past them.
 * Columns past the last field are dropped.
 */
export function applyPaste(rows: BulkRow[], rowIndex: number, field: BulkField, grid: string[][]): BulkRow[] {
  const startColumn = BULK_FIELDS.indexOf(field);
  const next = rows.slice();
  while (next.length < rowIndex + grid.length) next.push(blankRow());
  grid.forEach((cells, offset) => {
    let row = next[rowIndex + offset];
    cells.forEach((value, column) => {
      const target = BULK_FIELDS[startColumn + column];
      if (target) row = editRow(row, target, value);
    });
    next[rowIndex + offset] = row;
  });
  return withBlankTail(next);
}

/** The table always ends in a few empty lines to type into. */
export function withBlankTail(rows: BulkRow[], tail = 5): BulkRow[] {
  let blanks = 0;
  for (let index = rows.length - 1; index >= 0 && isBlank(rows[index]); index -= 1) blanks += 1;
  return blanks >= tail ? rows : [...rows, ...blankRows(tail - blanks)];
}

// --- Keyboard ------------------------------------------------------------------

/**
 * The cell Tab, Shift+Tab or Enter moves to. Tab runs along the row and on to
 * the next one; Enter goes down the column (as in Excel). ``null`` past the
 * last row - the page adds rows then.
 */
export function nextCell(
  rowIndex: number,
  column: number,
  key: "Tab" | "Enter",
  shift: boolean,
  rowCount: number,
): { row: number; column: number } | null {
  const last = BULK_FIELDS.length - 1;
  if (key === "Enter") {
    const row = shift ? rowIndex - 1 : rowIndex + 1;
    if (row < 0) return { row: 0, column };
    return row >= rowCount ? null : { row, column };
  }
  if (shift) {
    if (column > 0) return { row: rowIndex, column: column - 1 };
    return rowIndex > 0 ? { row: rowIndex - 1, column: last } : { row: 0, column: 0 };
  }
  if (column < last) return { row: rowIndex, column: column + 1 };
  return rowIndex + 1 >= rowCount ? null : { row: rowIndex + 1, column: 0 };
}

// --- Sync --------------------------------------------------------------------

export interface SyncPlan {
  rows: BatchSyncRow[];
  /** Versions sent, by row key, to settle the answer against. */
  versions: Record<string, number>;
}

/**
 * What the server has not seen: every changed row (a blank row it never had
 * is not sent; a row it has that is now blank is sent, and it removes it).
 */
export function planSync(rows: BulkRow[], limit = SYNC_CHUNK): SyncPlan {
  const plan: SyncPlan = { rows: [], versions: {} };
  for (const row of rows) {
    if (plan.rows.length >= limit) break;
    if (!isDirty(row)) continue;
    if (!row.id && isBlank(row)) continue;
    plan.rows.push({
      key: row.key,
      ...(row.id ? { id: row.id } : {}),
      ...row.values,
      ...(row.checked ? { checked: true } : {}),
    });
    plan.versions[row.key] = row.version;
  }
  return plan;
}

/** The server's answer to a sync laid back onto the table. */
export function settleSync(
  rows: BulkRow[],
  plan: SyncPlan,
  answer: { ids: Record<string, string>; removed: string[] },
): BulkRow[] {
  const removed = new Set(answer.removed);
  return rows.map((row) => {
    const sent = plan.versions[row.key];
    if (sent === undefined) return row;
    const id = row.id && removed.has(row.id) ? undefined : (answer.ids[row.key] ?? row.id);
    return { ...row, id, synced: sent, checked: row.version === sent ? false : row.checked };
  });
}

export function hasUnsynced(rows: BulkRow[], deleted: string[]): boolean {
  return deleted.length > 0 || rows.some((row) => isDirty(row) && (row.id || !isBlank(row)));
}

/**
 * Rows a phone or an upload added, put into the table: rows it already shows
 * are left as they are (the office may be typing in them); new ones go in
 * before the empty lines at the end.
 */
export function mergeIncoming(rows: BulkRow[], incoming: BatchRowData[]): BulkRow[] {
  const known = new Set(rows.map((row) => row.id).filter(Boolean));
  const fresh = incoming.filter((data) => !known.has(data.id)).map(rowFromServer);
  if (fresh.length === 0) return rows;
  let end = rows.length;
  while (end > 0 && isBlank(rows[end - 1]) && !rows[end - 1].id) end -= 1;
  return withBlankTail([...rows.slice(0, end), ...fresh, ...rows.slice(end)]);
}

/**
 * The poll's `since`: the server's last `now` less half a minute, so a row a
 * phone was still saving when the last poll ran is not missed. Rows already
 * shown come back and are dropped by `mergeIncoming`.
 */
export function pollSince(serverNow: string, marginMs = 30_000): string {
  const at = Date.parse(serverNow);
  return Number.isNaN(at) ? serverNow : new Date(at - marginMs).toISOString();
}

export function filledCount(rows: BulkRow[]): number {
  return rows.filter((row) => !isBlank(row)).length;
}

/** Problems the page shows, red; `check_photo` is the yellow one. */
export const BLOCKING_PROBLEMS = [
  "missing_name",
  "name_has_digits",
  "check_photo",
  "passport_invalid",
  "phone_invalid",
  "dob_invalid",
  "expiry_invalid",
  "passport_expired",
  "passport_twice",
  "phone_twice",
  "passport_on_roster",
  "phone_on_roster",
] as const;
