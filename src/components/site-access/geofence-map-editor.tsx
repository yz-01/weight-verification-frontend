"use client";

import { useEffect, useRef } from "react";

export function GeofenceMapEditor({
  shape,
  center,
  radiusM,
  points,
  onCenter,
  onPoints,
}: {
  shape: "CIRCLE" | "POLYGON";
  center?: [number, number];
  radiusM: number;
  points: Array<[number, number]>;
  onCenter: (point: [number, number]) => void;
  onPoints: (points: Array<[number, number]>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | null = null;
    let observer: ResizeObserver | null = null;
    void import("leaflet").then(({ default: L }) => {
      if (disposed || !ref.current) return;
      const initial = center ?? points[0] ?? [3.139, 101.6869];
      map = L.map(ref.current, { center: initial, zoom: 16, zoomAnimation: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      if (shape === "CIRCLE" && center) {
        L.circle(center, { radius: radiusM, color: "#087f8c", fillOpacity: 0.1 }).addTo(map);
      }
      if (shape === "POLYGON" && points.length) {
        const layer = points.length > 2
          ? L.polygon(points, { color: "#087f8c", fillOpacity: 0.1 }).addTo(map)
          : L.polyline(points, { color: "#087f8c" }).addTo(map);
        map.fitBounds(layer.getBounds().pad(0.2), { maxZoom: 17, animate: false });
        points.forEach((point, index) => L.circleMarker(point, { radius: 5 }).addTo(map!).bindTooltip(String(index + 1)));
      }
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const point: [number, number] = [event.latlng.lat, event.latlng.lng];
        if (shape === "CIRCLE") onCenter(point);
        else onPoints([...points, point]);
      });
      observer = new ResizeObserver(() => map?.invalidateSize({ animate: false }));
      observer.observe(ref.current);
      requestAnimationFrame(() => map?.invalidateSize({ animate: false }));
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [center, onCenter, onPoints, points, radiusM, shape]);

  return (
    <div
      ref={ref}
      className="relative isolate h-72 min-h-72 min-w-0 max-w-full overflow-hidden rounded-lg border bg-muted/20 [contain:layout_paint]"
    />
  );
}
