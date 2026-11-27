/**
 * JB297 (客户 11-28c): 「提交给总部：由总部接收待审批通知及执行审批，项目经理可以查看
 * 记录，不可以审批。」 and the same the other way round. The server decides
 * (`can_review`, `review_route`); the page offers no 确认 / 拒绝 to the
 * other side and says plainly who decides instead.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const page = readFileSync(path.join(process.cwd(), "src/components/sundry-claims/sundry-claims-office.tsx"), "utf8");

describe("the other side looks, it does not approve (JB297)", () => {
  it("the buttons follow can_review and the plain line takes their place", () => {
    // The 确认 / 拒绝 block shows only when the server says the reader decides it.
    expect(page).toMatch(/claim\.can_review !== false && \(\s*<>[\s\S]*?action\.confirm/);
    // Otherwise one plain line, by who decides it.
    expect(page).toMatch(/claim\.can_review === false && \([\s\S]*?t297\(claim\.review_route === "PROJECT" \? "viewOnly\.PROJECT" : "viewOnly\.HQ"\)/);
  });

  it("a claim head office decides because the project has no 项目经理 says so", () => {
    expect(page).toMatch(/claim\.review_route === "HQ_FALLBACK" && \([\s\S]*?t297\("fallback"\)/);
  });

  it("is said in every language, with 你", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb297.viewOnly.PROJECT).toBeTruthy();
      expect(messages.jb297.viewOnly.HQ).toBeTruthy();
      expect(messages.jb297.fallback).toBeTruthy();
      expect(messages.errors.api.sundry_claim_view_only).toContain("{submit_to, select,");
    }
    expect(zh.jb297.viewOnly.HQ).toBe("这笔报销提交给总部审批。你可以查看，不可以审批。");
    expect(zh.jb297.viewOnly.PROJECT).toBe("这笔报销提交给项目经理审批。你可以查看，不可以审批。");
    expect(zh.jb297.fallback).toBe("这个项目没有可以审批的项目经理，改由总部审批。");
    for (const words of [zh.jb297.viewOnly.HQ, zh.errors.api.sundry_claim_view_only, zhTW.jb297.viewOnly.HQ]) {
      expect(words).not.toContain("您");
    }
  });
});
