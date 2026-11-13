import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  KNOWN_LOG_KINDS,
  NO_SINGLE_RECORD,
  PAGE_ONLY,
  WINDOW_OPENERS,
  logRowTarget,
  type LogWindowOpener,
} from "@/lib/log-record-open";

/**
 * JB183 (客户 11-13 事项 2): 「请仔细检查报表历史记录与各业务模块的关联，确保每条
 * 记录都能准确打开对应的原始资料，关闭后返回原来的历史记录页面。」「请同时检查是否
 * 存在其他业务记录链接错误的问题。」
 *
 * Every record kind the frontend can write on an 操作记录 row is read off the
 * source - not typed here - so a kind added tomorrow fails this until it is
 * given a window or a page in `log-record-open.ts`, or put on its
 * 「has no single record」 list with the reason (the house style of
 * `modal-routes.test.ts`).
 */

const SRC = path.join(process.cwd(), "src");
// CRLF on a Windows checkout reads as LF.
const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/** The string literals of one exported type or const, up to its `;`. */
function literalsOf(file: string, declaration: RegExp): string[] {
  // Comments out first: a `;` or a quoted word in one is not the type's.
  const text = read(path.join(SRC, file))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/ .*$/gm, "");
  const start = text.search(declaration);
  expect(start, `${declaration} in ${file}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf(";", start);
  return [...text.slice(start, end).matchAll(/"([A-Z][A-Z_]+)"/g)].map((match) => match[1]);
}

/** Every record kind a log row can carry, as the source writes them. */
function writtenKinds(): Map<string, string> {
  const kinds = new Map<string, string>();
  const add = (kind: string, where: string) => {
    if (!kinds.has(kind)) kinds.set(kind, where);
  };
  const patterns = [
    // `recordKind: "X"` / `record_kind: "X"` (a FileSource, a log row's
    // details, a send target) and `recordKind="X"` (a record's 发送记录).
    /\b(?:recordKind|record_kind)\s*[:=]\s*\{?\s*"([A-Z][A-Z_]+)"/g,
    // A record frame's 完整证据 button: `exportRecord={{ kind: "X", … }}`.
    /exportRecord=\{[\s\S]{0,200}?\bkind:\s*"([A-Z][A-Z_]+)"/g,
    // `ExportButton record={{ kind: "X", … }}` (JB183).
    /\brecord=\{\{\s*kind:\s*"([A-Z][A-Z_]+)"/g,
    // The 完整证据 button and the attachment slot, which log their own kind.
    /<(?:RecordExportButtons?|RecordAttachmentsPanel)\b[^>]*?\bkind="([A-Z][A-Z_]+)"/g,
  ];
  for (const file of sourceFiles(SRC)) {
    const text = read(file);
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) add(match[1], path.relative(SRC, file));
    }
  }
  // Kinds that come in as data: a package's items and a document's linked
  // records (the archive queue's), a column's records (RecordSheet names
  // them), the conversation and attachment slots, and every kind the 完整证据
  // endpoint prints.
  const unions: [string, RegExp][] = [
    ["interfaces/contractor-ops.ts", /export type ArchiveRecordKind =/],
    ["interfaces/contractor-ops.ts", /export type CategoryRecordKind =/],
    ["lib/record-chat.ts", /export type ChatRecordKind =/],
    ["interfaces/record-attachment.ts", /export type AttachableKind =/],
    ["services/contractor-ops.service.ts", /export const RECORD_PDF_KINDS =/],
  ];
  for (const [file, declaration] of unions) {
    for (const kind of literalsOf(file, declaration)) add(kind, file);
  }
  return kinds;
}

describe("JB183-4: every kind a log row can name opens something", () => {
  const kinds = writtenKinds();

  it("reads the kinds off the source (not an empty net)", () => {
    // The client's own rows: an equipment movement's 完整证据, a daily report,
    // a field task's photo; and a permit, logged as HAZARD.
    for (const kind of ["EQUIPMENT_MOVEMENT", "DAILY_REPORT", "FIELD_TASK", "HAZARD", "EVIDENCE_PACKAGE"]) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(35);
  });

  it.each([...writtenKinds().entries()])("%s has a window, a page or a reason (written in %s)", (kind) => {
    expect(KNOWN_LOG_KINDS).toContain(kind);
  });

  it("names each kind once", () => {
    expect(new Set(KNOWN_LOG_KINDS).size).toBe(KNOWN_LOG_KINDS.length);
    for (const reason of Object.values(NO_SINGLE_RECORD)) expect(reason.trim()).not.toBe("");
  });
});

describe("JB183-1: 「打开记录」 opens the record the row names, not the page it was pressed on", () => {
  it("图1's 「完整证据 · EQ0001-ENTRY」 (link \"/\" = 仪表板) opens the equipment movement", () => {
    expect(logRowTarget({ record_kind: "EQUIPMENT_MOVEMENT", record_id: "m1", link: "/" })).toEqual({
      window: "inPlace",
      kind: "EQUIPMENT_MOVEMENT",
      id: "m1",
    });
  });

  it("图3's photo of a field task (link /field-tasks) opens that task", () => {
    expect(logRowTarget({ record_kind: "FIELD_TASK", record_id: "t9", link: "/field-tasks" })).toEqual({
      window: "inPlace",
      kind: "FIELD_TASK",
      id: "t9",
    });
  });

  it("a photo printed over the dashboard opens its record, never /dashboard", () => {
    expect(logRowTarget({ record_kind: "MATERIAL_RECEIPT", record_id: "r1", link: "/dashboard" })).toMatchObject({
      window: "inPlace",
      kind: "MATERIAL_RECEIPT",
    });
  });

  it("日报告 (no link, no kept file) opens the report's book", () => {
    expect(logRowTarget({ record_kind: "DAILY_REPORT", record_id: "d1", link: "" })).toEqual({
      window: "dailyReport",
      kind: "DAILY_REPORT",
      id: "d1",
    });
  });

  it("a permit (logged as HAZARD) goes to the hazard opener, which shows it as the permit", () => {
    expect(logRowTarget({ record_kind: "HAZARD", record_id: "p1" })).toMatchObject({ window: "inPlace", kind: "HAZARD" });
    const safety = read(path.join(SRC, "components/site-operations/safety.tsx"));
    const inPlace = safety.slice(safety.indexOf("export function HazardInPlace"));
    expect(inPlace).toMatch(/record_type === "PERMIT"\) return <PermitDetail id=\{id\} presentation="dialog" onClose=\{onClose\} \/>/);
  });

  it("a letter opens what it belongs to: Claim 信件 the claim, 资料包信件 the package", () => {
    expect(logRowTarget({ record_kind: "CLAIM_LETTER", record_id: "c1" })).toEqual({ window: "inPlace", kind: "CLAIM", id: "c1" });
    expect(logRowTarget({ record_kind: "PACKAGE_LETTER", record_id: "k1" })).toEqual({ window: "package", kind: "PACKAGE_LETTER", id: "k1" });
  });

  it("a record with only a page goes to that page, on that record", () => {
    expect(logRowTarget({ record_kind: "APPROVAL", record_id: "a 1" })).toEqual({ page: "/approvals?approval=a%201" });
  });

  it("做法 4: no record named - the page it kept (「打开当时的页面」), or nothing", () => {
    expect(logRowTarget({ record_kind: "", record_id: "", link: "/site-access?tab=gate" })).toEqual({
      pastPage: "/site-access?tab=gate",
    });
    // "/" only ever went to 仪表板; another site is never followed.
    expect(logRowTarget({ link: "/" })).toBeNull();
    expect(logRowTarget({ link: "https://example.com/x" })).toBeNull();
    expect(logRowTarget({ link: "//example.com/x" })).toBeNull();
    expect(logRowTarget({ record_kind: "", record_id: "", link: "" })).toBeNull();
    // A kind with no id names no record.
    expect(logRowTarget({ record_kind: "FIELD_TASK", record_id: "", link: "/field-tasks" })).toEqual({ pastPage: "/field-tasks" });
  });
});

describe("JB183-4: each window is one that exists", () => {
  const windowSource = read(path.join(SRC, "components/contractor-ops/log-record-window.tsx"));

  it.each([...new Set(Object.values(WINDOW_OPENERS).map((entry) => entry.opener))])(
    "「%s」 is drawn by LogRecordWindow",
    (opener: LogWindowOpener) => {
      expect(windowSource).toContain(`case "${opener}":`);
    },
  );

  it("every kind sent to the module's own window is one InPlaceRecord opens", () => {
    const inPlace = read(path.join(SRC, "components/shared/in-place-record.tsx"));
    const set = inPlace.slice(inPlace.indexOf("const IN_PLACE_KINDS"), inPlace.indexOf("]);"));
    const opened = [...set.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
    for (const [kind, entry] of Object.entries(WINDOW_OPENERS)) {
      if (entry.opener !== "inPlace") continue;
      expect(opened, kind).toContain(entry.as ?? kind);
    }
  });

  it("page-only kinds go to a page of this site", () => {
    for (const [kind, page] of Object.entries(PAGE_ONLY)) {
      expect(page("x").startsWith("/"), kind).toBe(true);
    }
  });
});
