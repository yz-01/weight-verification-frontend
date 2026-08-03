"use client";

import { useEffect, useRef } from "react";

export interface LocationMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  detail?: string;
  tone?: "primary" | "positive" | "warning" | "danger";
  stale?: boolean;
}

interface LocationMapProps {
  center?: [number, number];
  radiusM?: number | null;
  markers: LocationMapMarker[];
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [3.139, 101.6869];

export function LocationMap({
  center = DEFAULT_CENTER,
  radiusM,
  markers,
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
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      if (radiusM && radiusM > 0) {
        L.circle(center, {
          radius: radiusM,
          color: "#087f8c",
          fillColor: "#087f8c",
          fillOpacity: 0.08,
          weight: 2,
        })
          .addTo(map)
          .bindTooltip("Geofence");
      }

      const bounds = L.latLngBounds([]);
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
          html: `<span style="--marker-color:${color};${marker.stale ? "opacity:.5;" : ""}"></span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const point = L.marker([marker.latitude, marker.longitude], { icon })
          .addTo(map!)
          .bindPopup(
            `<strong>${escapeHtml(marker.label)}</strong>${marker.detail ? `<br>${escapeHtml(marker.detail)}` : ""}`,
          );
        bounds.extend(point.getLatLng());
      });

      if (markers.length > 0) {
        bounds.extend(center);
        map.fitBounds(bounds.pad(0.15), { maxZoom: 16 });
      }
    });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [center, markers, radiusM]);

  return (
    <div
      ref={containerRef}
      className={`min-h-[22rem] w-full overflow-hidden border bg-muted/20 ${className}`}
      aria-label="Location map"
    />
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
