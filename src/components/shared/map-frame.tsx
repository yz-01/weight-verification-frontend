"use client";

import { LocateFixed, Maximize2, Minimize2 } from "lucide-react";
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
export function MapFrame({
  className,
  fitLabel,
  onFit,
  children,
}: {
  className?: string;
  fitLabel?: string;
  onFit?: () => void;
  /** The map's own container, which fills the frame. */
  children: ReactNode;
}) {
  const t = useTranslations("mapFrame");
  const slotRef = useRef<HTMLDivElement>(null);
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
      slotRef.current?.appendChild(holder);
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
      slot?.appendChild(holder);
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
    <div ref={slotRef} data-map-frame={mode} className={cn("relative", className)}>
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
    </div>
  );
}
