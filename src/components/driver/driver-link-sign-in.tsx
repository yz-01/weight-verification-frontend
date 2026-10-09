"use client";

import { Copy, Link2Off, Loader2, LogIn, RefreshCw, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import { driverLinkOutcome, driverLinkToken, type DriverLinkOutcome } from "@/lib/driver-link";
import { inAppBrowserName } from "@/lib/in-app-browser";
import { redirectWithFallback } from "@/lib/portal";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import { signInWithDriverLink } from "@/services/driver-link.service";

type Screen = "signingIn" | "chatApp" | DriverLinkOutcome;

/**
 * Where a driver's sign-in link lands.
 *
 * 「司机这个不需要pin登录，可以直接登录」: opening the link is the whole
 * sign-in. The first phone to open it keeps it, by the same device id the
 * field-staff link uses, so a link forwarded on is useless elsewhere.
 *
 * Also the screen a driver is sent to when their link closes mid-session
 * (``?closed=1``), because there is no password to fall back on and a login
 * form would be a dead end.
 */
export function DriverLinkSignIn() {
  const t = useTranslations("driverLink");
  const common = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const token = driverLinkToken(searchParams.get("token"));
  const chatApp = typeof window === "undefined" ? null : inAppBrowserName();
  const [screen, setScreen] = useState<Screen>(() =>
    searchParams.get("closed") === "1"
      ? "closed"
      : !token
        ? "invalid"
        : chatApp
          ? "chatApp"
          : "signingIn",
  );
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const signIn = useCallback(async () => {
    setScreen("signingIn");
    try {
      const result = await signInWithDriverLink({
        token,
        device_id: getOrCreateFieldDeviceId(),
        device_name: navigator.platform || t("thisPhone"),
      });
      setUser(result.user);
      redirectWithFallback(router, "/driver", 150);
    } catch (cause) {
      setScreen(driverLinkOutcome(cause instanceof ApiError ? cause.code : ""));
    }
  }, [router, setUser, t, token]);

  useEffect(() => {
    // Once: React runs effects twice in development, and a second sign-in
    // on the same phone is harmless but would flash the spinner again.
    if (screen !== "signingIn" || started.current) return;
    started.current = true;
    void signIn();
  }, [screen, signIn]);

  if (screen === "signingIn") {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("signingIn")}</p>
      </Centered>
    );
  }

  if (screen === "chatApp") {
    // A chat app's own browser keeps its own storage, so the link would bind
    // to that view and the same phone in Chrome or Safari would be refused
    // as "another phone". Said before anything is bound, not after.
    return (
      <Centered>
        <Smartphone className="size-12 text-warning" />
        <h1 className="text-center text-xl font-bold leading-tight">{t("chatTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {t("chatBody", { app: chatApp ?? "" })}
        </p>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy />
            {copied ? t("copied") : t("copyLink")}
          </Button>
          <Button size="lg" onClick={() => void signIn()}>
            <LogIn />
            {t("continueHere")}
          </Button>
        </div>
      </Centered>
    );
  }

  const failed = screen === "failed";
  const Icon = screen === "otherDevice" ? Smartphone : Link2Off;
  return (
    <Centered>
      <Icon className={`size-12 ${failed ? "text-muted-foreground" : "text-destructive"}`} />
      <h1 className="text-center text-xl font-bold leading-tight">{t(`${screen}Title`)}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">{t(`${screen}Body`)}</p>
      {failed && token && (
        <Button size="lg" onClick={() => void signIn()}>
          <RefreshCw />
          {common("retry")}
        </Button>
      )}
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10">
      {children}
    </main>
  );
}
