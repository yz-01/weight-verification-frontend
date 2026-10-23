"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Loader2, LogIn, Smartphone } from "lucide-react";
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
  fieldSessionIssuedAt,
  getFieldBootstrapToken,
  hasFieldSession,
  isStandaloneApp,
  markFieldInstallHelp,
  setFieldBootstrapToken,
  takeFieldSignOutReason,
} from "@/lib/auth-token";
import {
  activationLinkSignedIn,
  contextReason,
  detectInstallEnvironment,
  fieldAccessView,
  fieldSignInDestination,
  unboundCode,
  unboundReason,
  type InstallEnvironment,
  validBootstrap,
} from "@/lib/field-install";
import { replacePage, safeReturnPath } from "@/lib/portal";
import { cacheBranding } from "@/lib/branding";
import {
  activateFieldDevice,
  fieldDeviceIdIsPersistent,
  fieldLogin,
  fieldSessionUserId,
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
  // The installed app sent here to join the phone with the PIN.
  const joinLink = validBootstrap(searchParams.get("bootstrap"));
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
    () => typeof window !== "undefined" && !token && Boolean(resumeLink(joinLink)),
  );
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
  // The server's code when the stored hand-off was refused (shown as the
  // reason under the "not linked" help, and logged).
  const [refusedCode, setRefusedCode] = useState<string | null>(null);
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
      // A page opened with a link in its address (the app link, or the
      // activation link) is about that link: a
      // sign-out this browser saw earlier, under an older link, is not news
      // here (Lucas 2026-10-23: scanned the QR, 「在 Safari 打开」, and read
      // 「办公室已重新发出链接」 about a test link from days before).
      const officeReason = takeFieldSignOutReason();
      if (officeReason && !joinLink && !token) setError((current) => current || officeReason);
      setContext({
        standalone: isStandaloneApp(),
        environment: detectInstallEnvironment(),
        linked: fieldStorageWasLinked(),
        hasDeviceId,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [joinLink, token]);

  useEffect(() => {
    if (!token || !invitation.data?.branding) return;
    document.title = invitation.data.branding.name;
    cacheBranding(invitation.data.branding, true);
  }, [invitation.data, token]);

  /**
   * Tapping the activation link again where this person is already signed in
   * through it goes straight to the workspace, no PIN (Lucas 2026-10-23:
   * workers close the page and open the link from WhatsApp again every time).
   * Also when the link has since run out: the session here is what counts. A
   * browser signed in as someone else, or through a link the office has since
   * replaced, gets the form (`activationLinkSignedIn`).
   */
  useEffect(() => {
    if (!token || invitation.isLoading || !hasFieldSession()) return;
    const sameLink = activationLinkSignedIn({
      invitationExpired: invitation.isError,
      invitationUserId: invitation.data?.user_id,
      activatedAt: invitation.data?.activated_at,
      sessionUserId: fieldSessionUserId(),
      sessionIssuedAt: fieldSessionIssuedAt(),
    });
    if (!sameLink) return;
    const frame = window.requestAnimationFrame(() => {
      setSignedIn(true);
      replacePage(next ?? "/field-staff");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [invitation.data, invitation.isError, invitation.isLoading, next, token]);

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
    const stored = resumeLink(joinLink);
    if (!stored) return;
    let abandoned = false;
    void restoreFieldPwaSession({
      context: isStandaloneApp() ? "standalone" : "browser",
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
        } else if (cause instanceof ApiError && cause.code) {
          setRefusedCode(cause.code);
        }
        setResuming(false);
      });
    return () => {
      abandoned = true;
    };
  }, [joinLink, next, setUser, t, token]);

  const submit = async () => {
    setError("");
    setDeviceRefused(false);
    setPending(true);
    try {
      const deviceId = getOrCreateFieldDeviceId();
      // Discovered by writing and reading back, so it can only be known
      // after the call above.
      setStorageBlocked(!fieldDeviceIdIsPersistent());
      const context = isStandaloneApp() ? "standalone" : "browser";
      // The app link this page holds (in its address, or kept from an earlier
      // sign-in here) lets the PIN sign this page in even when the server no
      // longer counts it among the signed-in places.
      const link = joinLink ?? validBootstrap(getFieldBootstrapToken());
      const result = token
        ? await activateFieldDevice({
            token,
            pin,
            device_id: deviceId,
            device_name: navigator.platform || t("thisPhone"),
            context,
          })
        : await fieldLogin({
            pin,
            device_id: deviceId,
            ...(link ? { bootstrap: link, context } : {}),
          });
      // First, before anything re-renders: the form must not come back.
      setSignedIn(true);
      const bootstrapToken = result.pwa_bootstrap?.token;
      // Kept so that installing later, from any screen, still produces an app
      // that opens signed in. This is the only moment it is handed to us.
      if (bootstrapToken) setFieldBootstrapToken(bootstrapToken);
      markFieldInstallHelp();
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
      ? deviceRefused || (refusedCode && context.standalone && !context.linked)
        ? contextReason(context)
        : unboundReason({
            linked: context.linked,
            hasBootstrapToken: Boolean(getFieldBootstrapToken() || joinLink),
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
            {token ? invitation.data?.full_name : joinLink ? t("joinBody") : t("loginBody")}
          </p>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          {token && invitation.data && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{invitation.data.projects.map((project) => project.name).join(", ")}</p>
              <p className="mt-1 text-muted-foreground">{invitation.data.phone}</p>
            </div>
          )}
          {unbound && context && (
            <FieldUnboundHelp
              reason={unbound}
              standalone={context.standalone}
              code={unboundCode({
                standalone: context.standalone,
                environment: context.environment,
                refusedCode,
                deviceRefused,
                joinLink: Boolean(joinLink),
              })}
            />
          )}
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
          {/* The link keeps working: tapping it again, or opening it in
              another browser on this phone, signs in with the same PIN
              (Lucas 2026-10-23). */}
          {token ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              {t("reuseLinkTip")}
            </p>
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

/**
 * The app link to sign in with before asking for a PIN, or null.
 *
 * With a link in the address, that link and nothing else: in the home-screen
 * app it signs in by itself; in a browser tab it needs the PIN, so nothing is
 * tried. Spending an older link this browser kept instead - one the office
 * may since have replaced - put that link's refusal above the PIN box.
 */
function resumeLink(joinLink: string | null): string | null {
  if (joinLink) return isStandaloneApp() ? joinLink : null;
  return getFieldBootstrapToken();
}
