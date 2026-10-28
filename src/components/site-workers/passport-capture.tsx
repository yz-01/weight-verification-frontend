"use client";

/**
 * A phone photographing passports into one 批量新增人员 batch (JB61-1).
 *
 * Opened by scanning the QR code on the office's batch page. No account; the
 * link can do one thing - add passport photos to that batch - and lasts a
 * working day. The page is one camera with a frame to aim the passport's
 * data page into, one big 「拍照」 button, and an answer after each shot:
 * what was read, or 「看不清楚，请重拍」. What it takes appears in the
 * office's table by itself.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, Link2Off, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import type { CaptureResult } from "@/interfaces/site-workers";
import { captureFrame, frameBox } from "@/lib/passport-frame";
import {
  discardCaptureRow,
  getCapture,
  uploadCapturePhoto,
} from "@/services/worker-location-link.service";

type Stage = "aim" | "sending" | "result";

export function PassportCapture({ token }: { token: string }) {
  const t = useTranslations("passportCapture");
  const state = useQuery({
    queryKey: ["passport-capture", token],
    queryFn: () => getCapture(token),
    retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status === 410),
  });
  const [count, setCount] = useState<number | null>(null);

  if (state.isError) {
    const ended = state.error instanceof ApiError && state.error.code === "passport_capture_link_invalid";
    return (
      <Centered>
        <Link2Off className="size-12 text-warning" />
        <h1 className="text-center text-xl font-bold">{ended ? t("endedTitle") : t("failedTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {ended ? t("endedBody") : t("failedBody")}
        </p>
        {!ended && (
          <Button size="lg" onClick={() => void state.refetch()}>
            <RotateCcw className="h-4 w-4" />
            {t("tryAgain")}
          </Button>
        )}
      </Centered>
    );
  }
  if (!state.data) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </Centered>
    );
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-3 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{state.data.project_name}</p>
        </div>
        <LanguageSwitcher />
      </div>
      <p className="text-sm font-medium">{t("count", { count: count ?? state.data.phone_count })}</p>
      <PassportCamera token={token} onCount={setCount} />
    </main>
  );
}

function PassportCamera({ token, onCount }: { token: string; onCount: (count: number) => void }) {
  const t = useTranslations("passportCapture");
  const video = useRef<HTMLVideoElement>(null);
  // J45: every photo is taken with the app's own camera, never the phone's
  // camera app or gallery - so a phone that cannot show it here tries again.
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState<"starting" | "on" | "off">("starting");
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [stage, setStage] = useState<Stage>("aim");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [failure, setFailure] = useState("");

  // The back camera, as sharp as the phone streams it.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setLive("off");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
        setLive("on");
      } catch {
        setLive("off");
      }
    };
    void start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const send = useMutation({
    mutationFn: (file: File) => uploadCapturePhoto(token, file),
    onSuccess: (answer) => {
      setResult(answer);
      onCount(answer.phone_count);
      setStage("result");
    },
    onError: (error) => {
      setFailure(error instanceof Error ? error.message : t("sendFailed"));
      setStage("result");
    },
  });
  const discard = useMutation({
    mutationFn: (row: string) => discardCaptureRow(token, row),
    onSuccess: (answer) => onCount(answer.phone_count),
  });

  const sendFile = useCallback(
    (file: File) => {
      setFailure("");
      setResult(null);
      setPreview(URL.createObjectURL(file));
      setStage("sending");
      send.mutate(file);
    },
    [send],
  );

  const shoot = async () => {
    const element = video.current;
    if (!element || !size) return;
    const file = await captureFrame(element, size.width, size.height);
    if (file) sendFile(file);
  };

  const again = () => {
    setStage("aim");
    setResult(null);
    setFailure("");
    setPreview(null);
  };

  const box = size ? frameBox(size.width, size.height) : null;
  const read = result?.read_status === "READ";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg border bg-muted">
        {/* The live camera stays mounted under the answer, so 「重拍」 is instant. */}
        <video
          ref={video}
          playsInline
          muted
          className={stage === "aim" && live === "on" ? "block h-auto w-full" : "hidden"}
          onLoadedMetadata={(event) =>
            setSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })
          }
        />
        {stage === "aim" && live === "on" && box && (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-md border-4 border-primary"
            style={{
              left: `${box.leftPct}%`,
              top: `${box.topPct}%`,
              width: `${box.widthPct}%`,
              height: `${box.heightPct}%`,
            }}
          >
            {/* Where the two lines of letters and < marks sit on the data page. */}
            <div className="absolute inset-x-2 bottom-2 h-1/5 rounded border-2 border-dashed border-primary" />
          </div>
        )}
        {stage !== "aim" && preview && (
          // eslint-disable-next-line @next/next/no-img-element -- a photo just taken, held in memory
          <img src={preview} alt={t("photoAlt")} className="block h-auto w-full" />
        )}
        {live === "starting" && stage === "aim" && (
          <div className="flex aspect-[4/3] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {live === "off" && stage === "aim" && (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
            <Camera className="size-10" />
            {t("noLiveCamera")}
          </div>
        )}
      </div>

      {stage === "aim" && (
        <>
          <p className="text-base">{t("aimHint")}</p>
          {live === "on" ? (
            <Button size="lg" className="h-14 text-lg" onClick={() => void shoot()} disabled={!size} disabledReason={t("cameraStarting")}>
              <Camera className="h-6 w-6" />
              {t("shoot")}
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-14 text-lg"
              onClick={() => {
                setLive("starting");
                setAttempt((count) => count + 1);
              }}
              disabled={live === "starting"}
              disabledReason={t("cameraStarting")}
            >
              <RotateCcw className="h-6 w-6" />
              {t("openCamera")}
            </Button>
          )}
        </>
      )}

      {stage === "sending" && (
        <p className="flex items-center gap-2 text-base">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("reading")}
        </p>
      )}

      {stage === "result" && (
        <div className="space-y-3">
          {failure ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-base text-destructive">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              {failure}
            </p>
          ) : read ? (
            <div className="rounded-lg border border-success/40 bg-success/10 p-3">
              <p className="flex items-center gap-2 text-lg font-semibold text-success">
                <CheckCircle2 className="h-6 w-6" />
                {t("readOk")}
              </p>
              <p className="mt-1 text-base">{result?.name}</p>
              <p className="text-sm text-muted-foreground">{t("passportNo", { number: result?.passport_no ?? "" })}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-2 text-lg font-semibold text-warning">
                <TriangleAlert className="h-6 w-6" />
                {t("unclear")}
              </p>
              <p className="mt-1 text-sm">{t("unclearBody")}</p>
            </div>
          )}
          {read || failure ? (
            <Button size="lg" className="h-14 w-full text-lg" onClick={again}>
              <Camera className="h-6 w-6" />
              {failure ? t("tryAgain") : t("next")}
            </Button>
          ) : (
            <div className="grid gap-2">
              <Button
                size="lg"
                className="h-14 text-lg"
                onClick={() => {
                  if (result) discard.mutate(result.row);
                  again();
                }}
              >
                <RotateCcw className="h-6 w-6" />
                {t("retake")}
              </Button>
              <Button size="lg" variant="outline" className="h-12" onClick={again}>
                {t("keepThis")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10">{children}</main>;
}
