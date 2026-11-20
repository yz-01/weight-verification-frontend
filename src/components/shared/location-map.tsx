"use client";

import {
  Building2,
  ClipboardList,
  Construction,
  FolderKanban,
  Recycle,
  Scale,
  Truck,
  UserRound,
} from "lucide-react";
import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MapFrame } from "@/components/shared/map-frame";
import { MAP_PRIMARY } from "@/lib/map-palette";
import { lockMapToBox, sitePadding, siteViewBox } from "@/lib/site-view";

import {
  MAP_TILE_MAX_ZOOM,
  MAP_TILE_OPTIONS,
  MAP_TILE_URL,
  warnIfFallbackTiles,
} from "@/lib/map-tiles";

export interface LocationMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  detail?: string;
  /**
   * `info` (purple) is the project map's 现场记录 layer (JB222); `neutral`
   * (grey) its people last located on an earlier day (audit 11-20 F4).
   */
  tone?: "primary" | "positive" | "warning" | "danger" | "info" | "neutral";
  stale?: boolean;
  icon?: "person" | "truck" | "project" | "recycler" | "scale" | "building" | "machine" | "record";
  /** More than one thing at this spot (JB222): the number on the icon. */
  count?: number;
  /**
   * A few words always shown under the icon, without a press (the project
   * map's 最新定位 time, audit 11-20 F4). No other map sets it.
   */
  caption?: string;
}

export interface LocationMapPath {
  id: string;
  points: Array<[number, number]>;
  color?: string;
  label?: string;
  /**
   * Draw as a broken line rather than a solid one.
   *
   * Used for the stretches of a driver's track where the phone recorded
   * nothing — the screen was locked, or the app was in the background. A solid
   * line there would claim a road that was never observed, and the straight
   * one at that.
   */
  dashed?: boolean;
}

export interface LocationMapZone {
  id: string;
  center?: [number, number];
  radiusM?: number;
  points?: Array<[number, number]>;
  label?: string;
  color?: string;
  /** Drawn dashed: a project's other fences beside its main one (J23). */
  dashed?: boolean;
}

interface LocationMapProps {
  center?: [number, number];
  radiusM?: number | null;
  markers: LocationMapMarker[];
  paths?: LocationMapPath[];
  zones?: LocationMapZone[];
  /** Where the map remembers the height it was dragged to (J23-1). */
  sizeKey?: string;
  className?: string;
  ariaLabel?: string;
  preserveViewOnDataUpdate?: boolean;
  fitBoundsKey?: string | number;
  /** Called with a marker's id when it is clicked (the HQ map selects). */
  onMarkerClick?: (id: string) => void;
  /** How close to zoom on a lone point (street level unless asked). */
  singlePointZoom?: number;
  /**
   * A button that shows everything on the map again, named for what it
   * shows (「回到围栏」, I7). With `preserveViewOnDataUpdate`, the one way the
   * map is re-centred after it first opens.
   */
  fitLabel?: string;
  /**
   * A map about one site (JB111, 客户 11-06: 「地图只服务于当前工地，不是让用户
   * 浏览世界地图」): it opens on the whole fence and cannot be dragged off it
   * or zoomed out past it. Kept to the fences only - a marker or track
   * outside them is not a reason to show another town. Overview maps (head
   * office, a driver's route) leave it off.
   */
  lockToSite?: boolean;
  /**
   * With `lockToSite`: the share of the map the fence fills when it opens
   * (JB222-2, 客户 11-19: 「让整个工地占据地图约80%的空间」), in between zoom
   * steps, and again whenever the map changes size until the reader moves it.
   * Off: the fence fits with 24 px around it, as every site map before.
   */
  siteFill?: number;
  /**
   * What the first view fits: everything drawn (default), or the markers
   * only - the head-office map opens on its pins, its fences drawn but not
   * pulling the view down to one street (JB222-1).
   */
  fitTo?: "all" | "markers";
  /** The closest a fit of several points zooms (default 16). */
  fitMaxZoom?: number;
  /** A Leaflet popup on each marker (default). Off when the caller shows its own card. */
  popups?: boolean;
  /** Drawn over the map inside its frame, full screen too (JB222). */
  overlay?: ReactNode;
}

const DEFAULT_CENTER: [number, number] = [3.139, 101.6869];

export function LocationMap({
  center = DEFAULT_CENTER,
  radiusM,
  markers,
  paths = [],
  zones = [],
  sizeKey,
  className = "",
  ariaLabel = "Location map",
  preserveViewOnDataUpdate = false,
  fitBoundsKey,
  onMarkerClick,
  singlePointZoom = 16,
  fitLabel,
  lockToSite = false,
  siteFill,
  fitTo = "all",
  fitMaxZoom = 16,
  popups = true,
  overlay,
}: LocationMapProps) {
  // The map's node, inside the frame that can fill the screen (I7). Held as
  // state so the map is made once the node exists.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  // Shows everything drawn again (「回到围栏」); set by the drawing below.
  const fitRef = useRef<(() => void) | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const fittedKeyRef = useRef<string | number | undefined>(undefined);
  const hasFittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  // The site's box, kept for the resize below (JB111).
  const lockRef = useRef<() => void>(() => {});
  // A fill-to-share map (JB222): made with in-between zoom steps, and
  // fitted again on a resize until the reader has moved it himself.
  const siteFillRef = useRef(siteFill);
  const touchedRef = useRef(false);
  const fittingRef = useRef(false);
  // Read through a ref so a new callback each render does not redraw markers.
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  useEffect(() => {
    if (!container) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;

    void import("leaflet").then(({ default: L }) => {
      if (disposed) return;

      const map = L.map(container, {
        center: DEFAULT_CENTER,
        zoom: 15,
        zoomControl: true,
        attributionControl: true,
        fadeAnimation: false,
        markerZoomAnimation: false,
        zoomAnimation: false,
        ...(siteFillRef.current ? { zoomSnap: 0.25 } : {}),
      });
      if (siteFillRef.current) {
        // Any move the map did not make itself is the reader's.
        map.on("movestart zoomstart", () => {
          if (!fittingRef.current) touchedRef.current = true;
        });
      }
      warnIfFallbackTiles();
      L.tileLayer(MAP_TILE_URL, { ...MAP_TILE_OPTIONS }).addTo(map);
      mapRef.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);
      leafletRef.current = L;
      // Full screen and back, or a panel resized: the tiles follow the box,
      // the view stays where it was.
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          fittingRef.current = true;
          map.invalidateSize({ animate: false });
          lockRef.current();
          fittingRef.current = false;
          // Full screen, a taller frame, a phone turned: the site fills the
          // new size too, while the reader has not moved the map (JB222-2).
          if (siteFillRef.current && !touchedRef.current) fitRef.current?.();
        });
        observer.observe(container);
      }
      setReady(true);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      lockRef.current = () => {};
      layerGroupRef.current = null;
      leafletRef.current = null;
      mapRef.current?.stop();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [container]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerGroupRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !layers || !L) return;

    layers.clearLayers();

      const visibleZones: LocationMapZone[] = [
        ...(radiusM && radiusM > 0
          ? [{ id: "primary", center, radiusM, label: "Geofence" }]
          : []),
        ...zones,
      ];
      visibleZones.forEach((zone) => {
        const color = zone.color ?? MAP_PRIMARY;
        if (zone.points && zone.points.length >= 3) {
          L.polygon(zone.points, {
            color,
            fillColor: color,
            fillOpacity: 0.08,
            weight: 2,
            dashArray: zone.dashed ? "6 6" : undefined,
          }).addTo(layers).bindTooltip(zone.label ?? "Geofence");
        } else if (zone.center && zone.radiusM) {
          L.circle(zone.center, {
            radius: zone.radiusM,
            color,
            fillColor: color,
            fillOpacity: 0.08,
            weight: 2,
            dashArray: zone.dashed ? "6 6" : undefined,
          }).addTo(layers).bindTooltip(zone.label ?? "Geofence");
        }
      });

      const bounds = L.latLngBounds([]);
      visibleZones.forEach((zone) => {
        if (zone.center) bounds.extend(zone.center);
        zone.points?.forEach((point) => bounds.extend(point));
      });
      paths.forEach((path) => {
        if (path.points.length < 2) return;
        const line = L.polyline(path.points, {
          color: path.color ?? MAP_PRIMARY,
          weight: path.dashed ? 3 : 4,
          opacity: path.dashed ? 0.55 : 0.75,
          dashArray: path.dashed ? "6 8" : undefined,
        }).addTo(layers);
        if (path.label) line.bindTooltip(path.label);
        path.points.forEach((point) => bounds.extend(point));
      });
      markers.forEach((marker) => {
        const color =
          marker.tone === "danger"
            ? "var(--tone-rose)"
            : marker.tone === "warning"
              ? "var(--tone-amber)"
              : marker.tone === "positive"
                ? "var(--tone-green)"
                : marker.tone === "info"
                  ? "var(--tone-purple)"
                  : marker.tone === "neutral"
                    ? "var(--tone-slate)"
                    : "var(--tone-cyan)";
        const icon = L.divIcon({
          className: "mse-map-marker",
          html: `<span style="--marker-color:${color};${marker.stale ? "opacity:.5;" : ""}${markerCount(marker) ? "position:relative;" : ""}">${renderToStaticMarkup(
            createElement(markerIcon(marker.icon), {
              size: 17,
              strokeWidth: 2.5,
              "aria-hidden": true,
            }),
          )}${markerCount(marker)}</span>${markerCaption(marker)}`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const point = L.marker([marker.latitude, marker.longitude], {
          icon,
          ...(popups ? {} : { title: marker.label, alt: marker.label }),
        }).addTo(layers);
        if (popups) {
          point.bindPopup(
            `<strong>${escapeHtml(marker.label)}</strong>${marker.detail ? `<br>${escapeHtml(marker.detail)}` : ""}`,
          );
        }
        point.on("click", () => onMarkerClickRef.current?.(marker.id));
        bounds.extend(point.getLatLng());
      });

      // A site's map: its room first, since Leaflet will not show a place
      // outside the old one (JB111).
      const siteBox = lockToSite
        ? siteViewBox(visibleZones.map((zone) => ({ points: zone.points, center: zone.center, radiusM: zone.radiusM })))
        : null;
      lockRef.current = lockToSite ? () => lockMapToBox(map, L, siteBox) : () => {};
      fittingRef.current = true;
      lockRef.current();
      fittingRef.current = false;

      const markerBounds = L.latLngBounds([]);
      markers.forEach((marker) => markerBounds.extend([marker.latitude, marker.longitude]));

      const fitOnce = () => {
        if (siteBox) {
          // The whole fence, and only the fence (「整个图框必须完整显示已设定的工地电子围栏范围」).
          const fence = L.latLngBounds([]);
          visibleZones.forEach((zone) => {
            if (zone.points && zone.points.length >= 3) zone.points.forEach((point) => fence.extend(point));
            else if (zone.center && zone.radiusM) fence.extend(L.latLng(zone.center).toBounds(zone.radiusM * 2));
          });
          if (fence.isValid()) {
            const size = map.getSize();
            if (siteFill && size.x > 0 && size.y > 0) {
              map.fitBounds(fence, {
                maxZoom: MAP_TILE_MAX_ZOOM,
                animate: false,
                padding: sitePadding(size.x, size.y, siteFill),
              });
            } else {
              map.fitBounds(fence, { maxZoom: 17, animate: false, padding: [24, 24] });
            }
            return;
          }
        }
        const target = fitTo === "markers" && markerBounds.isValid() ? markerBounds : bounds;
        if (!target.isValid()) return;
        const southWest = target.getSouthWest();
        const northEast = target.getNorthEast();
        if (southWest.equals(northEast)) {
          map.setView(southWest, singlePointZoom, { animate: false });
        } else {
          map.fitBounds(target.pad(0.15), { maxZoom: fitMaxZoom, animate: false });
        }
      };
      const fit = () => {
        fittingRef.current = true;
        try {
          fitOnce();
        } finally {
          fittingRef.current = false;
        }
      };
      fitRef.current = fit;

      const viewKey = fitBoundsKey ?? "default";
      if (fittedKeyRef.current !== viewKey) {
        fittedKeyRef.current = viewKey;
        hasFittedRef.current = false;
      }
      if (
        markers.length > 0 ||
        paths.some((path) => path.points.length > 0) ||
        visibleZones.length > 0
      ) {
        if (!preserveViewOnDataUpdate || !hasFittedRef.current) {
          fit();
          hasFittedRef.current = true;
        }
      }
  }, [
    center,
    fitBoundsKey,
    fitMaxZoom,
    fitTo,
    lockToSite,
    markers,
    paths,
    popups,
    preserveViewOnDataUpdate,
    radiusM,
    ready,
    singlePointZoom,
    siteFill,
    zones,
  ]);

  return (
    <MapFrame
      className={`min-h-[22rem] w-full overflow-hidden border bg-muted/20 ${className}`}
      sizeKey={sizeKey}
      fitLabel={fitLabel}
      onFit={
        fitLabel
          ? () => {
              // 「回到工地范围」: and from now on the map follows its size again.
              touchedRef.current = false;
              fitRef.current?.();
            }
          : undefined
      }
      overlay={overlay}
    >
      <div ref={setContainer} className="h-full w-full" aria-label={ariaLabel} />
    </MapFrame>
  );
}

function markerIcon(icon: LocationMapMarker["icon"]) {
  if (icon === "truck") return Truck;
  if (icon === "project") return FolderKanban;
  if (icon === "recycler") return Recycle;
  if (icon === "scale") return Scale;
  if (icon === "building") return Building2;
  if (icon === "machine") return Construction;
  if (icon === "record") return ClipboardList;
  return UserRound;
}

/** The number on a merged icon (JB222), or nothing for a single thing. */
function markerCount(marker: LocationMapMarker): string {
  if (!marker.count || marker.count < 2) return "";
  return `<b class="mse-map-count">${marker.count > 99 ? "99+" : marker.count}</b>`;
}

/** The words under an icon (audit 11-20 F4), or nothing. Not a span: those are the icon. */
// A plain type on purpose: location-map-defaults.test.ts finds the maps that use the component by its tag text.
export function markerCaption(marker: { caption?: string }): string {
  if (!marker.caption) return "";
  return `<em class="mse-map-caption">${escapeHtml(marker.caption)}</em>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
