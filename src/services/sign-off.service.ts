/**
 * The six-digit sign-off PIN (I29, ID67): 「我的签核密码」, the check before an
 * editor opens, and an administrator's reset.
 */
import { ApiError } from "@/interfaces/api";
import type { UserDetail } from "@/interfaces/auth";
import {
  SIGN_OFF_CODES,
  askSignOff,
  hasSignOffDialog,
  settleSignOff,
} from "@/lib/sign-off";
import { api, toastSuccess } from "@/services/api-client";

export interface SignOffPinStatus {
  has_pin: boolean;
  /** Turned off by an administrator: set a new one. */
  was_reset: boolean;
  /** ISO time it opens again, while locked. */
  locked_until: string | null;
  attempts_left: number;
  /** An account that works on the phone is never asked. */
  exempt: boolean;
  updated_at: string | null;
}

const BASE = "/api/approval-credentials";

const SIGN_OFF_REFUSALS: ReadonlySet<string> = new Set(Object.values(SIGN_OFF_CODES));

export const getSignOffPinStatus = () =>
  api.get<SignOffPinStatus>(`${BASE}/get_sign_off_pin/`);

/** Set or change my PIN, with my account password. */
export async function setSignOffPin(payload: { currentPassword: string; pin: string }) {
  const status = await api.post<SignOffPinStatus>(
    `${BASE}/set_sign_off_pin/`,
    { current_password: payload.currentPassword, pin: payload.pin },
    // The dialog and the profile form show the reason under the field.
    { silent: true },
  );
  toastSuccess("signOff.toast.saved");
  return status;
}

/**
 * Ask for the PIN before an editor opens (「开始填写或修改前」) and check it.
 *
 * Resolves to the PIN that was right - the editor sends it again when it
 * saves, so the person types it once - or `null` when they closed the dialog.
 * On a screen without the dialog, or for an account the server never asks,
 * resolves to `""`: the save goes ahead and the server decides.
 */
export async function signOffBeforeEditing(action: string): Promise<string | null> {
  if (!hasSignOffDialog()) return "";
  let ask = { code: SIGN_OFF_CODES.required as string, message: "", action };
  for (;;) {
    const pin = await askSignOff(ask);
    if (!pin) {
      settleSignOff();
      return null;
    }
    try {
      await api.post(
        `${BASE}/verify_sign_off_pin/`,
        { action },
        { signOffPin: pin, silent: true, noSignOffPrompt: true },
      );
      settleSignOff();
      return pin;
    } catch (error) {
      // Wrong, locked or not set: said in the dialog, which asks again.
      if (error instanceof ApiError && SIGN_OFF_REFUSALS.has(error.code)) {
        ask = { code: error.code, message: error.message, action };
        continue;
      }
      settleSignOff();
      throw error;
    }
  }
}

/** 重设签核密码 (IB17): the person sets a new one before their next sign-off. */
export async function resetUserSignOffPin(userId: string) {
  const user = await api.post<UserDetail>(`/api/users/${userId}/reset_sign_off_pin/`);
  toastSuccess("signOff.toast.reset");
  return user;
}
