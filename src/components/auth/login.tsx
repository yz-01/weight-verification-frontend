"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { required, requiredEmail } from "@/components/shared/form-shell";
import { BrandIcon } from "@/components/shared/brand-icon";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/interfaces/api";
import type { Portal } from "@/interfaces/auth";
import {
  PORTAL_LABELS,
  portalPaths,
} from "@/lib/portal";
import { cn } from "@/lib/utils";
import {
  firstAllowedDashboardPath,
  isRouteAllowed,
  landingPathFor,
} from "@/lib/navigation";
import * as authService from "@/services/auth.service";

export function Login({ portal, nextPath }: { portal: Portal; nextPath?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { setUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const result = await authService.login(value.email, value.password, portal);
        setUser(result.user);

        // Drivers land on the driver page, not the console. Decided from the
        // permissions the sign-in already returned rather than from a role
        // name, so a tenant that renames its roles does not break it.
        const permissions = new Set(result.user.permissions ?? []);
        const defaultLanding = landingPathFor((code) =>
          Boolean(result.user.is_superuser) || permissions.has(code),
        );
        const preferredHome = result.user.company_preferences?.home_page;
        const consoleHome =
          preferredHome &&
          isRouteAllowed(
            result.user.portal,
            result.user.features,
            preferredHome,
            result.user.permissions,
            result.user.is_superuser,
          )
            ? preferredHome
            : firstAllowedDashboardPath(
                result.user.portal,
                result.user.features,
              );
        const destination =
          nextPath ?? (defaultLanding === "/dashboard" ? consoleHome : defaultLanding);

        router.replace(destination);
      } catch (error) {
        setFormError(messageFor(error, t));
      }
    },
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5 lg:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border bg-background p-1">
            <BrandIcon alt={t("app.name")} />
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
              {PORTAL_LABELS[portal]} {t("auth.login.title")}
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
                validators={{ onSubmit: emailValidator(t) }}
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
                        href={portalPaths(portal).forgot}
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
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4" />
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
  if (error.code === "portal_mismatch") return error.message;
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

function emailValidator(t: Translate) {
  return requiredEmail(t("validation.required"), t("validation.email"));
}
