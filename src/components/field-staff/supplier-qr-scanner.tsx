"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Loader2, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const detectedRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open || !videoRef.current) return;
    let controls: IScannerControls | undefined;
    let disposed = false;
    detectedRef.current = false;
    setStarting(true);
    setError("");

    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 250,
    });
    void reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current,
        (result) => {
          if (!result || detectedRef.current) return;
          detectedRef.current = true;
          controls?.stop();
          onDetectedRef.current(extractSupplierToken(result.getText()));
        },
      )
      .then((nextControls) => {
        if (disposed) {
          nextControls.stop();
          return;
        }
        controls = nextControls;
        setStarting(false);
      })
      .catch(() => {
        if (!disposed) {
          setStarting(false);
          setError(t("cameraError"));
        }
      });

    return () => {
      disposed = true;
      controls?.stop();
    };
  }, [open, t]);

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
          <Button variant="outline" onClick={onClose}>
            <ScanLine />
            {t("closeScanner")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function extractSupplierToken(rawValue: string): string {
  const value = rawValue.trim();
  try {
    const url = new URL(value);
    const queryToken = url.searchParams.get("token");
    if (queryToken) return queryToken;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    return hash.get("token") ?? value;
  } catch {
    return value;
  }
}
