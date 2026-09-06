"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Copy, Loader2, LogIn, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/interfaces/api";
import {
  getFieldBootstrapToken,
  setFieldBootstrapToken,
} from "@/lib/auth-token";
import { inAppBrowserName } from "@/lib/in-app-browser";
import { redirectWithFallback, safeReturnPath } from "@/lib/portal";
import { cacheBranding } from "@/lib/branding";
import {
  activateFieldDevice,
  fieldDeviceIdIsPersistent,
  fieldLogin,
  getOrCreateFieldDeviceId,
  inspectFieldInvitation,
  restoreFieldPwaSession,
} from "@/services/field-access.service";

export function FieldAccess() {
  const t = useTranslations("fieldAccess");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const token = searchParams.get("token") ?? "";
  const next = safeReturnPath(searchParams.get("next") ?? undefined);
  const invitation = useQuery({
    queryKey: ["field-invitation", token],
    queryFn: () => inspectFieldInvitation(token),
    enabled: Boolean(token),
    retry: false,
  });
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // True once a sign-in has proved this browser will not keep the device
  // id. Without this the refusal reads as the worker having done
  // something wrong, when the browser is discarding their identity.
  const [storageBlocked, setStorageBlocked] = useState(false);
  // Whether the stored install key is worth trying, decided once at mount
  // rather than set from inside the effect - the PIN form stays hidden until
  // the attempt has failed, so the app does not flash a form the worker will
  // usually not need.
  const [resuming, setResuming] = useState(
    () => typeof window !== "undefined" && !token && Boolean(getFieldBootstrapToken()),
  );
  const [copied, setCopied] = useState(false);
  const chatApp = typeof window === "undefined" ? null : inAppBrowserName();

  useEffect(() => {
    if (!token || !invitation.data?.branding) return;
    document.title = invitation.data.branding.name;
    cacheBranding(invitation.data.branding, true);
  }, [invitation.data, token]);

  /**
   * Try the key the install left behind, before asking for a PIN.
   *
   * The installed app opens at this screen whenever it was added from a page
   * that had no install key to hand, and the worker gets a PIN box for a
   * device the server may not recognise - a dead end they cannot solve, since
   * the way out is an invitation link they no longer have.
   *
   * The key is already sitting in this browser storage; it was only ever read
   * to build the manifest URL. Spending it here turns that dead end into a
   * sign-in, and when it fails nothing is lost - the PIN form appears exactly
   * as it did before.
   */
  useEffect(() => {
    if (token) return;
    const stored = getFieldBootstrapToken();
    if (!stored) return;
    let abandoned = false;
    void restoreFieldPwaSession({
      token: stored,
      device_id: getOrCreateFieldDeviceId(),
      device_name: navigator.platform || t("thisPhone"),
    })
      .then((result) => {
        if (abandoned) return;
        setUser(result.user);
        redirectWithFallback(router, next ?? "/field-staff", 150);
      })
      .catch(() => {
        if (!abandoned) setResuming(false);
      });
    return () => {
      abandoned = true;
    };
  }, [next, router, setUser, t, token]);

  const submit = async () => {
    setError("");
    setPending(true);
    try {
      const deviceId = getOrCreateFieldDeviceId();
      // Discovered by writing and reading back, so it can only be known
      // after the call above.
      setStorageBlocked(!fieldDeviceIdIsPersistent());
      const result = token
        ? await activateFieldDevice({
            token,
            pin,
            device_id: deviceId,
            device_name: navigator.platform || t("thisPhone"),
          })
        : await fieldLogin({
            pin,
            device_id: deviceId,
          });
      setUser(result.user);
      const bootstrapToken = result.pwa_bootstrap?.token;
      // Kept so that installing later, from any screen, still produces an app
      // that opens signed in. This is the only moment it is handed to us.
      if (bootstrapToken) setFieldBootstrapToken(bootstrapToken);
      const destination = bootstrapToken
        ? `/trace/field-ready?bootstrap=${encodeURIComponent(bootstrapToken)}${
            next ? `&next=${encodeURIComponent(next)}` : ""
          }`
        : next ?? "/field-staff";
      redirectWithFallback(
        router,
        destination,
        150,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("failed"));
    } finally {
      setPending(false);
    }
  };

  if (token && invitation.isLoading) {
    return <Centered><Loader2 className="size-8 animate-spin text-primary" /></Centered>;
  }

  // The installed app opening on a lapsed session. Showing the PIN box while
  // the stored install key is still being tried would offer a form that is
  // usually about to become unnecessary.
  if (resuming) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("resuming")}</p>
      </Centered>
    );
  }

  if (token && invitation.isError) {
    return (
      <Centered>
        <Smartphone className="size-12 text-destructive" />
        <h1 className="text-base font-semibold">{t("invalidTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("invalidBody")}</p>
      </Centered>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-5 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="bg-primary px-6 py-7 text-primary-foreground">
          <span className="mb-4 flex size-12 items-center justify-center rounded-lg bg-white/15">
            <Camera className="size-7" />
          </span>
          <h1 className="text-base font-semibold">{token ? t("activateTitle") : t("loginTitle")}</h1>
          <p className="mt-1 text-sm text-primary-foreground/80">
            {token ? invitation.data?.full_name : t("loginBody")}
          </p>
        </div>
        <div className="space-y-5 p-6">
          {token && invitation.data && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{invitation.data.projects.map((project) => project.name).join(", ")}</p>
              <p className="mt-1 text-muted-foreground">{invitation.data.phone}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="field-pin">{t("pin")}</Label>
            <Input
              id="field-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="h-12 text-center text-xl"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          {/* Said to everybody activating, loudly when the web view names
              itself. A phone is linked to the storage of the browser it was
              activated in, so a link opened inside a chat app links that app
              and nothing else - and the same phone, opened later in Safari or
              from the home screen, arrives as a device the server has never
              seen. WhatsApp does not identify itself, which is why the plain
              sentence is shown regardless. */}
          {token ? (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                chatApp
                  ? "bg-warning/15 text-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <p className="font-semibold">{t("browserWarningTitle")}</p>
              <p className="mt-1 text-xs">
                {chatApp
                  ? t("browserWarningNamed", { app: chatApp })
                  : t("browserWarning")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
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
            </div>
          ) : null}
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {storageBlocked && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
              {t("storageBlocked")}
            </p>
          )}
          <Button
            size="lg"
            className="h-12 w-full text-sm"
            requires={[[pin.length === 6, t("pin")]]}
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
            {token ? t("bind") : t("signIn")}
          </Button>
        </div>
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6">{children}</main>;
}
