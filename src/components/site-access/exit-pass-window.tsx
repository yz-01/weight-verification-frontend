"use client";

/**
 * The 出门条 itself (JB217, 客户 11-18 事项 2):
 *
 *   「签名后自动发送到原申请人及本项目门岗手机端。预览、打印及手机端均须完整显示该
 *   栏。门岗收到后，打开该事项检查车辆及货物，在事项内现场拍照，再确认放行。确认后，
 *   该条事项归入「门岗事项」保存，保留核查照片、放行人员及时间，并关联原申请。」
 *
 * One window for whoever a 出门条 reaches (plan D5: the 出门条 is the record
 * seen through this window, not a fifth document): the gate guard (from its
 * 待放行 card or the 拍照 page's 「待放行」 list), a safety manager on a phone
 * (signs here, no PIN), the applicant, and an office reader from the bell.
 * What goes, the plate, who applied (a number to call), the application's
 * photographs, both approval parts in full - and, for a phone that may
 * release now, 【核查拍照】 and 【确认放行】.
 *
 * The gate step is the gate's own camera and tray (`gate-records.tsx`), each
 * photo with its time and GPS; nothing to type (I14). Online only (D10): a
 * release is checked against a pass another guard may just have used, so a
 * failure says why, keeps the photos and offers 【重试】 - the same
 * `client_event_id`, so a resend after a lost answer is the same release.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, DoorOpen, ExternalLink, Loader2, Truck } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { ExitPassSections, exitPassKey, useExitPass } from "@/components/contractor-ops/exit-pass-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper, LoadFailed, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import {
  RecordDetailDialog,
  RecordDetailShell,
  ShellPanel,
  ShellRecorder,
  type ShellFact,
} from "@/components/shared/record-detail-shell";
import {
  LocationLine,
  PhotoTray,
  useContinuousCamera,
  useGateLocation,
} from "@/components/site-access/gate-records";
import { Button } from "@/components/ui/button";
import { usePhoneOffline } from "@/hooks/use-phone-offline";
import { ApiError } from "@/interfaces/api";
import type { ExitPass, ExitPassKind, ExitPassReleaseBlock, ExitPassWaiting } from "@/interfaces/exit-pass";
import { useDateFormat } from "@/lib/dates";
import { isRouteAllowed } from "@/lib/navigation";
import { photoMeta } from "@/lib/photo-meta";
import { cn } from "@/lib/utils";
import { getExitPassesWaiting, releaseExit } from "@/services/exit-pass.service";
import { GATE_RELEASE_SHOTS, type GatePhotoDraft, type GateReleaseShot } from "@/interfaces/site-access";

// The record's own window, over this one (office only; the phone's is this).
const InPlaceRecord = dynamic(
  () => import("@/components/shared/in-place-record").then((module) => module.InPlaceRecord),
  { ssr: false },
);

/** Each kind's office page: 【打开原记录】 is offered to whoever may open it. */
export const EXIT_RECORD_PAGES: Record<ExitPassKind, string> = {
  MATERIAL_OUTGOING: "/material-outgoing",
  EQUIPMENT_MOVEMENT: "/site-equipment",
  WASTE_OUTGOING: "/waste-outgoing",
  DISPOSAL_REQUEST: "/waste-clearance",
};

/** Whether this office reader may open the record's own page (and so its window). */
export function useMayOpenExitRecord(kind: ExitPassKind | null | undefined): boolean {
  const { user } = useAuth();
  if (!kind || !user || user.is_field_staff) return false;
  return isRouteAllowed(user.portal, user.features, EXIT_RECORD_PAGES[kind], user.permissions, user.is_superuser);
}

function newEventId() {
  return `exit-${crypto.randomUUID()}`;
}

/**
 * The 出门条 window. `readOnly`: opened from a finished 门岗事项 - reading only.
 * `mayRelease` false: opened from a notice that is not the gate's (the
 * applicant's 「出门条已批准」, a phone safety manager's 「出门条待你批准」) -
 * never 【核查拍照】 / 【确认放行】 there (audit F1: 「门岗收到后…再确认放行」).
 */
export function ExitPassWindow({
  kind,
  record,
  onClose,
  readOnly = false,
  mayRelease = true,
}: {
  kind: ExitPassKind;
  record: string;
  onClose: () => void;
  readOnly?: boolean;
  mayRelease?: boolean;
}) {
  const t = useTranslations("exitPass");
  const pass = useExitPass(kind, record);
  const data = pass.data;
  const mayOpen = useMayOpenExitRecord(kind);
  const [openRecord, setOpenRecord] = useState(false);
  const title = data?.reference ? t("window.title", { reference: data.reference }) : t("window.titleBare");
  return (
    <>
      <RecordDetailDialog
        title={title}
        description={data?.summary || undefined}
        status={data ? <WindowStatus pass={data} /> : null}
        headerActions={
          mayOpen && data ? (
            <Button size="sm" variant="outline" data-exit-pass-open-record onClick={() => setOpenRecord(true)}>
              <ExternalLink />
              {t("window.openRecord")}
            </Button>
          ) : null
        }
        onClose={onClose}
      >
        {pass.isLoading ? (
          <div className="grid min-h-32 place-items-center" data-exit-pass-window="loading">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        ) : pass.isError || !data ? (
          <LoadFailed what={t("what")} onRetry={() => void pass.refetch()} />
        ) : data.state === "not_applicable" ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("window.none")}</p>
        ) : (
          <ExitPassWindowBody
            pass={data}
            readOnly={readOnly}
            mayRelease={mayRelease}
            openRecord={mayOpen ? () => setOpenRecord(true) : null}
          />
        )}
      </RecordDetailDialog>
      {openRecord ? <InPlaceRecord kind={kind} id={record} onClose={() => setOpenRecord(false)} /> : null}
    </>
  );
}

/** The pass's one word beside its number. */
function WindowStatus({ pass }: { pass: ExitPass }) {
  const t = useTranslations("exitPass");
  switch (pass.state) {
    // JB237 (材料出场): 准备出门条 until the site's photos, then 等待启动出门条.
    case "awaiting_photos":
      return <StatusBadge label={t("start.preparing")} tone="warning" />;
    case "awaiting_start":
      return <StatusBadge label={t("start.waitingStart")} tone="warning" />;
    case "awaiting_signature":
      return <StatusBadge label={t("approval.notApproved")} tone="warning" />;
    case "awaiting_external":
      return <StatusBadge label={t("external.waiting")} tone="warning" />;
    case "sent":
      return pass.releases.length > 0 ? (
        <StatusBadge label={t("release.trips", { count: pass.releases.length })} tone="positive" />
      ) : pass.release_ended ? (
        // A 工地清运 over with no lorry released (contract v4 F8): nothing to wait for.
        <StatusBadge label={t("release.ended")} tone="neutral" />
      ) : pass.record_closed ? (
        // Archived, returned or cancelled unreleased (walk 11-18): the window
        // says the record is over; nothing waits for the gate.
        null
      ) : (
        <StatusBadge label={t("release.waitingBadge")} tone="warning" />
      );
    case "released":
      return <StatusBadge label={t("release.released")} tone="positive" />;
    default:
      return null;
  }
}

/**
 * What is in the window, on a phone in reading order: the photographs, what
 * goes (the record's own facts, as 我提交过的 shows them), who applied, then
 * 出门条批准（安全经理） · 外部审批 · 门岗放行, then the gate's own step.
 */
export function ExitPassWindowBody({
  pass,
  readOnly = false,
  mayRelease = true,
  openRecord = null,
}: {
  pass: ExitPass;
  readOnly?: boolean;
  mayRelease?: boolean;
  /** Opens the record's own window (an office reader who may open it). */
  openRecord?: (() => void) | null;
}) {
  const t = useTranslations("exitPass");
  const tRoot = useTranslations();
  // The release this phone has just made: its green line outlives the gate
  // step, which goes once the pass reads 已放行 (walk 11-18 #5).
  const [releasedNow, setReleasedNow] = useState<ReleasedNow | null>(null);
  const step = gateStep(pass, { readOnly, mayRelease, releasedNow });
  const view = pass.record_view;
  const fieldLabel = (key: string) =>
    tRoot.has(`mySubmissions.field.${key}`) ? tRoot(`mySubmissions.field.${key}`) : null;
  const recordFacts: ShellFact[] = (view?.fields ?? []).flatMap((field) => {
    const label = fieldLabel(field.key);
    if (!label) return [];
    return [
      {
        label,
        value: (
          <span className="whitespace-pre-wrap">
            {field.value}
            {field.unit && tRoot.has(`mySubmissions.unit.${field.unit}`)
              ? ` ${tRoot(`mySubmissions.unit.${field.unit}`)}`
              : ""}
          </span>
        ),
        wide: field.value.length > 60 || field.value.includes("\n"),
      },
    ];
  });
  const head: ShellFact[] = [
    { label: t("window.kind"), value: t(`kind.${pass.kind}`) },
    { label: t("window.goes"), value: pass.summary },
    { label: t("window.plate"), value: pass.vehicle_plate },
    { label: t("window.project"), value: pass.project_name },
  ];
  // The record's own rows after these, without saying 项目 or 车牌 twice.
  const said = new Set(head.map((fact) => fact.label));
  const facts: ShellFact[] = [
    ...head,
    ...recordFacts.filter((fact) => !said.has(fact.label)),
  ];
  return (
    <RecordDetailShell
      reference={pass.reference}
      // A phone: nothing full size until a photo is opened (2026-10-09 二.4).
      heroFromThumbnail
      notices={
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {t("window.viewNote")}
        </p>
      }
      facts={facts}
      photos={(view?.photos ?? []).map((shot, index) => ({
        id: shot.id ?? `${index}:${shot.url}`,
        url: shot.url,
        thumbnailUrl: shot.thumbnail_url,
        label: shot.caption || pass.reference,
        ...photoMeta(shot),
      }))}
      recorder={
        pass.applicant_name ? (
          <ShellRecorder label={t("window.applicant")} name={pass.applicant_name} phone={pass.applicant_phone} />
        ) : undefined
      }
      aside={
        <div className="space-y-4" data-exit-pass-window-parts>
          {/* Not the record's own window: 【打印】 / 【发送】 are not at this
              window's top (walk 11-18 F-A2) - the 外部审批 step says where. */}
          <ExitPassSections pass={pass} readOnly={readOnly} openRecord={openRecord} />
          {step === "blocked" && pass.release_blocked ? (
            // Audit F1: the applicant, or not the gate's phone - one sentence, no release step.
            <ReleaseBlockedNote code={pass.release_blocked} />
          ) : step === "capture" ? (
            <ReleaseCapture pass={pass} onReleased={setReleasedNow} />
          ) : step === "releasedNow" && releasedNow ? (
            <ReleasedNowLine done={releasedNow} multi={pass.multi_release} />
          ) : (
            <GateNote pass={pass} />
          )}
        </div>
      }
    />
  );
}

/** The release this phone has just made: the 门岗事项 number, and which lorry. */
export interface ReleasedNow {
  number: string;
  count: number;
}

/**
 * What stands where 【确认放行】 would be. After this phone's own release the
 * pass reads 已放行 and the gate step goes; its success - 「已放行，记入门岗事项
 * GT-…。」 - stays in its place for as long as the window is open, rather than
 * the other guard's 「…不用再放行」 (walk 11-18 #5).
 */
export function gateStep(
  pass: ExitPass,
  { readOnly, mayRelease, releasedNow }: { readOnly: boolean; mayRelease: boolean; releasedNow: ReleasedNow | null },
): "note" | "blocked" | "capture" | "releasedNow" {
  if (readOnly) return "note";
  if (pass.release_blocked) return "blocked";
  if (pass.can_release && mayRelease) return "capture";
  if (releasedNow) return "releasedNow";
  return "note";
}

/** 「已放行，记入门岗事项 GT-…。」 - green, with the number to find it by. */
export function ReleasedNowLine({ done, multi }: { done: ReleasedNow; multi: boolean }) {
  const t = useTranslations("exitPass");
  return (
    <p
      role="status"
      data-exit-pass-released-now
      className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      {multi ? t("gate.doneTrip", { count: done.count, number: done.number }) : t("gate.done", { number: done.number })}
    </p>
  );
}

/**
 * The gate phone that may not release this one now says why, in a sentence
 * where 【确认放行】 would be: released already (another guard got there
 * first), not sent yet, or the record ended. Nothing for anyone else.
 */
export function GateNote({ pass }: { pass: ExitPass }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  const { user, can } = useAuth();
  if (!user?.is_field_staff || !can("site_access.scan")) return null;
  const last = pass.releases[pass.releases.length - 1];
  // A legacy or ended record: the parts above already say so.
  const sentence =
    pass.state === "legacy" || pass.record_closed
      ? ""
      : last && !pass.multi_release
          ? t("gate.alreadyReleased", { name: last.by, when: df.dateTime(last.at), number: last.incident_no })
          : !pass.sent
            ? t("gate.notSentYet")
            : "";
  if (!sentence) return null;
  return (
    <p
      role="status"
      data-exit-pass-gate-note
      className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-6 text-foreground"
    >
      {sentence}
    </p>
  );
}

/**
 * Why this phone does not release this one (contract v3, audit F1), in the
 * words the release itself would refuse with: 「这是你自己申请出场的东西…」 or
 * 「这个项目有门岗手机，出门条要由门岗检查放行…」. Where 【确认放行】 would be.
 */
export function ReleaseBlockedNote({ code }: { code: ExitPassReleaseBlock }) {
  const tRoot = useTranslations();
  return (
    <p
      role="status"
      data-exit-pass-release-blocked={code}
      className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-6 text-foreground"
    >
      {tRoot(`errors.api.${code}`)}
    </p>
  );
}

/** A refusal's words, and whether pressing again can help. */
export interface ReleaseFailure {
  /** What went wrong, in the reader's words. */
  reason: string;
  /** The network, or no answer: pressing 【重试】 where there is signal helps. */
  network: boolean;
}

function releaseFailure(error: unknown, words: { network: string; unknown: string }): ReleaseFailure {
  if (error instanceof ApiError && error.isNetwork) return { reason: words.network, network: true };
  // The server's refusal says what happened and what to do next (contract v2 §6).
  if (error instanceof ApiError && error.message) return { reason: error.message, network: false };
  return { reason: words.unknown, network: true };
}

/**
 * 【核查拍照】 then 【确认放行】 (JB217-7): the gate's own continuous camera
 * and tray, each photo with its time and GPS. 【确认放行】 stays off, saying
 * why, until there is a photo and while the phone has no network.
 */
export function ReleaseCapture({
  pass,
  onReleased,
}: {
  pass: ExitPass;
  /** Told the 门岗事项 the release became, so the window keeps saying so. */
  onReleased?: (done: ReleasedNow) => void;
}) {
  const t = useTranslations("exitPass");
  const tFlow = useTranslations("jb281");
  const queryClient = useQueryClient();
  const offline = usePhoneOffline();
  const { fix, failed, refresh } = useGateLocation();
  const camera = useContinuousCamera(fix);
  // JB281 (客户 11-26 事项 22): a 材料退场 is photographed 车辆、车牌、退场货物 -
  // one camera each, every photo labelled; the server refuses a missing one.
  const vehicle = useContinuousCamera(fix);
  const plate = useContinuousCamera(fix);
  const goods = useContinuousCamera(fix);
  const shotCameras = { VEHICLE: vehicle, PLATE: plate, GOODS: goods } as const;
  const labelled = pass.kind === "MATERIAL_OUTGOING";
  const photos: GatePhotoDraft[] = labelled
    ? GATE_RELEASE_SHOTS.flatMap((shot) => shotCameras[shot].photos.map((photo) => ({ ...photo, shot })))
    : camera.photos;
  const missingShots = labelled ? GATE_RELEASE_SHOTS.filter((shot) => shotCameras[shot].photos.length === 0) : [];
  const clearAll = () => {
    camera.clear();
    vehicle.clear();
    plate.clear();
    goods.clear();
  };
  // One id per release, kept across 【重试】 (a resend is the same release).
  const eventId = useRef(newEventId());
  // A second tap before the button turns off sends nothing (walk 11-18
  // point 9: two taps sent two requests; the server answers both the same).
  const sending = useRef(false);
  const [done, setDone] = useState<ReleasedNow | null>(null);
  const release = useMutation({
    mutationFn: () =>
      releaseExit({
        kind: pass.kind,
        record: pass.record,
        photos,
        clientEventId: eventId.current,
        fix: fix ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy } : undefined,
      }),
    onSuccess: (row) => {
      const released = { number: row.incident_no, count: pass.releases.length + 1 };
      setDone(released);
      onReleased?.(released);
      clearAll();
      eventId.current = newEventId();
      void queryClient.invalidateQueries({ queryKey: exitPassKey(pass.kind, pass.record) });
      void queryClient.invalidateQueries({ queryKey: ["exit-passes", "waiting"] });
      void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["gate-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      // Released already, not sent, the record ended: the pass says so now.
      if (error instanceof ApiError && !error.isNetwork) {
        void queryClient.invalidateQueries({ queryKey: exitPassKey(pass.kind, pass.record) });
      }
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  return (
    <ReleaseCaptureView
      photosTaken={photos.length}
      missingReason={
        missingShots.length > 0
          ? `${tFlow("gateNeedShots")} ${tFlow("gateShotsMissing", {
              shots: missingShots.map((shot) => tFlow(`shot.${shot}`)).join("、"),
            })}`
          : undefined
      }
      offline={offline}
      pending={release.isPending}
      error={
        release.isError
          ? releaseFailure(release.error, { network: t("gate.failedNetwork"), unknown: t("gate.failedUnknown") })
          : null
      }
      done={done}
      multi={pass.multi_release}
      camera={
        labelled ? (
          <ReleaseShotCameras
            cameras={shotCameras}
            onCapture={() => setDone(null)}
            location={<LocationLine fix={fix} failed={failed} onRetry={refresh} />}
          />
        ) : (
        <FieldWrapper label={t("gate.photos")} required hint={t("gate.photosHint")}>
          <div className="space-y-2">
            <FieldCamera
              label={camera.photos.length ? t("gate.takeAnother", { count: camera.photos.length }) : t("gate.takePhoto")}
              fileCount={camera.photos.length}
              onCapture={(file) => {
                setDone(null);
                camera.add(file);
              }}
              onClear={camera.clear}
            />
            <PhotoTray photos={camera.photos} onRemove={camera.remove} />
            <LocationLine fix={fix} failed={failed} onRetry={refresh} />
          </div>
        </FieldWrapper>
        )
      }
      onRelease={() => {
        if (sending.current) return;
        sending.current = true;
        release.mutate();
      }}
    />
  );
}

type ShotCamera = ReturnType<typeof useContinuousCamera>;

/**
 * JB281: the three labelled cameras of a 材料退场's release - 车辆, 车牌,
 * 退场货物 - each with its own tray, so every photo says what it shows.
 */
export function ReleaseShotCameras({
  cameras,
  onCapture,
  location,
}: {
  cameras: Record<GateReleaseShot, Pick<ShotCamera, "photos" | "add" | "remove" | "clear">>;
  onCapture?: () => void;
  location?: React.ReactNode;
}) {
  const tFlow = useTranslations("jb281");
  return (
    <FieldWrapper label={tFlow("gateShotsTitle")} required hint={tFlow("gateShotsHint")}>
      <div className="space-y-3" data-release-shots>
        {GATE_RELEASE_SHOTS.map((shot) => {
          const camera = cameras[shot];
          const name = tFlow(`shot.${shot}`);
          return (
            <div key={shot} className="space-y-2 rounded-lg border p-2" data-release-shot={shot}>
              <p className="text-sm font-medium">{name}</p>
              <FieldCamera
                label={
                  camera.photos.length
                    ? tFlow("gateShotTaken", { shot: name, count: camera.photos.length })
                    : tFlow("gateShotTake", { shot: name })
                }
                fileCount={camera.photos.length}
                onCapture={(file) => {
                  onCapture?.();
                  camera.add(file);
                }}
                onClear={camera.clear}
              />
              <PhotoTray photos={camera.photos} onRemove={camera.remove} />
            </div>
          );
        })}
        {location}
      </div>
    </FieldWrapper>
  );
}

/**
 * The gate step as drawn, apart from the camera itself, so each state - no
 * photo yet, no network, sending, refused with the photos kept, released -
 * is drawn the same way wherever it is tested or shown.
 */
export function ReleaseCaptureView({
  photosTaken,
  missingReason,
  offline,
  pending,
  error,
  done,
  multi,
  camera,
  onRelease,
}: {
  photosTaken: number;
  /** JB281: a 材料退场 still missing one of 车辆 / 车牌 / 退场货物. */
  missingReason?: string;
  offline: boolean;
  pending: boolean;
  /** Why the last press did not release; the photos are still in the tray. */
  error: ReleaseFailure | null;
  done: { number: string; count: number } | null;
  multi: boolean;
  camera: React.ReactNode;
  onRelease: () => void;
}) {
  const t = useTranslations("exitPass");
  const reason = offline
    ? t("gate.needNetwork")
    : (missingReason ?? (photosTaken === 0 ? t("gate.needPhoto") : undefined));
  return (
    <ShellPanel title={t("gate.title")} data-exit-pass-release-capture className="border-primary/40 shadow-glow-sm">
      <div className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">{t("gate.help")}</p>
        {camera}
        {done ? <ReleasedNowLine done={done} multi={multi} /> : null}
        {error ? (
          <div
            role="alert"
            data-exit-pass-release-failed
            className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {/* contract v2 §11: 「放行没有提交成功：{reason}。照片还在，请检查网络后按「重试」。」 */}
            <p className="font-medium">
              {error.network ? t("gate.failed", { reason: error.reason }) : t("gate.refused", { reason: error.reason })}
            </p>
            {!error.network && photosTaken > 0 ? <p>{t("gate.photosKept", { count: photosTaken })}</p> : null}
          </div>
        ) : null}
        <Button
          size="lg"
          className="h-12 w-full text-base"
          data-exit-pass-release={error ? "retry" : "confirm"}
          disabled={pending || Boolean(reason)}
          disabledReason={reason}
          showReason
          onClick={onRelease}
        >
          {pending ? <Loader2 className="animate-spin" /> : <DoorOpen />}
          {error ? t("gate.retry") : t("gate.confirm")}
        </Button>
      </div>
    </ShellPanel>
  );
}

/**
 * 「待放行 (N)」 on the guard's 拍照 page (JB217-7): every 出门条 of this
 * phone's project that is sent and not yet released, newest first. Opening
 * one is the 出门条 window, where the guard checks, photographs and releases.
 */
export function ExitPassWaitingList({ project }: { project: string }) {
  const t = useTranslations("exitPass");
  const waiting = useQuery({
    queryKey: ["exit-passes", "waiting", project],
    queryFn: () => getExitPassesWaiting(project || undefined),
    // A pass signed in the office reaches the gate without a reload.
    refetchInterval: 60_000,
  });
  const [opened, setOpened] = useState<{ kind: ExitPassKind; record: string } | null>(null);
  const rows = waiting.data?.results ?? [];
  return (
    <section className="surface-panel space-y-3 rounded-xl p-4" data-exit-pass-waiting>
      <div className="flex items-center gap-2">
        <Truck className="size-5 text-primary" />
        <h3 className="text-base font-semibold">
          {t("waiting.title", { count: waiting.data?.count ?? rows.length })}
        </h3>
      </div>
      <QueryFailedNote query={waiting} what={t("waiting.what")} />
      {waiting.isLoading ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </p>
      ) : waiting.isError ? null : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("waiting.empty")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("waiting.help")}</p>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={`${row.kind}:${row.record}`}>
                <WaitingRow row={row} onOpen={() => setOpened({ kind: row.kind, record: row.record })} />
              </li>
            ))}
          </ul>
        </>
      )}
      {opened ? (
        <ExitPassWindow kind={opened.kind} record={opened.record} onClose={() => setOpened(null)} />
      ) : null}
    </section>
  );
}

function WaitingRow({ row, onOpen }: { row: ExitPassWaiting; onOpen: () => void }) {
  const t = useTranslations("exitPass");
  const df = useDateFormat();
  return (
    <button
      type="button"
      onClick={onOpen}
      data-exit-pass-waiting-row={row.reference}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 active:scale-[0.99]",
      )}
    >
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular font-semibold">{row.reference}</span>
          <span className="text-xs text-muted-foreground">{t(`kind.${row.kind}`)}</span>
        </span>
        <span className="block break-words text-sm">{row.summary}</span>
        <span className="block text-xs text-muted-foreground">
          {[
            row.vehicle_plate ? t("waiting.plate", { plate: row.vehicle_plate }) : "",
            t("waiting.sentAt", { when: df.dateTime(row.sent_at) }),
            row.multi_release && row.release_count > 0 ? t("release.trips", { count: row.release_count }) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
        {t("waiting.open")}
      </span>
    </button>
  );
}
