"use client";

import {
  Building2,
  FolderKanban,
  Recycle,
  Scale,
  Truck,
  UserRound,
} from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MapFrame } from "@/components/shared/map-frame";
import { MAP_PRIMARY } from "@/lib/map-palette";

import {
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
  tone?: "primary" | "positive" | "warning" | "danger";
  stale?: boolean;
  icon?: "person" | "truck" | "project" | "recycler" | "scale" | "building";
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
      });
      warnIfFallbackTiles();
      L.tileLayer(MAP_TILE_URL, { ...MAP_TILE_OPTIONS }).addTo(map);
      mapRef.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);
      leafletRef.current = L;
      // Full screen and back, or a panel resized: the tiles follow the box,
      // the view stays where it was.
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
        observer.observe(container);
      }
      setReady(true);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
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
                : "var(--tone-cyan)";
        const icon = L.divIcon({
          className: "mse-map-marker",
          html: `<span style="--marker-color:${color};${marker.stale ? "opacity:.5;" : ""}">${renderToStaticMarkup(
            createElement(markerIcon(marker.icon), {
              size: 17,
              strokeWidth: 2.5,
              "aria-hidden": true,
            }),
          )}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const point = L.marker([marker.latitude, marker.longitude], { icon })
          .addTo(layers)
          .bindPopup(
            `<strong>${escapeHtml(marker.label)}</strong>${marker.detail ? `<br>${escapeHtml(marker.detail)}` : ""}`,
          );
        point.on("click", () => onMarkerClickRef.current?.(marker.id));
        bounds.extend(point.getLatLng());
      });

      const fit = () => {
        if (!bounds.isValid()) return;
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        if (southWest.equals(northEast)) {
          map.setView(southWest, singlePointZoom, { animate: false });
        } else {
          map.fitBounds(bounds.pad(0.15), { maxZoom: 16, animate: false });
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
    markers,
    paths,
    preserveViewOnDataUpdate,
    radiusM,
    ready,
    singlePointZoom,
    zones,
  ]);

  return (
    <MapFrame
      className={`min-h-[22rem] w-full overflow-hidden border bg-muted/20 ${className}`}
      sizeKey={sizeKey}
      fitLabel={fitLabel}
      onFit={fitLabel ? () => fitRef.current?.() : undefined}
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
  return UserRound;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
