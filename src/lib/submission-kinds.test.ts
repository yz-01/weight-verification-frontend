import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { recordKindIcon } from "@/components/shared/photo-thumb";
import type { MySubmissionRow } from "@/interfaces/contractor";
import {
  PHONE_KIND_STATUSES,
  PHONE_STATUS_NAMESPACE,
  QUEUED_SUBMISSION_KINDS,
  rowTalksAsGateIssue,
  submissionKindKey,
} from "@/lib/submission-kinds";

/**
 * JB116 - Lucas 11-06: 「这里写的是全部提交记录，可是我刚刚提交了门岗照片没有出现在
 * 这里，这个部分应该是会显示所有不管什么的提交记录才对」. Every kind the server now
 * lists must read as words in all four languages, never as a key path.
 */

const LOCALES = ["en", "zh", "zh-TW", "ms"] as const;

function messages(locale: string) {
  const file = path.join(process.cwd(), "src", "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function at(root: unknown, dotted: string) {
  return dotted
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
      root,
    );
}

/** Every kind the server's `DETAIL_SOURCES` answers for. */
const ROW_KINDS: MySubmissionRow["kind"][] = [
  "MATERIAL_RECEIPT",
  "SITE_RECORD",
  "WASTE_OUTGOING",
  "HAZARD",
  "PROGRESS",
  "DRIVER_TRIP",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "DISPOSAL_REQUEST",
  "SUNDRY_CLAIM",
  "MATERIAL_REQUEST",
  "GATE_INCIDENT",
  "VISITOR_ARRIVAL",
  "EQUIPMENT_HOURS",
  "ATTENDANCE",
  "PERMIT",
];

describe("「我提交过的」 names every kind (JB116)", () => {
  it.each(LOCALES)("every kind, and each way a row is named, has a %s name", (locale) => {
    const catalogue = messages(locale);
    const keys = [
      ...ROW_KINDS.map((kind) => submissionKindKey({ kind })),
      submissionKindKey({ kind: "GATE_INCIDENT", gate_issue: true }),
      submissionKindKey({ kind: "SITE_RECORD", task_type: "CONSULTANT" }),
      ...Object.values(QUEUED_SUBMISSION_KINDS).map((kind) => `mySubmissions.kind.${kind}`),
    ];
    const missing = keys.filter((key) => typeof at(catalogue, key) !== "string");
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("each new kind's statuses read as %s words", (locale) => {
    const catalogue = messages(locale);
    const missing = Object.entries(PHONE_KIND_STATUSES).flatMap(([kind, statuses]) =>
      statuses
        .map((status) => `${PHONE_STATUS_NAMESPACE[kind]}.${status}`)
        .filter((key) => typeof at(catalogue, key) !== "string"),
    );
    expect(missing).toEqual([]);
  });

  it("names a gate issue and a consultant request apart from their kind", () => {
    expect(submissionKindKey({ kind: "GATE_INCIDENT" })).toBe("mySubmissions.kind.GATE_INCIDENT");
    expect(submissionKindKey({ kind: "GATE_INCIDENT", gate_issue: true })).toBe("mySubmissions.kind.GATE_ISSUE");
    expect(submissionKindKey({ kind: "SITE_RECORD", task_type: "OTHER" })).toBe("mySubmissions.kind.SITE_RECORD");
    expect(submissionKindKey({ kind: "SITE_RECORD", task_type: "CONSULTANT" })).toBe("mySubmissions.kind.CONSULTANT");
    expect(messages("zh").mySubmissions.kind.GATE_INCIDENT).toBe("门岗照片");
    expect(messages("zh").mySubmissions.kind.CONSULTANT).toBe("顾问申请");
  });

  it("opens the conversation on a gate issue only", () => {
    expect(rowTalksAsGateIssue({ kind: "GATE_INCIDENT", gate_issue: true })).toBe(true);
    expect(rowTalksAsGateIssue({ kind: "GATE_INCIDENT", gate_issue: false })).toBe(false);
    expect(rowTalksAsGateIssue({ kind: "HAZARD", gate_issue: true })).toBe(false);
  });

  it("gives every new kind its own icon", () => {
    const fallback = recordKindIcon(null);
    for (const kind of ["GATE_INCIDENT", "VISITOR_ARRIVAL", "EQUIPMENT_HOURS", "ATTENDANCE", "PERMIT"]) {
      expect(recordKindIcon(kind), kind).not.toBe(fallback);
    }
  });
});
