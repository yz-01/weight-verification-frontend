/**
 * 外观 (Lucas 2026-10-08): 跟随系统 / 浅色 / 深色, one setting per device.
 *
 * The choice is applied before the first paint by the inline script the
 * theme provider renders into the page. These run that very script - taken
 * from the provider as the app configures it - against a stand-in page,
 * browser storage and system setting, and read which class it leaves on
 * <html>. Where the script can apply nothing (storage blocked), the
 * stylesheet itself must fall back to the system setting; the last test reads
 * `globals.css` for that.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ThemeProvider } from "next-themes";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { THEME_CHOICES, THEME_PROVIDER_PROPS } from "@/lib/theme";

const markup = renderToStaticMarkup(
  <ThemeProvider {...THEME_PROVIDER_PROPS}>
    <span />
  </ThemeProvider>,
);
const script = markup.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";

function paint({
  stored,
  osDark,
  storageThrows = false,
}: {
  stored: string | null;
  osDark: boolean;
  storageThrows?: boolean;
}): Set<string> {
  const classes = new Set<string>();
  const documentElement = {
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
    },
    setAttribute: () => undefined,
    style: {} as Record<string, string>,
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("storage is blocked");
      return key === THEME_PROVIDER_PROPS.storageKey ? stored : null;
    },
  };
  const window = {
    matchMedia: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? osDark : false,
    }),
  };
  new Function("document", "localStorage", "window", script)(
    { documentElement },
    localStorage,
    window,
  );
  return classes;
}

describe("外观: the choice applied before the first paint", () => {
  it("offers exactly 跟随系统, 浅色 and 深色, and starts on 跟随系统", () => {
    expect(THEME_CHOICES).toEqual(["system", "light", "dark"]);
    expect(THEME_PROVIDER_PROPS.defaultTheme).toBe("system");
    expect(script).toContain("localStorage");
  });

  it("a stored choice wins over the system", () => {
    expect([...paint({ stored: "light", osDark: true })]).toEqual(["light"]);
    expect([...paint({ stored: "dark", osDark: false })]).toEqual(["dark"]);
  });

  it("跟随系统 follows the system, stored or by default", () => {
    expect([...paint({ stored: "system", osDark: true })]).toEqual(["dark"]);
    expect([...paint({ stored: "system", osDark: false })]).toEqual(["light"]);
    expect([...paint({ stored: null, osDark: true })]).toEqual(["dark"]);
    expect([...paint({ stored: null, osDark: false })]).toEqual(["light"]);
  });

  it("storage that throws leaves no choice on the page, so the system decides", () => {
    expect([...paint({ stored: "light", osDark: true, storageThrows: true })]).toEqual([]);
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    // The dark tokens apply under the system's dark setting unless 浅色 was
    // chosen...
    const fallback = css.slice(css.indexOf("@media (prefers-color-scheme: dark) {\n  :root:not(.light) {"));
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback).toContain("--background: #060b16;");
    const dark = css.slice(css.indexOf("\n.dark {"), css.indexOf("\n}\n", css.indexOf("\n.dark {")));
    expect(dark).toContain("--background: #060b16;");
    // ...and so does every `dark:` class.
    expect(css).toMatch(/@custom-variant dark \{[\s\S]*prefers-color-scheme: dark[\s\S]*:root:not\(\.light\)/);
  });
});
