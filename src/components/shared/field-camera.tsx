"use client";

import { Camera, CameraIcon, Loader2, RefreshCw, SwitchCamera, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FacingMode = "user" | "environment";

interface FieldCameraProps {
  label: string;
  fileCount?: number;
  facingMode?: FacingMode;
  disabled?: boolean;
  className?: string;
  onCapture: (file: File) => void;
  onClear?: () => void;
}

export function FieldCamera({
  label,
  fileCount = 0,
  facingMode = "environment",
  disabled = false,
  className = "",
  onCapture,
  onClear,
}: FieldCameraProps) {
  const t = useTranslations("fieldStaffPwa.camera");
  const [open, setOpen] = useState(false);
  const [facing, setFacing] = useState<FacingMode>(facingMode);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
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
  }, [facing, open, stopCamera, t]);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError(t("captureError"));
      return;
    }
    if (facing === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
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
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setFacing(facingMode);
            setOpen(true);
          }}
          className="flex min-h-24 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 p-3 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="size-7 text-primary" />
          <span className="mt-2 text-sm font-semibold">{label}</span>
          <span className="mt-1 text-xs text-muted-foreground">
            {fileCount ? t("ready", { count: fileCount }) : t("open")}
          </span>
        </button>
        {fileCount > 0 && onClear ? (
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
        <DialogContent className="max-h-[96dvh] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{t("help")}</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-[3/4] max-h-[65dvh] overflow-hidden rounded-lg bg-black sm:aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
            />
            {starting ? (
              <div className="absolute inset-0 grid place-items-center bg-black/70 text-white">
                <Loader2 className="size-8 animate-spin" />
              </div>
            ) : null}
            {error ? (
              <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-sm text-white">
                <div>
                  <CameraIcon className="mx-auto size-9" />
                  <p className="mt-3">{error}</p>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_1fr]">
            <Button
              type="button"
              variant="outline"
              size="icon"
              title={t("switch")}
              disabled={starting}
              onClick={() => setFacing((value) => (value === "user" ? "environment" : "user"))}
            >
              <SwitchCamera />
            </Button>
            <Button type="button" className="h-12" disabled={!ready || starting} onClick={capture}>
              {ready ? <Camera /> : <RefreshCw className="animate-spin" />}
              {t("capture")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
