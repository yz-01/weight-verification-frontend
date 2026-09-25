import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RECORD_STATUSES, RECORD_STATUS_NAMESPACE, recordStatusLabel } from "@/lib/record-status";

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));
const read = (tree: Record<string, unknown>, key: string) =>
  key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);

describe("a record's status in its module's words (T-391)", () => {
  it.each(["en", "zh", "zh-TW", "ms"])("%s names every status of every kind", (locale) => {
    const tree = messages(locale);
    for (const [kind, statuses] of Object.entries(RECORD_STATUSES)) {
      for (const status of statuses) {
        const key = `${RECORD_STATUS_NAMESPACE[kind]}.${status}`;
        expect(typeof read(tree, key), `${locale}: ${key}`).toBe("string");
      }
    }
    expect(typeof read(tree, "archiveQueue.people")).toBe("string");
  });

  it("uses the module's name, not the server's English", () => {
    const zh = messages("zh");
    const t = Object.assign((key: string) => String(read(zh, key)), {
      has: (key: string) => typeof read(zh, key) === "string",
    });
    expect(recordStatusLabel(t, { kind: "EQUIPMENT_MOVEMENT", status: "EXIT", status_label: "Exit" })).toBe(
      read(zh, "contractorOps.direction.EXIT"),
    );
    expect(
      recordStatusLabel(t, { kind: "MATERIAL_OUTGOING", status: "RELEASED", status_label: "Released (before D-211)" }),
    ).not.toMatch(/D-211|Released/);
  });

  it("is what both screens print", () => {
    for (const file of ["src/components/contractor-ops/archive-queue.tsx", "src/components/field-staff/my-submissions.tsx"]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).toContain("recordStatusLabel(");
      expect(source, file).not.toMatch(/\{row\.status_label\}|label=\{row\.status_label\}/);
    }
  });
});

describe("the phone and the consultant columns use their own words", () => {
  it("names a site record's status on the phone the way the phone's task list does", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/field-staff/my-submissions.tsx"), "utf8");
    expect(source).toMatch(/SITE_RECORD: "fieldStaffPwa\.status"/);
    expect(source).toMatch(/recordStatusLabel\(t, row, PHONE_STATUS\)/);
    for (const locale of ["en", "zh", "zh-TW", "ms"]) {
      const tree = messages(locale);
      for (const status of RECORD_STATUSES.SITE_RECORD) {
        expect(typeof read(tree, `fieldStaffPwa.status.${status}`), `${locale}: ${status}`).toBe("string");
      }
    }
  });

  it("calls a consultant column's records 顾问资料提交, not 现场记录", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/category-management.tsx"), "utf8");
    expect(source).toMatch(/moduleKey === "consultant" && row\.kind === "SITE_RECORD"[\s\S]{0,80}fieldStaffPwa\.records\.consultant/);
  });
});
