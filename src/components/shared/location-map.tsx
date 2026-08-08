"use client";

import {
  Building2,
  FolderKanban,
  Recycle,
  Scale,
  Truck,
  UserRound,
} from "lucide-react";
import { createElement, useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
}

export interface LocationMapZone {
  id: string;
  center?: [number, number];
  radiusM?: number;
  points?: Array<[number, number]>;
  label?: string;
  color?: string;
}

interface LocationMapProps {
  center?: [number, number];
  radiusM?: number | null;
  markers: LocationMapMarker[];
  paths?: LocationMapPath[];
  zones?: LocationMapZone[];
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [3.139, 101.6869];

export function LocationMap({
  center = DEFAULT_CENTER,
  radiusM,
  markers,
  paths = [],
  zones = [],
  className = "",
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | null = null;

    void import("leaflet").then(({ default: L }) => {
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center,
        zoom: 15,
        zoomControl: true,
        attributionControl: true,
        fadeAnimation: false,
        markerZoomAnimation: false,
        zoomAnimation: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map!);

      const visibleZones: LocationMapZone[] = [
        ...(radiusM && radiusM > 0
          ? [{ id: "primary", center, radiusM, label: "Geofence" }]
          : []),
        ...zones,
      ];
      visibleZones.forEach((zone) => {
        const color = zone.color ?? "#087f8c";
        if (zone.points && zone.points.length >= 3) {
          L.polygon(zone.points, {
            color,
            fillColor: color,
            fillOpacity: 0.08,
            weight: 2,
          }).addTo(map!).bindTooltip(zone.label ?? "Geofence");
        } else if (zone.center && zone.radiusM) {
          L.circle(zone.center, {
            radius: zone.radiusM,
            color,
            fillColor: color,
            fillOpacity: 0.08,
            weight: 2,
          }).addTo(map!).bindTooltip(zone.label ?? "Geofence");
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
          color: path.color ?? "#087f8c",
          weight: 4,
          opacity: 0.75,
        }).addTo(map!);
        if (path.label) line.bindTooltip(path.label);
        path.points.forEach((point) => bounds.extend(point));
      });
      markers.forEach((marker) => {
        const color =
          marker.tone === "danger"
            ? "#c2410c"
            : marker.tone === "warning"
              ? "#b7791f"
              : marker.tone === "positive"
                ? "#16825d"
                : "#087f8c";
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
          .addTo(map!)
          .bindPopup(
            `<strong>${escapeHtml(marker.label)}</strong>${marker.detail ? `<br>${escapeHtml(marker.detail)}` : ""}`,
          );
        bounds.extend(point.getLatLng());
      });

      if (
        markers.length > 0 ||
        paths.some((path) => path.points.length > 0) ||
        visibleZones.length > 0
      ) {
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        if (southWest.equals(northEast)) {
          map.setView(southWest, 16, { animate: false });
        } else {
          map.fitBounds(bounds.pad(0.15), { maxZoom: 16, animate: false });
        }
      }
    });

    return () => {
      disposed = true;
      map?.stop();
      map?.remove();
    };
  }, [center, markers, paths, radiusM, zones]);

  return (
    <div
      ref={containerRef}
      className={`min-h-[22rem] w-full overflow-hidden border bg-muted/20 ${className}`}
      aria-label="Location map"
    />
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
