import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { identityOf, needsIdentity, oldPinUsable, pinSaveError } from "@/components/shared/pin-identity-fields";
import { ApiError } from "@/interfaces/api";
import {
  clearCompanySettingsPass,
  companySettingsPass,
  registerCompanySettingsRenewer,
  resetCompanySettingsPassForTests,
  setCompanySettingsPass,
} from "@/lib/company-settings-pass";
import { publishTranslator } from "@/lib/i18n-runtime";
import { resetSignOffForTests } from "@/lib/sign-off";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { api } from "@/services/api-client";
import type { SignOffPinStatus } from "@/services/sign-off.service";

/**
 * JB239 (客户 11-23 事项 11): 「点击「公司设置」时，必须先输入六位数签核密码，验证成功
 * 才能进入」, and 「忘记签核密码时，必须验证原公司管理员的真实身份，不能让其他人自行
 * 取代」. The server enforces both; these prove the desktop carries the pass,
 * renews it once, and asks for the old PIN or the e-mailed code.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const REFUSED = {
  success: false,
  message: "Enter your six-digit sign-off PIN to open company settings.",
  code: "company_settings_pin_required",
  errors: {},
  values: { action: "company_settings.open" },
};
const OK = { success: true, message: "", data: { name: "Alpha" } };

function serverSays(...answers: Array<[unknown, number]>) {
  const passes: Array<string | null> = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    passes.push(headers["X-Company-Settings-Pass"] ?? null);
    const [body, status] = answers[Math.min(passes.length - 1, answers.length - 1)];
    return json(body, status);
  }) as unknown as typeof fetch;
  return passes;
}

const status = (patch: Partial<SignOffPinStatus>): SignOffPinStatus => ({
  has_pin: true,
  was_reset: false,
  locked_until: null,
  attempts_left: 5,
  exempt: false,
  updated_at: null,
  needs_identity: true,
  email_hint: "ad***@alpha.test",
  ...patch,
});

describe("公司设置's pass in the API client", () => {
  beforeEach(() => publishTranslator("en", en as unknown as Record<string, unknown>));
  afterEach(() => {
    resetCompanySettingsPassForTests();
    resetSignOffForTests();
    vi.restoreAllMocks();
  });

  it("sends the pass while 公司设置 holds one, and nothing once it is left", async () => {
    const passes = serverSays([OK, 200]);
    setCompanySettingsPass("pass-1");
    await api.get("/api/contractor-site-settings/get_company_profile/");
    clearCompanySettingsPass();
    await api.get("/api/contractor-site-settings/get_company_profile/");
    expect(passes).toEqual(["pass-1", null]);
  });

  it("a pass that ran out: asks the gate for a new one, then sends the same request once more", async () => {
    const passes = serverSays([REFUSED, 403], [OK, 200]);
    setCompanySettingsPass("old");
    const renew = vi.fn(async () => {
      setCompanySettingsPass("new");
      return true;
    });
    registerCompanySettingsRenewer(renew);
    const data = await api.patch("/api/contractor-site-settings/update_company_profile/", { body: { phone: "1" } });
    expect(data).toEqual({ name: "Alpha" });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(passes).toEqual(["old", "new"]);
  });

  it("the PIN dialog closed, or the page left: the call fails and nothing is retried", async () => {
    const passes = serverSays([REFUSED, 403]);
    registerCompanySettingsRenewer(async () => false);
    await expect(
      api.get("/api/contractor-site-settings/get_company_profile/", undefined, { silent: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(passes).toHaveLength(1);
    expect(companySettingsPass()).toBeNull();
  });
});

describe("who may replace a PIN once set", () => {
  it("the first PIN needs only the password; any later one the old PIN or the code", () => {
    expect(needsIdentity(status({ has_pin: false, needs_identity: false }))).toBe(false);
    expect(needsIdentity(status({}))).toBe(true);
    expect(needsIdentity(status({ has_pin: false, was_reset: true }))).toBe(true);
    // A server from before JB239 says nothing: judged from the PIN itself.
    expect(needsIdentity(status({ needs_identity: undefined, has_pin: false, was_reset: true }))).toBe(true);
  });

  it("a reset or locked PIN is proved with the e-mailed code only", () => {
    expect(oldPinUsable(status({}))).toBe(true);
    expect(oldPinUsable(status({ has_pin: false, was_reset: true }))).toBe(false);
    expect(oldPinUsable(status({ locked_until: "2026-11-24T10:00:00Z" }))).toBe(false);
  });

  it("six digits of either, nothing less", () => {
    expect(identityOf("old", "12345", "")).toBeNull();
    expect(identityOf("old", "123456", "")).toEqual({ currentPin: "123456" });
    expect(identityOf("code", "", "654321")).toEqual({ emailCode: "654321" });
  });

  it("says each refusal under its own field", () => {
    const error = (code: string) => new ApiError("x", 403, {}, code);
    expect(pinSaveError(error("incorrect_password")).field).toBe("current_password");
    expect(pinSaveError(error("sign_off_pin_identity_required")).field).toBe("identity");
    expect(pinSaveError(error("sign_off_pin_code_incorrect")).field).toBe("email_code");
    expect(pinSaveError(error("sign_off_pin_code_expired")).field).toBe("email_code");
    expect(pinSaveError(error("sign_off_pin_incorrect")).field).toBe("current_pin");
  });

  it("the dialog no longer offers 「用账号密码重新设定」", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const words = JSON.stringify(messages.signOff);
      expect(words).not.toMatch(/用账号密码重新设定|用帳號密碼重新設定|with your account password, or/);
    }
    expect(zh.signOff.forgot).toBe("忘记了？用邮箱验证码重新设定");
  });
});

describe("the pages", () => {
  it("公司设置 is drawn only inside the gate", () => {
    const page = read("src/app/(dashboard)/company-settings/page.tsx");
    expect(page).toContain("<CompanySettingsGate>");
    const gate = read("src/components/shared/company-settings-gate.tsx");
    expect(gate).toContain('if (state === "open") return <>{children}</>;');
    // Leaving the page drops the pass.
    expect(gate).toContain("clearCompanySettingsPass();");
  });

  it("the PIN dialog, 「我的签核密码」 and the signature page all ask who it is", () => {
    for (const path of [
      "src/components/shared/sign-off-dialog.tsx",
      "src/components/profile/sign-off-pin-settings.tsx",
      "src/components/consultant-workflow/approval-credential.tsx",
    ]) {
      expect(read(path)).toContain("<PinIdentityFields");
    }
  });

  it("顾问权限管理 reads its defaults without opening 公司设置", () => {
    const dialog = read("src/components/consultant-workflow/consultant-access-management.tsx");
    expect(dialog).toContain("getConsultantDefaults");
    expect(dialog).not.toContain("getContractorSiteSettings");
  });

  it("has its words in the four languages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}${key}.`))
        : [prefix];
    for (const messages of [zhTW, en, ms]) {
      expect(keys(messages.jb239).sort()).toEqual(keys(zh.jb239).sort());
    }
    // The UI says 你, never 您.
    expect(JSON.stringify(zh.jb239)).not.toContain("您");
  });
});
