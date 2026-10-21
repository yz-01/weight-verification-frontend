"use client";

import { GripHorizontal, LocateFixed, Maximize2, Minimize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { fullscreenMode } from "@/lib/map-view";
import { cn } from "@/lib/utils";

/** The Fullscreen API's parts this frame uses, Safari's prefixed ones too. */
interface FullscreenDocument {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
}
interface FullscreenTarget {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => void;
}

const fullscreenApi = () => document as unknown as FullscreenDocument;
const inFullscreen = () => {
  const api = fullscreenApi();
  return api.fullscreenElement ?? api.webkitFullscreenElement ?? null;
};
const noSubscription = () => () => {};

/**
 * Any map, made to fill the screen (I7, ID23: 「可以把这个地图框架放大到整个
 * 页面」). Every map in the system is drawn in one, so all of them have it.
 *
 * 「全屏」 uses the browser's own full screen where the page may have it;
 * where it may not (an iPhone gives it only to video) the map is laid over the
 * whole window instead. Esc, or 「退出全屏」, brings it back - and only that:
 * a dialog the map sits in stays open.
 *
 * The map is drawn into a node of its own that is moved, not drawn again,
 * between its place on the page and the full screen, so the map inside keeps
 * its view, its layers and its listeners. `className` is the frame's size and
 * look on the page; its place stays the same size while the map is away.
 *
 * `fitLabel` / `onFit`: a button that shows the whole fence (or route) again -
 * the one way a map is re-centred after it first opens (「回到围栏」).
 */
/** How tall a map may be dragged (J23-1), in px. */
export const MAP_MIN_HEIGHT = 240;
export const MAP_MAX_HEIGHT = 960;

export function clampMapHeight(height: number): number {
  return Math.round(Math.min(MAP_MAX_HEIGHT, Math.max(MAP_MIN_HEIGHT, height)));
}

function storedHeight(sizeKey: string | undefined): number | null {
  if (!sizeKey) return null;
  try {
    const value = Number(window.localStorage.getItem(`mse.mapHeight.${sizeKey}`));
    return Number.isFinite(value) && value > 0 ? clampMapHeight(value) : null;
  } catch {
    return null;
  }
}

export function MapFrame({
  className,
  fitLabel,
  onFit,
  sizeKey,
  children,
}: {
  className?: string;
  fitLabel?: string;
  onFit?: () => void;
  /**
   * 调整显示大小 (J23-1, Q23-1): the handle under the map drags its height,
   * remembered under this key. Only how much is seen changes - a fence's
   * coordinates are the record's, never the map's.
   */
  sizeKey?: string;
  /** The map's own container, which fills the frame. */
  children: ReactNode;
}) {
  const t = useTranslations("mapFrame");
  const slotRef = useRef<HTMLDivElement>(null);
  // The height dragged here, else the one remembered (read in the browser
  // only, so the server's render and the first client one agree).
  const [dragged, setHeight] = useState<number | null>(null);
  const remembered = useSyncExternalStore(
    noSubscription,
    () => storedHeight(sizeKey),
    () => null,
  );
  const height = dragged ?? remembered;
  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const slot = slotRef.current;
    if (!slot) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = slot.getBoundingClientRect().height;
    let latest = startHeight;
    const move = (moveEvent: PointerEvent) => {
      latest = clampMapHeight(startHeight + moveEvent.clientY - startY);
      setHeight(latest);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      if (!sizeKey) return;
      try {
        window.localStorage.setItem(`mse.mapHeight.${sizeKey}`, String(latest));
      } catch {
        // storage unavailable: the height holds until the page closes
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const nudge = (by: number) =>
    setHeight((current) => {
      const next = clampMapHeight((current ?? slotRef.current?.getBoundingClientRect().height ?? 360) + by);
      if (sizeKey) {
        try {
          window.localStorage.setItem(`mse.mapHeight.${sizeKey}`, String(next));
        } catch {
          // storage unavailable
        }
      }
      return next;
    });
  // Only in the browser: on the server, and while the page hydrates, the
  // frame is an empty box of the right size.
  const client = useSyncExternalStore(noSubscription, () => true, () => false);
  const holder = useMemo(() => {
    if (!client) return null;
    const node = document.createElement("div");
    node.className = "absolute inset-0";
    return node;
  }, [client]);
  const [mode, setMode] = useState<"off" | "native" | "overlay">("off");
  const full = mode !== "off";

  // The map's node: in its place on the page, or in the overlay.
  useLayoutEffect(() => {
    if (!holder) return;
    if (mode !== "overlay") {
      // Only when it is not there already: appending a node moves it, and a
      // node taken out of the page leaves the browser's full screen - the
      // 「全屏」 press went full screen and straight back (Lucas 10/17).
      if (holder.parentNode !== slotRef.current) slotRef.current?.appendChild(holder);
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-[200] bg-background";
    // Over a dialog the page behind takes no presses; the map does.
    overlay.style.pointerEvents = "auto";
    // A press or focus on the map is not one "outside" the dialog it came
    // from, which would close it.
    const keep = (event: Event) => event.stopPropagation();
    overlay.addEventListener("pointerdown", keep);
    overlay.addEventListener("focusin", keep);
    overlay.appendChild(holder);
    document.body.appendChild(overlay);
    const slot = slotRef.current;
    return () => {
      if (holder.parentNode !== slot) slot?.appendChild(holder);
      overlay.remove();
    };
  }, [holder, mode]);

  // The browser's full screen came or went - by Esc, or its own controls.
  useEffect(() => {
    if (!holder) return;
    const onChange = () => {
      const current = inFullscreen();
      setMode((was) => (current === holder ? "native" : was === "native" ? "off" : was));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      // Leaving the page in full screen leaves full screen too.
      if (inFullscreen() === holder) {
        const api = fullscreenApi();
        void (api.exitFullscreen ? api.exitFullscreen().catch(() => undefined) : api.webkitExitFullscreen?.());
      }
    };
  }, [holder]);

  const enter = () => {
    if (!holder) return;
    const target = holder as unknown as FullscreenTarget;
    if (fullscreenMode(target, fullscreenApi()) === "overlay") {
      setMode("overlay");
      return;
    }
    try {
      const asked = target.requestFullscreen ? target.requestFullscreen() : target.webkitRequestFullscreen?.();
      // Refused (a policy, an iframe): the overlay does the same job.
      Promise.resolve(asked).catch(() => setMode("overlay"));
    } catch {
      setMode("overlay");
    }
  };

  const leave = useCallback(() => {
    if (holder && inFullscreen() === holder) {
      const api = fullscreenApi();
      void (api.exitFullscreen ? api.exitFullscreen().catch(() => undefined) : api.webkitExitFullscreen?.());
      return;
    }
    setMode("off");
  }, [holder]);

  // Esc leaves full screen, and is not passed on to a dialog under the map.
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      leave();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [full, leave]);

  return (
    <div
      ref={slotRef}
      data-map-frame={mode}
      className={cn("relative isolate", className)}
      style={height ? { height, minHeight: height } : undefined}
    >
      {holder &&
        createPortal(
          <div className={cn("absolute inset-0", full && "bg-background")}>
            {children}
            <div className="absolute top-2 right-2 z-10 flex flex-wrap items-center justify-end gap-1.5">
              {onFit && fitLabel ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 bg-card shadow-sm"
                  onClick={onFit}
                >
                  <LocateFixed />
                  {fitLabel}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 bg-card shadow-sm"
                aria-pressed={full}
                onClick={full ? leave : enter}
              >
                {full ? <Minimize2 /> : <Maximize2 />}
                {full ? t("exitFullscreen") : t("fullscreen")}
              </Button>
            </div>
          </div>,
          holder,
        )}
      {/* 调整显示大小 (J23-1): drag, or arrow keys, to make the map taller. */}
      {!full ? (
        <button
          type="button"
          aria-label={t("resize")}
          title={t("resize")}
          data-map-resize
          onPointerDown={startDrag}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              nudge(40);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              nudge(-40);
            }
          }}
          className="absolute inset-x-0 bottom-0 z-[401] mx-auto flex h-4 w-16 cursor-ns-resize touch-none items-center justify-center rounded-t-md bg-card/90 text-muted-foreground shadow-sm hover:text-foreground"
        >
          <GripHorizontal className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
