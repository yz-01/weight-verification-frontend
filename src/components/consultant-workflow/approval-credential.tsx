"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Save, ShieldCheck, Stamp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  DetailHeader,
  FieldWrapper,
  ListHeader,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getApprovalCredential,
  setApprovalCredential,
} from "@/services/consultant-workflow.service";

export function ApprovalCredentialSettings() {
  const t = useTranslations("consultantWorkflow");
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [signature, setSignature] = useState<File | undefined>();
  const [stamp, setStamp] = useState<File | undefined>();
  const credential = useQuery({
    queryKey: ["approval-credential"],
    queryFn: getApprovalCredential,
  });
  const save = useMutation({
    mutationFn: () =>
      setApprovalCredential({
        currentPassword: password,
        approvalPin: pin,
        signature,
        stamp,
      }),
    onSuccess: async () => {
      setPassword("");
      setPin("");
      setPinConfirm("");
      setSignature(undefined);
      setStamp(undefined);
      await queryClient.invalidateQueries({ queryKey: ["approval-credential"] });
    },
  });
  const valid = Boolean(
    password &&
      pin.length === 6 &&
      pin === pinConfirm &&
      (credential.data || signature),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8">
      <DetailHeader
        backHref="/consultant-applications"
        backLabel={t("applications.back")}
      />
      <ListHeader
        title={t("credential.title")}
        subtitle={t("credential.subtitle")}
      />
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-start gap-3 border-b pb-5">
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
        <div className="grid gap-5 sm:grid-cols-2">
          <FieldWrapper
            label={t("credential.signature")}
            required={!credential.data}
            hint={t("credential.signatureHelp")}
          >
            <Input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => setSignature(event.target.files?.[0])}
            />
            {credential.data?.signature && !signature && (
              <a
                href={credential.data.signature}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex h-28 items-center justify-center overflow-hidden rounded-lg border bg-white p-2"
              >
                {/* The stored image is user-owned evidence and is intentionally shown without transformation. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={credential.data.signature} alt={t("credential.signature")} className="max-h-full max-w-full object-contain" />
              </a>
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
              <a
                href={credential.data.stamp}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex h-28 items-center justify-center overflow-hidden rounded-lg border bg-white p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={credential.data.stamp} alt={t("credential.stamp")} className="max-h-full max-w-full object-contain" />
              </a>
            )}
          </FieldWrapper>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-start gap-3 border-b pb-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-info/10 text-info"><KeyRound className="size-5" /></span>
          <div><h2 className="font-semibold">{t("credential.pinTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("credential.pinHelp")}</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("credential.pin")} required>
            <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} />
          </FieldWrapper>
          <FieldWrapper label={t("credential.pinConfirm")} required error={pinConfirm && pinConfirm !== pin ? t("credential.pinMismatch") : undefined}>
            <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pinConfirm} onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, ""))} />
          </FieldWrapper>
          <FieldWrapper label={t("credential.currentPassword")} required className="sm:col-span-2" hint={t("credential.passwordHelp")}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </FieldWrapper>
        </div>
      </section>

      <div className="flex justify-end">
        <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" /> : credential.data ? <Save /> : <Stamp />}
          {t("credential.save")}
        </Button>
      </div>
    </div>
  );
}
