"use client";

/**
 * Rainy Weather 雨天记录 on the phone (JB192, 客户 11-13 晚上).
 *
 * The client:
 *
 * > 2. 开始下雨时，现场人员点击按钮拍第一张照片，系统自动记录日期、时间、GPS、拍摄人
 * >    及所属项目，照片暂存，不立即提交。
 * > 3. 雨停时，再点击同一个按钮拍第二张照片，自动记录雨停时间。
 * > 4. 两张照片完成后一起提交，形成一份完整的雨天记录，系统自动计算本次下雨时长。
 * > 5. 每份记录固定两张照片，现场人员不需要手动填写时间或计算下雨时长。
 * > 6. 使用现有离线缓存功能，第一张照片即使遇到断网或关闭页面，也不能丢失。
 *
 * One tile, three states, each with one big button:
 *
 * 1. Nothing open: 「开始下雨：拍第一张」 → the house camera → the photo is
 *    saved in this phone's offline database at once (bytes, its moment, the
 *    GPS fix, the project, a `client_event_id` made now) - never uploaded.
 * 2. The first photo held: its picture, 「开始 14:05」, 「已经下了 1 小时 5 分」
 *    (a 30-second clock, no store reads), and 「雨停了：拍第二张」.
 * 3. Both held: the two photos, start, end, the duration worked out the
 *    server's way, and 【提交雨天记录】 - through the offline queue (at once
 *    with signal, by itself later without). 「重拍第二张」 before that.
 *
 * Everything shown is read back from the store, so closing the page, the app
 * or the phone at any point loses nothing. 「取消这一次」 (asked twice) drops
 * it. A refusal is said in plain words and the held record stays; for a full
 * half hour the only way on is 「取消这一次」.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, CloudRain, Loader2, RotateCcw, Send, Sun, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { LocationField } from "@/components/field-staff/location-field";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { useRainDuration } from "@/hooks/use-rain-duration";
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import { asFix, type LocationValue } from "@/lib/field-location";
import {
  deleteHeldRain,
  getHeldRain,
  getHeldRains,
  keptBlob,
  putHeldRain,
  storeFile,
  type HeldRainPhoto,
  type HeldRainRecord,
} from "@/lib/offline-db";
import { requestPersistentStorage } from "@/lib/original-photos";
import { photoTakenAt } from "@/lib/photo-meta";
import {
  elapsedMinutes,
  endIsAfterStart,
  heldPhoto,
  heldRainId,
  isLongRain,
  rainMinutes,
  rainRefusal,
  startHeldRain,
  withEndPhoto,
  type RainRefusal,
} from "@/lib/rain-record";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import { newClientEventId, submitRainRecordOfflineAware } from "@/services/offline-sync.service";

/** The held record's query: read from this phone's store, never the network. */
export function heldRainQueryKey(id: string) {
  return ["rain-held", id] as const;
}

/** How often 「已经下了…」 moves on: minutes are what it shows. */
const CLOCK_MS = 30_000;

/** Now, every 30 seconds while `running` - a clock, not a store read. */
function useMinuteClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

/** What the line over the button says after 【提交雨天记录】. */
interface Sent {
  status: "uploaded" | "queued";
  start: string;
  end: string;
  minutes: number | null;
}

export function RainyWeatherCapture({ initialProject = "" }: { initialProject?: string }) {
  const t = useTranslations("rainRecords.phone");
  const df = useDateFormat();
  const duration = useRainDuration();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ownerId = user?.id ?? "";
  const [project, setProject] = useState(initialProject);
  // A worker on several projects picks the project here. When this phone is
  // already holding a rain record of theirs, the screen opens on that
  // record's project - coming back for the second photo must not start with
  // 「项目」 empty and the first photo out of sight (客户第 6 点: 不能丢失).
  // Followed once; choosing another project afterwards is the worker's own.
  // query-failure: no store on this browser - nothing is held, the picker is simply empty.
  const mine = useQuery({
    queryKey: ["rain-held", "mine", ownerId],
    queryFn: () => getHeldRains(ownerId),
    enabled: Boolean(ownerId) && !initialProject,
    networkMode: "always",
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const heldProject = openRainProject(mine.data);
  const [followedHeld, setFollowedHeld] = useState(false);
  if (!followedHeld && !project && heldProject) {
    setFollowedHeld(true);
    setProject(heldProject);
  }
  const projectName =
    project && user?.active_project?.project_id === project ? user.active_project.project_name : undefined;
  const id = ownerId && project ? heldRainId(ownerId, project) : "";
  const key = heldRainQueryKey(id);

  // Read from the phone, offline too (`networkMode: "always"`): what the
  // screen shows is what the store holds.
  const held = useQuery({
    queryKey: key,
    queryFn: () => getHeldRain(id),
    enabled: Boolean(id),
    networkMode: "always",
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const record = held.data ?? null;

  const [fix, setFix] = useState<LocationValue | null>(null);
  // The store refused (a private window, a full phone): the record is kept in
  // memory for this page only, and the worker is told.
  const [notKept, setNotKept] = useState(false);
  const [refusal, setRefusal] = useState<RainRefusal | null>(null);
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const now = useMinuteClock(Boolean(record && !record.end));

  /** Save to the phone first, then show it. */
  const keep = async (next: HeldRainRecord) => {
    void requestPersistentStorage();
    try {
      await putHeldRain(next);
      setNotKept(false);
    } catch {
      setNotKept(true);
    }
    queryClient.setQueryData(heldRainQueryKey(next.id), next);
  };

  /** The moment, the bytes and the fix, the instant the camera hands the photo over. */
  const photoOf = async (file: File): Promise<HeldRainPhoto> =>
    heldPhoto(await storeFile(file), photoTakenAt(file) ?? new Date().toISOString(), asFix(fix));

  const takeStart = async (file: File) => {
    if (!ownerId || !project) return;
    const next = startHeldRain({
      ownerId,
      project,
      projectName,
      clientEventId: newClientEventId("rain"),
      start: await photoOf(file),
    });
    await keep(next);
    setFix(null);
    setSent(null);
    setCancelled(false);
    setRefusal(null);
  };

  const takeEnd = async (file: File) => {
    if (!record) return;
    await keep(withEndPhoto(record, await photoOf(file)));
    setRefusal(null);
  };

  const cancel = async () => {
    if (!record) return;
    try {
      await deleteHeldRain(record.id);
    } catch {
      // Nothing was stored (the store refused it): nothing to delete.
    }
    queryClient.setQueryData(key, null);
    setAsking(false);
    setRefusal(null);
    setNotKept(false);
    setFix(null);
    setCancelled(true);
  };

  const send = useMutation({
    mutationFn: async (chosen: HeldRainRecord) => ({
      chosen,
      status: await submitRainRecordOfflineAware(ownerId, chosen, getOrCreateFieldDeviceId()),
    }),
    // Uploaded, or waiting in the queue with its own copy of both photos:
    // the phone's held record has done its job.
    onSuccess: async ({ chosen, status }) => {
      try {
        await deleteHeldRain(chosen.id);
      } catch {
        // Already gone, or never stored: the record is sent either way.
      }
      queryClient.setQueryData(heldRainQueryKey(chosen.id), null);
      setSent({
        status,
        start: chosen.start.capturedAt,
        end: chosen.end?.capturedAt ?? chosen.start.capturedAt,
        minutes: rainMinutes(chosen.start.capturedAt, chosen.end?.capturedAt),
      });
      setRefusal(null);
      setNotKept(false);
      setFix(null);
      void queryClient.invalidateQueries({ queryKey: ["site-progress"] });
    },
    // Refused: the held record stays, and why is said in plain words.
    onError: (error) =>
      setRefusal(
        error instanceof ApiError
          ? rainRefusal({
              status: error.status,
              code: error.code,
              message: error.message,
              errors: error.errors,
              values: error.values,
            })
          : rainRefusal({ message: t("failed") }),
      ),
  });

  const minutes = record?.end ? rainMinutes(record.start.capturedAt, record.end.capturedAt) : null;
  const tooShort = Boolean(record?.end && !endIsAfterStart(record.start.capturedAt, record.end.capturedAt));

  return (
    <div className="space-y-4" data-slot="rainy-weather">
      {!initialProject ? (
        <FieldWrapper label={t("project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(value) => {
              setProject(value);
              setRefusal(null);
              setSent(null);
              setAsking(false);
            }}
            placeholder={t("project")}
            className="h-11 w-full"
          />
        </FieldWrapper>
      ) : null}

      {sent ? <SentNote sent={sent} /> : null}
      {cancelled && !record ? (
        <p className="rounded-lg border bg-card px-3 py-2 text-sm" aria-live="polite">
          {t("cancelled")}
        </p>
      ) : null}
      {held.isError ? (
        <p role="alert" className="text-sm text-destructive" data-slot="rain-load-failed">
          {t("loadFailed")}
        </p>
      ) : null}
      {notKept ? (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" data-slot="rain-not-kept">
          {t("notKept")}
        </p>
      ) : null}

      {!project ? null : held.isLoading ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : !record ? (
        // 1. Nothing open: one big button.
        <section className="space-y-3" data-slot="rain-start">
          <p className="text-sm leading-5 text-muted-foreground">{t("howTo")}</p>
          <LocationField
            key="start"
            label={t("location")}
            readyLabel={t("locationReady")}
            value={fix}
            onChange={setFix}
            allowMissing
          />
          <FieldCamera
            trigger="button"
            variant="default"
            className="h-16 w-full text-base"
            icon={<CloudRain className="size-6" />}
            label={t("startBig")}
            onCapture={(file) => void takeStart(file)}
          />
        </section>
      ) : !record.end ? (
        // 2. The first photo held, waiting for the rain to stop.
        <section className="space-y-3" data-slot="rain-waiting">
          <HeldPhotoView photo={record.start} label={t("startPhoto")} />
          <dl className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("start")}</dt>
              <dd className="tabular text-xl font-semibold" data-slot="rain-started">
                {df.time(record.start.capturedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("duration")}</dt>
              <dd className="tabular text-xl font-semibold" data-slot="rain-elapsed">
                {t("raining", { duration: duration(elapsedMinutes(record.start.capturedAt, now)) })}
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-5 text-muted-foreground">{t("held")}</p>
          <LocationField
            key="end"
            label={t("location")}
            readyLabel={t("locationReady")}
            value={fix}
            onChange={setFix}
            allowMissing
          />
          <FieldCamera
            trigger="button"
            variant="default"
            className="h-16 w-full text-base"
            icon={<Sun className="size-6" />}
            label={t("endBig")}
            onCapture={(file) => void takeEnd(file)}
          />
          <CancelThisOne asking={asking} onAsk={setAsking} onConfirm={() => void cancel()} />
        </section>
      ) : (
        // 3. Both held: check, then 【提交雨天记录】.
        <section className="space-y-3" data-slot="rain-review">
          <div className="grid grid-cols-2 gap-2">
            <HeldPhotoView photo={record.start} label={t("startPhoto")} />
            <HeldPhotoView photo={record.end} label={t("endPhoto")} />
          </div>
          <dl className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("start")}</dt>
              <dd className="tabular text-base font-semibold" data-slot="rain-start-time">
                {df.dateTime(record.start.capturedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("end")}</dt>
              <dd className="tabular text-base font-semibold" data-slot="rain-end-time">
                {df.dateTime(record.end.capturedAt)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">{t("duration")}</dt>
              <dd className="tabular text-2xl font-bold" data-slot="rain-duration">
                {tooShort ? "—" : duration(minutes)}
              </dd>
            </div>
          </dl>
          {tooShort ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {t("tooShort")}
            </p>
          ) : isLongRain(minutes) ? (
            <p
              role="status"
              className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
              data-slot="rain-long"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              {t("long")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("review")}</p>
          )}
          {refusal ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              data-slot="rain-refused"
            >
              {t(`refused.${refusal.key}` as "refused.other", refusal.values as { reason: string })}
            </p>
          ) : null}
          {!tooShort && (refusal?.canSubmit ?? true) ? (
            <Button
              className="h-16 w-full text-base"
              data-slot="rain-submit"
              disabled={send.isPending}
              onClick={() => send.mutate(record)}
            >
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send className="size-5" />}
              {t("submit")}
            </Button>
          ) : null}
          {(refusal?.canRetake ?? true) ? (
            <FieldCamera
              trigger="button"
              className="h-12 w-full"
              icon={<RotateCcw />}
              label={t("retake")}
              disabled={send.isPending}
              onCapture={(file) => void takeEnd(file)}
            />
          ) : null}
          <CancelThisOne asking={asking} onAsk={setAsking} onConfirm={() => void cancel()} />
        </section>
      )}
    </div>
  );
}

/** One held photograph, drawn from its bytes on this phone. */
function HeldPhotoView({ photo, label }: { photo: HeldRainPhoto; label: string }) {
  const url = useMemo(() => URL.createObjectURL(keptBlob(photo.file)), [photo.file]);
  // A blob URL is the page's to release when the photo changes or goes.
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <figure className="overflow-hidden rounded-xl border bg-card" data-slot="rain-photo">
      {/* A blob URL cannot go through the image optimiser: a plain <img>. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="aspect-4/3 w-full object-cover" />
      <figcaption className="px-2 py-1.5 text-sm font-semibold">{label}</figcaption>
    </figure>
  );
}

/** 「取消这一次」, asked twice: the held photos are deleted, nothing is sent. */
function CancelThisOne({
  asking,
  onAsk,
  onConfirm,
}: {
  asking: boolean;
  onAsk: (asking: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("rainRecords.phone");
  if (!asking) {
    return (
      <Button variant="outline-destructive" className="h-12 w-full" data-slot="rain-cancel" onClick={() => onAsk(true)}>
        <X />
        {t("cancel")}
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3" data-slot="rain-cancel-ask">
      <p className="text-sm font-medium">{t("cancelAsk")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={() => onAsk(false)}>
          {t("cancelNo")}
        </Button>
        <Button variant="outline-destructive" className="h-12" data-slot="rain-cancel-yes" onClick={onConfirm}>
          {t("cancelYes")}
        </Button>
      </div>
    </div>
  );
}

/** 「已提交雨天记录：14:05–15:10（1 小时 5 分）」, or kept for the network. */
function SentNote({ sent }: { sent: Sent }) {
  const t = useTranslations("rainRecords.phone");
  const df = useDateFormat();
  const duration = useRainDuration();
  const values = { start: df.time(sent.start), end: df.time(sent.end), duration: duration(sent.minutes) };
  return (
    <p className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm" aria-live="polite" data-slot="rain-sent">
      {sent.status === "queued" ? (
        <CloudOff className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
      )}
      {sent.status === "queued" ? t("sentQueued", values) : t("sent", values)}
    </p>
  );
}

/**
 * The project the screen opens on when the phone already holds a rain record
 * of this account: the one saved last (the rain the worker is in the middle
 * of). Nothing held, no project.
 */
export function openRainProject(held: readonly Pick<HeldRainRecord, "project" | "savedAt">[] | undefined): string {
  if (!held?.length) return "";
  return [...held].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0].project;
}

/**
 * 「进行中」 on the 「拍照」 tile (做法 一.7): this account has a rain record
 * started and not sent - on `project` when the phone is bound to one. Read
 * once when the grid shows (the grid shows again when a screen closes).
 */
export function RainInProgressMark({ ownerId, project }: { ownerId: string; project?: string }) {
  const t = useTranslations("rainRecords.phone");
  // query-failure: no store on this browser - no mark, and the tile still opens the screen.
  const open = useQuery({
    queryKey: ["rain-held", "mark", ownerId, project ?? ""],
    queryFn: async () =>
      (await getHeldRains(ownerId)).some((record) => !project || record.project === project),
    enabled: Boolean(ownerId),
    networkMode: "always",
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!open.data) return null;
  return (
    <span
      className="inline-flex h-6 items-center rounded-full bg-warning/15 px-2 text-xs font-semibold text-warning"
      data-slot="rain-in-progress"
    >
      {t("inProgress")}
    </span>
  );
}
