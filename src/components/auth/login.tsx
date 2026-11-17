"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogIn, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ContactMse } from "@/components/platform-status/contact-mse";
import { MaintenanceNotice } from "@/components/platform-status/maintenance-banner";
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
  redirectWithFallback,
} from "@/lib/portal";
import { SIGNED_OUT, takeSignOutReason } from "@/lib/auth-token";
import { APP_VERSION } from "@/lib/app-version";
import { cn } from "@/lib/utils";
import { usePlatformStatus } from "@/hooks/use-platform-status";
import { checkClientVersion } from "@/services/platform-status.service";
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
  // JB211: a refusal MSE has to sort out (停用 / 到期 / 系统维护) shows MSE's
  // phone and email right under it.
  const [askMse, setAskMse] = useState(false);
  // query-failure: without an answer the page simply shows no notice and no contact lines; signing in still works.
  const status = usePlatformStatus();
  // query-failure: a failed check shows nothing; the server still answers an outdated build itself (426).
  const versionCheck = useQuery({
    queryKey: ["client-version-check", APP_VERSION],
    queryFn: () => checkClientVersion(APP_VERSION),
    staleTime: 5 * 60_000,
    retry: false,
  });
  // JB56: why this computer was signed out - the same account signed in on
  // another computer, or (JB78) the person pressed 退出登录. Read once, after the first paint (sessionStorage).
  const [signedOutReason, setSignedOutReason] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSignedOutReason(takeSignOutReason()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      setAskMse(false);
      try {
        const result = await authService.login(value.email, value.password, portal);
        setUser(result.user);

        // Drivers land on the driver page, not the console. Decided from the
        // permissions the sign-in already returned rather than from a role
        // name, so a tenant that renames its roles does not break it.
        const permissions = new Set(result.user.permissions ?? []);
        const defaultLanding = landingPathFor(
          (code) => Boolean(result.user.is_superuser) || permissions.has(code),
          result.user.is_field_staff,
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

        router.prefetch(destination);
        redirectWithFallback(router, destination, 1_200);
      } catch (error) {
        setFormError(messageFor(error, t));
        setAskMse(refusalForMse(error));
      }
    },
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-safe pb-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-panel-border bg-card p-1 shadow-glow-sm">
            <BrandIcon alt={t("app.name")} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-100">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {PORTAL_LABELS[portal]} {t("auth.login.title")}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("auth.login.subtitle")}
            </p>
          </div>

          {/* JB211: 系统维护 coming or under way, said before anyone types. */}
          <MaintenanceNotice
            maintenance={status.data?.maintenance}
            className="mb-4 rounded-lg"
          />
          {/* JB211 强制更新: this open page is older than the system allows. */}
          {versionCheck.data?.update_required ? (
            <div
              role="status"
              data-testid="login-version-outdated"
              className="mb-4 space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground"
            >
              <p className="font-medium">{t("platformStatus.gate.updateBody")}</p>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="size-4" />
                {t("platformStatus.gate.reload")}
              </Button>
            </div>
          ) : null}

          <div className="surface-panel rounded-xl p-4 sm:p-6">
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
                        className="inline-flex min-h-10 items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
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

              {signedOutReason && !formError && (
                <div
                  role="status"
                  data-testid="signed-out-reason"
                  className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5 text-sm font-medium text-foreground"
                >
                  {signedOutReason === SIGNED_OUT ? t("auth.login.signedOut") : signedOutReason}
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
                >
                  {formError}
                  {askMse ? (
                    <ContactMse contact={status.data?.contact} className="mt-2" />
                  ) : null}
                </div>
              )}

              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full"
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

          {/* JB211 (11.2.1 联络资料): 联系 MSE, from what MSE filled in. */}
          {!askMse ? (
            <ContactMse
              contact={status.data?.contact}
              className="mt-6 rounded-lg border border-panel-border px-3 py-2"
            />
          ) : null}

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
    // The code first: the message is already in the reader's language, so
    // 「company」 was only ever found in English (JB211).
    return error.code === "company_suspended" ||
      error.message.toLowerCase().includes("company")
      ? t("auth.login.companySuspended")
      : t("auth.login.userSuspended");
  }
  if (error.isNetwork) return t("errors.network");
  return error.message || t("common.unknownError");
}

/**
 * A refusal only MSE can lift (JB211): the company stopped or its subscription
 * over (both `company_suspended`), or 系统维护. MSE's phone and email go
 * right under it.
 */
export function refusalForMse(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.code === "company_suspended" || error.code === "platform_maintenance";
}

function emailValidator(t: Translate) {
  return requiredEmail(t("validation.required"), t("validation.email"));
}
