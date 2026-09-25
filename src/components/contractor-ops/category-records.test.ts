import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORY_MODULE_KEYS } from "@/lib/category-modules";
import {
  canConfirmClosure,
  canDiscuss,
  isQueueKind,
} from "@/lib/record-chat";
import { RECORD_STATUS_NAMESPACE } from "@/lib/record-status";

/**
 * A column's records, opened on Category Management (T-396, D-276).
 *
 * Lucas: 「栏目管理里点一个栏目，同一页弹出这个栏目里的全部记录，点一笔就在弹窗
 * 里看详情，不跳页」. Asserted by source, because the ways this drifts are a
 * link to the module's own screen coming back, the detail quietly fetching
 * from the archive queue's door (which only opens finished records), or a
 * part of the sheet drawn for a kind whose endpoint refuses it.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

const MANAGEMENT = "src/components/contractor-ops/category-management.tsx";
const QUEUE = "src/components/contractor-ops/archive-queue.tsx";
const SERVICE = "src/services/contractor-ops.service.ts";
const INTERFACES = "src/interfaces/contractor-ops.ts";

/** The body of one top-level function (generic or not), up to the next. */
function functionBody(source: string, name: string): string {
  const start = source.search(
    new RegExp(String.raw`\n(?:export )?function ${name}(?:<[^(]*>)?\(`),
  );
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n(?:export )?function [A-Z]/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The members of a string-literal union type. */
function unionMembers(source: string, type: string): string[] {
  const body = source.match(
    new RegExp(String.raw`export type ${type} =([\s\S]*?);`),
  )?.[1];
  expect(body, `${type} is declared`).toBeTruthy();
  return [...(body as string).matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

const CATEGORY_KINDS = unionMembers(read(INTERFACES), "CategoryRecordKind");
const QUEUE_ONLY_NOT = [
  "DELIVERY_NOTE",
  "SITE_RECORD",
  "SITE_EQUIPMENT",
  "DOCUMENT",
  "CLAIM",
];

describe("the kinds a column can hold (T-396)", () => {
  it("are the thirteen the backend sends", () => {
    expect([...CATEGORY_KINDS].sort()).toEqual(
      [
        "MATERIAL_RECEIPT",
        "DELIVERY_NOTE",
        "MATERIAL_OUTGOING",
        "SITE_RECORD",
        "HAZARD",
        "SITE_EQUIPMENT",
        "EQUIPMENT_MOVEMENT",
        "PROGRESS",
        "DISPOSAL_REQUEST",
        "WASTE_OUTGOING",
        "DOCUMENT",
        "SUNDRY_CLAIM",
        "CLAIM",
      ].sort(),
    );
  });

  it.each(["en", "zh", "zh-TW", "ms"])("are named in %s", (locale) => {
    const messages = JSON.parse(read(`src/messages/${locale}.json`));
    for (const kind of CATEGORY_KINDS) {
      expect(typeof messages.archiveQueue.kind[kind], `${locale}: ${kind}`).toBe("string");
    }
    expect(typeof messages.archiveQueue.notInQueue, locale).toBe("string");
    for (const key of ["title", "help", "count", "empty"]) {
      expect(typeof messages.categoryManagement.records[key], `${locale}: ${key}`).toBe(
        "string",
      );
    }
    expect(typeof messages.categoryManagement.viewRecords, locale).toBe("string");
  });

  it("have their status named by the module that owns them", () => {
    // `record-status.test.ts` then checks every status of each in 4 languages.
    for (const kind of CATEGORY_KINDS) {
      expect(RECORD_STATUS_NAMESPACE[kind], kind).toBeTruthy();
    }
  });
});

describe("clicking a column opens its records here (D-276)", () => {
  const source = read(MANAGEMENT);
  const page = functionBody(source, "CategoryManagement");
  const dialog = functionBody(source, "ColumnRecordsDialog");

  it("opens from the column's name and from a 查看记录 button, for any reader", () => {
    expect(page.match(/onClick=\{\(\) => setViewing\(row\)\}/g) ?? []).toHaveLength(2);
    expect(page).toMatch(/t\("viewRecords"\)/);
    // The button sits before, not inside, the manager-only actions.
    expect(page.indexOf('t("viewRecords")')).toBeLessThan(
      page.indexOf("{canManage && (\n                          <div"),
    );
  });

  it("serves every module through the one list, by the row's own id", () => {
    // `active` is any of the twelve, so every module's columns reach it.
    expect(page).toMatch(
      /\{viewing && \(\s*<ColumnRecordsDialog\s+moduleKey=\{active\.key\}\s+column=\{viewing\}/,
    );
    expect(dialog).toMatch(
      /getCategoryRecords\(\{\s*module: moduleKey,\s*category: column\.id,\s*page,\s*page_size: RECORDS_PAGE_SIZE,/,
    );
    const service = read(SERVICE);
    const list = service.slice(service.indexOf("export function getCategoryRecords("));
    expect(list).toMatch(/module: CategoryModuleKey;/);
    expect(list).toMatch(/api\.get<CategoryRecordPage>\("\/api\/category-records\/", query\)/);
    expect(CATEGORY_MODULE_KEYS).toHaveLength(12);
  });

  it("is a dialog on this page, never a link or a push", () => {
    for (const body of [page, dialog]) {
      expect(body).not.toMatch(/<Link\b|\bhref[:=]|router\.(push|replace)/);
    }
    expect(dialog).toMatch(/<Shell title=\{t\("records\.title", \{ name: column\.name \}\)\}/);
    expect(read("src/components/contractor-ops/package-shell.tsx")).toMatch(/role="dialog"/);
  });

  it("shows each row's reference, module, time, status and who archived it", () => {
    expect(dialog).toMatch(/\{row\.reference\}/);
    expect(dialog).toMatch(/\{row\.detail\}/);
    expect(dialog).toMatch(/queue\(`kind\.\$\{row\.kind\}`\)/);
    expect(dialog).toMatch(/formatter\.dateTime\(row\.submitted_at\)/);
    expect(dialog).toMatch(/recordStatusLabel\(root, row\)/);
    expect(dialog).not.toMatch(/\{row\.status_label\}/);
    for (const word of ["closure.notApplicable", "closure.closed", "closure.open"]) {
      expect(dialog, word).toContain(`queue("${word}")`);
    }
    expect(dialog).toMatch(/row\.archived\.by/);
  });

  it("says loading, failed and empty, and pages", () => {
    expect(dialog).toMatch(/records\.isLoading \?/);
    expect(dialog).toMatch(/records\.isError \?[\s\S]*?role="alert"/);
    expect(dialog).toMatch(/t\("records\.empty"\)/);
    expect(dialog).toMatch(/setPage\(\(current\) => current - 1\)/);
    expect(dialog).toMatch(/setPage\(\(current\) => current \+ 1\)/);
    expect(dialog).toMatch(/disabledReason=\{queue\("firstPage"\)\}/);
    expect(dialog).toMatch(/disabledReason=\{queue\("lastPage"\)\}/);
  });
});

describe("clicking a record opens the queue's own detail, fed from the column", () => {
  const dialog = functionBody(read(MANAGEMENT), "ColumnRecordsDialog");
  const sheet = functionBody(read(QUEUE), "RecordSheet");

  it("opens RecordSheet with getCategoryRecord, not the archive queue's door", () => {
    expect(dialog).toMatch(/onClick=\{\(\) => setOpen\(row\)\}/);
    expect(dialog).toMatch(/<RecordSheet\s+row=\{open\}\s+fetchRecord=\{getCategoryRecord\}/);
    expect(sheet).toMatch(/role="dialog"/);
    expect(sheet).toMatch(/fetchRecord\s*\?\s*fetchRecord\(row\.kind, row\.id\)/);
    const service = read(SERVICE);
    const one = service.slice(service.indexOf("export function getCategoryRecord("));
    expect(one).toMatch(/"\/api\/category-records\/get_record\/",\s*\{ kind, id \}/);
  });

  it("keeps the queue on its own door", () => {
    expect(read(QUEUE)).toMatch(/\{open && <RecordSheet row=\{open\} onClose=\{\(\) => setOpen\(null\)\} \/>\}/);
    expect(sheet).toMatch(/isQueueKind\(row\.kind\)\s*\?\s*getArchiveRecord\(row\.kind, row\.id\)/);
  });

  it("has no export button for the kinds the export endpoint does not print", () => {
    expect(sheet).toMatch(/isExportableKind\(row\.kind\) && \(\s*<RecordExportButton/);
    const service = read(SERVICE);
    const block = service.match(
      /export const EXPORTABLE_RECORD_KINDS[^=]*= \[([\s\S]*?)\];/,
    )?.[1];
    expect(block).toBeTruthy();
    const exportable = [...(block as string).matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(exportable).toHaveLength(9);
    for (const kind of [...QUEUE_ONLY_NOT, "ATTENDANCE_DAY"]) {
      expect(exportable, kind).not.toContain(kind);
    }
  });

  it("draws the conversation, the closure, the package and 我看过了 only where they work", () => {
    expect(sheet).toMatch(/canDiscuss\(row\.kind\) && \(\s*<RecordConversationPanel/);
    expect(sheet).toMatch(/canConfirmClosure\(row\.kind\) && \(\s*<RecordClosurePanel/);
    expect(sheet).toMatch(/canGoInAPackage\(row\.kind\) && \(\s*<AddToPackageButton/);
    expect(sheet).toMatch(/const queueKind = isQueueKind\(row\.kind\) \? row\.kind : null;/);
    expect(sheet).toMatch(/!queueKind \? null :/);
    for (const kind of QUEUE_ONLY_NOT) {
      expect(canDiscuss(kind), kind).toBe(false);
      expect(canConfirmClosure(kind), kind).toBe(false);
      expect(isQueueKind(kind), kind).toBe(false);
    }
    // The closure endpoint finds its record the way the chat does: a hazard
    // closes through its own verification and is "not found" there.
    expect(canConfirmClosure("HAZARD")).toBe(false);
    expect(canConfirmClosure("ATTENDANCE_DAY")).toBe(false);
    expect(isQueueKind("HAZARD")).toBe(true);
  });

  it("does not claim a mark it did not make", () => {
    // An unfinished record is in nobody's queue, so the server matches nothing.
    const service = read(SERVICE);
    const mark = service.slice(service.indexOf("export async function markRecordsArchived("));
    expect(mark).toMatch(/if \(result\.matched > 0\) toastSuccess\("archiveQueue\.toast\.archived"\)/);
    expect(sheet).toMatch(/if \(result\.matched === 0\) \{\s*setNotInQueue\(true\);/);
    expect(sheet).toMatch(/archiveQueue\.notInQueue/);
  });
});
