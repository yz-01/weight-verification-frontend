"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LocateFixed, MapPinned, RefreshCw, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { LocationMap } from "@/components/shared/location-map";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/interfaces/api";
import type { FieldStaffPosition } from "@/interfaces/site-operations";
import { getProjects } from "@/services/contractor.service";
import {
  getFieldStaffLivePositions,
  recordFieldStaffPosition,
} from "@/services/field-staff-gps.service";

export function FieldStaffGps() {
  const t = useTranslations();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [sharing, setSharing] = useState(false);
  const [sharingError, setSharingError] = useState("");
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  const projects = useQuery({
    queryKey: ["projects", "field-gps-options"],
    queryFn: () => getProjects({ page_size: 100 }),
  });
  const live = useQuery({
    queryKey: ["field-staff-gps", projectId],
    queryFn: () =>
      getFieldStaffLivePositions({
        page_size: 200,
        ...(projectId ? { project: projectId } : {}),
      }),
    refetchInterval: 15_000,
  });
  const record = useMutation({
    mutationFn: recordFieldStaffPosition,
    onSuccess: () => {
      setSharingError("");
      void queryClient.invalidateQueries({ queryKey: ["field-staff-gps"] });
    },
    onError: (error) => {
      stopSharing();
      setSharingError(
        error instanceof ApiError ? error.message : t("errors.generic"),
      );
    },
  });

  const selectedProject = useMemo(
    () => projects.data?.results.find((project) => project.id === projectId),
    [projectId, projects.data?.results],
  );
  const positions = useMemo(
    () => live.data?.results ?? [],
    [live.data?.results],
  );
  const center = useMemo<[number, number] | undefined>(() => {
    if (!selectedProject?.latitude || !selectedProject.longitude) return undefined;
    return [Number(selectedProject.latitude), Number(selectedProject.longitude)];
  }, [selectedProject]);
  const markers = useMemo(
    () =>
      positions.map((position) => ({
        id: position.id,
        latitude: Number(position.latitude),
        longitude: Number(position.longitude),
        label: position.user_name,
        detail: `${position.project_name} · ${t(
          `siteGps.event.${position.event_type}`,
        )}`,
        tone: position.geofence_result === "OUTSIDE" ? ("danger" as const) : position.is_stale ? ("warning" as const) : ("positive" as const),
        stale: position.is_stale,
        icon: "person" as const,
      })),
    [positions, t],
  );
  const zones = useMemo(() => {
    if (selectedProject) return [];
    const byProject = new Map<string, {
      id: string;
      center: [number, number];
      radiusM: number;
      label: string;
    }>();
    positions.forEach((position) => {
      if (
        position.project_latitude &&
        position.project_longitude &&
        position.project_geofence_radius_m
      ) {
        byProject.set(position.project, {
          id: position.project,
          center: [
            Number(position.project_latitude),
            Number(position.project_longitude),
          ],
          radiusM: position.project_geofence_radius_m,
          label: position.project_name,
        });
      }
    });
    return Array.from(byProject.values());
  }, [positions, selectedProject]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  function stopSharing() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setSharing(false);
  }

  function startSharing() {
    setSharingError("");
    if (!projectId || !user) return;
    if (!navigator.geolocation) {
      setSharingError(t("siteGps.error.unsupported"));
      return;
    }
    stopSharing();
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAt.current < 10_000) return;
        lastSentAt.current = now;
        record.mutate({
          project: projectId,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracy_m: position.coords.accuracy.toFixed(2),
          original_occurred_at: new Date(position.timestamp).toISOString(),
          client_event_id: `${user.id}-${position.timestamp}`,
        });
      },
      (error) => {
        stopSharing();
        const key =
          error.code === error.PERMISSION_DENIED
            ? "permissionDenied"
            : error.code === error.POSITION_UNAVAILABLE
              ? "unavailable"
              : "timeout";
        setSharingError(t(`siteGps.error.${key}`));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  }

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("siteGps.title")}
        subtitle={t("siteGps.count", { count: live.data?.count ?? 0 })}
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={live.isFetching}
            onClick={() => void live.refetch()}
          >
            <RefreshCw className={live.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("common.refresh")}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-y bg-card/50 py-3">
        <ProjectPicker
          value={projectId || "all"}
          onValueChange={(value) => {
            stopSharing();
            setProjectId(value === "all" ? "" : value);
          }}
          allowAll
          allLabel={t("siteGps.allProjects")}
          placeholder={t("siteGps.project")}
          className="w-full sm:w-[280px]"
        />
        {can("field_position.submit") && (
          <Button
            size="sm"
            variant={sharing ? "destructive" : "default"}
            disabled={!projectId || record.isPending}
            onClick={sharing ? stopSharing : startSharing}
          >
            {sharing ? <RefreshCw className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
            {sharing ? t("siteGps.stopSharing") : t("siteGps.startSharing")}
          </Button>
        )}
        {sharing && (
          <StatusBadge label={t("siteGps.sharing")} tone="positive" />
        )}
        {sharingError && (
          <p role="alert" className="w-full text-sm text-destructive">
            {sharingError}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MapPinned className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">{t("siteGps.map")}</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {t("siteGps.refreshNote")}
          </span>
        </div>
        <LocationMap
          center={center}
          radiusM={selectedProject?.geofence_radius_m}
          markers={markers}
          zones={zones}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("siteGps.people")}</h2>
        <div className="divide-y border-y">
          {positions.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("siteGps.empty")}
            </p>
          ) : (
            positions.map((position) => <PositionRow key={position.id} position={position} />)
          )}
        </div>
      </section>
    </div>
  );
}

function PositionRow({ position }: { position: FieldStaffPosition }) {
  const t = useTranslations();
  return (
    <div className="grid gap-3 px-3 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{position.user_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {position.project_code} · {position.latitude}, {position.longitude}
          </p>
        </div>
      </div>
      <StatusBadge
        label={t(`siteGps.geofence.${position.geofence_result}`)}
        tone={
          position.geofence_result === "INSIDE"
            ? "positive"
            : position.geofence_result === "OUTSIDE"
              ? "danger"
              : "neutral"
        }
      />
      <span className="text-xs tabular-nums text-muted-foreground">
        {position.is_stale ? t("siteGps.stale") : t("siteGps.live")}
      </span>
    </div>
  );
}
