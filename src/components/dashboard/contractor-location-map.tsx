"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPinned, RefreshCw, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  LocationMap,
  type LocationMapMarker,
  type LocationMapZone,
} from "@/components/shared/location-map";
import { StatusBadge } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@/interfaces/contractor";
import type { SiteGeofence } from "@/interfaces/site-access";
import type { FieldStaffPosition } from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getProjects } from "@/services/contractor.service";
import { getFieldStaffLivePositions } from "@/services/field-staff-gps.service";
import { getSiteGeofences } from "@/services/site-access.service";

const POSITION_REFRESH_MS = 15_000;
const PROJECT_COLORS = [
  "#087f8c",
  "#2563eb",
  "#7c3aed",
  "#c2410c",
  "#15803d",
  "#be123c",
  "#a16207",
  "#0f766e",
];

type PositionState = "inside" | "outside" | "stale" | "lastInside" | "unknown";

export function ContractorLocationMap({
  project,
  onProjectChange,
}: {
  project: string;
  onProjectChange: (project: string) => void;
}) {
  const t = useTranslations("contractorDashboard.locationMap");
  const dates = useDateFormat();
  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });
  const positions = useQuery({
    queryKey: ["field-staff-gps", "dashboard", project],
    queryFn: () =>
      getFieldStaffLivePositions({
        page_size: 200,
        ...(project ? { project } : {}),
      }),
    refetchInterval: POSITION_REFRESH_MS,
  });
  const geofences = useQuery({
    queryKey: ["site-geofences", "dashboard-map", project],
    queryFn: () =>
      getSiteGeofences({
        page_size: 200,
        is_active: true,
        ...(project ? { project } : {}),
      }),
    staleTime: 60_000,
  });

  const projectRows = useMemo(
    () =>
      (projects.data?.results ?? []).filter(
        (row) => !project || row.id === project,
      ),
    [project, projects.data?.results],
  );
  const positionRows = useMemo(
    () => positions.data?.results ?? [],
    [positions.data?.results],
  );
  const zoneRows = useMemo(
    () => buildZones(projectRows, geofences.data?.results ?? []),
    [geofences.data?.results, projectRows],
  );
  const markers = useMemo<LocationMapMarker[]>(() => {
    const projectMarkers = projectRows.flatMap((row) => {
      const point = projectPoint(row);
      return point
        ? [
            {
              id: `project-${row.id}`,
              latitude: point[0],
              longitude: point[1],
              label: row.name,
              detail: t("projectMarker", { code: row.code }),
              icon: "project" as const,
            },
          ]
        : [];
    });
    const staffMarkers = positionRows.flatMap((position) => {
      if (!hasVisibleCoordinates(position)) return [];
      const state = getPositionState(position);
      return [
        {
          id: `staff-${position.id}`,
          latitude: Number(position.latitude),
          longitude: Number(position.longitude),
          label: position.user_name,
          detail: t("personMarker", {
            project: position.project_name,
            seen: dates.dateTime(position.original_occurred_at),
          }),
          tone:
            state === "outside"
              ? ("danger" as const)
              : state === "stale" || state === "lastInside"
                ? ("warning" as const)
                : state === "inside"
                  ? ("positive" as const)
                  : ("primary" as const),
          stale: state === "stale" || state === "lastInside",
          icon: "person" as const,
        },
      ];
    });
    return [...projectMarkers, ...staffMarkers];
  }, [dates, positionRows, projectRows, t]);
  const selectedProject = projectRows.find((row) => row.id === project);
  const center = selectedProject ? projectPoint(selectedProject) : undefined;
  const counts = useMemo(
    () =>
      positionRows.reduce(
        (total, row) => {
          total[getPositionState(row)] += 1;
          return total;
        },
        { inside: 0, outside: 0, stale: 0, lastInside: 0, unknown: 0 },
      ),
    [positionRows],
  );
  const loading = projects.isLoading || positions.isLoading || geofences.isLoading;
  const failed = projects.isError || positions.isError || geofences.isError;
  const refreshing = projects.isFetching || positions.isFetching || geofences.isFetching;
  const gpsHref = project
    ? `/site-gps?project=${encodeURIComponent(project)}`
    : "/site-gps";

  return (
    <section aria-labelledby="dashboard-location-map-title" className="space-y-4 border-y py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-md bg-primary/10 p-2 text-primary">
            <MapPinned className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="dashboard-location-map-title" className="text-base font-semibold">
              {t("title")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-start gap-2 lg:w-auto lg:justify-end">
          <ProjectPicker
            value={project || "all"}
            onValueChange={(next) => onProjectChange(next === "all" ? "" : next)}
            placeholder={t("selectProject")}
            allowAll
            allLabel={t("allProjects")}
            className="w-full sm:w-64"
            projects={projects.data?.results}
            projectsLoading={projects.isLoading}
            projectsError={projects.isError}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => {
              void projects.refetch();
              void positions.refetch();
              void geofences.refetch();
            }}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            {t("refresh")}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={gpsHref}>
              <ExternalLink />
              {t("openGps")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <MapCount label={t("projects")} value={projectRows.length} />
        <MapCount label={t("people")} value={positionRows.length} />
        <MapCount label={t("inside")} value={counts.inside} tone="positive" />
        <MapCount label={t("outside")} value={counts.outside} tone="danger" />
        <MapCount
          label={t("stale")}
          value={counts.stale + counts.lastInside}
          tone="warning"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_22rem]">
          <Skeleton className="h-[22rem] w-full sm:h-[24rem]" />
          <Skeleton className="h-64 w-full xl:h-[24rem]" />
        </div>
      ) : failed ? (
        <div className="border-y py-10 text-center text-sm text-destructive">
          {t("loadError")}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_22rem]">
          {markers.length > 0 || zoneRows.length > 0 ? (
            <LocationMap
              center={center}
              markers={markers}
              zones={zoneRows}
              preserveViewOnDataUpdate
              fitBoundsKey={project || "all"}
              ariaLabel={t("mapLabel")}
              className="h-[22rem] min-h-[22rem] rounded-md sm:h-[24rem] sm:min-h-[24rem]"
            />
          ) : (
            <div className="grid h-[22rem] place-items-center rounded-md border bg-muted/20 px-6 text-center text-sm text-muted-foreground sm:h-[24rem]">
              {t("empty")}
            </div>
          )}

          <div className="min-w-0 border-y xl:h-[24rem]">
            <div className="flex items-center justify-between gap-3 border-b py-3">
              <div>
                <h3 className="text-sm font-semibold">{t("staffStatus")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("staffCount", { count: positionRows.length })}
                </p>
              </div>
              <UserRound className="size-4 text-muted-foreground" />
            </div>
            {positionRows.length > 0 ? (
              <div className="max-h-[20rem] divide-y overflow-y-auto overscroll-contain xl:max-h-[19.5rem]">
                {positionRows.map((position) => (
                  <PositionRow key={position.id} position={position} />
                ))}
              </div>
            ) : (
              <p className="px-1 py-10 text-center text-sm text-muted-foreground">
                {t("noPeople")}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PositionRow({ position }: { position: FieldStaffPosition }) {
  const t = useTranslations("contractorDashboard.locationMap");
  const dates = useDateFormat();
  const state = getPositionState(position);
  const tone =
    state === "inside"
      ? "positive"
      : state === "outside"
        ? "danger"
        : state === "stale" || state === "lastInside"
          ? "warning"
          : "neutral";

  return (
    <Link
      href={`/site-gps?project=${encodeURIComponent(position.project)}&user=${encodeURIComponent(position.user)}`}
      className="block px-1 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{position.user_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {position.project_code} · {position.project_name}
          </p>
        </div>
        <StatusBadge label={t(state)} tone={tone} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasVisibleCoordinates(position)
          ? t("lastSeen", { at: dates.dateTime(position.original_occurred_at) })
          : t("noPosition")}
      </p>
    </Link>
  );
}

function MapCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "warning" | "danger";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "size-2 rounded-full bg-muted-foreground/40",
          tone === "positive" && "bg-success",
          tone === "warning" && "bg-warning",
          tone === "danger" && "bg-destructive",
        )}
      />
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums text-foreground">{value}</strong>
    </span>
  );
}

function buildZones(projects: Project[], geofences: SiteGeofence[]): LocationMapZone[] {
  const projectIds = new Set(projects.map((project) => project.id));
  const validCustomZones: LocationMapZone[] = [];
  const projectsWithCustomZones = new Set<string>();
  geofences.forEach((row) => {
    if (!row.is_active || !projectIds.has(row.project)) return;
    const color = projectColor(row.project);
    if (row.shape === "POLYGON") {
      const points = row.polygon.filter(isValidPoint);
      if (points.length < 3) return;
      validCustomZones.push({
        id: row.id,
        label: `${row.project_name} · ${row.name}`,
        points,
        color,
      });
      projectsWithCustomZones.add(row.project);
      return;
    }
    if (row.latitude === null || row.longitude === null) return;
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const radiusM = Number(row.radius_m);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || radiusM <= 0) {
      return;
    }
    validCustomZones.push({
      id: row.id,
      label: `${row.project_name} · ${row.name}`,
      center: [latitude, longitude],
      radiusM,
      color,
    });
    projectsWithCustomZones.add(row.project);
  });
  const defaultZones = projects.flatMap((project) => {
    const point = projectPoint(project);
    const radiusM = Number(project.geofence_radius_m);
    if (!point || projectsWithCustomZones.has(project.id) || radiusM <= 0) return [];
    return [
      {
        id: `project-default-${project.id}`,
        label: project.name,
        center: point,
        radiusM,
        color: projectColor(project.id),
      },
    ];
  });
  return [...validCustomZones, ...defaultZones];
}

function getPositionState(position: FieldStaffPosition): PositionState {
  if (!hasVisibleCoordinates(position)) return "unknown";
  if (position.coordinates_are_last_in_geofence) return "lastInside";
  if (position.is_stale) return "stale";
  if (position.geofence_result === "OUTSIDE") return "outside";
  if (position.geofence_result === "INSIDE") return "inside";
  return "unknown";
}

function projectPoint(project: Project): [number, number] | undefined {
  if (
    project.latitude === null ||
    project.latitude === undefined ||
    project.latitude === "" ||
    project.longitude === null ||
    project.longitude === undefined ||
    project.longitude === ""
  ) {
    return undefined;
  }
  const latitude = Number(project.latitude);
  const longitude = Number(project.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? [latitude, longitude]
    : undefined;
}

function hasVisibleCoordinates(
  position: FieldStaffPosition,
): position is FieldStaffPosition & { latitude: string; longitude: string } {
  return (
    position.latitude !== null &&
    position.longitude !== null &&
    Number.isFinite(Number(position.latitude)) &&
    Number.isFinite(Number(position.longitude))
  );
}

function isValidPoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function projectColor(projectId: string): string {
  let hash = 0;
  for (const character of projectId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}
