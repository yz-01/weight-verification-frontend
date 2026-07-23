"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/interfaces/api";
import { cn } from "@/lib/utils";
import * as authService from "@/services/auth.service";

export function Login() {
  const t = useTranslations();
  const router = useRouter();
  const { setUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const result = await authService.login(value.email, value.password);
        setUser(result.user);
        router.replace("/dashboard");
      } catch (error) {
        setFormError(messageFor(error, t));
      }
    },
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5 lg:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-4.5 w-4.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("auth.login.title")}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("auth.login.subtitle")}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
            >
              <form.Field
                name="email"
                validators={{ onSubmit: requiredEmail(t) }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="email"
                      className={cn(
                        "text-sm font-medium",
                        field.state.meta.errors[0] && "text-destructive",
                      )}
                    >
                      {t("auth.login.email")}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder={t("auth.login.emailPlaceholder")}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    {field.state.meta.errors[0] && (
                      <p className="text-xs font-medium text-destructive">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Field
                name="password"
                validators={{ onSubmit: required(t("validation.required")) }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="password"
                        className={cn(
                          "text-sm font-medium",
                          field.state.meta.errors[0] && "text-destructive",
                        )}
                      >
                        {t("auth.login.password")}
                      </Label>
                      <Link
                        href="/forgot-password"
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t("auth.login.forgot")}
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder={t("auth.login.passwordPlaceholder")}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    {field.state.meta.errors[0] && (
                      <p className="text-xs font-medium text-destructive">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </div>
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
                    {isSubmitting && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {t("auth.login.submit")}
                  </Button>
                )}
              </form.Subscribe>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("app.tagline")}
          </p>
        </div>
      </main>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations>;

/**
 * Turn a failed sign-in into copy the user can act on.
 *
 * The backend distinguishes a suspended user from a suspended company because
 * the two need different next steps: one is the customer's own administrator,
 * the other is MSE Trace support.
 */
function messageFor(error: unknown, t: Translate): string {
  if (!(error instanceof ApiError)) return t("common.unknownError");
  if (error.status === 429) return t("auth.login.throttled");
  if (error.status === 401) return t("auth.login.invalid");
  if (error.status === 403) {
    return error.message.toLowerCase().includes("company")
      ? t("auth.login.companySuspended")
      : t("auth.login.userSuspended");
  }
  if (error.isNetwork) return t("errors.network");
  return error.message || t("common.unknownError");
}

/** Zod wrapped in a plain function, as the form layer expects. */
function required(message: string) {
  return ({ value }: { value: unknown }) => {
    const result = z.string().min(1, message).safeParse(value);
    return result.success ? undefined : result.error.issues[0].message;
  };
}

function requiredEmail(t: Translate) {
  return ({ value }: { value: unknown }) => {
    const result = z
      .string()
      .min(1, t("validation.required"))
      .email(t("validation.email"))
      .safeParse(value);
    return result.success ? undefined : result.error.issues[0].message;
  };
}
