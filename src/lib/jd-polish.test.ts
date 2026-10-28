/**
 * 10-28 screenshots of the new features (polish round):
 *
 * - a report's PDF / spreadsheet printed 「ENTRY」「PENDING」: the screen now
 *   sends its words for every code a column can hold (`reportColumnValues`);
 * - 审计日志 in Chinese read 「Archive.confirm」「Login succeeded」: an
 *   operation without words is no longer made into English;
 * - 「1990年6月05日」: a Chinese date writes its day as a plain number.
 */
import { describe, expect, it } from "vitest";

import { auditObjectTypeLabel, auditOperationLabel } from "@/lib/audit-labels";
import { chineseDay } from "@/lib/dates";
import { messageCodes, reportColumnValues } from "@/lib/report-preview";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

type Messages = Record<string, unknown>;

function resolve(messages: Messages, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Messages)[part] : undefined),
    messages,
  );
}

function translator(messages: Messages) {
  const t = (key: string) => {
    const value = resolve(messages, key);
    if (typeof value !== "string") throw new Error(`missing ${key}`);
    return value;
  };
  t.has = (key: string) => resolve(messages, key) !== undefined;
  t.raw = (key: string) => resolve(messages, key);
  return t;
}

function valuesFor(messages: Messages, reportType: Parameters<typeof reportColumnValues>[0], columns: string[]) {
  const t = translator(messages);
  return reportColumnValues(
    reportType,
    columns,
    (key) => (t.has(key) && typeof t.raw(key) === "string" ? t(key) : null),
    (namespace) => messageCodes(t, namespace),
    { TONNE: "吨" },
  );
}

describe("report files word their codes (10-28)", () => {
  it("equipment: 进场 / 退场, yes / no - never ENTRY or True", () => {
    const values = valuesFor(zh, "equipment", ["direction", "occurred_at"]);
    expect(values.direction.ENTRY).toBe(zh.contractorOps.direction.ENTRY);
    expect(values.direction.EXIT).toBe(zh.contractorOps.direction.EXIT);
    expect(values.direction.true).toBe(zh.contractorReports.value.yes);
    // A column with no codes still words a yes / no.
    expect(Object.keys(values.occurred_at)).toEqual(["true", "false"]);
  });

  it("every status a report can hold, not only those on the preview's page", () => {
    const outgoing = valuesFor(zh, "material_outgoing", ["status", "unit"]);
    for (const code of Object.keys(zh.contractorOps.outgoingStatus)) {
      expect(outgoing.status[code]).toBeTruthy();
    }
    expect(outgoing.unit.TONNE).toBe("吨");
    const safety = valuesFor(zh, "safety", ["status"]);
    expect(safety.status.PENDING ?? safety.status.OPEN).toBeTruthy();
  });

  it("recycling: a disposal's and a recycling order's statuses, each in its own words", () => {
    const values = valuesFor(zh, "recycling", ["status", "record_type"]);
    expect(values.status.REQUESTED).toBe(zh.siteDisposal.status.REQUESTED);
    expect(values.status.PENDING_ACCEPTANCE).toBe(zh.dispatches.state.PENDING_ACCEPTANCE);
    expect(values.record_type.DISPOSAL).toBe(zh.wasteClearance.kind.disposal);
  });

  it("schedule and targets word their computed statuses", () => {
    expect(valuesFor(zh, "schedule", ["status"]).status.DELAYED).toBe(zh.schedulePlanning.status.delayed);
    expect(valuesFor(zh, "target", ["status"]).status.INACTIVE).toBe(zh.businessTargets.status.inactive);
  });

  it("no code is left as its own word in Chinese", () => {
    const values = valuesFor(zh, "equipment", ["direction", "ocr_status"]);
    for (const [code, word] of Object.entries({ ...values.direction, ...values.ocr_status })) {
      expect(word, code).not.toBe(code);
    }
  });
});

describe("audit operations in the reader's words (10-28)", () => {
  const zhT = translator(zh);

  it("the screenshots' operations read in Chinese", () => {
    expect(auditOperationLabel("login_succeeded", zhT, "zh")).toBe("登录成功");
    expect(auditOperationLabel("receipt_records_queried", zhT, "zh")).toBe("查询材料进场记录");
    // A PIN-signed operation, worded where the PIN dialog words it.
    expect(auditOperationLabel("archive.confirm", zhT, "zh")).toBe(zh.signOff.action.archive_confirm);
    expect(auditOperationLabel("assistant.manage", zhT, "zh")).toBe(zh.signOff.action.assistant_manage);
  });

  it("an operation without words adds nothing in Chinese or Malay; English reads it out", () => {
    expect(auditOperationLabel("some_new_thing", zhT, "zh")).toBeNull();
    expect(auditOperationLabel("some_new_thing", translator(ms), "ms")).toBeNull();
    expect(auditOperationLabel("some_new_thing", translator(en), "en")).toBe("Some new thing");
    expect(auditOperationLabel(undefined, zhT, "zh")).toBeNull();
  });

  it("what a row is about: worded, or left out in Chinese", () => {
    expect(auditObjectTypeLabel("SignOffAssistant", zhT, "zh")).toBe("助理副密码");
    expect(auditObjectTypeLabel("SignOffAssistant", translator(zhTW), "zh-TW")).toBe("助理副密碼");
    expect(auditObjectTypeLabel("SomeModel", zhT, "zh")).toBeNull();
    expect(auditObjectTypeLabel("SomeModel", translator(en), "en")).toBe("SomeModel");
  });

  it("every operation word exists in all four languages", () => {
    const keys = Object.keys(en.audit.operation);
    for (const messages of [zh, zhTW, ms]) {
      expect(Object.keys(messages.audit.operation).sort()).toEqual([...keys].sort());
      expect(Object.keys(messages.audit.objectType).sort()).toEqual(Object.keys(en.audit.objectType).sort());
    }
  });
});

describe("dates (10-28)", () => {
  it("a Chinese date writes its day as a plain number", () => {
    expect(chineseDay("zh")).toBe(true);
    expect(chineseDay("zh-TW")).toBe(true);
    expect(chineseDay("en")).toBe(false);
    expect(chineseDay("ms")).toBe(false);
    const day = new Intl.DateTimeFormat("zh-CN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date("1990-06-05T04:00:00Z"));
    expect(day).toBe("1990年6月5日");
  });
});

describe("文件资料报表's 上传时间 (10-28)", () => {
  it("is read as a date and time, not the raw ISO text", async () => {
    const { REPORT_DATE_TIME_COLUMNS } = await import(
      "@/components/contractor-ops/contractor-report-workspace"
    );
    expect(REPORT_DATE_TIME_COLUMNS.has("created_at")).toBe(true);
  });
});
