import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LOCALES } from "@/i18n/config";
import { loadMessages, withEnglishFallback } from "@/i18n/messages";

/**
 * The catalogue the browser loads (perf #7, 2026-10-09).
 *
 * The root layout used to hand the whole catalogue (~650 KB) to the browser
 * inside every HTML document. The browser now loads it itself as a cached,
 * hashed file; these tests pin the two things that change must not break:
 * every locale's catalogue is built exactly as before (English underneath, so
 * no raw key ever shows), and nothing in `src/app` starts sending it in the
 * page again.
 */

function json(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"));
}

describe("withEnglishFallback", () => {
  it("keeps English where a translation is missing or empty", () => {
    const english = { a: { b: "B", c: "C", d: "D" }, e: "E" };
    const overlay = { a: { b: "乙", c: "" }, e: "戊", f: "F" };
    expect(withEnglishFallback(english, overlay)).toEqual({
      a: { b: "乙", c: "C", d: "D" },
      e: "戊",
      f: "F",
    });
  });
});

describe("loadMessages", () => {
  it.each(LOCALES)("builds %s as English overlaid with the translation", async (locale) => {
    const english = json("en");
    const expected = locale === "en" ? english : withEnglishFallback(english, json(locale));
    expect(await loadMessages(locale)).toEqual(expected);
  });

  it("loads each locale once and shares it", () => {
    expect(loadMessages("zh")).toBe(loadMessages("zh"));
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full.split(path.sep).join("/")]
      : [];
  });
}

describe("the root layout", () => {
  it("lets the browser load the catalogue instead of writing it into the page", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("<IntlProvider");
    // The server NextIntlClientProvider without `messages` serialises the whole
    // request catalogue into the HTML (631 KB on /login).
    const offenders = sourceFiles("src/app").filter((file) =>
      /NextIntlClientProvider|getMessages\s*\(/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
