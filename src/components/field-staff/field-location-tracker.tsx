"use client";

import { AlertTriangle, Loader2, LocateFixed, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/interfaces/api";
import { recordAutomaticFieldStaffPosition } from "@/services/field-staff-gps.service";
import { getSiteLocationPolicy } from "@/services/site-access.service";

type TrackerState = "starting" | "active" | "blocked" | "unavailable";

export function FieldLocationTracker() {
  const t = useTranslations("fieldStaffPwa.locationTracker");
  const [state, setState] = useState<TrackerState>("starting");
  const [error, setError] = useState("");
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const intervalMs = useRef(60_000);
  const mounted = useRef(true);

  const clearWatcher = useCallback(() => {
    if (watchId.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const explainError = useCallback((locationError: GeolocationPositionError) => {
    const key = locationError.code === locationError.PERMISSION_DENIED
      ? "permissionDenied"
      : locationError.code === locationError.POSITION_UNAVAILABLE
        ? "unavailable"
        : "timeout";
    setError(t(`error.${key}`));
    setState(locationError.code === locationError.PERMISSION_DENIED ? "blocked" : "unavailable");
  }, [t]);

  const upload = useCallback(async (position: GeolocationPosition, force = false) => {
    const now = Date.now();
    if (!force && now - lastSentAt.current < intervalMs.current) return;
    lastSentAt.current = now;
    try {
      await recordAutomaticFieldStaffPosition({
        latitude: position.coords.latitude.toFixed(7),
        longitude: position.coords.longitude.toFixed(7),
        accuracy_m: position.coords.accuracy.toFixed(2),
        original_occurred_at: new Date(position.timestamp).toISOString(),
        client_event_id: `auto-${position.timestamp}`,
      });
      if (mounted.current) {
        setError("");
        setState("active");
      }
    } catch (uploadError) {
      if (!mounted.current) return;
      setError(uploadError instanceof ApiError ? uploadError.message : t("error.upload"));
      setState("active");
    }
  }, [t]);

  const start = useCallback(async () => {
    clearWatcher();
    setError("");
    setState("starting");
    if (!("geolocation" in navigator)) {
      setError(t("error.unsupported"));
      setState("blocked");
      return;
    }

    try {
      const policy = await getSiteLocationPolicy();
      intervalMs.current = policy.location_update_interval_seconds * 1000;
    } catch {
      intervalMs.current = 60_000;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void upload(position, true);
        watchId.current = navigator.geolocation.watchPosition(
          (next) => void upload(next),
          explainError,
          {
            enableHighAccuracy: true,
            maximumAge: Math.min(intervalMs.current, 30_000),
            timeout: 20_000,
          },
        );
      },
      explainError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }, [clearWatcher, explainError, t, upload]);

  useEffect(() => {
    mounted.current = true;
    void start();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void start();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
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
        {state !== "starting" && (
          <Button className="w-full" onClick={() => void start()}>
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
