/**
 * JB287: 【清运费用设定】 is signed with the six-digit PIN, as 材料单价 is
 * (客户: 「参照现有材料分类的价格设定方式」).
 *
 * The fee window has no PIN box of its own: the server refuses the save with
 * `sign_off_pin_required`, the shared dialog asks, and the same save goes
 * again with the PIN. A wrong PIN comes back to that dialog (with the tries
 * left) and the window stays as typed; closing the dialog saves nothing and
 * shows no error.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publishTranslator } from "@/lib/i18n-runtime";
import { isSignOffCancelled, registerSignOff, resetSignOffForTests, type SignOffAsk } from "@/lib/sign-off";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { setDisposalFee } from "@/services/disposal-settlement.service";

const REQUIRED = {
  success: false,
  message: "Enter your six-digit sign-off PIN.",
  code: "sign_off_pin_required",
  errors: { sign_off_pin: ["Required."] },
  values: { action: "disposal_fee.set" },
};
const WRONG = {
  success: false,
  message: "The sign-off PIN is incorrect.",
  code: "sign_off_pin_incorrect",
  errors: { sign_off_pin: ["Incorrect."] },
  values: { attempts_left: 4 },
};
const SAVED = {
  success: true,
  message: "",
  data: { id: "f-1", fee_per_trip: "350.00", effective_from: "2026-11-01", set_by_name: "Mike", set_at: "2026-11-27T01:00:00Z", note: "" },
};

function serverSays(...answers: Array<[unknown, number]>) {
  const pins: Array<string | null> = [];
  const urls: string[] = [];
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    pins.push(headers["X-Sign-Off-PIN"] ?? null);
    urls.push(String(url));
    const [body, status] = answers[Math.min(pins.length - 1, answers.length - 1)];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { pins, urls };
}

// JB301: a fee is set for one project.
const FEE = { project: "p-1", supplier: "s-1", fee_per_trip: "350.00", effective_from: "2026-11-01" };

describe("清运费用设定 asks the sign-off PIN (as 材料单价)", () => {
  beforeEach(() => {
    publishTranslator("en", en as unknown as Record<string, unknown>);
  });
  afterEach(() => {
    resetSignOffForTests();
    vi.restoreAllMocks();
  });

  it("the save opens the shared PIN dialog and goes again with the PIN", async () => {
    const { pins, urls } = serverSays([REQUIRED, 403], [SAVED, 201]);
    const asks: SignOffAsk[] = [];
    registerSignOff(async (ask) => {
      asks.push(ask);
      return "135790";
    }, () => undefined);
    const row = await setDisposalFee(FEE);
    expect(row.fee_per_trip).toBe("350.00");
    expect(pins).toEqual([null, "135790"]);
    expect(urls.every((url) => url.includes("/api/disposal-fees/"))).toBe(true);
    expect(asks[0].action).toBe("disposal_fee.set");
  });

  it("a wrong PIN comes back to the dialog with the existing message, then the right one saves", async () => {
    const { pins } = serverSays([REQUIRED, 403], [WRONG, 403], [SAVED, 201]);
    const asks: SignOffAsk[] = [];
    const typed = ["111111", "135790"];
    registerSignOff(async (ask) => {
      asks.push(ask);
      return typed.shift() ?? null;
    }, () => undefined);
    await setDisposalFee(FEE);
    expect(pins).toEqual([null, "111111", "135790"]);
    expect(asks.map((ask) => ask.code)).toEqual(["sign_off_pin_required", "sign_off_pin_incorrect"]);
    expect(asks[1].message).toContain("4");
  });

  it("closing the dialog saves nothing and is not an error the window shows", async () => {
    serverSays([REQUIRED, 403]);
    registerSignOff(async () => null, () => undefined);
    const failure = await setDisposalFee(FEE).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(isSignOffCancelled(failure)).toBe(true);
  });

  it("the window stays open on a refusal and says the PIN comes after 保存", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/disposal-fees.tsx"), "utf8").replace(/\r\n/g, "\n");
    const form = source.slice(source.indexOf("function SetFeeForm("), source.indexOf("function FeeHistory("));
    // Only a success goes back to the list; a refusal is shown in the form.
    expect(form).toMatch(/onSuccess: \(\) => \{[\s\S]*?onDone\(\);\s+\},/);
    expect(form).toContain("if (isSignOffCancelled(reason)) return;");
    expect(form).toContain('t("fee.pinHint")');
    // No PIN box of its own: the shared dialog is the API client's.
    expect(readFileSync(path.join(process.cwd(), "src/services/disposal-settlement.service.ts"), "utf8")).not.toContain("noSignOffPrompt");
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.signOff.action.disposal_fee_set).toBeTruthy();
      expect(catalogue.jb287.fee.pinHint).toBeTruthy();
    }
    expect(zh.signOff.action.disposal_fee_set).toBe("设定或修改每车清运费用");
  });
});
