"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Save, ShieldCheck, Stamp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  DetailHeader,
  FieldWrapper,
  ListHeader,
  LoadFailed,
} from "@/components/shared/page-primitives";
import { PhotoLink } from "@/components/shared/photo-link";
import { PinIdentityFields, needsIdentity } from "@/components/shared/pin-identity-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getApprovalCredential,
  setApprovalCredential,
} from "@/services/consultant-workflow.service";
import { getSignOffPinStatus, type PinIdentity } from "@/services/sign-off.service";

export function ApprovalCredentialSettings() {
  const t = useTranslations("consultantWorkflow");
  const queryClient = useQueryClient();
  // Back to where the reader came from (JB215B-4, jb201-names §4.3): a
  // consultant opens this page from 顾问首页, a contractor from 顾问申请. It
  // said 「返回顾问申请」 to both.
  const { user } = useAuth();
  const back = user?.account_type === "CONSULTANT"
    ? { backHref: "/consultant-dashboard", backLabel: t("backToDashboard") }
    : { backHref: "/consultant-applications", backLabel: t("applications.back") };
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [signature, setSignature] = useState<File | undefined>();
  const [stamp, setStamp] = useState<File | undefined>();
  const credential = useQuery({
    queryKey: ["approval-credential"],
    queryFn: getApprovalCredential,
  });
  // JB203-11 (Lucas 11-16 audit): with a PIN already set, the PIN boxes are
  // optional - a new stamp or signature alone keeps it. Asking for a 「新 6 位
  // PIN」 to save a picture replaced the one PIN used everywhere.
  const keepsPin = Boolean(credential.data?.has_pin) && pin === "" && pinConfirm === "";
  // JB239 (客户 11-23 事项 11): a PIN once set is replaced only with the old
  // PIN or a code mailed to the login e-mail - here as on 「我的签核密码」.
  const tIdentity = useTranslations("jb239.identity");
  // The server still refuses a PIN replaced without proof (sign_off_pin_identity_required), said in the toast.
  // query-failure: the 「确认是你本人」 block stays hidden; the save is then refused and says why.
  const pinStatus = useQuery({ queryKey: ["sign-off-pin"], queryFn: getSignOffPinStatus });
  const proving = !keepsPin && needsIdentity(pinStatus.data);
  const [identity, setIdentity] = useState<PinIdentity>(null);
  const [round, setRound] = useState(0);
  const save = useMutation({
    mutationFn: () =>
      setApprovalCredential({
        currentPassword: password,
        approvalPin: pin,
        signature,
        stamp,
        identity: proving ? identity : null,
      }),
    onSuccess: async () => {
      setRound((value) => value + 1);
      setPassword("");
      setPin("");
      setPinConfirm("");
      setSignature(undefined);
      setStamp(undefined);
      await queryClient.invalidateQueries({ queryKey: ["approval-credential"] });
      await queryClient.invalidateQueries({ queryKey: ["sign-off-pin"] });
    },
  });

  if (credential.isError) {
    // Without the stored credential the form cannot tell "set up" from "replace".
    return (
      <div className="mx-auto max-w-4xl space-y-4 pb-8">
        <DetailHeader {...back} />
        <ListHeader
          title={t("credential.title")}
          subtitle={t("credential.subtitle")}
        />
        <LoadFailed what={t("what.credential")} onRetry={() => credential.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <DetailHeader {...back} />
      <ListHeader
        title={t("credential.title")}
        subtitle={t("credential.subtitle")}
      />
      <section id="credential-identity" className="surface-panel scroll-mt-20 rounded-xl p-4 sm:p-6">
        <div className="mb-4 flex items-start gap-3 border-b pb-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t("credential.identityTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("credential.identityHelp")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={t("credential.signature")}
            required={!credential.data?.signature}
            hint={t("credential.signatureHelp")}
          >
            <Input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => setSignature(event.target.files?.[0])}
            />
            {credential.data?.signature && !signature && (
              // Opened in the app's viewer, on white (JB172): as a bare file
              // the browser put a see-through signature on its own dark page.
              <PhotoLink
                href={credential.data.signature}
                label={t("credential.signature")}
                image
                paper
                className="mt-2 flex h-28 items-center justify-center overflow-hidden rounded-lg border bg-paper p-2"
              >
                {/* The stored image is user-owned evidence and is intentionally shown without transformation. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={credential.data.signature} alt={t("credential.signature")} className="max-h-full max-w-full object-contain" />
              </PhotoLink>
            )}
          </FieldWrapper>
          <FieldWrapper
            label={t("credential.stamp")}
            hint={t("credential.stampHelp")}
          >
            <Input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => setStamp(event.target.files?.[0])}
            />
            {credential.data?.stamp && !stamp && (
              <PhotoLink
                href={credential.data.stamp}
                label={t("credential.stamp")}
                image
                paper
                className="mt-2 flex h-28 items-center justify-center overflow-hidden rounded-lg border bg-paper p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={credential.data.stamp} alt={t("credential.stamp")} className="max-h-full max-w-full object-contain" />
              </PhotoLink>
            )}
          </FieldWrapper>
        </div>
      </section>

      <section id="credential-pin" className="surface-panel scroll-mt-20 rounded-xl p-4 sm:p-6">
        <div className="mb-4 flex items-start gap-3 border-b pb-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-info/10 text-info"><KeyRound className="size-5" /></span>
          <div><h2 className="font-semibold">{t("credential.pinTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("credential.pinHelp")}</p>{credential.data?.has_pin && <p data-slot="pin-keep" className="mt-1 text-sm text-muted-foreground">{t("credential.pinKeep")}</p>}</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("credential.pin")} required={!credential.data?.has_pin}>
            <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} />
          </FieldWrapper>
          <FieldWrapper label={t("credential.pinConfirm")} required={!credential.data?.has_pin} error={pinConfirm && pinConfirm !== pin ? t("credential.pinMismatch") : undefined}>
            <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pinConfirm} onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, ""))} />
          </FieldWrapper>
          <FieldWrapper label={t("credential.currentPassword")} required className="sm:col-span-2" hint={t("credential.passwordHelp")}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </FieldWrapper>
          {proving && pinStatus.data && (
            <div className="sm:col-span-2">
              <FieldWrapper label={tIdentity("proof")} required>
                <PinIdentityFields
                  key={round}
                  status={pinStatus.data}
                  password={password}
                  disabled={save.isPending}
                  onChange={setIdentity}
                />
              </FieldWrapper>
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-end max-sm:[&_button]:w-full">
        <Button requires={[[password, t("credential.currentPassword")], [keepsPin || pin.length === 6, t("credential.pin")], [keepsPin || pinConfirm.length === 6, t("credential.pinConfirm")], [credential.data?.signature || signature, t("credential.signature")], ...(proving ? [[identity, tIdentity("proof")] as const] : [])]}
disabledReason={pin.length === 6 && pinConfirm.length === 6 && pin !== pinConfirm ? t("credential.pinMismatch") : undefined}
                disabled={pin !== pinConfirm || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" /> : credential.data ? <Save /> : <Stamp />}
          {t("credential.save")}
        </Button>
      </div>
    </div>
  );
}
