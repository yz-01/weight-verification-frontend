"use client";

import { Camera, CameraIcon, Loader2, RefreshCw, SwitchCamera, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applicationPhotoCanvas, startOriginal } from "@/lib/original-capture";
import {
  applyZoom,
  findWideLens,
  readWidePreference,
  writeWidePreference,
  zoomFor,
  zoomRange,
  type WideLens,
} from "@/lib/camera-lens";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canvasJpeg, encodeWithinTarget, markAtUploadSize } from "@/lib/photo-compression";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FacingMode = "user" | "environment";

/**
 * What the camera stream is asked for (J45: every photo square).
 *
 * The photo is the centre square of the frame, so its side is the frame's
 * short side. 4:3 is the shape of a phone's sensor: a 1920 x 1440 stream uses
 * the whole sensor and gives a 1440 px square, where the old 1920 x 1080 ask
 * gave 1080. Only `ideal`, so a camera without a 4:3 mode still picks its
 * nearest - in practice 1920 x 1080, which is a 1080 px square, as sharp as
 * the photos were before (a 16:9 frame keeps 56% of its long side in the
 * square, a 4:3 one 75%). Not 1920 x 1920: no phone camera streams square,
 * and browsers then choose odd modes to get near it.
 */
export const SQUARE_SOURCE = {
  width: { ideal: 1920 },
  height: { ideal: 1440 },
  aspectRatio: { ideal: 4 / 3 },
} as const;

/**
 * Where the kept square sits in a viewfinder that shows the video with
 * `object-cover`, as fractions (0-1] of the viewfinder's width and height,
 * centred.
 *
 * The photo is always the centre square of the whole camera frame (J45,
 * `centreSquare`) - never just the part the screen happens to show. On the
 * desktop the viewfinder is itself that square, so this is the whole box. On
 * a phone the viewfinder is the whole screen (client 2026-11-09 item 7:
 * 「直接改成手机全屏取景」): an upright screen is taller than the frame, so
 * the frame's sides run off the screen and the square becomes a band across
 * it. Outside the band is dimmed - that part is on screen but not kept.
 */
export function keptSquareInView(
  videoWidth: number,
  videoHeight: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { width: 1, height: 1 };
  }
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const side = Math.min(videoWidth, videoHeight) * scale;
  return { width: Math.min(side / boxWidth, 1), height: Math.min(side / boxHeight, 1) };
}

interface FieldCameraProps {
  label: string;
  fileCount?: number;
  /**
   * The photograph this tile holds, shown as a thumbnail.
   *
   * Until this existed the tile said "1 photo(s) ready" and drew a camera
   * icon, which looks exactly like an empty slot. A worker could not see what
   * they had taken, so they could not tell a usable photograph of a delivery
   * note from a blurred one - and retaking, which has always worked by
   * pressing the tile again, did not look like it did anything either
   * (2026-09-05).
   *
   * Optional: several callers hold a list rather than one file and keep
   * passing only `fileCount`.
   */
  file?: File;
  /**
   * A photograph the server already holds, shown as a thumbnail.
   *
   * The sibling of `file`, for callers whose photographs are uploaded the
   * moment they are taken and are therefore no longer a `File` on this
   * device: the disposal screens post each shot immediately and then re-read
   * the record. They had no way to show one back, so both the external
   * collector's temporary link and the internal execution screen drew an
   * empty-looking camera tile after a successful upload (F-289).
   *
   * Preferred over keeping the local `File` for those callers, because this
   * one survives a reload - which matters most to the external company, who
   * open a link on a phone with a poor connection.
   */
  previewUrl?: string;
  facingMode?: FacingMode;
  /**
   * "button" draws a plain button instead of the photo tile, for a screen
   * that offers the camera beside other ways of adding a file (the desktop
   * attachment picker, I3). The dialog and the camera handling are the same.
   */
  trigger?: "tile" | "button";
  /** The button trigger's icon, in place of the camera (e.g. a tick once done). */
  icon?: React.ReactNode;
  /** The button trigger's size (`Button`'s own). */
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
  className?: string;
  onCapture: (file: File) => void;
  onClear?: () => void;
}

export function FieldCamera({
  label,
  fileCount = 0,
  file,
  previewUrl: storedPreviewUrl,
  facingMode = "environment",
  trigger = "tile",
  icon,
  size,
  disabled = false,
  className = "",
  onCapture: handOver,
  onClear,
}: FieldCameraProps) {
  const t = useTranslations("fieldStaffPwa.camera");
  const commonT = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [facing, setFacing] = useState<FacingMode>(facingMode);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  // The kept square's share of the viewfinder (`keptSquareInView`).
  const [kept, setKept] = useState({ width: 1, height: 1 });
  const streamRef = useRef<MediaStream | null>(null);
  // 「广角」 (J45): off unless the worker turned it on on this phone; the
  // switch shows only when the phone has a wide lens (`lib/camera-lens`).
  const [wide, setWide] = useState(false);
  const [lens, setLens] = useState<WideLens | null>(null);
  const wideRef = useRef(false);

  function openCamera() {
    setFacing(facingMode);
    const remembered = readWidePreference();
    wideRef.current = remembered;
    setWide(remembered);
    setOpen(true);
  }
  // An ultra-wide that is its own camera is opened instead of the normal one.
  const wideDeviceId = facing === "environment" && wide && lens?.kind === "device" ? lens.deviceId : "";

  // Derived rather than stored, so the thumbnail is right on the render that
  // receives the photograph rather than one render later.
  const blobUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file],
  );
  // A local file wins: it is the shot just taken, and on a slow link it is on
  // screen well before the server's copy can be read back.
  const previewUrl = blobUrl || storedPreviewUrl || "";
  // A blob URL is a handle the page owns, so it has to be released when the
  // photograph is replaced or the tile goes away. Leaving them to accumulate
  // pins every retaken shot in memory for the life of the page, on the one
  // device least able to spare it.
  useEffect(() => {
    if (!blobUrl) return;
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    stopCamera();

    const start = async () => {
      setStarting(true);
      setReady(false);
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("unsupported"));
        setStarting(false);
        return;
      }
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: wideDeviceId
              ? { deviceId: { exact: wideDeviceId }, ...SQUARE_SOURCE }
              : { facingMode: { ideal: facing }, ...SQUARE_SOURCE },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("video_unavailable");
        }
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.srcObject = stream;
        await waitForVideoReady(video);
        await video.play();
        // The wide lens, found once the camera is open (labels and zoom are
        // only readable then). Kept as it is while the ultra-wide device is
        // the one open, so the switch does not flip itself back.
        if (!wideDeviceId) {
          const track = stream.getVideoTracks()[0];
          let devices: MediaDeviceInfo[] = [];
          try {
            devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
          } catch {
            devices = [];
          }
          if (cancelled) return;
          const found = findWideLens(
            zoomRange(track),
            facing === "environment" ? devices : [],
          );
          setLens(found);
          // Normal (1x) is the camera's own start; only wide is set.
          if (found?.kind === "zoom" && wideRef.current) {
            await applyZoom(track, zoomFor(found, true));
          }
        }
        setReady(true);
      } catch {
        setError(t("permissionError"));
      } finally {
        setStarting(false);
      }
    };
    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [facing, open, stopCamera, t, wideDeviceId]);

  // Measured again whenever the frame or the screen changes shape (a phone
  // turned, the address bar sliding away).
  useEffect(() => {
    if (!open || !ready) return;
    const video = videoRef.current;
    const box = viewfinderRef.current;
    if (!video || !box) return;
    const measure = () =>
      setKept(keptSquareInView(video.videoWidth, video.videoHeight, box.clientWidth, box.clientHeight));
    measure();
    video.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      video.removeEventListener("resize", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, ready]);

  function closeCamera() {
    stopCamera();
    setReady(false);
    setOpen(false);
  }

  function toggleWide() {
    const next = !wide;
    wideRef.current = next;
    setWide(next);
    writeWidePreference(next);
    // A zoom lens switches in place; a separate ultra-wide device reopens
    // the camera through `wideDeviceId`.
    if (lens?.kind === "zoom") {
      void applyZoom(streamRef.current?.getVideoTracks()[0], zoomFor(lens, next));
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth || !video.videoHeight) return;
    // The original (H5 三, WP1): this frame at full resolution and high
    // quality, kept apart. The photo below is handed over as before, under a
    // name that carries the original's id (`lib/original-capture`).
    const original = startOriginal(video, facing === "user");
    // Marked as at upload size: submit does not decode it again to check.
    const onCapture = (photo: File) =>
      handOver(markAtUploadSize(original ? original.attach(photo) : photo));

    // Taken at upload size (A5, A9): the same long-edge cap and quality as
    // every other photo the queue holds (`lib/photo-compression`), here at no
    // extra cost because the frame is drawn onto a canvas anyway. It also
    // keeps the DO photo that OCR reads the moment it is taken small enough
    // to get through on a weak signal. Drawn from the original's frame when
    // there is one, so both are the same moment.
    const canvas = applicationPhotoCanvas(video, facing === "user", original);
    if (!canvas) {
      setError(t("captureError"));
      return;
    }
    // At 0.8, stepped down toward 500 KB but never below the floor that keeps
    // a DO's print readable (client 2026-10-09 一.2-一.4).
    void encodeWithinTarget((quality) => canvasJpeg(canvas, quality)).then((blob) => {
      if (!blob) {
        setError(t("captureError"));
        return;
      }
      onCapture(
        new File([blob], `mse-site-${new Date().toISOString().replaceAll(":", "-")}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      );
      setOpen(false);
    });
  }

  return (
    <>
      {trigger === "button" ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          className={className}
          disabled={disabled}
          onClick={openCamera}
        >
          {icon ?? <Camera />}
          {label}
        </Button>
      ) : (
      <div className={`relative ${className}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={openCamera}
          className={`flex min-h-24 w-full flex-col items-center justify-center overflow-hidden rounded-xl text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
            previewUrl
              ? "photo-hatch border border-tone-green/50 p-0"
              : "border border-dashed border-primary/45 bg-card p-3 hover:border-primary hover:bg-primary/8 hover:shadow-glow-sm"
          }`}
        >
          {previewUrl ? (
            <span className="relative block w-full">
              {/* A blob URL cannot go through the image optimiser, and a
                  stored one is served from the API host rather than from this
                  build - so a plain <img> either way. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`${label} - ${t("preview")}`}
                className="aspect-4/3 w-full object-cover"
              />
              <span className="block bg-card px-2 py-1.5">
                <span className="block truncate text-sm font-semibold">
                  {label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("retake")}
                </span>
              </span>
            </span>
          ) : (
            <>
              <Camera className="size-7 text-tone-cyan-fg" />
              <span className="mt-2 text-sm font-semibold">{label}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {fileCount ? t("ready", { count: fileCount }) : t("open")}
              </span>
            </>
          )}
        </button>
        {(fileCount > 0 || previewUrl) && onClear ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 size-8"
            title={t("clear")}
            onClick={onClear}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            stopCamera();
            setReady(false);
          }
          setOpen(next);
        }}
      >
        {/* Full screen on a phone (client 2026-11-09 item 7): the camera fills
            the screen, the title over its top and the buttons over its
            bottom, clear of the notch and the home bar. A sized dialog with
            a square viewfinder on a desktop, as before. */}
        <DialogContent
          showCloseButton={false}
          className="max-h-[96dvh] overflow-y-auto p-4 sm:max-w-xl sm:p-6 max-sm:inset-0 max-sm:top-0 max-sm:bottom-0 max-sm:h-dvh max-sm:max-h-none max-sm:overflow-hidden max-sm:rounded-none max-sm:p-0 max-sm:pb-0 max-sm:ring-0"
        >
          <DialogHeader className="relative pr-12 max-sm:absolute max-sm:inset-x-0 max-sm:top-0 max-sm:z-10 max-sm:bg-overlay max-sm:pb-3 max-sm:pl-4 max-sm:pt-[max(0.75rem,env(safe-area-inset-top))] max-sm:text-overlay-foreground">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription className="max-sm:text-overlay-foreground/80">{t("help")}</DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-0 top-0 max-sm:right-3 max-sm:top-[max(0.75rem,env(safe-area-inset-top))] max-sm:text-overlay-foreground"
              onClick={closeCamera}
            >
              <X />
              <span className="sr-only">{commonT("close")}</span>
            </Button>
          </DialogHeader>
          {/* The video with object-cover. The photo is the centre square of
              the whole frame (J45, centreSquare) whatever the screen shows:
              on a desktop the box is that square; on a phone the box is the
              screen and the part outside the square is dimmed. Capped by
              width on a desktop - a max-height on an aspect box squashes it
              into a rectangle that shows more than the photo keeps. */}
          <div
            ref={viewfinderRef}
            data-testid="field-camera-viewfinder"
            className="relative mx-auto aspect-square w-full max-w-[60dvh] overflow-hidden rounded-lg bg-black max-sm:absolute max-sm:inset-0 max-sm:aspect-auto max-sm:max-w-none max-sm:rounded-none"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
            />
            {ready && !error && (kept.width < 1 || kept.height < 1) ? (
              <div
                data-testid="field-camera-kept"
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-overlay-foreground/70"
                style={{
                  width: `${kept.width * 100}%`,
                  height: `${kept.height * 100}%`,
                  // The theme's overlay, thinned: the part not kept stays visible.
                  boxShadow: "0 0 0 100vmax color-mix(in srgb, var(--overlay) 60%, transparent)",
                }}
              />
            ) : null}
            {starting ? (
              <div className="absolute inset-0 grid place-items-center bg-overlay text-overlay-foreground">
                <Loader2 className="size-8 animate-spin" />
              </div>
            ) : null}
            {ready && !error ? (
              <WideLensSwitch
                lens={lens}
                wide={wide}
                label={t("wide")}
                onToggle={toggleWide}
                className="max-sm:top-auto max-sm:right-4 max-sm:bottom-[calc(env(safe-area-inset-bottom)+9rem)]"
              />
            ) : null}
            {error ? (
              <div className="absolute inset-0 grid place-items-center bg-overlay p-6 text-center text-sm text-overlay-foreground">
                <div>
                  <CameraIcon className="mx-auto size-9" />
                  <p className="mt-3">{error}</p>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_1fr] max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-10 max-sm:m-0 max-sm:border-0 max-sm:bg-overlay max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="col-span-2 text-center text-xs text-muted-foreground max-sm:text-overlay-foreground/80">{t("stepBack")}</p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="max-sm:size-12"
              title={t("switch")}
              disabled={starting}
              onClick={() => setFacing((value) => (value === "user" ? "environment" : "user"))}
            >
              <SwitchCamera />
            </Button>
            <Button type="button" className="h-12" disabledReason={!ready ? t("starting") : undefined}
                                                   disabled={!ready || starting} onClick={capture}>
              {ready ? <Camera /> : <RefreshCw className="animate-spin" />}
              {t("capture")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The 「广角」 switch over the viewfinder's corner (J45): nothing at all on a
 * phone without a wide lens; pressed while the wide lens is in use.
 */
export function WideLensSwitch({
  lens,
  wide,
  label,
  onToggle,
  className,
}: {
  lens: WideLens | null;
  wide: boolean;
  label: string;
  onToggle: () => void;
  /** Placement over the viewfinder, merged onto the corner default. */
  className?: string;
}) {
  if (!lens) return null;
  return (
    <button
      type="button"
      data-testid="field-camera-wide"
      aria-pressed={wide}
      onClick={onToggle}
      className={cn(
        "absolute right-2 top-2 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur transition",
        wide ? "bg-primary text-primary-foreground" : "bg-overlay text-overlay-foreground",
        className,
      )}
    >
      {label}
    </button>
  );
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("video_metadata_timeout"));
    }, 8_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
    };
    const onReady = () => {
      if (video.videoWidth <= 0) return;
      cleanup();
      resolve();
    };
    video.addEventListener("loadedmetadata", onReady, { once: false });
    video.addEventListener("canplay", onReady, { once: false });
  });
}
