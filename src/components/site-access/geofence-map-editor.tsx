"use client";

import { useEffect, useRef, useState } from "react";

type Point = [number, number];
type Shape = "CIRCLE" | "POLYGON";

export function GeofenceMapEditor({
  shape,
  center,
  radiusM,
  points,
  onCenter,
  onPoints,
}: {
  shape: Shape;
  center?: Point;
  radiusM: number;
  points: Point[];
  onCenter: (point: Point) => void;
  onPoints: (points: Point[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const initialRenderRef = useRef(true);
  const [mapReady, setMapReady] = useState(false);

  const propsRef = useRef({ shape, center, radiusM, points, onCenter, onPoints });

  useEffect(() => {
    propsRef.current = { shape, center, radiusM, points, onCenter, onPoints };
  }, [center, onCenter, onPoints, points, radiusM, shape]);

  // Keep one Leaflet instance alive while the form changes. Recreating the map
  // after every click used to reset the viewport and made polygon input flaky.
  useEffect(() => {
    let disposed = false;

    void import("leaflet").then(({ default: L }) => {
      if (disposed || !ref.current) return;

      const initial = center ?? points[0] ?? [3.139, 101.6869];
      const map = L.map(ref.current, {
        center: initial,
        zoom: 16,
        zoomControl: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      mapRef.current = map;
      leafletRef.current = L;
      layersRef.current = L.layerGroup().addTo(map);
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const current = propsRef.current;
        const point: Point = [event.latlng.lat, event.latlng.lng];
        if (current.shape === "CIRCLE") {
          current.onCenter(point);
        } else {
          current.onPoints([...current.points, point]);
        }
      });

      const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
      observer.observe(ref.current);
      observerRef.current = observer;
      setMapReady(true);
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });

    return () => {
      disposed = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
      mapRef.current?.stop();
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
      leafletRef.current = null;
      setMapReady(false);
    };
    // The editor owns one map for its full lifetime. Form changes are rendered
    // by the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layers = layersRef.current;
    if (!mapReady || !map || !L || !layers) return;

    layers.clearLayers();
    if (shape === "CIRCLE" && center) {
      L.circle(center, {
        radius: radiusM,
        color: "#087f8c",
        fillColor: "#087f8c",
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(layers);
      map.setView(center, map.getZoom(), { animate: false });
    }

    if (shape === "POLYGON" && points.length > 0) {
      const boundary = points.length >= 3
        ? L.polygon(points, {
            color: "#087f8c",
            fillColor: "#087f8c",
            fillOpacity: 0.12,
            weight: 2,
          })
        : L.polyline(points, { color: "#087f8c", weight: 2 });
      boundary.addTo(layers);
      points.forEach((point, index) => {
        L.circleMarker(point, {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: "#087f8c",
          fillOpacity: 1,
        }).addTo(layers).bindTooltip(String(index + 1), { direction: "top" });
      });

      // Fit only when opening an existing polygon. Never fit after a click:
      // that changes the zoom and makes it look as if the map ignored the click.
      if (initialRenderRef.current && points.length >= 2) {
        map.fitBounds(boundary.getBounds().pad(0.2), { maxZoom: 17, animate: false });
      }
    }

    initialRenderRef.current = false;
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [center, mapReady, points, radiusM, shape]);

  return (
    <div
      ref={ref}
      data-testid="geofence-map-editor"
      className="geofence-map-editor relative z-0 isolate block h-72 min-h-72 w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-lg border bg-muted/20 [contain:strict]"
    />
  );
}
