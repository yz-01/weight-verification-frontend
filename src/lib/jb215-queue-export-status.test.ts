import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import zh from "@/messages/zh.json";
import { RECORD_STATUSES, recordStatusLabel, recordStatusWords } from "@/lib/record-status";

/**
 * JB215 (found by JB215B): 现场记录中心's export printed each record's status
 * as the server's English label (「Verified and closed」…) in a Chinese file.
 * The server now sends `<kind>:<status>` (`kind_status`) and the screen sends
 * the words it shows for each, so a zh export reads like the zh list.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

function lookup(key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    zh,
  );
}

const t = Object.assign(
  (key: string, values?: Record<string, string | number>) => {
    const found = lookup(key);
    if (typeof found !== "string") return key;
    return found.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  },
  { has: (key: string) => typeof lookup(key) === "string" },
);

const CJK = /[一-鿿]/;

describe("现场记录中心 export: the status column", () => {
  it("words every kind's every status in Chinese, as the list does", () => {
    const words = recordStatusWords(t);
    for (const [kind, statuses] of Object.entries(RECORD_STATUSES)) {
      for (const status of statuses) {
        const said = words[`${kind}:${status}`];
        expect(said, `${kind}:${status}`).toBe(recordStatusLabel(t, { kind, status, status_label: status }));
        expect(CJK.test(said), `${kind}:${status} → ${said}`).toBe(true);
      }
    }
  });

  it("a 施工准证 reads in the permit's own words", () => {
    const words = recordStatusWords(t);
    expect(words["HAZARD:PERMIT:RECTIFICATION_SUBMITTED"]).toBe(zh.permits.status.RECTIFICATION_SUBMITTED);
    expect(words["HAZARD:PERMIT:VERIFIED"]).toBe(zh.permits.status.VERIFIED);
    for (const status of RECORD_STATUSES.HAZARD) {
      expect(CJK.test(words[`HAZARD:PERMIT:${status}`]), status).toBe(true);
    }
  });

  it("the export asks for kind_status with those words, not the English label", () => {
    const queue = read("src/components/contractor-ops/archive-queue.tsx");
    expect(queue).toContain('{ key: "kind_status", label: t("column.status"), values: recordStatusWords(root) },');
    expect(queue).not.toContain('{ key: "status_label", label: t("column.status") }');
  });
});
