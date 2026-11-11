/**
 * JB159 (found on the 11-10 update-doc screenshots s05 / s06): a 停用 phone
 * account's screens gave the wrong advice.
 *
 * - The home-screen icon of a stopped account said 「这个账号已被办公室停用，
 *   请联系办公室。」 (right), then the 「这个主屏幕图标还没绑定」 box telling the
 *   worker to delete the icon (wrong: after 恢复 the same icon works, see the
 *   backend's accounts/tests/test_suspend_reenable_home_screen.py).
 * - 「原因：refused:field_account_stopped」 was printed for the worker to read.
 * - After 恢复 the icon said 「…（办公室可能已经重新发了链接）…」 and the Safari
 *   tab 「办公室已重新发出链接…」 - but no link was sent; 「登录」 and the PIN
 *   once are all it takes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";
import {
  FIELD_ACCOUNT_STOPPED,
  FIELD_EXPLAINED_SIGN_OUTS,
  FIELD_LINK_SPENT,
  FIELD_OFFICE_SIGN_OUTS,
  bootstrapRefusalKeepsIcon,
} from "@/lib/auth-token";
import { fieldPinUseful } from "@/lib/field-install";

const read = (path: string) =>
  readFileSync(new URL(`./${path}`, import.meta.url), "utf8");

describe("the icon's start screen", () => {
  it("drops the 「还没绑定」 box for 停用 and for a spent link, keeps it otherwise", () => {
    expect(bootstrapRefusalKeepsIcon(`refused:${FIELD_ACCOUNT_STOPPED}`)).toBe(true);
    expect(bootstrapRefusalKeepsIcon("refused:field_pwa_bootstrap_invalid")).toBe(true);
    // A deleted account keeps its own box (JB154); a new link, an icon
    // added without a link and a network failure keep theirs.
    expect(bootstrapRefusalKeepsIcon("refused:field_account_removed")).toBe(false);
    expect(bootstrapRefusalKeepsIcon("refused:field_link_replaced")).toBe(false);
    expect(bootstrapRefusalKeepsIcon("no-token")).toBe(false);
    expect(bootstrapRefusalKeepsIcon("refused:network")).toBe(false);
    expect(bootstrapRefusalKeepsIcon(null)).toBe(false);
  });

  it("renders the box only when the icon needs it, and the code as an attribute", () => {
    const bootstrap = read("field-pwa-bootstrap.tsx");
    expect(bootstrap).toContain("const iconIsFine = bootstrapRefusalKeepsIcon(failure);");
    expect(bootstrap).toMatch(/\{reason && !iconIsFine && \(\s*<FieldUnboundHelp/);
    expect(bootstrap).toContain("data-refusal={failure ?? undefined}");
    // 「登录」 stays: after 恢复 it leads to the PIN, which signs the icon in.
    expect(bootstrap).toMatch(/\{!accountRemoved && \(\s*<Button/);
  });

  it("the help box never prints the code", () => {
    const help = read("field-unbound-help.tsx");
    expect(help).not.toContain('t("unboundReason"');
    expect(help).toContain("data-unbound-code={code}");
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.fieldAccess).not.toHaveProperty("unboundReason");
    }
  });
});

describe("the PIN screen", () => {
  it("shows only the stopped message for 停用, no 「还没绑定」 box", () => {
    const access = read("field-access.tsx");
    expect(access).toMatch(/if \(officeCode === FIELD_ACCOUNT_STOPPED\) setAccountStopped\(true\)/);
    expect(access).toMatch(/setAccountStopped\(cause\.code === FIELD_ACCOUNT_STOPPED\)/);
    expect(access).toMatch(/const unbound =\s*!token && context && !accountStopped/);
  });

  it("offers no PIN box or 登录 for 停用 either (JB164, s05 variant)", () => {
    const base = { accountRemoved: false, accountStopped: false, hasInvitation: false, unbound: false, deviceRefused: false, hasDeviceId: true };
    expect(fieldPinUseful(base)).toBe(true);
    expect(fieldPinUseful({ ...base, accountStopped: true })).toBe(false);
    expect(fieldPinUseful({ ...base, accountStopped: true, hasInvitation: true })).toBe(false);
    expect(fieldPinUseful({ ...base, accountRemoved: true })).toBe(false);
    // Unchanged otherwise: an activation link always asks; a never-linked page does not.
    expect(fieldPinUseful({ ...base, hasInvitation: true, unbound: true, hasDeviceId: false })).toBe(true);
    expect(fieldPinUseful({ ...base, unbound: true, hasDeviceId: false })).toBe(false);
    expect(fieldPinUseful({ ...base, unbound: true, hasDeviceId: false, deviceRefused: true })).toBe(true);
    const access = read("field-access.tsx");
    expect(access).toContain("const pinUseful = fieldPinUseful({");
    expect(access).toContain("{!accountRemoved && !accountStopped && (");
  });
});

describe("the words after 恢复", () => {
  it("the spent link says to press 「登录」 and type the PIN, not that a link was re-sent", () => {
    expect(FIELD_LINK_SPENT).toBe("field_pwa_bootstrap_invalid");
    expect(zh.errors.api.field_pwa_bootstrap_invalid).toBe(
      "这个登录链接已经不能再用了。请按「登录」，输入你的 PIN；如果 PIN 不能用，请向办公室要新的链接。",
    );
    expect(zhTW.errors.api.field_pwa_bootstrap_invalid).toContain(`「${zhTW.fieldAccess.signIn}」`);
    for (const messages of [zh, zhTW]) {
      expect(messages.errors.api.field_pwa_bootstrap_invalid).not.toMatch(/重新发|重新發/);
    }
    expect(en.errors.api.field_pwa_bootstrap_invalid).toContain(`"${en.fieldAccess.signIn}"`);
    expect(ms.errors.api.field_pwa_bootstrap_invalid).toContain(`"${ms.fieldAccess.signIn}"`);
  });

  it("the signed-out Safari tab is told to type the PIN (field_office_signed_out)", () => {
    expect(zh.errors.api.field_office_signed_out).toBe(
      "办公室让这台手机退出了登录。请输入你的 PIN 继续；如果 PIN 不能用，请向办公室要新的链接。",
    );
    for (const messages of [zhTW, en, ms]) {
      expect(messages.errors.api.field_office_signed_out).toBeTruthy();
      expect(messages.errors.api.field_office_signed_out).not.toBe(
        messages.errors.api.field_link_replaced,
      );
    }
    expect(FIELD_OFFICE_SIGN_OUTS).toContain("field_office_signed_out");
    expect(FIELD_EXPLAINED_SIGN_OUTS).toContain("field_office_signed_out");
  });

  it("the deleted account's words stay as JB154 set them", () => {
    expect(zh.errors.api.field_account_removed).toBe(
      "这个手机图标是已经删除的旧账号。请删掉这个图标，用办公室发给你的新链接重新登录，再加到主屏幕。",
    );
    expect(zh.errors.api.field_account_stopped).toBe("这个账号已被办公室停用，请联系办公室。");
  });
});
