"use client";

/**
 * 现场人员位置: everybody on site now, where they were last seen inside the
 * fence (2026-10-10, Lucas: 「在围栏内会显示现场工作人员的实时位置」).
 *
 * The people are the ones the 当前在场 numbers count - an open 进场 - so the
 * map and the figures above it never disagree. The server sends only points
 * inside the fence: somebody who steps out is drawn where they last were
 * inside until the fence records 离开, and then disappears. A marker the phone
 * has not refreshed for ten minutes turns grey; a phone only reports while the
 * field app is open on screen, which the note under the map says.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MapPinned, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  LocationMap,
  type LocationMapMarker,
  type LocationMapZone,
} from "@/components/shared/location-map";
import { QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import type { SiteGeofence } from "@/interfaces/site-access";
import type { OnSitePosition } from "@/interfaces/site-operations";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getOnSitePositions } from "@/services/field-staff-gps.service";
import { getSiteGeofences } from "@/services/site-access.service";

/** Half the phone's report interval: a move shows within a minute. */
export const ON_SITE_REFRESH_MS = 30_000;

export function onSiteQueryKey(project?: string) {
  return ["field-staff-gps", "on-site", project || "all"] as const;
}

export function useOnSitePositions(project?: string, enabled = true) {
  return useQuery({
    queryKey: onSiteQueryKey(project),
    queryFn: () => getOnSitePositions(project || undefined),
    refetchInterval: ON_SITE_REFRESH_MS,
    enabled,
  });
}

/** The map's people: green while fresh, grey once stale. */
export function onSiteMarkers(
  rows: OnSitePosition[],
  detail: (row: OnSitePosition) => string,
): LocationMapMarker[] {
  return rows.flatMap((row) => {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [
      {
        id: `on-site-${row.project_id}-${row.user_id}`,
        latitude,
        longitude,
        label: row.full_name,
        detail: detail(row),
        tone: row.stale ? ("warning" as const) : ("positive" as const),
        stale: row.stale,
        icon: "person" as const,
      },
    ];
  });
}

function fenceZones(rows: SiteGeofence[], project?: string): LocationMapZone[] {
  return rows.flatMap((row): LocationMapZone[] => {
    if (!row.is_active || (project && row.project !== project)) return [];
    const label = `${row.project_name} · ${row.name}`;
    if (row.shape === "POLYGON") {
      const points = row.polygon.filter(
        (point) => Number.isFinite(point[0]) && Number.isFinite(point[1]),
      );
      return points.length >= 3 ? [{ id: row.id, label, points }] : [];
    }
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const radiusM = Number(row.radius_m);
    if (
      row.latitude === null ||
      row.longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !(radiusM > 0)
    ) {
      return [];
    }
    return [{ id: row.id, label, center: [latitude, longitude] as [number, number], radiusM }];
  });
}

/**
 * The panel itself: a map of the fence with a marker per person, and the
 * same people as a list beside it.
 *
 * `collapsible` folds it behind its header on a page whose main job is a
 * table (人员进场), so the list keeps its room until somebody asks for the map.
 */
export function OnSiteMap({
  project,
  collapsible = false,
  className,
}: {
  project?: string;
  collapsible?: boolean;
  className?: string;
}) {
  const t = useTranslations("onSiteMap");
  const dates = useDateFormat();
  const { can } = useAuth();
  const [open, setOpen] = useState(!collapsible);
  const positions = useOnSitePositions(project);
  // The fence outline is drawn for readers allowed to see it; the people do
  // not depend on it.
  const mayReadFences = can("geofence.view") || can("field_position.submit");
  const fences = useQuery({
    queryKey: ["site-geofences", "on-site-map", project || "all"],
    queryFn: () =>
      getSiteGeofences({ page_size: 200, is_active: true, ...(project ? { project } : {}) }),
    enabled: mayReadFences && open,
    staleTime: 60_000,
  });
  const rows = useMemo(() => positions.data?.results ?? [], [positions.data?.results]);
  const markers = useMemo(
    () =>
      onSiteMarkers(rows, (row) =>
        `${row.project_name} · ${t("lastSeen", { at: dates.dateTime(row.last_seen_at) })}`,
      ),
    [dates, rows, t],
  );
  const zones = useMemo(
    () => fenceZones(fences.data?.results ?? [], project),
    [fences.data?.results, project],
  );

  const header = (
    <div className="flex min-w-0 items-start gap-3">
      <span className="rounded-md bg-primary/10 p-2 text-primary">
        <MapPinned className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 className="panel-title">{t("title")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {positions.isSuccess ? t("count", { count: rows.length }) : t("subtitle")}
        </p>
      </div>
    </div>
  );

  return (
    <section className={cn("surface-panel space-y-3 rounded-xl p-4 sm:p-6", className)}>
      {collapsible ? (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {header}
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
      ) : (
        header
      )}
      <QueryFailedNote query={positions} what={t("what")} />
      {open && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_20rem]">
            {markers.length > 0 || zones.length > 0 ? (
              <LocationMap
                markers={markers}
                zones={zones}
                preserveViewOnDataUpdate
                fitBoundsKey={`on-site:${project || "all"}`}
                ariaLabel={t("mapLabel")}
                className="h-[16rem] min-h-[16rem] rounded-md sm:h-[20rem] sm:min-h-[20rem]"
              />
            ) : (
              <div className="grid h-[12rem] place-items-center rounded-md border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                {t("empty")}
              </div>
            )}
            <div className="min-w-0 divide-y rounded-lg border xl:max-h-[20rem] xl:overflow-y-auto">
              {rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                rows.map((row) => (
                  <div
                    key={`${row.project_id}-${row.user_id}`}
                    className={cn("flex items-start gap-2 px-3 py-2.5", row.stale && "opacity-60")}
                  >
                    <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.project_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("lastSeen", { at: dates.dateTime(row.last_seen_at) })}
                      </p>
                    </div>
                    <StatusBadge
                      label={row.stale ? t("stale") : t("live")}
                      tone={row.stale ? "neutral" : "positive"}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
          <QueryFailedNote query={fences} what={t("whatFences")} />
          <p className="text-xs text-muted-foreground">{t("foregroundOnly")}</p>
        </>
      )}
    </section>
  );
}
