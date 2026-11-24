"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { PinIdentityFields, needsIdentity, pinSaveError } from "@/components/shared/pin-identity-fields";
import { pinDigits } from "@/lib/pin-digits";
import { FieldWrapper, QueryFailedNote, ReadField } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import {
  getSignOffPinStatus,
  setSignOffPin,
  type PinIdentity,
  type SignOffPinStatus,
} from "@/services/sign-off.service";

/** What 「我的签核密码」 says about the PIN today. */
export function pinStatusKey(status: SignOffPinStatus): "locked" | "reset" | "set" | "notSet" {
  if (status.locked_until) return "locked";
  if (status.was_reset) return "reset";
  return status.has_pin ? "set" : "notSet";
}

/**
 * 「我的签核密码」 on the profile (I29, ID67): every office account sets its own
 * six-digit sign-off PIN here, with its account password, and changes it the
 * same way - which also lifts a lock or an administrator's reset. JB239: a PIN
 * once set is changed only with the old PIN or a code mailed to the login
 * e-mail as well (「不能让其他人自行取代」).
 */
export function SignOffPinSettings() {
  const t = useTranslations("signOff");
  const tIdentity = useTranslations("jb239.identity");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [identity, setIdentity] = useState<PinIdentity>(null);
  // Remounts the identity fields (old PIN / code typed) after a save.
  const [round, setRound] = useState(0);
  const status = useQuery({ queryKey: ["sign-off-pin"], queryFn: getSignOffPinStatus });
  const proving = needsIdentity(status.data);
  const save = useMutation({
    mutationFn: () =>
      setSignOffPin({ currentPassword: password, pin: newPin, identity: proving ? identity : null }),
    onSuccess: (next) => {
      setNewPin("");
      setConfirmPin("");
      setPassword("");
      setError(null);
      setRound((value) => value + 1);
      queryClient.setQueryData(["sign-off-pin"], next);
    },
    onError: (failure) => {
      if (failure instanceof ApiError) setError(pinSaveError(failure));
    },
  });

  const current = status.data;
  const state = current ? pinStatusKey(current) : null;

  return (
    <div className="surface-panel scroll-mt-20 rounded-xl" id="sign-off-pin">
      <div className="flex flex-wrap items-center gap-3 p-4 sm:px-6 sm:py-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="panel-title">{t("profileTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("profileHelp")}</p>
        </div>
        <Button
          type="submit"
          form="sign-off-pin-form"
          className="ml-auto"
          requires={[
            [newPin.length === 6, t("newPin")],
            [confirmPin.length === 6, t("confirmPin")],
            [password, t("accountPassword")],
            ...(proving ? [[identity, tIdentity("proof")] as const] : []),
          ]}
          disabledReason={
            newPin.length === 6 && confirmPin.length === 6 && newPin !== confirmPin
              ? t("pinMismatch")
              : undefined
          }
          disabled={save.isPending || newPin !== confirmPin}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {current?.has_pin ? t("change") : t("save")}
        </Button>
      </div>
      <form
        id="sign-off-pin-form"
        className="grid gap-4 border-t border-panel-border p-4 sm:px-6 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (newPin.length === 6 && newPin === confirmPin && password && (!proving || identity)) save.mutate();
        }}
      >
        {status.isError ? (
          <QueryFailedNote className="md:col-span-2" query={status} what={t("profileTitle")} />
        ) : (
          <ReadField
            className="md:col-span-2"
            label={t("statusLabel")}
            value={
              current && state
                ? state === "locked"
                  ? t("status.locked", {
                      time: format.dateTime(new Date(current.locked_until as string), {
                        hour: "2-digit",
                        minute: "2-digit",
                        hourCycle: "h23",
                      }),
                    })
                  : t(`status.${state}`)
                : "…"
            }
          />
        )}
        <FieldWrapper
          label={t("newPin")}
          required
          error={error?.field === "pin" ? error.message : undefined}
        >
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={newPin}
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
            onChange={(event) => setConfirmPin(pinDigits(event.target.value))}
          />
        </FieldWrapper>
        <FieldWrapper
          className="md:col-span-2"
          label={t("accountPassword")}
          required
          hint={t("accountPasswordHint")}
          error={error?.field === "current_password" ? error.message : undefined}
        >
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FieldWrapper>
        {proving && current && (
          <div className="md:col-span-2">
            <PinIdentityFields
              key={round}
              status={current}
              password={password}
              disabled={save.isPending}
              error={error}
              onChange={setIdentity}
            />
          </div>
        )}
      </form>
    </div>
  );
}
