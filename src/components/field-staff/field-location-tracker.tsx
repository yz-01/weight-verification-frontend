"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, LocateFixed, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { LocationDenialSteps } from "@/components/field-staff/location-denial-help";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/interfaces/api";
import { recordAutomaticFieldStaffPosition } from "@/services/field-staff-gps.service";
import { getSiteLocationPolicy } from "@/services/site-access.service";

type TrackerState = "starting" | "active" | "blocked" | "unavailable";

export function FieldLocationTracker() {
  const t = useTranslations("fieldStaffPwa.locationTracker");
  const queryClient = useQueryClient();
  const [state, setState] = useState<TrackerState>("starting");
  /**
   * Whether the block is a refusal rather than a phone that cannot see
   * the sky. Both used to show the same dialog, and only one of them has
   * a switch the reader can move (2026-09-05).
   */
  const [refused, setRefused] = useState(false);
  const [error, setError] = useState("");
  const watchId = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const latestPosition = useRef<GeolocationPosition | null>(null);
  const uploadInFlight = useRef(false);
  const uploadRef = useRef<
    ((position: GeolocationPosition, force?: boolean, heartbeat?: boolean) => void) | null
  >(null);
  const lastSentAt = useRef(0);
  const eventSequence = useRef(0);
  const intervalMs = useRef(60_000);
  const mounted = useRef(true);

  const clearWatcher = useCallback(() => {
    if (watchId.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (heartbeatTimer.current !== null) {
      window.clearTimeout(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  const explainError = useCallback((locationError: GeolocationPositionError) => {
    watchId.current = null;
    const key = locationError.code === locationError.PERMISSION_DENIED
      ? "permissionDenied"
      : locationError.code === locationError.POSITION_UNAVAILABLE
        ? "unavailable"
        : "timeout";
    setError(t(`error.${key}`));
    const denied = locationError.code === locationError.PERMISSION_DENIED;
    setRefused(denied);
    setState(denied ? "blocked" : "unavailable");
  }, [t]);

  const upload = useCallback(async (
    position: GeolocationPosition,
    force = false,
    heartbeat = false,
  ) => {
    const now = Date.now();
    if (
      uploadInFlight.current ||
      (!force && now - lastSentAt.current < intervalMs.current)
    ) {
      return;
    }
    uploadInFlight.current = true;
    const occurredAt = heartbeat ? now : position.timestamp;
    try {
      const result = await recordAutomaticFieldStaffPosition({
        latitude: position.coords.latitude.toFixed(7),
        longitude: position.coords.longitude.toFixed(7),
        accuracy_m: position.coords.accuracy.toFixed(2),
        original_occurred_at: new Date(occurredAt).toISOString(),
        client_event_id: `auto-${occurredAt}-${eventSequence.current++}`,
      });
      if (mounted.current) {
        if (!result.position) {
          setError(t("error.noProject"));
          setState("unavailable");
          return;
        }
        lastSentAt.current = now;
        setError("");
        setState("active");
        void queryClient.invalidateQueries({ queryKey: ["field-staff-gps"] });
        if (heartbeatTimer.current !== null) {
          window.clearTimeout(heartbeatTimer.current);
        }
        heartbeatTimer.current = window.setTimeout(() => {
          const latest = latestPosition.current;
          if (latest && document.visibilityState === "visible") {
            uploadRef.current?.(latest, true, true);
          }
        }, intervalMs.current);
      }
    } catch (uploadError) {
      if (!mounted.current) return;
      setError(uploadError instanceof ApiError ? uploadError.message : t("error.upload"));
      setState("active");
      heartbeatTimer.current = window.setTimeout(() => {
        const latest = latestPosition.current;
        if (latest && document.visibilityState === "visible") {
          uploadRef.current?.(latest, true, true);
        }
      }, Math.min(intervalMs.current, 15_000));
    } finally {
      uploadInFlight.current = false;
    }
  }, [queryClient, t]);

  useEffect(() => {
    uploadRef.current = upload;
    return () => {
      uploadRef.current = null;
    };
  }, [upload]);

  const start = useCallback((background = false) => {
    clearWatcher();
    setError("");
    if (!background) setState("starting");
    if (!("geolocation" in navigator)) {
      setError(t("error.unsupported"));
      // Not a refusal: there is no permission to grant, so the settings
      // steps would send the reader somewhere that does not exist.
      setRefused(false);
      setState("blocked");
      return;
    }

    void getSiteLocationPolicy()
      .then((policy) => {
        const configuredInterval = policy.location_update_interval_seconds * 1000;
        const liveHeartbeat = Math.max(
          30_000,
          Math.floor((policy.live_position_window_seconds * 1000) / 2),
        );
        intervalMs.current = Math.min(configuredInterval, liveHeartbeat);
      })
      .catch(() => {
        intervalMs.current = 60_000;
      });

    let firstFix = true;
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        latestPosition.current = position;
        void upload(position, firstFix);
        firstFix = false;
      },
      explainError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      },
    );
  }, [clearWatcher, explainError, t, upload]);

  useEffect(() => {
    mounted.current = true;
    const startTimer = window.setTimeout(() => start(), 0);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearWatcher();
      } else {
        start(true);
      }
    };
    const handleOnline = () => start(true);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      mounted.current = false;
      window.clearTimeout(startTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      clearWatcher();
    };
  }, [clearWatcher, start]);

  if (state === "active") return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-[calc(100%-2rem)] sm:max-w-md [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="items-center text-center">
          <span className={`grid size-14 place-items-center rounded-full ${state === "starting" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            {state === "starting" ? <LocateFixed className="size-7" /> : <AlertTriangle className="size-7" />}
          </span>
          <DialogTitle>{state === "starting" ? t("startingTitle") : t("requiredTitle")}</DialogTitle>
          <DialogDescription className="text-center leading-6">
            {state === "starting" ? t("startingBody") : error || t("requiredBody")}
          </DialogDescription>
        </DialogHeader>
        {refused && (
          <LocationDenialSteps
            action={
              <Button className="mt-3 w-full" onClick={() => start()}>
                <RefreshCw className="size-4" />
                {t("retry")}
              </Button>
            }
          />
        )}
        {state !== "starting" && !refused && (
          <Button className="w-full" onClick={() => start()}>
            <RefreshCw className="size-4" />
            {t("retry")}
          </Button>
        )}
        {state === "starting" && <Loader2 className="mx-auto size-6 animate-spin text-primary" />}
        <p className="text-center text-xs leading-5 text-muted-foreground">{t("foregroundOnly")}</p>
      </DialogContent>
    </Dialog>
  );
}
