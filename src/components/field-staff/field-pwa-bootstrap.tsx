"use client";

import { Loader2, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldUnboundHelp } from "@/components/field-staff/field-unbound-help";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import {
  getFieldBootstrapToken,
  hasFieldSession,
  isStandaloneApp,
  markFieldAppContext,
  setFieldBootstrapToken,
} from "@/lib/auth-token";
import {
  contextReason,
  detectInstallEnvironment,
  fieldBootstrapStep,
  type UnboundReason,
} from "@/lib/field-install";
import { replacePage } from "@/lib/portal";
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
  const { setUser } = useAuth();
  const started = useRef(false);
  // Known only in the browser; read after hydration.
  const [reason, setReason] = useState<UnboundReason | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setReason(
        contextReason({
          standalone: isStandaloneApp(),
          environment: detectInstallEnvironment(),
        }),
      ),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [error, setError] = useState(() =>
    token ? "" : t("desktopExpired"),
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const step = fieldBootstrapStep({ token, hasSession: hasFieldSession() });
    // A phone that is already signed in keeps its session: a relaunch of the
    // installed app, or a reload, must not exchange the link again. If that
    // session turns out to be refused, the workspace comes back here (or to
    // the sign-in screen, which tries the kept link) by itself.
    if (step === "keep-session") {
      if (token && !getFieldBootstrapToken()) setFieldBootstrapToken(token);
      markFieldAppContext();
      replacePage(next ?? "/field-staff");
      return;
    }
    if (step === "missing") return;
    void restoreFieldPwaSession({
      token,
      device_id: getOrCreateFieldDeviceId(),
      device_name: navigator.platform || t("thisPhone"),
    })
      .then(async (result) => {
        // The app's own storage now holds the way back in, so a re-install
        // from inside the app carries it too.
        setFieldBootstrapToken(token);
        setUser(result.user);
        replacePage(next ?? "/field-staff");
      })
      .catch((cause) => {
        if (hasFieldSession()) {
          markFieldAppContext();
          replacePage(next ?? "/field-staff");
          return;
        }
        // A newer hand-off is held here (a PIN typed inside the app made
        // one): the sign-in screen tries it before asking for anything.
        const stored = getFieldBootstrapToken();
        if (stored && stored !== token) {
          replacePage("/trace/field-login");
          return;
        }
        setError(cause instanceof ApiError ? cause.message : t("failed"));
      });
  }, [next, setUser, t, token]);

  if (!error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("desktopSigningIn")}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Smartphone className="size-12 text-destructive" />
      <h1 className="text-xl font-bold leading-tight">{t("desktopExpiredTitle")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
      <div className="w-full max-w-sm text-left">
        {reason && <FieldUnboundHelp reason={reason} />}
      </div>
      <Button onClick={() => replacePage("/trace/field-login")}>
        {t("signIn")}
      </Button>
    </main>
  );
}
