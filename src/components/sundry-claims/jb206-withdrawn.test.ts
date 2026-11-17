/**
 * JB206-8 (Lucas 11-16 audit): a withdrawn (撤回) 杂费报销 says it was
 * withdrawn, instead of an empty action area.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

describe("a withdrawn claim says so (JB206-8)", () => {
  it("on the detail", () => {
    const page = readFileSync(path.join(process.cwd(), "src/components/sundry-claims/sundry-claims-office.tsx"), "utf8");
    expect(page).toMatch(/status === "CANCELLED" && \([\s\S]*?t\("withdrawn"\)/);
  });

  it("in every catalogue", () => {
    for (const messages of [zh, zhTW, en, ms]) expect(messages.sundryClaim.withdrawn).toBeTruthy();
    expect(zh.sundryClaim.withdrawn).toContain("撤回");
  });
});
