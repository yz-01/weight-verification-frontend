"use client";

import { Loader2, MailCheck, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { pinDigits } from "@/lib/pin-digits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import {
  requestSignOffPinCode,
  type PinIdentity,
  type SignOffPinStatus,
} from "@/services/sign-off.service";

/**
 * Whether replacing this PIN needs proof it is the owner (JB239): a PIN was
 * once set. Only the very first PIN is set with the account password alone.
 */
export function needsIdentity(status: SignOffPinStatus | null | undefined): boolean {
  if (!status) return false;
  return Boolean(status.needs_identity ?? (status.has_pin || status.was_reset));
}

/**
 * Whether the old PIN can still prove it: on, and not locked. A PIN reset by
 * an administrator, or locked, is proved with the e-mailed code only.
 */
export function oldPinUsable(status: SignOffPinStatus | null | undefined): boolean {
  return Boolean(status?.has_pin && !status.locked_until);
}

/** The identity the fields hold, or `null` while incomplete. */
export function identityOf(mode: "old" | "code", oldPin: string, code: string): PinIdentity {
  if (mode === "old") return oldPin.length === 6 ? { currentPin: oldPin } : null;
  return code.length === 6 ? { emailCode: code } : null;
}

/**
 * 「确认是你本人」 (JB239, 客户 11-23 事项 11: 「忘记签核密码时，必须验证原公司管理
 * 员的真实身份，不能让其他人自行取代」): the old PIN, or - forgotten, locked or
 * reset by an administrator - a code mailed to the account's own login
 * e-mail, sent with the account password typed in the same form.
 */
export function PinIdentityFields({
  status,
  password,
  disabled,
  error,
  startWithCode = false,
  onChange,
}: {
  status: SignOffPinStatus | null;
  /** The account password typed in the same form: the code is sent with it. */
  password: string;
  disabled?: boolean;
  /** A refusal from the save, placed under its field. */
  error?: { field: string; message: string } | null;
  /** Opened from 「忘记了？」 or a lock: start on the e-mailed code. */
  startWithCode?: boolean;
  onChange: (identity: PinIdentity) => void;
}) {
  const t = useTranslations("jb239.identity");
  const mail = useTranslations("jb239.email");
  const canUseOld = oldPinUsable(status);
  const [chosen, setMode] = useState<"old" | "code">(startWithCode ? "code" : "old");
  // A PIN reset or locked meanwhile: only the code can prove it.
  const mode = canUseOld ? chosen : "code";
  const [oldPin, setOldPin] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ to: string; minutes: number } | null>(null);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    onChange(identityOf(mode, oldPin, code));
  }, [mode, oldPin, code, onChange]);

  const send = async () => {
    if (!password || sending) return;
    setSending(true);
    setSendError("");
    try {
      const result = await requestSignOffPinCode({
        currentPassword: password,
        // `{code}` stays as it is: only the server knows the code.
        emailCopy: { subject: mail("subject"), body: mail("body", { code: "{code}" }) },
      });
      setSent({ to: result.sent_to, minutes: result.minutes });
    } catch (failure) {
      setSendError(failure instanceof ApiError ? failure.fieldError("current_password") ?? failure.message : "");
    } finally {
      setSending(false);
    }
  };

  if (mode === "old") {
    return (
      <div className="space-y-2" data-slot="pin-identity" data-mode="old">
        <FieldWrapper
          label={t("oldPin")}
          required
          error={error?.field === "current_pin" || error?.field === "identity" ? error.message : undefined}
        >
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={oldPin}
            disabled={disabled}
            onChange={(event) => setOldPin(pinDigits(event.target.value))}
          />
        </FieldWrapper>
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          disabled={disabled}
          onClick={() => {
            setOldPin("");
            setMode("code");
          }}
        >
          {t("useCode")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-panel-border p-3" data-slot="pin-identity" data-mode="code">
      <p className="text-sm text-muted-foreground">
        {sent ? (
          <span className="flex items-center gap-1.5 text-foreground">
            <MailCheck className="size-4 shrink-0 text-primary" />
            {t("sent", { email: sent.to, minutes: sent.minutes })}
          </span>
        ) : (
          t("codeHelp", { email: status?.email_hint || "" })
        )}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || sending || !password}
        disabledReason={!password ? t("needPassword") : undefined}
        onClick={() => void send()}
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {sending ? t("sending") : sent ? t("resend") : t("send")}
      </Button>
      {sendError && <p className="text-sm text-destructive">{sendError}</p>}
      <FieldWrapper
        label={t("code")}
        required
        error={error?.field === "email_code" || error?.field === "identity" ? error.message : undefined}
      >
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          disabled={disabled}
          className="font-mono tracking-[0.3em]"
          onChange={(event) => setCode(pinDigits(event.target.value))}
        />
      </FieldWrapper>
      {canUseOld && (
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          disabled={disabled}
          onClick={() => {
            setCode("");
            setMode("old");
          }}
        >
          {t("useOldPin")}
        </button>
      )}
    </div>
  );
}

/**
 * Where a refusal of a PIN save is said (JB239 adds the old PIN and the
 * e-mailed code): the field, and the sentence in the reader's words.
 */
export function pinSaveError(error: ApiError): { field: string; message: string } {
  const code = error.code;
  if (code === "incorrect_password") return { field: "current_password", message: error.message };
  if (code === "sign_off_pin_identity_required") return { field: "identity", message: error.message };
  if (code.startsWith("sign_off_pin_code")) return { field: "email_code", message: error.message };
  if (code === "sign_off_pin_incorrect" || code === "sign_off_pin_locked") {
    return { field: "current_pin", message: error.message };
  }
  return { field: "pin", message: error.fieldError("pin") ?? error.message };
}
