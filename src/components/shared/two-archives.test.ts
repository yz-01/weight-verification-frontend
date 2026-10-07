import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Two different things, two different names (D-270, T-391, 2026-10 C4).
 *
 * The same sheet once offered 「确认并归档」 (finished and locked for everyone,
 * D-234) beside 「归档（仅限我）」 (off *my* to-see list only, D-063), and
 * Lucas could not tell where either went. The per-person one became 「未看／
 * 已看」; 归档 is the name of the one act that has a who and a when:
 * 【确认归档】. Since C4 that act is on each module's own page and the record
 * centre only reads - opening a record there is the look, so 「我看过了」 is
 * gone as a button and as a text.
 */

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));

describe("archiving and seeing read as two things", () => {
  it.each(["en", "zh", "zh-TW", "ms"])("%s names them differently", (locale) => {
    const m = messages(locale);
    expect(m.archiveQueue.closure.closed).not.toEqual(m.archiveQueue.state.archived);
  });

  it.each(["en", "zh", "zh-TW", "ms"])("%s has no 「我看过了」 left (C4)", (locale) => {
    const m = messages(locale);
    for (const key of ["archive", "alreadyArchived", "notInQueue", "archiveHelp", "toast"]) {
      expect(m.archiveQueue, key).not.toHaveProperty(key);
    }
    expect(typeof m.archiveQueue.hazardClosure.closed).toBe("string");
    expect(typeof m.archiveQueue.hazardClosure.open).toBe("string");
  });

  it("calls only the confirm step 归档 in Chinese", () => {
    for (const locale of ["zh", "zh-TW"]) {
      const m = messages(locale);
      expect(m.recordClosure.action).toMatch(/归档|歸檔/);
      expect(m.archiveQueue.closure.closed).toMatch(/归档|歸檔/);
      for (const value of [m.archiveQueue.state.pending, m.archiveQueue.state.archived]) {
        expect(value).not.toMatch(/归档|歸檔/);
      }
    }
    expect(messages("zh").recordClosure.action).toBe("确认归档");
    expect(messages("zh").archiveQueue.hazardClosure).toMatchObject({ closed: "已闭环", open: "未闭环" });
  });
});
