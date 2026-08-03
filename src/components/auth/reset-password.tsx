"use client";

import { useForm } from "@tanstack/react-form";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { TextField, type BoundField } from "@/components/shared/form-fields";
import { minLength, required } from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import { resetPassword } from "@/services/auth.service";

export function ResetPassword() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { new_password: "", confirm_password: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (value.new_password !== value.confirm_password) {
        setFormError(t("validation.passwordMismatch"));
        return;
      }
      try {
        await resetPassword({ token, new_password: value.new_password });
        setDone(true);
      } catch (error) {
        if (error instanceof ApiError) {
          setFormError(
            error.fieldError("new_password") ?? t("auth.reset.invalidToken"),
          );
        }
      }
    },
  });

  const backToLogin = (
    <Link
      href="/login"
      className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {t("auth.forgot.backToLogin")}
    </Link>
  );

  // A link with no token cannot be redeemed, and the failure is the link's
  // rather than anything the user can fix by typing. Say so before the form.
  if (token === "") {
    return (
      <AuthCard
        title={t("auth.reset.title")}
        subtitle={t("auth.reset.subtitle")}
        footer={backToLogin}
      >
        <p className="text-sm text-destructive">{t("auth.reset.invalidToken")}</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.reset.title")}
      subtitle={t("auth.reset.subtitle")}
      footer={backToLogin}
    >
      {done ? (
        <div className="flex items-start gap-2.5 rounded-md border border-success/25 bg-success/8 px-3 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-sm text-foreground">{t("auth.reset.success")}</p>
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
            name="new_password"
            validators={{
              onSubmit: minLength(10, t("validation.passwordTooShort")),
            }}
          >
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("auth.reset.newPassword")}
                required
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.Field>

          <form.Field
            name="confirm_password"
            validators={{ onSubmit: required(t("validation.required")) }}
          >
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("auth.reset.confirmPassword")}
                required
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.Field>

          {formError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

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
                  <KeyRound className="h-4 w-4" />
                )}
                {t("auth.reset.submit")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </AuthCard>
  );
}
