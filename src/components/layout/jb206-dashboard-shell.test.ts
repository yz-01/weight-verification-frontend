/**
 * JB206-8 (Lucas 11-16 audit): a page this account may not open said
 * nothing - the shell moved to the first allowed page and the reader thought
 * the button was broken. It now says so once, with what to do; leaving the
 * home address says nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { refusedPageNotice } from "@/lib/refused-page";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

describe("a refused page says so (JB206-8)", () => {
  it("for a page", () => {
    expect(refusedPageNotice("/deductions")).toBe("common.pageNotOpen");
    expect(refusedPageNotice("/projects/create")).toBe("common.pageNotOpen");
  });

  it("not for the home address", () => {
    expect(refusedPageNotice("/dashboard")).toBeNull();
    expect(refusedPageNotice("/")).toBeNull();
  });

  it("before it moves, once per address", () => {
    const shell = readFileSync(path.join(process.cwd(), "src/components/layout/dashboard-shell.tsx"), "utf8");
    expect(shell).toMatch(/toastRefusal\(notice\);\s*\}\s*redirectWithFallback\(/);
    expect(shell).toContain("toldRefused.current !== pathname");
  });

  it("in every catalogue, saying whom to ask", () => {
    for (const messages of [zh, zhTW, en, ms]) expect(messages.common.pageNotOpen).toBeTruthy();
    expect(zh.common.pageNotOpen).toContain("管理员");
  });
});
