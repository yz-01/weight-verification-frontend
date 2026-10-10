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
import { onSiteMarkers, useOnSitePositions } from "@/components/site-operations/on-site-map";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@/interfaces/contractor";
import type { SiteGeofence } from "@/interfaces/site-access";
import type { OnSitePosition } from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import { MAP_COLORS } from "@/lib/map-palette";
import { cn } from "@/lib/utils";
import { getProjects } from "@/services/contractor.service";
import { getSiteGeofences } from "@/services/site-access.service";

// Leaflet writes these into SVG attributes, so they come from the map
// palette (the canvas's data colours as literals) rather than CSS variables.
const PROJECT_COLORS = MAP_COLORS;

export function ContractorLocationMap({
  project,
  onProjectChange,
  headless = false,
}: {
  project: string;
  onProjectChange: (project: string) => void;
  /** Inside a dashboard section that already shows the title (F7). */
  headless?: boolean;
}) {
  const t = useTranslations("contractorDashboard.locationMap");
  const dates = useDateFormat();
  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });
  // The people on site now, at their newest point inside the fence - not
  // every phone that reported lately, wherever it was (2026-10-10).
  const positions = useOnSitePositions(project);
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
    const staffMarkers = onSiteMarkers(positionRows, (row) =>
      t("personMarker", {
        project: row.project_name,
        seen: dates.dateTime(row.last_seen_at),
      }),
    );
    return [...projectMarkers, ...staffMarkers];
  }, [dates, positionRows, projectRows, t]);
  const selectedProject = projectRows.find((row) => row.id === project);
  const center = selectedProject ? projectPoint(selectedProject) : undefined;
  const staleCount = useMemo(
    () => positionRows.filter((row) => row.stale).length,
    [positionRows],
  );
  const loading = projects.isLoading || positions.isLoading || geofences.isLoading;
  const failed = projects.isError || positions.isError || geofences.isError;
  const refreshing = projects.isFetching || positions.isFetching || geofences.isFetching;
  const gpsHref = project
    ? `/site-gps?project=${encodeURIComponent(project)}`
    : "/site-gps";

  return (
    <section
      aria-labelledby={headless ? undefined : "dashboard-location-map-title"}
      aria-label={headless ? t("title") : undefined}
      className={cn("space-y-4", !headless && "border-y py-5")}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {headless ? (
          <p className="min-w-0 text-sm text-muted-foreground">{t("subtitle")}</p>
        ) : (
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
        )}
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
        <MapCount label={t("inside")} value={positionRows.length - staleCount} tone="positive" />
        <MapCount label={t("stale")} value={staleCount} tone="warning" />
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_22rem]">
          <Skeleton className="h-[16rem] w-full sm:h-[18rem]" />
          <Skeleton className="h-56 w-full xl:h-[18rem]" />
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
              className="h-[16rem] min-h-[16rem] rounded-md sm:h-[18rem] sm:min-h-[18rem]"
            />
          ) : (
            <div className="grid h-[16rem] place-items-center rounded-md border bg-muted/20 px-6 text-center text-sm text-muted-foreground sm:h-[18rem]">
              {t("empty")}
            </div>
          )}

          <div className="min-w-0 border-y xl:h-[18rem]">
            <div className="flex items-center justify-between gap-3 border-b py-3">
              <div>
                <h3 className="text-base font-semibold">{t("staffStatus")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("staffCount", { count: positionRows.length })}
                </p>
              </div>
              <UserRound className="size-4 text-muted-foreground" />
            </div>
            {positionRows.length > 0 ? (
              <div className="max-h-[14rem] divide-y overflow-y-auto overscroll-contain xl:max-h-[13.5rem]">
                {positionRows.map((position) => (
                  <PositionRow key={`${position.project_id}-${position.user_id}`} position={position} />
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

function PositionRow({ position }: { position: OnSitePosition }) {
  const t = useTranslations("contractorDashboard.locationMap");
  const dates = useDateFormat();

  return (
    <Link
      href={`/site-gps?project=${encodeURIComponent(position.project_id)}&user=${encodeURIComponent(position.user_id)}`}
      className={cn(
        "block px-1 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        position.stale && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{position.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{position.project_name}</p>
        </div>
        <StatusBadge
          label={t(position.stale ? "stale" : "inside")}
          tone={position.stale ? "warning" : "positive"}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("lastSeen", { at: dates.dateTime(position.last_seen_at) })}
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
  const projectColors = new Map(
    projects.map((project, index) => [
      project.id,
      PROJECT_COLORS[projects.length === 1 ? 0 : index % PROJECT_COLORS.length],
    ]),
  );
  const validCustomZones: LocationMapZone[] = [];
  const projectsWithCustomZones = new Set<string>();
  geofences.forEach((row) => {
    if (!row.is_active || !projectIds.has(row.project)) return;
    const color = projectColors.get(row.project) ?? PROJECT_COLORS[0];
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
        color: projectColors.get(project.id) ?? PROJECT_COLORS[0],
      },
    ];
  });
  return [...validCustomZones, ...defaultZones];
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

function isValidPoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}
