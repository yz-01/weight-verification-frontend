"use client";

import { useEffect, useRef, useState } from "react";

import { MapFrame } from "@/components/shared/map-frame";
import { MAP_PRIMARY } from "@/lib/map-palette";
import { fitsOnResize, geofenceClick, pointsDraggable } from "@/lib/map-view";

import {
  MAP_TILE_OPTIONS,
  MAP_TILE_URL,
  warnIfFallbackTiles,
} from "@/lib/map-tiles";

type Point = [number, number];
type Shape = "CIRCLE" | "POLYGON";

/**
 * The geofence drawn on a map (I7, ID23: 「设定好电子围栏地图就不要被动了」).
 *
 * - A click edits the fence only while `editing` (the 「编辑围栏」 switch): it
 *   moves the circle's centre, or adds a polygon point while drawing; the
 *   numbered points drag only then too.
 * - The map moves by itself only to show the fence when there first is one,
 *   and when asked: 「回到围栏」, or `fitSignal` changing (the project's
 *   location or the phone's GPS was just put in). Clicks, typing, drawing and
 *   resizing leave the view where the reader put it.
 * - 「全屏」 fills the screen with it (`MapFrame`).
 */
export function GeofenceMapEditor({
  shape,
  center,
  radiusM,
  points,
  drawingEnabled,
  editing,
  fitSignal = 0,
  backLabel,
  onCenter,
  onPoints,
}: {
  shape: Shape;
  center?: Point;
  radiusM: number;
  points: Point[];
  drawingEnabled?: boolean;
  /** The 「编辑围栏」 switch: while it is off a click changes nothing. */
  editing: boolean;
  /** Bumped by the form when the reader put in a new place to look at. */
  fitSignal?: number;
  /** 「回到围栏」. */
  backLabel: string;
  onCenter: (point: Point) => void;
  onPoints: (points: Point[]) => void;
}) {
  // The map's node, inside the frame that can fill the screen. Held as state
  // so the map is made once the node exists.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);
  // Whether the fence has been shown once, and whether the reader has moved
  // the map since it opened (from then on a resize keeps their view).
  const fittedRef = useRef(false);
  const touchedRef = useRef(false);
  const fitSignalRef = useRef(fitSignal);
  /** Shows the whole fence: the polygon, the circle, or the centre alone. */
  const fitFenceRef = useRef<() => void>(() => {});
  const [mapReady, setMapReady] = useState(false);

  const propsRef = useRef({ shape, center, radiusM, points, drawingEnabled, editing, onCenter, onPoints });

  useEffect(() => {
    propsRef.current = { shape, center, radiusM, points, drawingEnabled, editing, onCenter, onPoints };
  }, [center, drawingEnabled, editing, onCenter, onPoints, points, radiusM, shape]);

  // Keep one Leaflet instance alive while the form changes. Recreating the map
  // after every click used to reset the viewport and made polygon input flaky.
  useEffect(() => {
    if (!container) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let release = () => {};

    void import("leaflet").then(({ default: L }) => {
      if (disposed) return;

      const opening = propsRef.current;
      const initial = opening.center ?? opening.points[0] ?? [3.139, 101.6869];
      const map = L.map(container, {
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
      fitFenceRef.current = () => {
        const fence = propsRef.current;
        const room = { maxZoom: 17, animate: false, padding: [24, 24] as [number, number] };
        if (fence.shape === "POLYGON" && fence.points.length >= 2) {
          map.fitBounds(L.latLngBounds(fence.points), room);
        } else if (fence.shape === "CIRCLE" && fence.center && fence.radiusM > 0) {
          map.fitBounds(L.latLng(fence.center).toBounds(fence.radiusM * 2), room);
        } else if (fence.center) {
          map.setView(fence.center, map.getZoom(), { animate: false });
        }
      };
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const now = propsRef.current;
        const point: Point = [event.latlng.lat, event.latlng.lng];
        const action = geofenceClick(now.shape, now.editing, Boolean(now.drawingEnabled));
        if (action === "center") now.onCenter(point);
        else if (action === "point") now.onPoints([...now.points, point]);
      });

      // The reader's own hand on the map.
      const touched = () => {
        touchedRef.current = true;
      };
      container.addEventListener("pointerdown", touched);
      container.addEventListener("wheel", touched, { passive: true });
      container.addEventListener("touchstart", touched, { passive: true });

      const opened = Date.now();
      let resizeFrame = 0;
      const refreshSize = () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          map.invalidateSize({ animate: false });
          // While the dialog it opens in is still settling its size, keep
          // the fence in view; never once the reader has moved the map.
          if (fittedRef.current && fitsOnResize(touchedRef.current, Date.now() - opened)) {
            fitFenceRef.current();
          }
        });
      };
      observer = new ResizeObserver(refreshSize);
      observer.observe(container);
      window.addEventListener("resize", refreshSize);
      setMapReady(true);
      refreshSize();
      const dialogAnimationTimer = window.setTimeout(refreshSize, 250);

      release = () => {
        cancelAnimationFrame(resizeFrame);
        window.clearTimeout(dialogAnimationTimer);
        window.removeEventListener("resize", refreshSize);
        container.removeEventListener("pointerdown", touched);
        container.removeEventListener("wheel", touched);
        container.removeEventListener("touchstart", touched);
      };
    });

    return () => {
      disposed = true;
      release();
      observer?.disconnect();
      mapRef.current?.stop();
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
      leafletRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
  }, [container]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layers = layersRef.current;
    if (!mapReady || !map || !L || !layers) return;

    layers.clearLayers();
    if (shape === "CIRCLE" && center) {
      L.circle(center, {
        radius: radiusM,
        color: MAP_PRIMARY,
        fillColor: MAP_PRIMARY,
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(layers);
    }

    if (shape === "POLYGON" && points.length > 0) {
      const boundary = points.length >= 3
        ? L.polygon(points, {
            color: MAP_PRIMARY,
            fillColor: MAP_PRIMARY,
            fillOpacity: 0.12,
            weight: 2,
          })
        : L.polyline(points, { color: MAP_PRIMARY, weight: 2 });
      boundary.addTo(layers);
      const draggable = pointsDraggable(editing, Boolean(drawingEnabled));
      points.forEach((point, index) => {
        const marker = L.marker(point, {
          draggable,
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
    }

    // The fence is shown once, when there first is one to show. After that
    // the view is the reader's: clicks, typing and drawing do not move it.
    if (!fittedRef.current && (center || points.length > 0)) {
      fitFenceRef.current();
      fittedRef.current = true;
    }
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [center, drawingEnabled, editing, mapReady, points, radiusM, shape]);

  // A new place to look at, put in by the reader (the project's location,
  // the phone's GPS): drawn by the effect above, then shown.
  useEffect(() => {
    if (!mapReady || fitSignalRef.current === fitSignal) return;
    fitSignalRef.current = fitSignal;
    const frame = requestAnimationFrame(() => fitFenceRef.current());
    return () => cancelAnimationFrame(frame);
  }, [fitSignal, mapReady]);

  return (
    <MapFrame
      sizeKey="geofence-editor"
      className="geofence-map-editor relative z-0 isolate block h-72 min-h-72 w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-lg border bg-muted/20"
      fitLabel={backLabel}
      onFit={() => fitFenceRef.current()}
    >
      <div
        ref={setContainer}
        data-testid="geofence-map-editor"
        className={`h-full w-full ${editing && shape === "POLYGON" && drawingEnabled ? "cursor-crosshair" : ""}`}
      />
    </MapFrame>
  );
}
