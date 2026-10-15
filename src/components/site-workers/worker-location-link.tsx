"use client";

/**
 * The page a worker opens from the office's WhatsApp (I20, ID52).
 *
 * No account, no PIN, few words. In order:
 *
 * 1. the first time, the worker types their phone number - only the number
 *    the office registered binds this link to this phone;
 * 2. what is collected, in plain words, and 「同意并开始定位」;
 * 3. then the page reports where the phone is while it stays open, at the
 *    company's interval, and says 「定位中 · 上次上传 hh:mm」 and 「请保持此
 *    页面打开」.
 *
 * There is nothing on this page that changes or deletes a location record,
 * and no such endpoint exists. The browser stops reporting when the page is
 * closed or the screen locks; the office then reads 「定位未更新」, never 离场.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2Off, Loader2, LocateFixed, MapPin, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useScreenWakeLock } from "@/components/driver/use-screen-wake-lock";
import { LocationDenialSteps } from "@/components/field-staff/location-denial-help";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import type { WorkerLinkState } from "@/interfaces/site-workers";
import { inAppBrowserName } from "@/lib/in-app-browser";
import { clockTime, reportIntervalMs, workerLinkOutcome, workerLinkToken } from "@/lib/site-workers";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import {
  bindWorkerPhone,
  getWorkerLink,
  recordWorkerPosition,
  startWorkerLocation,
} from "@/services/worker-location-link.service";

type Ending = "invalid" | "closed" | "otherDevice";

export function WorkerLocationLink({ token: rawToken }: { token: string }) {
  const t = useTranslations("workerLocation");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const token = workerLinkToken(rawToken);
  const chatApp = typeof window === "undefined" ? null : inAppBrowserName();
  // A chat app's own browser keeps its own storage: the link would stay with
  // that view, and the same phone in Chrome or Safari would count as another.
  const [confirmed, setConfirmed] = useState(!chatApp);
  const [copied, setCopied] = useState(false);
  const device = useMemo(() => (typeof window === "undefined" ? "" : getOrCreateFieldDeviceId()), []);
  const key = useMemo(() => ["worker-location-link", token] as const, [token]);

  const link = useQuery({
    queryKey: key,
    queryFn: () => getWorkerLink(token, device),
    enabled: Boolean(token && device && confirmed),
    retry: (count, error) =>
      count < 2 && workerLinkOutcome(error instanceof ApiError ? error.code : "") === "failed",
  });
  const settle = (state: WorkerLinkState) => queryClient.setQueryData(key, state);

  if (!token) return <Ended outcome="invalid" />;

  if (!confirmed) {
    return (
      <Centered>
        <Smartphone className="size-12 text-warning" />
        <h1 className="text-center text-xl font-bold leading-tight">{t("chatTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("chatBody", { app: chatApp ?? "" })}</p>
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
            {copied ? common("copied") : t("copyLink")}
          </Button>
          <Button size="lg" onClick={() => setConfirmed(true)}>
            {t("continueHere")}
          </Button>
        </div>
      </Centered>
    );
  }

  const outcome = link.error ? workerLinkOutcome(link.error instanceof ApiError ? link.error.code : "") : null;
  if (outcome === "invalid" || outcome === "closed" || outcome === "otherDevice") {
    return <Ended outcome={outcome} />;
  }
  if (!link.data) {
    return (
      <Centered>
        {link.error ? (
          <>
            <RefreshCw className="size-10 text-muted-foreground" />
            <h1 className="text-center text-xl font-bold leading-tight">{t("failedTitle")}</h1>
            <p className="max-w-sm text-center text-sm text-muted-foreground">{t("failedBody")}</p>
            <Button size="lg" onClick={() => void link.refetch()}>
              <RefreshCw />
              {common("retry")}
            </Button>
          </>
        ) : (
          <Loader2 className="size-8 animate-spin text-primary" />
        )}
      </Centered>
    );
  }

  const state = link.data;
  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-background">
      <header className="sticky top-0 z-20 border-b border-sidebar-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-lg items-center gap-2 px-4 py-2">
          <MapPin className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{state.company_name}</p>
            <p className="truncate text-base font-semibold text-foreground">{state.project_name}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-6">
        {!state.bound ? (
          <PhoneStep token={token} device={device} onBound={settle} />
        ) : !state.consented ? (
          <ConsentStep token={token} device={device} name={state.worker_name} onAgreed={settle} />
        ) : (
          <Locating token={token} device={device} state={state} />
        )}
      </main>
    </div>
  );
}

function PhoneStep({
  token,
  device,
  onBound,
}: {
  token: string;
  device: string;
  onBound: (state: WorkerLinkState) => void;
}) {
  const t = useTranslations("workerLocation");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const bind = useMutation({
    mutationFn: () => bindWorkerPhone(token, device, phone),
    onSuccess: onBound,
    onError: (failure) => {
      const outcome = workerLinkOutcome(failure instanceof ApiError ? failure.code : "");
      setError(t(`error.${outcome}`));
    },
  });
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold leading-tight">{t("phoneTitle")}</h1>
      {/* One field on the screen: no red star, the hint says it in words. */}
      <FieldWrapper label={t("phoneLabel")} required="quiet" hint={t("phoneBody")} error={error}>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t("phonePlaceholder")}
          className="h-12 text-lg"
          value={phone}
          onChange={(event) => {
            setError("");
            setPhone(event.target.value);
          }}
        />
      </FieldWrapper>
      <Button
        size="lg"
        className="w-full"
        onClick={() => bind.mutate()}
        disabled={bind.isPending}
        requires={[[phone.trim(), t("phoneLabel")]]}
      >
        {bind.isPending && <Loader2 className="animate-spin" />}
        {t("phoneConfirm")}
      </Button>
    </section>
  );
}

function ConsentStep({
  token,
  device,
  name,
  onAgreed,
}: {
  token: string;
  device: string;
  name: string;
  onAgreed: (state: WorkerLinkState) => void;
}) {
  const t = useTranslations("workerLocation");
  const [error, setError] = useState("");
  const agree = useMutation({
    mutationFn: () => startWorkerLocation(token, device),
    onSuccess: onAgreed,
    onError: (failure) => {
      const outcome = workerLinkOutcome(failure instanceof ApiError ? failure.code : "");
      setError(t(`error.${outcome}`));
    },
  });
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold leading-tight">{t("hello", { name })}</h1>
      <div className="space-y-2 rounded-xl border bg-muted/20 p-4 text-sm leading-6">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-primary" />
          {t("consentTitle")}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t("consent.what")}</li>
          <li>{t("consent.when")}</li>
          <li>{t("consent.who")}</li>
          <li>{t("consent.noEdit")}</li>
        </ul>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <Button size="lg" className="w-full" onClick={() => agree.mutate()} disabled={agree.isPending}>
        {agree.isPending ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        {t("agree")}
      </Button>
    </section>
  );
}

type TrackState = "starting" | "active" | "blocked" | "unavailable";

/** Reports while the page is open; stops when it is hidden, resumes when back. */
function Locating({ token, device, state }: { token: string; device: string; state: WorkerLinkState }) {
  const t = useTranslations("workerLocation");
  const [track, setTrack] = useState<TrackState>("starting");
  const [refused, setRefused] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(state.last_position_at);
  const [ended, setEnded] = useState<Ending | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const inFlight = useRef(false);
  const latest = useRef<GeolocationPosition | null>(null);
  const timer = useRef<number | null>(null);
  const interval = reportIntervalMs(state.interval_seconds);
  useScreenWakeLock(track === "active");

  const send = useCallback(
    async (position: GeolocationPosition, force = false) => {
      const now = Date.now();
      if (inFlight.current || (!force && now - lastSent.current < interval)) return;
      inFlight.current = true;
      try {
        const result = await recordWorkerPosition(token, device, {
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracy_m: Math.min(position.coords.accuracy, 999999).toFixed(2),
          recorded_at: new Date(position.timestamp).toISOString(),
        });
        lastSent.current = now;
        setSentAt(result.received_at);
        setUploadFailed(false);
      } catch (failure) {
        const outcome = workerLinkOutcome(failure instanceof ApiError ? failure.code : "");
        if (outcome === "invalid" || outcome === "closed" || outcome === "otherDevice") setEnded(outcome);
        else setUploadFailed(true);
      } finally {
        inFlight.current = false;
      }
    },
    [device, interval, token],
  );

  const stop = useCallback(() => {
    if (watchId.current !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    if (!("geolocation" in navigator)) {
      setRefused(false);
      setTrack("blocked");
      return;
    }
    let first = true;
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        latest.current = position;
        setTrack("active");
        void send(position, first);
        first = false;
      },
      (failure) => {
        const denied = failure.code === failure.PERMISSION_DENIED;
        setRefused(denied);
        setTrack(denied ? "blocked" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    // A phone standing still sends no new fix; the last one is reported again
    // at the interval so the office does not read 「定位未更新」 for a worker
    // who simply has not moved.
    timer.current = window.setInterval(() => {
      if (latest.current && document.visibilityState === "visible") void send(latest.current, true);
    }, interval);
  }, [interval, send, stop]);

  useEffect(() => {
    const startTimer = window.setTimeout(start, 0);
    const onVisibility = () => (document.visibilityState === "hidden" ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(startTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [start, stop]);

  if (ended) return <Ended outcome={ended} inline />;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold leading-tight">{t("hello", { name: state.worker_name })}</h1>
      {track === "active" ? (
        <div className="space-y-2 rounded-xl border border-tone-green/35 bg-tone-green/12 p-4">
          <p className="flex items-center gap-2 text-base font-semibold text-tone-green-fg">
            <LocateFixed className="size-5" />
            {sentAt ? t("locatingAt", { time: clockTime(sentAt) }) : t("locating")}
          </p>
          <p className="text-sm text-tone-green-fg">{t("keepOpen")}</p>
        </div>
      ) : track === "starting" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("starting")}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            {track === "blocked" && refused ? t("error.denied") : t("error.unavailable")}
          </p>
          {refused ? (
            <LocationDenialSteps
              action={
                <Button className="mt-3 w-full" onClick={start}>
                  <RefreshCw className="size-4" />
                  {t("retry")}
                </Button>
              }
            />
          ) : (
            <Button className="w-full" onClick={start}>
              <RefreshCw className="size-4" />
              {t("retry")}
            </Button>
          )}
        </div>
      )}
      {uploadFailed && <p className="text-sm text-warning">{t("error.upload")}</p>}
      <p className="text-xs leading-5 text-muted-foreground">{t("foregroundOnly")}</p>
    </section>
  );
}

function Ended({ outcome, inline = false }: { outcome: Ending; inline?: boolean }) {
  const t = useTranslations("workerLocation");
  const Icon = outcome === "otherDevice" ? Smartphone : Link2Off;
  const body = (
    <>
      <Icon className="size-12 text-muted-foreground" />
      <h1 className="text-center text-xl font-bold leading-tight">{t(`${outcome}Title`)}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">{t(`${outcome}Body`)}</p>
    </>
  );
  if (inline) return <div className="flex flex-col items-center gap-4 py-10">{body}</div>;
  return <Centered>{body}</Centered>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10">{children}</main>;
}
