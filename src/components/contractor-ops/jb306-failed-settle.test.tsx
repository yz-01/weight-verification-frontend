/**
 * 客户 11-28i: 「刚才测试设备租赁月结单，已经提交结算，系统仍然显示「已核对、待结算」」.
 * The walk reproduced it: a 结算 that failed left the window open with nothing
 * said (only the global toast, unseen behind the window). Now the 核对 and
 * 结算 windows say it themselves.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/interfaces/api";
import { SIGN_OFF_CANCELLED } from "@/lib/sign-off";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/equipment-rental-statements",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1", full_name: "Office", email: "office@x.test" }, can: () => true }),
}));

const { FailedLine } = await import("@/components/contractor-ops/return-checks");

const NOT_SETTLED = zh.jb306.notSettled;
const html = (error: unknown) => renderToStaticMarkup(<FailedLine error={error} notSaved={NOT_SETTLED} />);

describe("a 核对 / 结算 that did not go through says so in the window", () => {
  it("a server fault (the walk's 500) says it was not settled and is still under 已核对", () => {
    const out = html(new ApiError(zh.errors.generic, 500, {}, "server_error"));
    expect(out).toContain('role="alert"');
    expect(out).toContain(NOT_SETTLED);
    expect(NOT_SETTLED).toContain("没有成功");
    expect(NOT_SETTLED).toContain("「已核对」");
  });

  it("a refusal says its own words (e.g. the 「结算确认」 switch is off)", () => {
    const refusal = zh.errors.api.finance_confirm_settlement_off;
    const out = html(new ApiError(refusal, 403, {}, "finance_confirm_settlement_off"));
    expect(out).toContain(refusal);
    expect(out).not.toContain(NOT_SETTLED);
  });

  it("says nothing before trying, or when the PIN window was closed", () => {
    expect(html(null)).toBe("");
    expect(html(new ApiError("", 0, {}, SIGN_OFF_CANCELLED))).toBe("");
  });

  it("is under both the 【确认核对】 and the 【确认结算】 buttons, in every language", () => {
    const source = readFileSync(join(process.cwd(), "src/components/contractor-ops/return-checks.tsx"), "utf8");
    expect(source).toContain('<FailedLine error={save.error} notSaved={t306("notChecked")} />');
    expect(source).toContain('<FailedLine error={save.error} notSaved={t306("notSettled")} />');
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.jb306.notChecked).toBeTruthy();
      expect(messages.jb306.notSettled).toBeTruthy();
    }
  });
});
