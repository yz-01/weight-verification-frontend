/**
 * JB154 (客户 11-10, 图 18 - the phone's 「现场人员登录」 with 「这个账号已被停用。」):
 *
 *   这个就是今天的问题，一开机就显示这个账号已被停用。但是我查了在项目没有停用这个账号。
 *   今天两个手机都是这个问题
 *   而且还是不同项目
 *
 * The icons held accounts deleted on the old project, whose numbers now belong
 * to new, active accounts. A deleted account (`field_account_removed`) says it
 * is the old one and what to do, and the screens offer no PIN for it; 停用
 * (`field_account_stopped`) says the office stopped it.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";
import {
  FIELD_ACCOUNT_REMOVED,
  FIELD_EXPLAINED_SIGN_OUTS,
  FIELD_OFFICE_SIGN_OUTS,
  rememberFieldSignOutReason,
  takeFieldSignOut,
  takeFieldSignOutReason,
} from "@/lib/auth-token";

const read = (path: string) =>
  readFileSync(new URL(`./${path}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the words", () => {
  it("says a deleted account is the old one, and 停用 is the office's", () => {
    expect(zh.errors.api.field_account_removed).toBe(
      "这个手机图标是已经删除的旧账号。请删掉这个图标，用办公室发给你的新链接重新登录，再加到主屏幕。",
    );
    expect(zh.errors.api.field_account_stopped).toBe("这个账号已被办公室停用，请联系办公室。");
  });

  it.each([
    ["zh-TW", zhTW],
    ["en", en],
    ["ms", ms],
  ])("%s has both, and they differ", (_, messages) => {
    const api = messages.errors.api;
    expect(api.field_account_removed).toBeTruthy();
    expect(api.field_account_stopped).toBeTruthy();
    expect(api.field_account_removed).not.toBe(api.field_account_stopped);
  });
});

describe("the phone hears it as the office's word", () => {
  it("signs out with it and says it", () => {
    expect(FIELD_ACCOUNT_REMOVED).toBe("field_account_removed");
    expect(FIELD_OFFICE_SIGN_OUTS).toContain(FIELD_ACCOUNT_REMOVED);
    expect(FIELD_EXPLAINED_SIGN_OUTS).toContain(FIELD_ACCOUNT_REMOVED);
  });

  it("the sign-in screen reads the code with the reason, once", () => {
    const session = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
      },
      localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    });
    rememberFieldSignOutReason("旧账号", FIELD_ACCOUNT_REMOVED);
    expect(takeFieldSignOut()).toEqual({ message: "旧账号", code: FIELD_ACCOUNT_REMOVED });
    expect(takeFieldSignOut()).toEqual({ message: "", code: "" });
    rememberFieldSignOutReason("已停用");
    expect(takeFieldSignOutReason()).toBe("已停用");
    expect(takeFieldSignOut()).toEqual({ message: "", code: "" });
  });
});

describe("no PIN is offered for a deleted account", () => {
  const access = read("field-access.tsx");
  const bootstrap = read("field-pwa-bootstrap.tsx");

  it("the PIN screen hides the PIN box, 登录 and 「请输入你的 6 位 PIN」", () => {
    // From the app's own link refused at start, and from a session the
    // office ended.
    expect(access).toMatch(/setAccountRemoved\(cause\.code === FIELD_ACCOUNT_REMOVED\)/);
    expect(access).toMatch(/if \(officeCode === FIELD_ACCOUNT_REMOVED\) setAccountRemoved\(true\)/);
    expect(access).toMatch(/const pinUseful = accountRemoved\s*\?\s*false/);
    expect(access).toMatch(/\{!accountRemoved && \(\s*<p[^>]*>\s*\{token \? invitation\.data\?\.full_name/);
    // The PIN box and 登录 both hang on pinUseful.
    expect(access.match(/\{pinUseful && \(/g)).toHaveLength(2);
  });

  it("the home-screen app's start screen drops 登录 (which leads to the PIN)", () => {
    expect(bootstrap).toMatch(/const accountRemoved = failure === `refused:\$\{FIELD_ACCOUNT_REMOVED\}`;/);
    expect(bootstrap).toMatch(
      /\{!accountRemoved && \(\s*<Button onClick=\{\(\) => replacePage\("\/trace\/field-login"\)\}>/,
    );
  });
});

describe("the help box names the old account's icon", () => {
  it("is titled for a deleted account, not 「还没绑定」", () => {
    const help = read("field-unbound-help.tsx");
    expect(help).toMatch(/code\?\.includes\("field_account_removed"\)/);
    expect(help).toContain('t("unboundRemovedTitle")');
    expect(help).toContain('t("unboundRemovedBody")');
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.fieldAccess.unboundRemovedTitle).toBeTruthy();
      expect(messages.fieldAccess.unboundRemovedBody).toBeTruthy();
    }
    expect(zh.fieldAccess.unboundRemovedTitle).toBe("这是已经删除的旧账号的图标");
  });
});
