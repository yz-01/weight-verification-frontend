"use client";

/**
 * The one way a photo zooms, everywhere it opens large (Lucas 11-08:
 * 「确保每个照片的放大和缩小都可以正常使用」「整个系统都照片都一样」).
 *
 * It opens whole (I21, ID44): fitted into its frame, its shape kept, never
 * blown up past its own pixels - that is 100%. 放大 / 缩小 go in steps of
 * 50% up to 400%, relative to that whole view, and only then does the frame
 * scroll, so the reader pans by scrolling (or dragging a finger). On a phone
 * two fingers pinch it too, and a sideways swipe still turns the photo while
 * it is whole. 「整张显示」 and a new photo both go back to the whole photo.
 *
 * `PhotoViewer` (record-detail-shell) keeps its own frame and uses the
 * pieces - `usePhotoZoom` and `PhotoZoomBar`; every other viewer (照片墙,
 * the evidence archive, a file preview, a clock-in photo...) uses
 * `ZoomablePhoto`, which is the frame, the photo and the bar together.
 */

import { Shrink, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 100% is the whole photo fitted in the frame (I21, ID44); 400% the most. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** What one press of 放大 / 缩小 adds or takes away. */
export const ZOOM_STEP = 0.5;

/** How far a finger has to travel for a swipe to turn the photo. */
const SWIPE_PX = 48;

export interface Size {
  width: number;
  height: number;
}

/**
 * The size a photo is drawn at to show all of it in the frame (I21, ID44):
 * its shape kept, neither side over the frame, never blown up past its own
 * pixels. The viewer's 100%; zooming multiplies this.
 */
export function fitSize(photo: Size, frame: Size): Size {
  if (photo.width <= 0 || photo.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(frame.width / photo.width, frame.height / photo.height, 1);
  return { width: photo.width * scale, height: photo.height * scale };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The enlarged photo's size: the fitted size times the zoom, so 200% is
 * twice the whole photo. Until the frame has been measured, the frame's
 * width stands in. `flexShrink: 0`: the frame is a flex row, and a flex item
 * shrinks back to its own pixels - so 400% stopped at about 150% (Lucas
 * 11-08: 「照片为什么只能放大150%，我增加去400%都没有变化」).
 */
export function enlargedStyle(fitted: Size | null, zoom: number): React.CSSProperties {
  return fitted
    ? {
        width: `${fitted.width * zoom}px`,
        height: `${fitted.height * zoom}px`,
        maxWidth: "none",
        maxHeight: "none",
        flexShrink: 0,
      }
    : { width: `${zoom * 100}%`, height: "auto", maxWidth: "none", maxHeight: "none", flexShrink: 0 };
}

/** The frame's classes: centred and still while whole, scrolling once enlarged. */
export function zoomFrameClass(whole: boolean): string {
  return whole ? "items-center justify-center overflow-hidden" : "overflow-auto";
}

/**
 * Zoom state for one photo at `url`: the zoom, the frame's measured size,
 * the photo's own pixels, and the enlarged style. A new `url` goes back to
 * the whole photo.
 */
export function usePhotoZoom(url: string, { onNatural }: { onNatural?: (size: Size) => void } = {}) {
  const [zoom, setZoomState] = useState(MIN_ZOOM);
  const [seenUrl, setSeenUrl] = useState(url);
  if (seenUrl !== url) {
    setSeenUrl(url);
    setZoomState(MIN_ZOOM);
  }
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  // The photo's own pixels, kept with the address they belong to so the
  // next photo is never sized by the last one's shape.
  const [natural, setNatural] = useState<(Size & { url: string }) | null>(null);

  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(([entry]) => {
      if (entry) setFrame({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const loaded = natural && natural.url === url ? natural : null;
  const fitted = frame && loaded ? fitSize(loaded, frame) : null;
  const whole = zoom <= MIN_ZOOM;
  const setZoom = (next: number) => setZoomState(clampZoom(next));

  // Two fingers pinch (a bonus on a phone; the buttons are the way).
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const spread = (touches: React.TouchList) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  return {
    zoom,
    whole,
    frameRef,
    natural: loaded,
    fitted,
    enlarged: enlargedStyle(fitted, zoom),
    setZoom,
    step: (by: number) => setZoomState((current) => clampZoom(current + by)),
    reset: () => setZoomState(MIN_ZOOM),
    onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => {
      const size = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
      setNatural({ url, ...size });
      if (size.width > 0 && size.height > 0) onNatural?.(size);
    },
    pinchStart: (event: React.TouchEvent) => {
      pinch.current = event.touches.length === 2 ? { distance: spread(event.touches), zoom } : null;
    },
    pinchMove: (event: React.TouchEvent) => {
      const from = pinch.current;
      if (!from || event.touches.length !== 2 || from.distance <= 0) return;
      setZoomState(clampZoom(from.zoom * (spread(event.touches) / from.distance)));
    },
    pinchEnd: (event: React.TouchEvent) => {
      if (event.touches.length < 2) pinch.current = null;
    },
  };
}

/** 缩小 · n% · 放大 · 整张显示 - under the photo, never over its stamped strip. */
export function PhotoZoomBar({
  zoom,
  onStep,
  onFit,
  className,
}: {
  zoom: number;
  onStep: (by: number) => void;
  onFit: () => void;
  className?: string;
}) {
  const t = useTranslations("recordShell");
  return (
    <div data-photo-zoom-bar className={cn("flex shrink-0 items-center justify-center gap-1", className)}>
      <Button
        size="sm"
        variant="outline"
        title={t("zoomOut")}
        aria-label={t("zoomOut")}
        disabled={zoom <= MIN_ZOOM}
        disabledReason={t("zoomOut")}
        onClick={() => onStep(-ZOOM_STEP)}
      >
        <ZoomOut />
      </Button>
      <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
      <Button
        size="sm"
        variant="outline"
        title={t("zoomIn")}
        aria-label={t("zoomIn")}
        disabled={zoom >= MAX_ZOOM}
        disabledReason={t("zoomIn")}
        onClick={() => onStep(ZOOM_STEP)}
      >
        <ZoomIn />
      </Button>
      <Button size="sm" variant="ghost" title={t("fitWhole")} data-photo-fit-whole onClick={onFit}>
        <Shrink />
        {t("fitWhole")}
      </Button>
    </div>
  );
}

/**
 * One photo in a frame that zooms, with the zoom bar under it. The frame
 * needs a height of its own: a fixed height or an aspect ratio in
 * `frameClassName`, or `fill` with a block (`className`) that has one.
 */
export function ZoomablePhoto({
  src,
  alt,
  className,
  frameClassName,
  imgProps,
  onSwipe,
  fill = false,
  children,
}: {
  src: string;
  alt: string;
  /** The whole block: frame, then bar. */
  className?: string;
  /** The frame's size and surface. */
  frameClassName?: string;
  /** `data-*` marks a screen's tests look for. */
  imgProps?: Record<`data-${string}`, string | boolean | undefined>;
  /** A sideways swipe while the photo is whole: 1 the next, -1 the one before. */
  onSwipe?: (by: 1 | -1) => void;
  /** Fill the height `className` gives the block, the bar at its foot. */
  fill?: boolean;
  /** Laid over the frame, e.g. 上一张 / 下一张 arrows. */
  children?: React.ReactNode;
}) {
  const { zoom, whole, frameRef, enlarged, step, reset, onLoad, pinchStart, pinchMove, pinchEnd } =
    usePhotoZoom(src);
  const swipe = useRef<number | null>(null);
  return (
    <div data-zoomable-photo className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className={cn("relative min-w-0", fill && "min-h-0 flex-1")}>
        <div
          ref={frameRef}
          data-photo-frame={whole ? "whole" : "zoomed"}
          className={cn(
            "flex max-w-full touch-pan-x touch-pan-y",
            fill && "absolute inset-0",
            zoomFrameClass(whole),
            frameClassName,
          )}
          onTouchStart={(event) => {
            pinchStart(event);
            swipe.current = whole && event.touches.length === 1 ? event.touches[0].clientX : null;
          }}
          onTouchMove={(event) => {
            pinchMove(event);
            if (event.touches.length > 1) swipe.current = null;
          }}
          onTouchEnd={(event) => {
            pinchEnd(event);
            const from = swipe.current;
            swipe.current = null;
            const to = event.changedTouches[0]?.clientX;
            if (from === null || to === undefined || !onSwipe) return;
            if (to - from <= -SWIPE_PX) onSwipe(1);
            else if (to - from >= SWIPE_PX) onSwipe(-1);
          }}
        >
          {/* A plain img: the stamped copy as the record holds it. Whole, it
              is fitted (object-contain - never cut, never stretched); enlarged,
              it is a size, which scrolls. `m-auto` centres it while it is
              smaller than the frame and lets it scroll from its edge once it
              is larger. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={alt}
            {...imgProps}
            data-photo-zoom={Math.round(zoom * 100)}
            onLoad={onLoad}
            style={whole ? undefined : enlarged}
            className={cn(
              "block",
              whole ? "max-h-full max-w-full object-contain" : "m-auto object-contain",
            )}
          />
        </div>
        {children}
      </div>
      <PhotoZoomBar zoom={zoom} onStep={step} onFit={reset} />
    </div>
  );
}
