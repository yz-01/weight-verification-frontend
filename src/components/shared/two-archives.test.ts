import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Two different acts, two different names (D-270).
 *
 * The same sheet offered 「确认并归档」 (the matter is finished and locked for
 * everyone, D-234) beside 「归档（仅限我）」 (off *my* to-see list only, D-063).
 * Lucas: 「确认并归档后是归档去哪里？好乱啊我不会用」. Neither moves the record
 * anywhere, so neither is called 归档 any more.
 */

const messages = (locale: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));

describe("confirming finished and marking seen read as two things", () => {
  it.each(["en", "zh", "zh-TW", "ms"])("%s names them differently", (locale) => {
    const m = messages(locale);
    expect(m.recordClosure.action).not.toEqual(m.archiveQueue.archive);
  });

  it("uses neither word 归档 in Chinese", () => {
    for (const locale of ["zh", "zh-TW"]) {
      const m = messages(locale);
      for (const value of [m.recordClosure.action, m.recordClosure.title, m.archiveQueue.archive]) {
        expect(value).not.toMatch(/归档|歸檔/);
      }
    }
    expect(messages("zh").recordClosure.action).toBe("确认完成");
    expect(messages("zh").archiveQueue.archive).toBe("我看过了");
  });
});
