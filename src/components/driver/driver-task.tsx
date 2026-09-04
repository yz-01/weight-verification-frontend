"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  CircleAlert,
  ExternalLink,
  Loader2,
  MapPin,
  PackageOpen,
  Scale,
  Truck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DriverError,
  DriverLoading,
} from "@/components/driver/driver-shell";
import { StatusBadge } from "@/components/shared/page-primitives";
import {
  LocationMap,
  type LocationMapMarker,
  type LocationMapPath,
  type LocationMapZone,
} from "@/components/shared/location-map";
import { TASK_STATE_TONE } from "@/components/tasks/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_TRANSITIONS,
  type DriverTaskDetail,
  type TaskPositionEvent,
  type TaskState,
} from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { getDriverTaskOfflineAware } from "@/services/driver-offline.service";
import {
  submitTaskPhotoOfflineAware,
  submitTaskPositionOfflineAware,
  submitTaskTransitionOfflineAware,
} from "@/services/offline-sync.service";
import { useAuth } from "@/components/providers/auth-provider";
import { useOrderRealtime } from "@/hooks/use-order-realtime";
import { trackPaths } from "@/lib/track-paths";
import {
  useDriverDeviceStatus,
  type DevicePermissionStatus,
} from "@/components/driver/use-driver-device-status";
import { useScreenWakeLock } from "@/components/driver/use-screen-wake-lock";

/**
 * One trip, on a phone.
 *
 * The screen is arranged around the single question a driver has at any moment:
 * what do I press next. So the next step is one full-width button pinned under
 * the content, and everything above it is the context needed to be sure it is
 * the right button — where, what, which lorry.
 *
 * Only the steps the machine allows are offered. The list comes from the same
 * transition table the backend enforces, so a driver is never shown a button
 * that will be refused.
 */
export function DriverTask({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const realtimeKeys = useMemo(
    () => [["tasks", "detail", id], ["tasks", "mine"], ["driver", "dashboard"]],
    [id],
  );
  useOrderRealtime(realtimeKeys);

  const { gpsStatus } = useDriverDeviceStatus();

  const [moving, setMoving] = useState<TaskState | null>(null);
  const [reason, setReason] = useState("");
  const [locating, setLocating] = useState(false);
  const [gpsUnavailable, setGpsUnavailable] = useState(false);
  const [hasQueuedPhoto, setHasQueuedPhoto] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastPositionAt = useRef(0);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tasks", "detail", id],
    queryFn: () => getDriverTaskOfflineAware(user!.id, id),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  const advance = useMutation({
    mutationFn: async (state: TaskState) => {
      // Location is asked for only on arrival, and only then. A page that
      // prompted for it on load would be denied once and never ask again,
      // exactly when it is finally wanted.
      let position: {
        latitude?: string;
        longitude?: string;
        accuracyM?: string;
      } = {};
      if (state === "ARRIVED") {
        setLocating(true);
        position = await currentPosition();
        setLocating(false);
        if (user && position.latitude && position.longitude) {
          await submitTaskPositionOfflineAware(user.id, {
            taskId: id,
            eventType: "ARRIVAL",
            latitude: position.latitude,
            longitude: position.longitude,
            accuracyM: position.accuracyM,
          });
        }
      }
      if (!user) throw new Error("A signed-in user is required.");
      return submitTaskTransitionOfflineAware(user.id, {
        taskId: id,
        state,
        reason: reason.trim(),
        latitude: position.latitude,
        longitude: position.longitude,
      });
    },
    onSuccess: (result, state) => {
      if (result === "queued") {
        queryClient.setQueryData(
          ["tasks", "detail", id],
          (current: typeof data) =>
            current
              ? {
                  ...current,
                  state,
                  is_running: !["COMPLETED", "CANCELLED", "FAILED"].includes(state),
                }
              : current,
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      }
      setMoving(null);
      setReason("");
    },
    onError: () => setLocating(false),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("A signed-in user is required.");
      const position = await currentPosition();
      const missingGps = !position.latitude || !position.longitude;
      setGpsUnavailable(missingGps);
      if (missingGps) throw new Error("driver_photo_gps_required");
      return submitTaskPhotoOfflineAware(user.id, id, file, "LOADING", {
        latitude: position.latitude,
        longitude: position.longitude,
      });
    },
    onSuccess: (result) => {
      if (result === "queued") {
        setHasQueuedPhoto(true);
      } else {
        void queryClient.invalidateQueries({
          queryKey: ["tasks", "detail", id],
        });
      }
    },
  });

  function recordNavigation(eventType: TaskPositionEvent): void {
    if (!user) return;
    void currentPosition()
      .then((position) => {
        if (!position.latitude || !position.longitude) return;
        return submitTaskPositionOfflineAware(user.id, {
          taskId: id,
          eventType,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyM: position.accuracyM,
        });
      })
      .catch(() => setGpsUnavailable(true));
  }

  useEffect(() => {
    if (!user || !data?.is_running || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsUnavailable(false);
        const now = Date.now();
        if (now - lastPositionAt.current < 30_000) return;
        lastPositionAt.current = now;
        void submitTaskPositionOfflineAware(user.id, {
          taskId: id,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracyM: position.coords.accuracy.toFixed(2),
          originalOccurredAt: new Date(position.timestamp).toISOString(),
        }).catch(() => undefined);
      },
      () => setGpsUnavailable(true),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [data?.is_running, id, user]);

  // Declared before the early returns: a hook that only runs on some renders
  // is the one React rule this file cannot bend.
  const wakeLock = useScreenWakeLock(Boolean(data?.is_running));

  if (isLoading) return <DriverLoading />;
  if (isError || !data) return <DriverError onRetry={() => void refetch()} />;

  const next = TASK_TRANSITIONS[data.state];
  // A gate somebody typed beats the project pin: the pin is the site, and the
  // whole point of typing an address was that the site has more than one way
  // in. An address merely inherited from the project record is not more precise
  // than the project's own coordinates, so that case keeps the pin.
  const projectDestination = data.pickup_address_is_manual
    ? mapDestination(null, null, [data.pickup_address])
    : mapDestination(
        data.project_latitude,
        data.project_longitude,
        [
          data.project_address_line_1,
          data.project_address_line_2,
          data.project_city,
          data.project_state,
          data.project_postcode,
        ],
      );
  const yardDestination = mapDestination(
    data.site_latitude,
    data.site_longitude,
    [
      data.site_address_line_1,
      data.site_address_line_2,
      data.site_city,
      data.site_state,
      data.site_postcode,
    ],
  );
  const hasPendingPhoto =
    hasQueuedPhoto || (data.local_pending_photo_count ?? 0) > 0;
  // The step that carries the trip forward, as opposed to abandoning it.
  const forward = next.find((state) => state !== "FAILED" && state !== "CANCELLED");
  const canFail = next.includes("FAILED");

  return (
    <div className="space-y-4 pb-4">
      <Link
        href="/driver/jobs"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("driver.back")}
      </Link>

      {/*
        Whether the phone is recording, in one line, always visible while a
        trip is running.

        The platform records position only while this page is open and the
        screen is on (D-020). Saying so is not an apology — it is the
        difference between a driver who keeps the phone awake and a customer
        who concludes the GPS is broken (R-019).
      */}
      {data.is_running && (
        <TrackingBanner gpsStatus={gpsStatus} wakeLock={wakeLock} />
      )}

      <div className="space-y-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={t(`tasks.state.${data.state}`)}
            tone={TASK_STATE_TONE[data.state]}
          />
          {data.dispatch_no !== null && (
            <span className="tabular text-xs text-muted-foreground">
              {data.task_no}
            </span>
          )}
        </div>

        {/* The dispatch number is what the driver quotes at the gate, so it
            is the heading when there is one. A trip raised without a load —
            a yard collecting something that turned up unannounced — falls
            back to its own number rather than shouting about the absence. */}
        <p className="text-xl font-semibold text-foreground">
          {data.dispatch_no ?? data.task_no}
        </p>
        {data.dispatch_no === null && (
          <p className="text-sm text-muted-foreground">
            {t("tasks.noDispatch")}
          </p>
        )}

        <dl className="space-y-2.5 text-sm">
          {data.waste_type && (
            <Row
              icon={PackageOpen}
              label={t("tasks.field.dispatch")}
              value={t(`dispatches.wasteType.${data.waste_type}`)}
            />
          )}
          {/* Only when there is a load. Without one there is no producer and
              no site to go to, and a row reading "Site —" is a line the
              driver has to read before discovering it says nothing. */}
          {data.dispatch_no !== null && (
            <Row
              icon={Building2}
              label={t("tasks.field.project")}
              value={
                [data.contractor_name, data.project_name]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }
            />
          )}
          <Row
            icon={MapPin}
            label={t("tasks.field.site")}
            value={data.site_name}
          />
          <Row
            icon={Truck}
            label={t("tasks.field.vehicle")}
            value={data.vehicle_plate}
          />
        </dl>

        {data.scheduled_for && (
          <p className="tabular text-xs text-muted-foreground">
            {t("tasks.field.scheduledFor")}: {df.dateTime(data.scheduled_for)}
          </p>
        )}
      </div>

      <DriverTripMap data={data} />

      {data.pickup_address && (
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">
            {t("driver.pickupAddress")}
          </p>
          <p className="mt-0.5 text-sm font-medium">{data.pickup_address}</p>
        </div>
      )}

      {projectDestination &&
        data.state !== "RETURNING" &&
        data.state !== "DELIVERED" &&
        data.state !== "COMPLETED" && (
        <Button asChild variant="outline" size="lg" className="h-12 w-full">
          <a
            href={googleMapsDirections(projectDestination)}
            target="_blank"
            rel="noreferrer"
            onClick={() => recordNavigation("NAVIGATION_START")}
          >
            <MapPin className="h-4 w-4" />
            {t("driver.navigate")}
            <ExternalLink className="ml-auto h-4 w-4" />
          </a>
        </Button>
      )}

      {yardDestination && data.state === "RETURNING" && (
          <Button asChild variant="outline" size="lg" className="h-12 w-full">
            <a
              href={googleMapsDirections(yardDestination)}
              target="_blank"
              rel="noreferrer"
              onClick={() => recordNavigation("NAVIGATION_RETURN")}
            >
              <Truck className="h-4 w-4" />
              {t("driver.returnYard")}
              <ExternalLink className="ml-auto h-4 w-4" />
            </a>
          </Button>
        )}

      {data.weighing && (
        <div className="space-y-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("ticket.section.weighing")}
            </h2>
          </div>
          <dl className="space-y-2.5 text-sm">
            <Row
              icon={Scale}
              label={t("ticket.field.grossWeight")}
              value={data.weighing.gross_weight_kg ? `${data.weighing.gross_weight_kg} kg` : "—"}
            />
            <Row
              icon={Scale}
              label={t("ticket.field.tareWeight")}
              value={data.weighing.tare_weight_kg ? `${data.weighing.tare_weight_kg} kg` : "—"}
            />
            <Row
              icon={Scale}
              label={t("ticket.field.netWeight")}
              value={data.weighing.net_weight_kg ? `${data.weighing.net_weight_kg} kg` : "—"}
            />
          </dl>
        </div>
      )}

      {data.settlement && (
        <div className="space-y-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("driver.settlement.title")}
            </h2>
          </div>
          <dl className="space-y-2.5 text-sm">
            <Row icon={Scale} label={t("driver.settlement.deduction")} value={`${data.settlement.deduction_weight_kg ?? "0"} kg`} />
            <Row icon={Scale} label={t("driver.settlement.payableWeight")} value={`${data.settlement.settled_weight_kg ?? "0"} kg`} />
            <Row icon={Scale} label={t("driver.settlement.amount")} value={data.settlement.total_amount ? `${data.settlement.currency} ${data.settlement.total_amount}` : "—"} />
            <Row icon={Scale} label={t("driver.settlement.paid")} value={`${data.settlement.currency ?? "MYR"} ${data.settlement.amount_paid}`} />
            <Row icon={Scale} label={t("driver.settlement.outstanding")} value={data.settlement.outstanding === null ? "—" : `${data.settlement.currency ?? "MYR"} ${data.settlement.outstanding}`} />
          </dl>
          {data.settlement.deductions.length > 0 && (
            <div className="divide-y border-y">
              {data.settlement.deductions.map((deduction) => (
                <div key={deduction.id} className="py-2 text-xs">
                  <p className="font-medium text-foreground">{deduction.kind} · {deduction.weight_kg} kg</p>
                  <p className="mt-0.5 text-muted-foreground">{deduction.reason} · {deduction.state}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data.state === "DELIVERED" && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-4">
          <p className="text-sm font-semibold text-foreground">
            {t("driver.awaitingWeighing")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("driver.awaitingWeighingBody")}
          </p>
        </div>
      )}

      {gpsUnavailable && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          {upload.isError
            ? t("driver.photoGpsRequired")
            : t("driver.gpsUnavailable")}
        </p>
      )}

      <div className="space-y-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("tasks.section.photos")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {data.photos.length}
          </span>
        </div>

        {data.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {data.photos.map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-square overflow-hidden rounded-md border bg-muted/40"
              >
                <Image
                  src={photo.watermarked || photo.image}
                  alt={photo.caption || photo.kind}
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        )}

        {/* `capture` opens the camera straight away rather than the gallery.
            The point is a photograph taken now, at the load, not one chosen
            from the roll afterwards. */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="lg"
          className="h-12 w-full rounded-full"
          disabled={upload.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {upload.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {t("driver.takePhoto")}
        </Button>
      </div>

      {data.failure_reason && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {data.failure_reason}
        </p>
      )}

      {/* The next step, as one button the size of a thumb. */}
      {forward === "LOADED" && data.photos.length === 0 && !hasPendingPhoto && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          {t("driver.photoRequired")}
        </p>
      )}
      {forward && (
        <Button
          size="lg"
          className="h-14 w-full rounded-full text-base shadow-sm"
          disabledReason={forward === "LOADED" && data.photos.length === 0 && !hasPendingPhoto ? t("driver.photoRequired") : undefined}
          disabled={advance.isPending || locating || (forward === "LOADED" && data.photos.length === 0 && !hasPendingPhoto)}
          onClick={() => setMoving(forward)}
        >
          {advance.isPending || locating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowRight className="h-5 w-5" />
          )}
          {t(`driver.action.${forward}`)}
        </Button>
      )}

      {canFail && (
        <Button
          variant="ghost"
          size="lg"
          className="h-12 w-full text-destructive"
          onClick={() => setMoving("FAILED")}
        >
          <CircleAlert className="h-4 w-4" />
          {t("driver.cannotComplete")}
        </Button>
      )}

      {moving && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setMoving(null);
              setReason("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[440px] [&>button]:hidden">
            <DialogHeader>
              <DialogTitle>{t(`driver.action.${moving}`)}</DialogTitle>
              <DialogDescription>
                {moving === "ARRIVED"
                  ? t("driver.arrivedNote")
                  : moving === "LOADED"
                    ? t("tasks.loadedNote")
                    : moving === "FAILED"
                      ? t("tasks.failNote")
                      : t("tasks.advanceDescription")}
              </DialogDescription>
            </DialogHeader>

            {moving === "FAILED" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {t("common.reason")}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                size="lg"
                className="h-12 rounded-full px-6"
                onClick={() => {
                  setMoving(null);
                  setReason("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="lg"
                variant={moving === "FAILED" ? "destructive" : "default"}
                className="h-12 rounded-full px-6 shadow-sm"
                requires={[[moving !== "FAILED" || reason, t("common.reason")]]}
                disabled={advance.isPending || locating}
                onClick={() => advance.mutate(moving)}
              >
                {advance.isPending || locating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {t("common.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/**
 * One line saying whether the phone is actually recording.
 *
 * Three states worth telling apart, because the fix for each is different:
 * permission was refused (the driver must change a browser setting), the
 * browser will not hold the screen awake (the driver must stop it locking),
 * or everything is running (nothing to do, and worth saying so — silence
 * reads as "no idea").
 */
function TrackingBanner({
  gpsStatus,
  wakeLock,
}: {
  gpsStatus: DevicePermissionStatus;
  wakeLock: { supported: boolean; held: boolean };
}) {
  const t = useTranslations();
  const denied = gpsStatus === "denied" || gpsStatus === "unsupported";
  const tone = denied
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : wakeLock.held
      ? "border-success/40 bg-success/10 text-success"
      : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  const message = denied
    ? t("driver.track.denied")
    : wakeLock.held
      ? t("driver.track.recording")
      : wakeLock.supported
        ? t("driver.track.mayPause")
        : t("driver.track.noWakeLock");

  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${tone}`}
    >
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

function DriverTripMap({ data }: { data: DriverTaskDetail }) {
  const t = useTranslations();
  const df = useDateFormat();
  const latest = data.latest_position;
  if (!latest) return null;

  const latitude = Number(latest.latitude);
  const longitude = Number(latest.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const projectLatitude = Number(data.project_latitude);
  const projectLongitude = Number(data.project_longitude);
  const hasProject =
    Number.isFinite(projectLatitude) && Number.isFinite(projectLongitude);
  const markers: LocationMapMarker[] = [
    {
      id: `driver-${data.id}`,
      latitude,
      longitude,
      label: data.driver_name,
      detail: data.vehicle_plate,
      tone: latest.geofence_result === "OUTSIDE" ? "warning" : "positive",
      icon: "truck",
    },
    ...(hasProject
      ? [
          {
            id: `project-${data.id}`,
            latitude: projectLatitude,
            longitude: projectLongitude,
            label: data.project_name ?? data.contractor_name ?? data.dispatch_no ?? data.task_no,
            icon: "project" as const,
          },
        ]
      : []),
  ];
  // Broken into recorded runs and holes: geolocation stops when the screen
  // locks, and a solid line through that would claim a road nobody recorded.
  const paths: LocationMapPath[] = trackPaths({
    id: `route-${data.id}`,
    points: data.route.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      occurredAt: point.original_occurred_at,
    })),
    label: data.task_no,
    gapLabel: (minutes) => t("driver.track.gap", { minutes }),
  });
  const zones: LocationMapZone[] =
    hasProject && data.project_geofence_radius_m
      ? [
          {
            id: `geofence-${data.id}`,
            center: [projectLatitude, projectLongitude],
            radiusM: data.project_geofence_radius_m,
            label: data.project_name ?? data.task_no,
            color: "#087f8c",
          },
        ]
      : [];

  return (
    <section className="space-y-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("driver.dashboard.gps")}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {df.dateTime(latest.original_occurred_at)}
        </span>
      </div>
      <LocationMap
        markers={markers}
        paths={paths}
        zones={zones}
        preserveViewOnDataUpdate
        fitBoundsKey={data.id}
        ariaLabel={t("driver.dashboard.gps")}
        className="h-64 min-h-64 rounded-md"
      />
      <p className="text-xs text-muted-foreground">{t("tasks.locationNote")}</p>
    </section>
  );
}

function mapDestination(
  latitude: string | null,
  longitude: string | null,
  addressParts: string[],
): string | null {
  if (latitude && longitude) return `${latitude},${longitude}`;
  const address = addressParts.map((part) => part.trim()).filter(Boolean).join(", ");
  return address || null;
}

function googleMapsDirections(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-foreground">{value}</dd>
      </div>
    </div>
  );
}

/**
 * The device's position, or nothing.
 *
 * Never rejects. A driver in a basement, or one who declined the prompt
 * months ago, must still be able to mark themselves arrived — the alternative
 * is a trip that cannot be completed, which is worse than a trip with no
 * coordinates. What is recorded is what the device reported, and the record
 * says so.
 */
function currentPosition(): Promise<{
  latitude?: string;
  longitude?: string;
  accuracyM?: string;
}> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({});
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracyM: position.coords.accuracy.toFixed(2),
        }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
