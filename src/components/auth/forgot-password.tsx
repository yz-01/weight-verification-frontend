"use client";

import { useForm } from "@tanstack/react-form";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { TextField, type BoundField } from "@/components/shared/form-fields";
import { requiredEmail } from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import type { Portal } from "@/interfaces/auth";
import { portalLoginPath } from "@/lib/portal";
import { forgotPassword } from "@/services/auth.service";

export function ForgotPassword({ portal }: { portal?: Portal }) {
  const t = useTranslations();
  const [sent, setSent] = useState(false);

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      // The service never rejects on an unknown address, and the response is
      // identical either way: a different answer for a missing account turns
      // this endpoint into a way to enumerate who is registered.
      await forgotPassword(
        value.email,
        {
          subject: t("email.reset.subject"),
          body: t("email.reset.body"),
        },
        portal,
      );
      setSent(true);
    },
  });

  return (
    <AuthCard
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      footer={
        <Link
          href={portalLoginPath(portal)}
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      {sent ? (
        <div className="flex items-start gap-2.5 rounded-md border border-success/25 bg-success/8 px-3 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-sm text-foreground">{t("auth.forgot.sent")}</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="email"
            validators={{
              onSubmit: requiredEmail(
                t("validation.required"),
                t("validation.email"),
              ),
            }}
          >
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("auth.login.email")}
                required
                type="email"
                autoComplete="email"
                placeholder={t("auth.login.emailPlaceholder")}
              />
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="w-full rounded-full shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t("auth.forgot.submit")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </AuthCard>
  );
}
