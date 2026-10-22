"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Copy, Loader2, LogIn, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { FieldUnboundHelp } from "@/components/field-staff/field-unbound-help";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import {
  FIELD_OFFICE_SIGN_OUTS,
  getFieldBootstrapToken,
  isStandaloneApp,
  setFieldBootstrapToken,
  takeFieldSignOutReason,
} from "@/lib/auth-token";
import {
  contextReason,
  detectInstallEnvironment,
  fieldAccessView,
  fieldSignInDestination,
  unboundReason,
  type InstallEnvironment,
} from "@/lib/field-install";
import { inAppBrowserName } from "@/lib/in-app-browser";
import { replacePage, safeReturnPath } from "@/lib/portal";
import { cacheBranding } from "@/lib/branding";
import {
  activateFieldDevice,
  fieldDeviceIdIsPersistent,
  fieldLogin,
  fieldStorageWasLinked,
  getOrCreateFieldDeviceId,
  inspectFieldInvitation,
  restoreFieldPwaSession,
} from "@/services/field-access.service";

interface BrowserContext {
  standalone: boolean;
  environment: InstallEnvironment;
  linked: boolean;
  hasDeviceId: boolean;
}

export function FieldAccess() {
  const t = useTranslations("fieldAccess");
  const searchParams = useSearchParams();
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
  // Why the phone was signed out, when the office did it (new link, or the
  // account stopped): said in plain words above the PIN box, not a bare
  // "session expired" (Lucas 2026-10-22).
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
  // Set once a PIN (or the stored key) has been accepted. From then on the
  // screen only says "opening" while the browser loads the next page: the
  // form must never come back for a second PIN (Lucas 2026-10-22,
  // 「我第一次输入了又跳回去输入pin的页面」). Signing in clears the query
  // cache, the invitation query loaded again, and on a slow line the form
  // reappeared before the next page did - and a second PIN retired the
  // hand-off token the first one had put in the address.
  const [signedIn, setSignedIn] = useState(false);
  // The server said this browser is not the linked phone.
  const [deviceRefused, setDeviceRefused] = useState(false);
  const chatApp = typeof window === "undefined" ? null : inAppBrowserName();
  // Browser facts, read after hydration so the server and the first client
  // render agree.
  const [context, setContext] = useState<BrowserContext | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let hasDeviceId = false;
      try {
        hasDeviceId = Boolean(window.localStorage.getItem("mse_field_device_id"));
      } catch {
        hasDeviceId = false;
      }
      const officeReason = takeFieldSignOutReason();
      if (officeReason) setError((current) => current || officeReason);
      setContext({
        standalone: isStandaloneApp(),
        environment: detectInstallEnvironment(),
        linked: fieldStorageWasLinked(),
        hasDeviceId,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
        setSignedIn(true);
        setUser(result.user);
        replacePage(next ?? "/field-staff");
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        if (
          cause instanceof ApiError &&
          FIELD_OFFICE_SIGN_OUTS.includes(cause.code ?? "")
        ) {
          setError(cause.message);
        }
        setResuming(false);
      });
    return () => {
      abandoned = true;
    };
  }, [next, setUser, t, token]);

  const submit = async () => {
    setError("");
    setDeviceRefused(false);
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
      // First, before anything re-renders: the form must not come back.
      setSignedIn(true);
      const bootstrapToken = result.pwa_bootstrap?.token;
      // Kept so that installing later, from any screen, still produces an app
      // that opens signed in. This is the only moment it is handed to us.
      if (bootstrapToken) setFieldBootstrapToken(bootstrapToken);
      openPage(
        fieldSignInDestination({
          bootstrapToken,
          next,
          standalone: isStandaloneApp(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("failed"));
      setDeviceRefused(
        cause instanceof ApiError && cause.code === "field_device_invalid",
      );
      setPending(false);
    }
  };

  const view = fieldAccessView({
    signedIn,
    hasInvitation: Boolean(token),
    invitationLoading: invitation.isLoading,
    invitationError: invitation.isError,
    resuming,
  });

  if (view === "opening") {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("opening")}</p>
      </Centered>
    );
  }

  if (view === "loading") {
    return <Centered><Loader2 className="size-8 animate-spin text-primary" /></Centered>;
  }

  // The installed app opening on a lapsed session. Showing the PIN box while
  // the stored install key is still being tried would offer a form that is
  // usually about to become unnecessary.
  if (view === "resuming") {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("resuming")}</p>
      </Centered>
    );
  }

  if (view === "invalid") {
    return (
      <Centered>
        <Smartphone className="size-12 text-destructive" />
        <h1 className="text-center text-xl font-bold leading-tight">{t("invalidTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("invalidBody")}</p>
      </Centered>
    );
  }

  const unbound =
    !token && context
      ? deviceRefused
        ? contextReason(context)
        : unboundReason({
            linked: context.linked,
            hasBootstrapToken: Boolean(getFieldBootstrapToken()),
            standalone: context.standalone,
            environment: context.environment,
          })
      : null;
  // Storage that has never held a device id has never been linked: the
  // server has never seen this "phone", so a PIN cannot work. Only the way in
  // is shown there.
  const pinUseful = token
    ? true
    : !unbound || deviceRefused || Boolean(context?.hasDeviceId);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="w-full max-w-md overflow-hidden surface-panel rounded-xl">
        <div className="border-b border-panel-border bg-primary/10 px-4 py-6 sm:px-6">
          <span className="mb-4 flex size-12 items-center justify-center rounded-xl border border-panel-border bg-primary/15 text-primary shadow-glow-sm">
            <Camera className="size-7" />
          </span>
          <h1 className="text-xl font-bold leading-tight">{token ? t("activateTitle") : t("loginTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {token ? invitation.data?.full_name : t("loginBody")}
          </p>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          {token && invitation.data && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{invitation.data.projects.map((project) => project.name).join(", ")}</p>
              <p className="mt-1 text-muted-foreground">{invitation.data.phone}</p>
            </div>
          )}
          {unbound && <FieldUnboundHelp reason={unbound} />}
          {pinUseful && (
            <FieldWrapper label={t("pin")} required>
              <Input
                id="field-pin"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="h-12 text-center text-xl"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </FieldWrapper>
          )}
          {/* Said to everybody activating, loudly when the web view names
              itself. A phone is linked to the storage of the browser it was
              activated in, so a link opened inside a chat app links that app
              and nothing else - and the same phone, opened later in Safari or
              from the home screen, arrives as a device the server has never
              seen. WhatsApp does not identify itself, which is why the plain
              sentence is shown regardless. */}
          {token ? (
            <div
              className={`rounded-lg border p-3 text-sm ${
                chatApp
                  ? "border-warning/40 bg-warning/15 text-foreground"
                  : "bg-muted/30 text-muted-foreground"
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
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
          {storageBlocked && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground">
              {t("storageBlocked")}
            </p>
          )}
          {pinUseful && (
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
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * A full page load, not a client-side route change, for two reasons:
 *
 * - On an iPhone, "Add to Home Screen" takes the address and manifest of the
 *   document Safari actually loaded. After a client-side change Safari could
 *   still hold the activation page's, and the installed app then opened on
 *   the PIN screen with nothing to sign in with.
 * - Nothing on this screen can cancel it half-way, which is how the PIN form
 *   came back for a second PIN on a slow line.
 */
function openPage(path: string): void {
  window.location.replace(path);
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">{children}</main>;
}
