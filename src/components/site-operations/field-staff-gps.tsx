"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, LocateFixed, MapPinned, RefreshCw, Route, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { LocationMap, type LocationMapZone } from "@/components/shared/location-map";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/interfaces/api";
import type { FieldStaffPosition } from "@/interfaces/site-operations";
import type { SiteGeofence } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getProjects } from "@/services/contractor.service";
import {
  getFieldStaffLastPositions,
  getFieldStaffLivePositions,
  getFieldStaffRouteHistory,
  recordFieldStaffPosition,
  stopFieldStaffLocationSharing,
} from "@/services/field-staff-gps.service";
import { getSiteGeofences, getSiteLocationPolicy } from "@/services/site-access.service";

export function FieldStaffGps() {
  const t = useTranslations();
  const dates = useDateFormat();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("live");
  const [projectId, setProjectId] = useState("");
  const [sharing, setSharing] = useState(false);
  const [sharingError, setSharingError] = useState("");
  const [historyProjectId, setHistoryProjectId] = useState("");
  const [historySelection, setHistorySelection] = useState("");
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
      stopWatcher();
      setSharingError(
        error instanceof ApiError ? error.message : t("errors.generic"),
      );
    },
  });
  const geofences = useQuery({
    queryKey: ["site-geofences", "gps-map"],
    queryFn: () => getSiteGeofences({ page_size: 200, is_active: true }),
  });
  const locationPolicy = useQuery({
    queryKey: ["site-location-policy"],
    queryFn: getSiteLocationPolicy,
  });
  const lastPositions = useQuery({
    queryKey: ["field-staff-gps", "last", historyProjectId],
    queryFn: () =>
      getFieldStaffLastPositions({
        page_size: 100,
        ...(historyProjectId ? { project: historyProjectId } : {}),
      }),
  });
  const lastRows = useMemo(
    () => lastPositions.data?.results ?? [],
    [lastPositions.data?.results],
  );
  const selectedLastPosition = useMemo(
    () =>
      lastRows.find(
        (position) =>
          `${position.project}:${position.user}` === historySelection,
      ) ?? lastRows[0],
    [historySelection, lastRows],
  );
  const history = useQuery({
    queryKey: [
      "field-staff-gps",
      "history",
      selectedLastPosition?.project,
      selectedLastPosition?.user,
    ],
    queryFn: () =>
      getFieldStaffRouteHistory(selectedLastPosition!.project, {
        user: selectedLastPosition!.user,
        page_size: 100,
        sort_by: "original_occurred_at",
        sort_order: "asc",
      }),
    enabled: Boolean(selectedLastPosition),
  });
  const stop = useMutation({
    mutationFn: stopFieldStaffLocationSharing,
    onSuccess: () => {
      setSharingError("");
      void queryClient.invalidateQueries({ queryKey: ["field-staff-gps"] });
    },
    onError: (error) => {
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
  const zones = useMemo(
    () => buildZones(geofences.data?.results ?? [], positions, projectId),
    [geofences.data?.results, positions, projectId],
  );
  const selectedHistoryProject = useMemo(
    () => projects.data?.results.find((project) => project.id === historyProjectId),
    [historyProjectId, projects.data?.results],
  );
  const historyPositions = useMemo(
    () => history.data?.results ?? [],
    [history.data?.results],
  );
  const historyMarkers = useMemo(
    () =>
      lastRows.map((position) => ({
        id: `${position.project}:${position.user}`,
        latitude: Number(position.latitude),
        longitude: Number(position.longitude),
        label: position.user_name,
        detail: `${position.project_name} · ${dates.dateTime(position.original_occurred_at)}`,
        tone:
          position.geofence_result === "OUTSIDE"
            ? ("danger" as const)
            : position.event_type === "SHARING_STOPPED" || position.is_stale
              ? ("warning" as const)
              : ("positive" as const),
        stale: position.event_type === "SHARING_STOPPED" || position.is_stale,
        icon: "person" as const,
      })),
    [dates, lastRows],
  );
  const historyPaths = useMemo(() => {
    if (!selectedLastPosition) return [];
    const points = historyPositions
      .filter((position) => position.event_type !== "SHARING_STOPPED")
      .map(
        (position) =>
          [Number(position.latitude), Number(position.longitude)] as [number, number],
      );
    return points.length > 1
      ? [{
          id: `${selectedLastPosition.project}:${selectedLastPosition.user}`,
          points,
          label: selectedLastPosition.user_name,
        }]
      : [];
  }, [historyPositions, selectedLastPosition]);
  const historyZones = useMemo(
    () => buildZones(geofences.data?.results ?? [], lastRows, historyProjectId),
    [geofences.data?.results, historyProjectId, lastRows],
  );
  const historyCenter = useMemo<[number, number] | undefined>(() => {
    if (selectedHistoryProject?.latitude && selectedHistoryProject.longitude) {
      return [
        Number(selectedHistoryProject.latitude),
        Number(selectedHistoryProject.longitude),
      ];
    }
    if (selectedLastPosition) {
      return [
        Number(selectedLastPosition.latitude),
        Number(selectedLastPosition.longitude),
      ];
    }
    return undefined;
  }, [selectedHistoryProject, selectedLastPosition]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  function stopWatcher() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setSharing(false);
  }

  function stopSharing() {
    stopWatcher();
    if (!projectId || !user) return;
    stop.mutate({
      project: projectId,
      client_event_id: `${user.id}-stop-${Date.now()}`,
    });
  }

  function startSharing() {
    setSharingError("");
    if (!projectId || !user) return;
    if (!navigator.geolocation) {
      setSharingError(t("siteGps.error.unsupported"));
      return;
    }
    stopWatcher();
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const interval = (locationPolicy.data?.location_update_interval_seconds ?? 60) * 1000;
        if (now - lastSentAt.current < interval) return;
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
        stopWatcher();
        const key =
          error.code === error.PERMISSION_DENIED
            ? "permissionDenied"
            : error.code === error.POSITION_UNAVAILABLE
              ? "unavailable"
              : "timeout";
        setSharingError(t(`siteGps.error.${key}`));
      },
      {
        enableHighAccuracy: true,
        maximumAge: (locationPolicy.data?.location_update_interval_seconds ?? 60) * 1000,
        timeout: 15_000,
      },
    );
  }

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("siteGps.title")}
        subtitle={
          tab === "live"
            ? t("siteGps.count", { count: live.data?.count ?? 0 })
            : t("siteGps.historyCount", { count: lastPositions.data?.count ?? 0 })
        }
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={tab === "live" ? live.isFetching : lastPositions.isFetching}
            onClick={() => {
              if (tab === "live") {
                void live.refetch();
              } else {
                void lastPositions.refetch();
                if (selectedLastPosition) void history.refetch();
              }
            }}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (tab === "live" ? live.isFetching : lastPositions.isFetching) &&
                  "animate-spin",
              )}
            />
            {t("common.refresh")}
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="live">
            <MapPinned />
            {t("siteGps.tabs.live")}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History />
            {t("siteGps.tabs.history")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-5 pt-2">
          <div className="flex flex-wrap items-center gap-3 border-y bg-card/50 py-3">
            <ProjectPicker
              value={projectId || "all"}
              onValueChange={(value) => {
                if (sharing) stopSharing();
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
                disabled={!projectId || record.isPending || stop.isPending}
                onClick={sharing ? stopSharing : startSharing}
              >
                {sharing ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <LocateFixed className="h-4 w-4" />
                )}
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

          <MapSection title={t("siteGps.map")} note={t("siteGps.refreshNote")}>
            <LocationMap
              center={center}
              radiusM={zones.length ? null : selectedProject?.geofence_radius_m}
              markers={markers}
              zones={zones}
            />
          </MapSection>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("siteGps.people")}</h2>
            <div className="divide-y border-y">
              {positions.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("siteGps.empty")}
                </p>
              ) : (
                positions.map((position) => (
                  <PositionRow key={position.id} position={position} />
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="history" className="space-y-5 pt-2">
          <div className="border-y bg-card/50 py-3">
            <ProjectPicker
              value={historyProjectId || "all"}
              onValueChange={(value) => {
                setHistoryProjectId(value === "all" ? "" : value);
                setHistorySelection("");
              }}
              allowAll
              allLabel={t("siteGps.allProjects")}
              placeholder={t("siteGps.project")}
              className="w-full sm:w-[280px]"
            />
          </div>

          <MapSection
            title={t("siteGps.historyMap")}
            note={t("siteGps.historyNote", { count: historyPositions.length })}
          >
            <LocationMap
              center={historyCenter}
              radiusM={historyZones.length ? null : selectedHistoryProject?.geofence_radius_m}
              markers={historyMarkers}
              paths={historyPaths}
              zones={historyZones}
            />
          </MapSection>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">
                {t("siteGps.lastPositions")}
              </h2>
            </div>
            <div className="divide-y border-y">
              {lastRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("siteGps.historyEmpty")}
                </p>
              ) : (
                lastRows.map((position) => {
                  const key = `${position.project}:${position.user}`;
                  return (
                    <HistoryPositionRow
                      key={key}
                      active={selectedLastPosition !== undefined &&
                        selectedLastPosition.project === position.project &&
                        selectedLastPosition.user === position.user}
                      position={position}
                      onSelect={() => setHistorySelection(key)}
                    />
                  );
                })
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function buildZones(
  geofences: SiteGeofence[],
  positions: FieldStaffPosition[],
  projectId: string,
): LocationMapZone[] {
  const rows = geofences.filter(
    (row) => row.is_active && (!projectId || row.project === projectId),
  );
  const zones: LocationMapZone[] = rows.map((row) =>
    row.shape === "POLYGON"
      ? { id: row.id, label: `${row.project_name} · ${row.name}`, points: row.polygon }
      : {
          id: row.id,
          label: `${row.project_name} · ${row.name}`,
          center: [Number(row.latitude), Number(row.longitude)],
          radiusM: row.radius_m ?? 1,
        },
  );
  const projectsWithZones = new Set(rows.map((row) => row.project));
  const legacy = new Map<string, LocationMapZone>();
  positions.forEach((position) => {
    if (
      projectsWithZones.has(position.project) ||
      (projectId && position.project !== projectId) ||
      !position.project_latitude ||
      !position.project_longitude ||
      !position.project_geofence_radius_m
    ) return;
    legacy.set(position.project, {
      id: `legacy-${position.project}`,
      center: [Number(position.project_latitude), Number(position.project_longitude)],
      radiusM: position.project_geofence_radius_m,
      label: position.project_name,
    });
  });
  return [...zones, ...legacy.values()];
}

function MapSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      {children}
    </section>
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

function HistoryPositionRow({
  position,
  active,
  onSelect,
}: {
  position: FieldStaffPosition;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const dates = useDateFormat();
  const sharingStatus =
    position.event_type === "SHARING_STOPPED"
      ? "stopped"
      : position.is_stale
        ? "expired"
        : "live";
  const sharingTone =
    sharingStatus === "live"
      ? "positive"
      : sharingStatus === "stopped"
        ? "warning"
        : "neutral";
  const distance = position.distance_to_project_m
    ? Math.round(Number(position.distance_to_project_m)).toLocaleString()
    : null;

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "grid w-full gap-3 px-3 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
        active ? "bg-primary/8" : "hover:bg-muted/50",
      )}
      onClick={onSelect}
    >
      <div className="flex min-w-0 items-start gap-2">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{position.user_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {position.project_code} · {position.latitude}, {position.longitude}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("siteGps.lastSeen", {
              value: dates.precise(position.original_occurred_at),
            })}
            {distance !== null
              ? ` · ${t("siteGps.distance", { value: distance })}`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
        <StatusBadge
          label={t(`siteGps.status.${sharingStatus}`)}
          tone={sharingTone}
        />
      </div>
    </button>
  );
}
