"use client";

import { Loader2, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import {
  hasFieldSession,
  markFieldAppContext,
  setFieldBootstrapToken,
} from "@/lib/auth-token";
import { redirectWithFallback } from "@/lib/portal";
import {
  getOrCreateFieldDeviceId,
  restoreFieldPwaSession,
} from "@/services/field-access.service";

export function FieldPwaBootstrap({
  token,
  next,
}: {
  token: string;
  next?: string;
}) {
  const t = useTranslations("fieldAccess");
  const router = useRouter();
  const { setUser } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState(() =>
    token ? "" : t("desktopExpired"),
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) return;
    // Skip the round trip only when there is a session to skip it for. The
    // link is reusable within the access window now (T-127), so a device that
    // kept this marker but lost its tokens should ask the server again rather
    // than fall back to the PIN - that fallback was half of the reported bug,
    // and browsers do clear storage in pieces.
    const completionKey = "mse_field_pwa_bootstrap_complete";
    if (
      window.localStorage.getItem(completionKey) === token &&
      hasFieldSession()
    ) {
      markFieldAppContext();
      redirectWithFallback(router, next ?? "/field-staff", 150);
      return;
    }
    void restoreFieldPwaSession({
      token,
      device_id: getOrCreateFieldDeviceId(),
      device_name: navigator.platform || t("thisPhone"),
    })
      .then(async (result) => {
        window.localStorage.setItem(completionKey, token);
        // The app's own storage now holds the way back in, so a re-install
        // from inside the app carries it too.
        setFieldBootstrapToken(token);
        setUser(result.user);
        redirectWithFallback(router, next ?? "/field-staff", 150);
      })
      .catch((cause) => {
        if (hasFieldSession()) {
          markFieldAppContext();
          redirectWithFallback(router, next ?? "/field-staff", 150);
          return;
        }
        setError(cause instanceof ApiError ? cause.message : t("failed"));
      });
  }, [next, router, setUser, t, token]);

  if (!error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("desktopSigningIn")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Smartphone className="size-12 text-destructive" />
      <h1 className="text-base font-semibold">{t("desktopExpiredTitle")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
      <Button onClick={() => redirectWithFallback(router, "/trace/field-login", 150)}>
        {t("signIn")}
      </Button>
    </main>
  );
}
