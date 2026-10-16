import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import { publishTranslator } from "@/lib/i18n-runtime";
import { ApiError } from "@/interfaces/api";
import {
  SIGN_OFF_CANCELLED,
  isSignOffCancelled,
  isSignOffRefusal,
  registerSignOff,
  resetSignOffForTests,
  signsWithCredential,
  type SignOffAsk,
} from "@/lib/sign-off";
import { api, fetchObjectUrl } from "./api-client";

/**
 * The sign-off PIN (I29): an office operation refused for want of the PIN
 * opens the shared dialog, and the same request goes again with what was
 * typed - so no screen needs its own PIN box. A wrong PIN comes back to the
 * dialog with the tries left; closing it ends the operation quietly.
 */

const REQUIRED = {
  success: false,
  message: "Enter your six-digit sign-off PIN.",
  code: "sign_off_pin_required",
  errors: { sign_off_pin: ["Required."] },
  values: { action: "daily_report.delete" },
};
const WRONG = {
  success: false,
  message: "The sign-off PIN is incorrect.",
  code: "sign_off_pin_incorrect",
  errors: { sign_off_pin: ["Incorrect."] },
  values: { attempts_left: 4 },
};
const OK = { success: true, message: "", data: { removed: true } };

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The server's answers in turn; each request's PIN header is kept. */
function serverSays(...answers: Array<[unknown, number]>) {
  const pins: Array<string | null> = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    pins.push(headers["X-Sign-Off-PIN"] ?? null);
    const [body, status] = answers[Math.min(pins.length - 1, answers.length - 1)];
    return json(body, status);
  }) as unknown as typeof fetch;
  return pins;
}

describe("the sign-off PIN in the API client", () => {
  beforeEach(() => {
    publishTranslator("en", en as unknown as Record<string, unknown>);
  });
  afterEach(() => {
    resetSignOffForTests();
    vi.restoreAllMocks();
  });

  it("asks the dialog and sends the same request again with the PIN", async () => {
    const pins = serverSays([REQUIRED, 403], [OK, 200]);
    const asks: SignOffAsk[] = [];
    const close = vi.fn();
    registerSignOff(async (ask) => {
      asks.push(ask);
      return "135790";
    }, close);

    const data = await api.delete("/api/daily-reports/1/delete_report/", { body: { reason: "x" } });

    expect(data).toEqual({ removed: true });
    expect(pins).toEqual([null, "135790"]);
    expect(asks).toHaveLength(1);
    expect(asks[0].code).toBe("sign_off_pin_required");
    expect(asks[0].action).toBe("daily_report.delete");
    expect(close).toHaveBeenCalled();
  });

  it("brings a wrong PIN back to the dialog with the tries left", async () => {
    const pins = serverSays([REQUIRED, 403], [WRONG, 403], [OK, 200]);
    const asks: SignOffAsk[] = [];
    const typed = ["111111", "135790"];
    registerSignOff(async (ask) => {
      asks.push(ask);
      return typed.shift() ?? null;
    }, () => undefined);

    await api.post("/api/schedule-plans/create_plan/", { name: "A" });

    expect(pins).toEqual([null, "111111", "135790"]);
    expect(asks.map((ask) => ask.code)).toEqual(["sign_off_pin_required", "sign_off_pin_incorrect"]);
    expect(asks[1].message).toContain("4");
  });

  it("keeps naming the operation after a wrong PIN, and passes the lock's time", async () => {
    // WRONG carries no action, as an older server answered: the dialog
    // still says what the PIN is for (not 「操作」).
    const LOCKED = {
      success: false,
      message: "Locked.",
      code: "sign_off_pin_locked",
      errors: {},
      values: { minutes: 15, locked_until: "2026-10-16T09:30:00+08:00" },
    };
    serverSays([REQUIRED, 403], [WRONG, 403], [LOCKED, 403]);
    const asks: SignOffAsk[] = [];
    const typed = ["111111", "222222"];
    registerSignOff(async (ask) => {
      asks.push(ask);
      return typed.shift() ?? null;
    }, () => undefined);

    await api.delete("/api/daily-reports/1/delete_report/", { body: { reason: "x" } }).catch(() => undefined);

    expect(asks.map((ask) => ask.action)).toEqual([
      "daily_report.delete",
      "daily_report.delete",
      "daily_report.delete",
    ]);
    expect(asks[2].code).toBe("sign_off_pin_locked");
    expect(asks[2].lockedUntil).toBe("2026-10-16T09:30:00+08:00");
  });

  it("ends quietly when the dialog is closed", async () => {
    serverSays([REQUIRED, 403]);
    registerSignOff(async () => null, () => undefined);

    const failure = await api.post("/api/roles/create_role/", {}).catch((error) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe(SIGN_OFF_CANCELLED);
    // ID77: nothing for any screen to show - no "Enter your six-digit
    // sign-off PIN." under the 改正 dialog or the 更换清运公司 one.
    expect((failure as ApiError).message).toBe("");
    expect((failure as ApiError).errors).toEqual({});
    expect(isSignOffCancelled(failure)).toBe(true);
  });

  it("ends a cancelled download quietly too", async () => {
    serverSays([REQUIRED, 403]);
    registerSignOff(async () => null, () => undefined);

    const failure = await fetchObjectUrl("/api/daily-reports/export/").catch((error) => error);

    expect((failure as ApiError).code).toBe(SIGN_OFF_CANCELLED);
    expect((failure as ApiError).message).toBe("");
  });

  it("tells a cancel from a real refusal", () => {
    expect(isSignOffCancelled(new ApiError("", 403, {}, SIGN_OFF_CANCELLED))).toBe(true);
    expect(isSignOffCancelled(new ApiError("No", 403, {}, "sign_off_pin_required"))).toBe(false);
    expect(isSignOffCancelled(new Error("x"))).toBe(false);
    expect(isSignOffCancelled(null)).toBe(false);
  });

  it("is an ordinary failure where no dialog is mounted (the phone)", async () => {
    serverSays([REQUIRED, 403]);

    const failure = await api.post("/api/roles/create_role/", {}, { silent: true }).catch((error) => error);

    expect((failure as ApiError).code).toBe("sign_off_pin_required");
  });

  it("leaves a PIN sent in a form field to its own screen", async () => {
    // A consultant's decision carries `approval_pin` in its body: a wrong one
    // is said in that dialog, not by opening a second one.
    serverSays([WRONG, 403]);
    const ask = vi.fn(async () => "135790");
    registerSignOff(ask, () => undefined);

    const failure = await api
      .post("/api/consultant-applications/1/act/", { approval_pin: "111111" }, { silent: true })
      .catch((error) => error);

    expect(ask).not.toHaveBeenCalled();
    expect((failure as ApiError).code).toBe("sign_off_pin_incorrect");
  });
});

describe("which refusals are the dialog's", () => {
  it("is always the first ask, and the follow-ups only after a PIN was sent", () => {
    expect(isSignOffRefusal(403, "sign_off_pin_required", false)).toBe(true);
    expect(isSignOffRefusal(403, "sign_off_pin_incorrect", false)).toBe(false);
    expect(isSignOffRefusal(403, "sign_off_pin_incorrect", true)).toBe(true);
    expect(isSignOffRefusal(403, "sign_off_pin_locked", true)).toBe(true);
    expect(isSignOffRefusal(403, "sign_off_pin_not_set", true)).toBe(true);
    expect(isSignOffRefusal(400, "sign_off_pin_required", false)).toBe(false);
    expect(isSignOffRefusal(403, "permission_denied", true)).toBe(false);
  });
});

describe("a consultant's credential", () => {
  it("is a signature with its PIN, switched on", () => {
    expect(signsWithCredential({ is_active: true, signature: "/s.png" })).toBe(true);
    // A PIN set alone on 「我的签核密码」.
    expect(signsWithCredential({ is_active: true, signature: "" })).toBe(false);
    // Reset by an administrator.
    expect(signsWithCredential({ is_active: false, signature: "/s.png" })).toBe(false);
    expect(signsWithCredential(null)).toBe(false);
  });
});
