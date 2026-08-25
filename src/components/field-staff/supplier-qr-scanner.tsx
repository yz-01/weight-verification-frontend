"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { ImagePlus, Loader2, RefreshCw, ScanLine } from "lucide-react";
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

export function SupplierQrScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (token: string) => void;
}) {
  const t = useTranslations("fieldStaffPwa.material");
  const commonT = useTranslations("common");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onDetectedRef = useRef(onDetected);
  const detectedRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let frame = 0;
    detectedRef.current = false;

    const start = async () => {
      setStarting(true);
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setStarting(false);
        setError(t("cameraError"));
        return;
      }
      await new Promise<void>((resolve) => {
        const waitForVideo = () => {
          if (videoRef.current || disposed) return resolve();
          frame = requestAnimationFrame(waitForVideo);
        };
        waitForVideo();
      });
      if (disposed || !videoRef.current) return;
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error("video_unavailable");
        }
        streamRef.current = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.srcObject = stream;
        await waitForVideoReady(video);
        await video.play();
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
        controlsRef.current = await reader.decodeFromVideoElement(video, (result) => {
          if (!result || detectedRef.current) return;
          detectedRef.current = true;
          stop();
          onDetectedRef.current(extractSupplierToken(result.getText()));
        });
        if (!disposed) setStarting(false);
      } catch {
        if (!disposed) {
          setStarting(false);
          setError(t("cameraError"));
        }
      }
    };
    void start();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stop();
    };
  }, [open, retry, stop, t]);

  async function decodeImage(file: File) {
    setError("");
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      onDetectedRef.current(extractSupplierToken(result.getText()));
    } catch {
      setError(t("qrInvalid"));
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scanTitle")}</DialogTitle>
          <DialogDescription>{t("scanHelp")}</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-[3/4] max-h-[65dvh] overflow-hidden rounded-lg bg-black sm:aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            className="size-full object-cover"
            muted
            playsInline
          />
          {starting && (
            <div className="absolute inset-0 grid place-items-center bg-black/50 text-white">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-[16%] rounded-lg border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void decodeImage(file);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <ImagePlus />
            {t("scanSupplierQr")}
          </Button>
          {error && (
            <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
              <RefreshCw />
              {commonT("retry")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            <ScanLine />
            {t("closeScanner")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function extractSupplierToken(rawValue: string): string {
  const value = rawValue.trim();
  try {
    const url = new URL(value);
    const queryToken = url.searchParams.get("token") ?? url.searchParams.get("supplier_token");
    if (queryToken) return queryToken;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    return hash.get("token") ?? value;
  } catch {
    return value;
  }
}
