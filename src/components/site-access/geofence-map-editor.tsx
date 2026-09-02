"use client";

import { useEffect, useRef, useState } from "react";

import {
  MAP_TILE_OPTIONS,
  MAP_TILE_URL,
  warnIfFallbackTiles,
} from "@/lib/map-tiles";

type Point = [number, number];
type Shape = "CIRCLE" | "POLYGON";

export function GeofenceMapEditor({
  shape,
  center,
  radiusM,
  points,
  drawingEnabled,
  onCenter,
  onPoints,
}: {
  shape: Shape;
  center?: Point;
  radiusM: number;
  points: Point[];
  drawingEnabled?: boolean;
  onCenter: (point: Point) => void;
  onPoints: (points: Point[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const initialRenderRef = useRef(true);
  const previousDrawingRef = useRef(drawingEnabled);
  const [mapReady, setMapReady] = useState(false);

  const propsRef = useRef({ shape, center, radiusM, points, drawingEnabled, onCenter, onPoints });

  useEffect(() => {
    propsRef.current = { shape, center, radiusM, points, drawingEnabled, onCenter, onPoints };
  }, [center, drawingEnabled, onCenter, onPoints, points, radiusM, shape]);

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
      warnIfFallbackTiles();
      L.tileLayer(MAP_TILE_URL, {
        ...MAP_TILE_OPTIONS,
        // Drawing tuning, specific to this editor: the extra buffer and the
        // eager updates keep tiles under the cursor while a polygon is being
        // placed. Unrelated to which provider serves them.
        keepBuffer: 4,
        updateWhenIdle: false,
        updateWhenZooming: true,
      }).addTo(map);

      mapRef.current = map;
      leafletRef.current = L;
      layersRef.current = L.layerGroup().addTo(map);
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const current = propsRef.current;
        const point: Point = [event.latlng.lat, event.latlng.lng];
        if (current.shape === "CIRCLE") {
          current.onCenter(point);
        } else if (current.drawingEnabled) {
          current.onPoints([...current.points, point]);
        }
      });

      let resizeFrame = 0;
      const refreshSize = () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          map.invalidateSize({ animate: false });
          const current = propsRef.current;
          if (
            current.shape === "POLYGON" &&
            !current.drawingEnabled &&
            current.points.length >= 3
          ) {
            map.fitBounds(current.points, {
              animate: false,
              maxZoom: 17,
              padding: [24, 24],
            });
          }
        });
      };
      const observer = new ResizeObserver(refreshSize);
      observer.observe(ref.current);
      observerRef.current = observer;
      window.addEventListener("resize", refreshSize);
      setMapReady(true);
      refreshSize();
      const dialogAnimationTimer = window.setTimeout(refreshSize, 250);

      map.once("unload", () => {
        cancelAnimationFrame(resizeFrame);
        window.clearTimeout(dialogAnimationTimer);
        window.removeEventListener("resize", refreshSize);
      });
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

    if (shape === "POLYGON" && center && points.length === 0) {
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
        const marker = L.marker(point, {
          draggable: Boolean(drawingEnabled),
          icon: L.divIcon({
            className: "geofence-point-marker",
            html: `<span>${index + 1}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).addTo(layers);
        marker.on("dragend", () => {
          const current = propsRef.current;
          const next = [...current.points];
          const moved = marker.getLatLng();
          next[index] = [moved.lat, moved.lng];
          current.onPoints(next);
        });
      });

      // Fit when opening an existing polygon or when the user explicitly
      // finishes drawing. Individual clicks must not move the viewport.
      const justFinished = previousDrawingRef.current && !drawingEnabled;
      if ((initialRenderRef.current || justFinished) && points.length >= 2) {
        map.fitBounds(boundary.getBounds(), {
          maxZoom: 17,
          animate: false,
          padding: [24, 24],
        });
      }
    }

    initialRenderRef.current = false;
    previousDrawingRef.current = drawingEnabled;
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [center, drawingEnabled, mapReady, points, radiusM, shape]);

  return (
    <div
      ref={ref}
      data-testid="geofence-map-editor"
      className={`geofence-map-editor relative z-0 isolate block h-72 min-h-72 w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-lg border bg-muted/20 ${shape === "POLYGON" && drawingEnabled ? "cursor-crosshair" : ""}`}
    />
  );
}
