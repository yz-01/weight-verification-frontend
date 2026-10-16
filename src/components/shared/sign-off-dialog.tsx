"use client";

import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import { SIGN_OFF_CODES, registerSignOff, type SignOffAsk } from "@/lib/sign-off";
import { getSignOffPinStatus, setSignOffPin, type SignOffPinStatus } from "@/services/sign-off.service";

type Mode = "loading" | "enter" | "setup" | "locked";

/** The digits only, at most six: what a PIN box keeps of what was typed. */
export function pinDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

/** Which screen a refusal opens on, given what is known of the PIN. */
export function modeFor(code: string, status: SignOffPinStatus | null): Mode {
  if (code === SIGN_OFF_CODES.locked) return "locked";
  if (code === SIGN_OFF_CODES.notSet) return "setup";
  if (code === SIGN_OFF_CODES.incorrect) return "enter";
  if (status === null) return "enter";
  if (!status.has_pin) return "setup";
  if (status.locked_until) return "locked";
  return "enter";
}

/**
 * The one sign-off PIN dialog (I29, ID67), mounted once at the root.
 *
 * Opened by the API client when an office operation is refused for want of
 * the PIN (`lib/sign-off`): the person types six digits and the operation is
 * sent again. Somebody with no PIN yet sets one here - with their account
 * password - and carries on (「弹窗里直接带去设定」); a PIN forgotten or locked
 * is set again the same way.
 */
export function SignOffHost() {
  const t = useTranslations("signOff");
  const format = useFormatter();
  const [ask, setAsk] = useState<SignOffAsk | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [status, setStatus] = useState<SignOffPinStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [password, setPassword] = useState("");
  const [setupError, setSetupError] = useState<{ field: string; message: string } | null>(null);
  // Where 「返回」 on the set-again form goes: the box it was opened from.
  // `null` when the form is the first thing shown (no PIN yet): it cancels.
  const [backTo, setBackTo] = useState<Mode | null>(null);
  const resolver = useRef<((pin: string | null) => void) | null>(null);

  const answer = useCallback((value: string | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(value);
  }, []);

  useEffect(
    () =>
      registerSignOff(
        (next) =>
          new Promise<string | null>((resolve) => {
            resolver.current = resolve;
            setAsk(next);
            setBusy(false);
            setPin("");
            setSetupError(null);
            setBackTo(null);
            if (next.code === SIGN_OFF_CODES.locked && !next.lockedUntil) {
              // The time it opens: from the PIN's status when the refusal
              // did not say (a check before an editor opens).
              getSignOffPinStatus().then(setStatus).catch(() => undefined);
            }
            if (next.code === SIGN_OFF_CODES.required || next.code === SIGN_OFF_CODES.notSet) {
              setMode(next.code === SIGN_OFF_CODES.notSet ? "setup" : "loading");
              getSignOffPinStatus()
                .then((found) => {
                  setStatus(found);
                  setMode((current) => (current === "loading" ? modeFor(next.code, found) : current));
                })
                .catch(() => setMode((current) => (current === "loading" ? "enter" : current)));
            } else {
              setMode(modeFor(next.code, null));
            }
          }),
        () => {
          answer(null);
          setAsk(null);
          setBusy(false);
          setPin("");
          setNewPin("");
          setConfirmPin("");
          setPassword("");
        },
      ),
    [answer],
  );

  const actionKey = ask?.action ? ask.action.replace(/\./g, "_") : "";
  const actionLabel =
    actionKey && t.has(`action.${actionKey}`) ? t(`action.${actionKey}`) : t("action.generic");

  const submitPin = () => {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    answer(pin);
  };

  const submitSetup = async () => {
    if (busy || newPin.length !== 6 || newPin !== confirmPin || !password) return;
    setBusy(true);
    setSetupError(null);
    try {
      await setSignOffPin({ currentPassword: password, pin: newPin });
      setPassword("");
      // Carry on with the operation it was asked for.
      answer(newPin);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError) {
        const field = error.fieldError("current_password") ? "current_password" : "pin";
        setSetupError({ field, message: error.fieldError(field) ?? error.message });
      } else {
        setSetupError({ field: "pin", message: t("failed") });
      }
    }
  };

  const close = () => {
    if (busy) return;
    answer(null);
    setAsk(null);
  };

  const wrong = ask && ask.code === SIGN_OFF_CODES.incorrect ? ask.message : "";
  const opensAt = ask?.lockedUntil ?? status?.locked_until ?? null;
  const openSetup = (from: Mode) => {
    setSetupError(null);
    setBackTo(from);
    setMode("setup");
  };

  return (
    <Dialog open={ask !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md" data-testid="sign-off-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "locked" ? <Lock className="size-5 text-destructive" /> : mode === "setup" ? <ShieldCheck className="size-5 text-primary" /> : <KeyRound className="size-5 text-primary" />}
            {mode === "setup" ? t("setupTitle") : mode === "locked" ? t("lockedTitle") : t("title")}
          </DialogTitle>
          <DialogDescription>{actionLabel}</DialogDescription>
        </DialogHeader>

        {mode === "loading" && (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {mode === "enter" && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitPin();
            }}
          >
            <p className="text-sm text-muted-foreground">{t("enterHelp")}</p>
            <FieldWrapper label={t("pin")} required error={wrong || undefined}>
              <Input
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={pin}
                disabled={busy}
                className="text-center font-mono text-lg tracking-[0.5em]"
                onChange={(event) => setPin(pinDigits(event.target.value))}
              />
            </FieldWrapper>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              disabled={busy}
              onClick={() => openSetup("enter")}
            >
              {t("forgot")}
            </button>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                {t("cancel")}
              </Button>
              <Button type="submit" requires={[[pin.length === 6, t("pin")]]} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {busy ? t("checking") : t("confirm")}
              </Button>
            </DialogFooter>
          </form>
        )}

        {mode === "setup" && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitSetup();
            }}
          >
            <p className="text-sm text-muted-foreground">
              {status?.was_reset ? t("resetHelp") : status?.has_pin ? t("changeHelp") : t("setupHelp")}
            </p>
            <FieldWrapper
              label={t("newPin")}
              required
              error={setupError?.field === "pin" ? setupError.message : undefined}
            >
              <Input
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={newPin}
                disabled={busy}
                onChange={(event) => setNewPin(pinDigits(event.target.value))}
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("confirmPin")}
              required
              error={confirmPin.length === 6 && confirmPin !== newPin ? t("pinMismatch") : undefined}
            >
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={confirmPin}
                disabled={busy}
                onChange={(event) => setConfirmPin(pinDigits(event.target.value))}
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("accountPassword")}
              required
              hint={t("accountPasswordHint")}
              error={setupError?.field === "current_password" ? setupError.message : undefined}
            >
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FieldWrapper>
            {backTo !== null && (
              // Someone who forgot the PIN may have forgotten the password
              // too: say where that is put right.
              <p className="text-sm text-muted-foreground">{t("forgotPassword")}</p>
            )}
            <DialogFooter>
              {backTo !== null ? (
                // 「返回」 goes back to the PIN box; the operation still waits.
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setSetupError(null);
                    setNewPin("");
                    setConfirmPin("");
                    setPassword("");
                    setMode(backTo);
                    setBackTo(null);
                  }}
                >
                  {t("back")}
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled={busy} onClick={close}>
                  {t("cancel")}
                </Button>
              )}
              <Button
                type="submit"
                requires={[
                  [newPin.length === 6, t("newPin")],
                  [confirmPin.length === 6, t("confirmPin")],
                  [password, t("accountPassword")],
                ]}
                disabledReason={
                  newPin.length === 6 && confirmPin.length === 6 && newPin !== confirmPin
                    ? t("pinMismatch")
                    : undefined
                }
                disabled={busy || newPin !== confirmPin}
              >
                {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                {t("saveAndContinue")}
              </Button>
            </DialogFooter>
          </form>
        )}

        {mode === "locked" && (
          <div className="space-y-3">
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {opensAt
                ? t("lockedUntil", {
                    time: format.dateTime(new Date(opensAt), {
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                    }),
                  })
                : ask?.code === SIGN_OFF_CODES.locked
                  ? ask.message
                  : t("lockedHelp")}
            </p>
            <p className="text-sm text-muted-foreground">{t("lockedHint")}</p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => openSetup("locked")}
              >
                {t("setAgain")}
              </Button>
              <Button type="button" onClick={close}>
                {t("close")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
