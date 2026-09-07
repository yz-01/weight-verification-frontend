"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Send, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormSection } from "@/components/shared/form-shell";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import {
  getCompanyOwnerAccount,
  updateCompanyOwnerAccount,
} from "@/services/companies.service";

/**
 * The address a tenant activation key went to, and a way to correct it.
 *
 * The company form collects the owner at creation and then hides those fields,
 * because the backend refuses them on edit - pointing the account at a
 * different person is a handover, not a correction. But that left the address
 * invisible as well as unchangeable, so one typed character was indisputable
 * only after the customer said they never received their email.
 *
 * Read by anyone who can see the company; changed by a platform superadmin
 * only, which is the rule the user set (2026-09-05). The server enforces it -
 * `can_be_edited` is what the server says about the reader, not a guess made
 * here - and the form is simply not offered when the answer is no, rather than
 * shown and refused on press.
 */
export function OwnerAccountPanel({ companyId }: { companyId: string }) {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [sentTo, setSentTo] = useState("");

  const owner = useQuery({
    queryKey: ["companies", companyId, "owner-account"],
    queryFn: () => getCompanyOwnerAccount(companyId),
  });

  const save = useMutation({
    mutationFn: () =>
      updateCompanyOwnerAccount(companyId, {
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        owner_email_copy: {
          subject: t("email.invite.subject"),
          body: t("email.invite.body"),
        },
      }),
    onSuccess: (result) => {
      setError("");
      setEmail("");
      setPhone("");
      setLink(result.invitation_url);
      setSentTo(result.invitation_sent ? result.email : "");
      void owner.refetch();
    },
    onError: (reason) =>
      setError(
        reason instanceof ApiError ? reason.message : t("errors.generic"),
      ),
  });

  if (owner.isLoading) return null;

  const row = owner.data;

  return (
    <FormSection title={t("companies.owner.account.title")}>
      {row === null || row === undefined ? (
        <p className="text-sm text-muted-foreground">
          {t("companies.owner.account.none")}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("companies.owner.account.description")}
          </p>
          <dl className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("companies.field.ownerName")}
              </dt>
              <dd className="font-medium">{row.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("companies.field.ownerEmail")}
              </dt>
              <dd className="font-medium break-all">{row.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("companies.owner.account.status")}
              </dt>
              <dd className="font-medium">
                {t.has(`companies.owner.account.userStatus.${row.status}`)
                  ? t(`companies.owner.account.userStatus.${row.status}`)
                  : row.status}
              </dd>
            </div>
          </dl>

          {row.can_be_edited ? (
            <>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                {t("companies.owner.account.warning")}
              </p>
              <FieldWrapper
                label={t("companies.field.ownerEmail")}
                optional={t("common.optional")}
              >
                <Input
                  type="email"
                  value={email}
                  placeholder={row.email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper
                label={t("companies.field.ownerPhone")}
                optional={t("common.optional")}
              >
                <Input
                  type="tel"
                  value={phone}
                  placeholder={row.phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </FieldWrapper>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending || !(email.trim() || phone.trim())}
                disabledReason={
                  !(email.trim() || phone.trim())
                    ? t("companies.owner.account.needsAChange")
                    : undefined
                }
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send />
                )}
                {t("companies.owner.account.save")}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("companies.owner.account.readOnly")}
            </p>
          )}

          {sentTo ? (
            <p className="text-sm text-success">
              {t("companies.owner.account.sent", { email: sentTo })}
            </p>
          ) : null}
          {link ? (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-xs text-muted-foreground">
                {t("companies.owner.account.notSent")}
              </p>
              <p className="mt-1 text-xs break-all font-mono">{link}</p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </>
      )}
    </FormSection>
  );
}
