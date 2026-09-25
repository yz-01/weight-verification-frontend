import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Two different acts, two different names (D-270, T-391).
 *
 * The same sheet offered 「确认并归档」 (finished and locked for everyone,
 * D-234) beside 「归档（仅限我）」 (off *my* to-see list only, D-063), and
 * Lucas could not tell where either went. The per-person one became
 * 「我看过了」 (未看／已看); Lucas then asked for the queue to show
 * 「未归档／已归档」 with who archived and when - so 归档 is the name of the
 * one act that has a who and a when: 【确认归档】.
 */

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));

describe("archiving and marking seen read as two things", () => {
  it.each(["en", "zh", "zh-TW", "ms"])("%s names them differently", (locale) => {
    const m = messages(locale);
    expect(m.recordClosure.action).not.toEqual(m.archiveQueue.archive);
    expect(m.archiveQueue.closure.closed).not.toEqual(m.archiveQueue.state.archived);
  });

  it("calls only the confirm step 归档 in Chinese", () => {
    for (const locale of ["zh", "zh-TW"]) {
      const m = messages(locale);
      expect(m.recordClosure.action).toMatch(/归档|歸檔/);
      expect(m.archiveQueue.closure.closed).toMatch(/归档|歸檔/);
      for (const value of [m.archiveQueue.archive, m.archiveQueue.state.pending, m.archiveQueue.state.archived]) {
        expect(value).not.toMatch(/归档|歸檔/);
      }
    }
    expect(messages("zh").recordClosure.action).toBe("确认归档");
    expect(messages("zh").archiveQueue.archive).toBe("我看过了");
  });
});
