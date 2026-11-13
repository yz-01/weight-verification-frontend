/**
 * JB193 (客户 11-14): 「请完善现有 Multi Engine 资料打包功能」 - 材料领用（MIN）、
 * 工程进度日报告、文件档案、现场记录中心 join the packing that is already there:
 * 【添加资料】 offers their own lists (JB193-2), a MIN counts once however many
 * lines it has (一 1), the record centre asks about several kinds at once (四 1),
 * and every page names a package record the same way (五 2).
 */
import { describe, expect, it } from "vitest";

import { packageKindKey, packageKindName, withFixedFiles } from "@/lib/package-items";
import {
  PACK_TARGETS,
  collectHref,
  packRecordRefs,
  targetKinds,
  uniqueIds,
} from "@/lib/pack-collect";
import { officeNotificationHref } from "@/lib/office-notification";
import { QUEUE_KINDS } from "@/lib/record-chat";
import { recordTarget } from "@/lib/record-routes";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;

/** A dotted key's words in one catalogue. */
function words(catalogue: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalogue);
}

const target = (key: string) => PACK_TARGETS.find((row) => row.key === key);
const keys = PACK_TARGETS.map((row) => row.key);

describe("JB193-2: 【添加资料】 has the four new lists", () => {
  it("offers 材料领用（MIN） right after 材料出场, on the MIN list", () => {
    const issue = target("issue");
    expect(issue?.kind).toBe("MATERIAL_OUTGOING");
    expect(keys.indexOf("issue")).toBe(keys.indexOf("outgoing") + 1);
    const url = new URL(collectHref(issue!, { id: "pk1", project: "p1" }), "https://office.local");
    expect(url.pathname).toBe("/material-outgoing");
    expect(url.searchParams.get("kind")).toBe("ISSUE");
    expect(url.searchParams.get("project")).toBe("p1");
    expect(url.searchParams.get("pack")).toBe("pk1");
  });

  it("offers 日报告 right after the rain records, on 工程进度's 日报告 tab", () => {
    const reports = target("dailyReports");
    expect(reports?.kind).toBe("DAILY_REPORT");
    expect(keys.indexOf("dailyReports")).toBe(keys.indexOf("rain") + 1);
    const url = new URL(collectHref(reports!, { id: "pk1", project: "p1" }), "https://office.local");
    expect(url.pathname).toBe("/progress");
    expect(url.searchParams.get("tab")).toBe("reports");
    expect(url.searchParams.get("pack")).toBe("pk1");
  });

  it("offers 文件档案 on the document archive, and 现场记录中心 with every queue kind", () => {
    expect(target("documents")).toMatchObject({ kind: "DOCUMENT", path: "/documents" });
    const queue = target("archiveQueue");
    expect(queue?.path).toBe("/archive-queue");
    // Not one kind made up for it: the page mixes kinds, each row its own.
    expect(typeof queue?.kind).not.toBe("string");
    expect([...targetKinds(queue!)].sort()).toEqual([...QUEUE_KINDS].sort());
    // 人员进场 by day is one of them now (四 4).
    expect(targetKinds(queue!)).toContain("ATTENDANCE_DAY");
    // A single-kind target is a list of one.
    expect(targetKinds(target("receipts")!)).toEqual(["MATERIAL_RECEIPT"]);
  });

  it("names them as the menu does (spec 第二十六轮: the existing nav keys, one new)", () => {
    expect(target("issue")?.labelKey).toBe("nav.submodule.materialIssue");
    expect(target("dailyReports")?.labelKey).toBe("nav.submodule.dailyReport");
    expect(target("documents")?.labelKey).toBe("nav.submodule.documentArchive");
    expect(target("archiveQueue")?.labelKey).toBe("nav.submodule.archiveQueue");
    expect(zh.nav.submodule.materialIssue).toBe("材料领用（MIN）");
    expect(zhTW.nav.submodule.materialIssue).toBe("材料領用（MIN）");
    expect(en.nav.submodule.materialIssue).toBe("Material issue (MIN)");
    expect(ms.nav.submodule.materialIssue).toBe("Pengeluaran bahan (MIN)");
    expect(zh.nav.submodule.dailyReport).toBe("日报告");
    expect(zh.nav.submodule.archiveQueue).toBe("现场记录中心");
  });
});

describe("JB193-1: a MIN is one record, however many lines it has", () => {
  it("asks about, ticks and counts each record once, in the page's order", () => {
    // Three lines of MIN o-1 and one of o-2, as the 材料领用 list draws them.
    const lines = [{ record: "o-1" }, { record: "o-1" }, { record: "o-2" }, { record: "o-1" }];
    expect(uniqueIds(lines.map((line) => line.record))).toEqual(["o-1", "o-2"]);
    // A list whose ids were already unique asks exactly as before.
    expect(uniqueIds(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(uniqueIds(["a", "", "a"])).toEqual(["a"]);
  });
});

describe("JB193-6 / JB193-7: the record centre asks with each row's own kind", () => {
  const rows = [
    { id: "r1", kind: "MATERIAL_RECEIPT" as const },
    { id: "o1", kind: "MATERIAL_OUTGOING" as const },
    // A day of 人员进场: its id is computed on the server, sent as it is.
    { id: "5f0c6a8e-1d7b-5c3e-9a41-2b8f0e6d7c19", kind: "ATTENDANCE_DAY" as const },
    { id: "r1", kind: "MATERIAL_RECEIPT" as const },
  ];

  it("gives every record once with its kind", () => {
    expect(packRecordRefs(rows, (row) => row.id, (row) => row.kind)).toEqual([
      { kind: "MATERIAL_RECEIPT", id: "r1" },
      { kind: "MATERIAL_OUTGOING", id: "o1" },
      { kind: "ATTENDANCE_DAY", id: "5f0c6a8e-1d7b-5c3e-9a41-2b8f0e6d7c19" },
    ]);
    expect(packRecordRefs([], (row: { id: string }) => row.id, () => "PROGRESS")).toEqual([]);
  });
});

describe("JB193-1 / JB193-8: a package record says what it is", () => {
  const fake = (catalogue: unknown) => {
    const t = ((key: string) => String(words(catalogue, `multiEngine.${key}`))) as ((key: string) => string) & {
      has: (key: string) => boolean;
    };
    t.has = (key: string) => typeof words(catalogue, `multiEngine.${key}`) === "string";
    return t;
  };

  it("calls a MIN 「材料领用」 and an MO still 「材料出场」", () => {
    expect(packageKindKey({ record_kind: "MATERIAL_OUTGOING", outgoing_kind: "ISSUE" })).toBe("MATERIAL_ISSUE");
    expect(packageKindKey({ record_kind: "MATERIAL_OUTGOING", outgoing_kind: "RETURN" })).toBe("MATERIAL_OUTGOING");
    expect(packageKindKey({ record_kind: "MATERIAL_OUTGOING" })).toBe("MATERIAL_OUTGOING");
    expect(packageKindKey({ record_kind: "PROGRESS", outgoing_kind: null })).toBe("PROGRESS");
    const t = fake(zh);
    expect(packageKindName(t, { record_kind: "MATERIAL_OUTGOING", outgoing_kind: "ISSUE" })).toBe("材料领用");
    expect(packageKindName(t, { record_kind: "MATERIAL_OUTGOING", outgoing_kind: "RETURN" })).toBe("材料出场");
  });

  it("names 日报告, 文件档案 and 人员进场 in all four languages", () => {
    const t = fake(zh);
    expect(packageKindName(t, { record_kind: "DAILY_REPORT" })).toBe("日报告");
    expect(packageKindName(t, { record_kind: "DOCUMENT" })).toBe("文件档案");
    expect(packageKindName(t, { record_kind: "ATTENDANCE_DAY" })).toBe("人员进场");
    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      for (const kind of ["DAILY_REPORT", "DOCUMENT", "ATTENDANCE_DAY", "MATERIAL_ISSUE"]) {
        expect(typeof words(catalogue, `multiEngine.kind.${kind}`), `${locale} ${kind}`).toBe("string");
      }
    }
    expect(zhTW.multiEngine.kind.MATERIAL_ISSUE).toBe("材料領用");
    expect(en.multiEngine.kind.DAILY_REPORT).toBe("Daily report");
  });

  it("shows an unknown kind's code instead of breaking the page", () => {
    expect(packageKindName(fake(zh), { record_kind: "SOMETHING_NEW" })).toBe("SOMETHING_NEW");
    // An ISSUE whose words were missing still falls back to 材料出场.
    const noIssue = fake({ multiEngine: { kind: { MATERIAL_OUTGOING: "材料出场" } } });
    expect(packageKindName(noIssue, { record_kind: "MATERIAL_OUTGOING", outgoing_kind: "ISSUE" })).toBe("材料出场");
  });
});

describe("JB193-3 / JB193-5: a record's own body cannot be unticked", () => {
  const files = [
    { id: "f-pdf", fixed: true },
    { id: "f-extra" },
    { id: "f-sys", fixed: true },
  ];

  it("puts every fixed file back into a selection that names its files", () => {
    expect(withFixedFiles({ files: [] }, files).files).toEqual(["f-pdf", "f-sys"]);
    expect(withFixedFiles({ fields: ["a"], files: ["f-extra"] }, files)).toEqual({
      fields: ["a"],
      files: ["f-extra", "f-pdf", "f-sys"],
    });
  });

  it("leaves alone a selection that means every file, or a record with none fixed", () => {
    const all: { fields: string[]; files?: string[] } = { fields: ["a"] };
    expect(withFixedFiles(all, files)).toBe(all);
    const some = { files: ["f-extra"] };
    expect(withFixedFiles(some, [{ id: "f-extra" }])).toBe(some);
    expect(withFixedFiles(some, undefined)).toBe(some);
  });
});

describe("the words both sides print (contract table)", () => {
  const TABLE: Array<[string, Record<keyof typeof CATALOGUES, string>]> = [
    ["archiveQueue.kind.DAILY_REPORT", { zh: "日报告", "zh-TW": "日報告", en: "Daily report", ms: "Laporan harian" }],
    ["mySubmissions.field.report_name", { zh: "日报告名称", "zh-TW": "日報告名稱", en: "Report name", ms: "Nama laporan" }],
    ["mySubmissions.field.report_period", { zh: "报告日期", "zh-TW": "報告日期", en: "Report dates", ms: "Tarikh laporan" }],
    // en / ms: the daily reports list's own words for the same count - the contract's
    // "Progress records" / "Rekod kemajuan" are retired module names (T-367, field-home-naming).
    ["mySubmissions.field.report_records", { zh: "进度记录", "zh-TW": "進度記錄", en: "Records taken in", ms: "Rekod yang dimasukkan" }],
    ["mySubmissions.field.report_photos", { zh: "照片数量", "zh-TW": "照片數量", en: "Photos", ms: "Foto" }],
  ];

  it.each(TABLE)("%s reads exactly as the contract says", (key, expected) => {
    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      expect(words(catalogue, key), `${locale} ${key}`).toBe(expected[locale as keyof typeof CATALOGUES]);
    }
  });

  it("keeps the PDF words of 文件档案, 人员进场 and 材料领用单 that were already there", () => {
    for (const catalogue of Object.values(CATALOGUES)) {
      for (const kind of ["DOCUMENT", "ATTENDANCE_DAY", "MATERIAL_ISSUE"]) {
        expect(typeof words(catalogue, `archiveQueue.kind.${kind}`), kind).toBe("string");
      }
    }
  });

  it("says why a document cannot go in yet, and that a record's body always does", () => {
    expect(zh.multiEngine.collect.reason.not_archived).toBe("这份文件还没确认归档，归档后才能放进资料包");
    expect(zh.multiEngine.fixedPart).toBe("一定会放进资料包");
    for (const catalogue of Object.values(CATALOGUES)) {
      expect(typeof catalogue.multiEngine.collect.reason.not_archived).toBe("string");
      expect(typeof catalogue.multiEngine.fixedPart).toBe("string");
    }
    // The client reads 你, never 您.
    for (const value of [zh.multiEngine.collect.reason.not_archived, zh.multiEngine.fixedPart, zhTW.multiEngine.fixedPart]) {
      expect(value).not.toContain("您");
    }
  });
});

describe("JB193-9: a returned daily report or document opens the record", () => {
  it("routes a daily report to its tab with the report open", () => {
    expect(recordTarget("DAILY_REPORT", "d1")).toEqual({ href: "/progress?tab=reports&report=d1" });
    expect(recordTarget("DOCUMENT", "doc1")).toEqual({ href: "/documents?document=doc1" });
  });

  it("follows the notice to the record, by its subject or by the phone-style link", () => {
    expect(officeNotificationHref({ record_kind: "DAILY_REPORT", record_id: "d1" })).toBe(
      "/progress?tab=reports&report=d1",
    );
    expect(officeNotificationHref({ href: "/field-staff?tab=home&chat=DAILY_REPORT:d1" })).toBe(
      "/progress?tab=reports&report=d1",
    );
    expect(officeNotificationHref({ href: "/field-staff?tab=home&chat=DOCUMENT:doc1" })).toBe(
      "/documents?document=doc1",
    );
    // A hazard keeps its own room: unchanged.
    expect(officeNotificationHref({ href: "/field-staff?tab=home&chat=HAZARD:h1" })).toBeNull();
  });
});
