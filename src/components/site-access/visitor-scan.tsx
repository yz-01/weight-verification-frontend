"use client";

/**
 * 访客扫码 (batch H, HD7; I26): scan the pass, read it, then let the person
 * in or out.
 *
 * 「扫码后，手机自动显示访客姓名、公司、电话、访问项目、访问目的、批准人及有效
 * 期限」. Scanning records nothing; the guard reads the whole pass first, with
 * the guard's own project, so a pass for another project, an unknown code, or
 * one not approved, revoked, expired or not valid yet cannot be confirmed -
 * and the screen says which.
 *
 * A visitor (I26, ID63) has two more checks before 放行, because anyone can
 * walk in with somebody else's QR code: 「门岗扫描访客二维码后，先拍摄访客现场
 * 照片，再等待接待人电子确认」. Photo (required) → 「通知接待人」 (choosing the
 * host when the pass names none) → waiting, with who was asked and how long
 * → green 「已确认（某某 hh:mm）」 → 放行. A declined visitor is red, with the
 * host's reason. The screen looks again every few seconds while it waits, so
 * the host's answer shows within seconds. On the way out the same QR records
 * the exit on the same visit. A worker's or a lorry's pass keeps its two
 * buttons, unchanged.
 *
 * One panel for the guard's phone (bound to its project) and the office's
 * 工地门禁 › 访客扫码 tab (the page's project). Visitors still at the gate are
 * listed under it, so a reload or a second visitor never loses the first.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  Keyboard,
  Loader2,
  LogIn,
  LogOut,
  ScanLine,
  ShieldAlert,
  UserRoundSearch,
  X,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { GateQrScanner } from "@/components/site-access/gate-qr-scanner";
import {
  useArrivalAnswer,
  visitorArrivalKey,
  VisitorHostPicker,
} from "@/components/site-access/visitor-arrival";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import type {
  GatePassCheck,
  GatePassRefusal,
  GatePhotoDraft,
  VisitorArrival,
} from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { requestLocation, type LocationFix } from "@/lib/field-location";
import { cn } from "@/lib/utils";
import {
  canNotifyHost,
  gateVisitorStep,
  visitStatusTone,
  WAITING_POLL_MS,
  waitedMinutes,
} from "@/lib/visitor-arrival";
import {
  cancelVisitorArrival,
  checkGatePass,
  confirmGatePass,
  getOpenVisitorArrivals,
  getVisitorArrival,
  startVisitorArrival,
} from "@/services/site-access.service";

/** The bare token from a scanned link, a `MSEACCESS:` value or a typed one. */
export function passToken(value: string) {
  const scan = value.match(/[?&]scan=([^&]+)/)?.[1];
  if (scan) return decodeURIComponent(scan);
  return value.startsWith("MSEACCESS:")
    ? value.slice("MSEACCESS:".length).trim()
    : value.trim();
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function VisitorScanPanel({
  project: givenProject,
  lockProject,
  initialToken = "",
  initialArrival = "",
  onRecorded,
}: {
  /** The guard's project (the phone's bound one, or the page's). */
  project: string;
  /** The phone is bound to its project; the office may choose. */
  lockProject: boolean;
  /** A pass link opened on this page (`?scan=`). */
  initialToken?: string;
  /** A visit opened from its notice (`?gate_arrival=`): picked up again. */
  initialArrival?: string;
  onRecorded?: () => void;
}) {
  const t = useTranslations("siteControl.visitorScan");
  const ta = useTranslations("siteControl.visitorArrival");
  const tType = useTranslations("siteControl.subjectType");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const answerText = useArrivalAnswer();
  const [project, setProject] = useState(givenProject);
  const [seenProject, setSeenProject] = useState(givenProject);
  if (seenProject !== givenProject) {
    setSeenProject(givenProject);
    setProject(givenProject);
  }
  const [scannerOpen, setScannerOpen] = useState(false);
  const [otherWays, setOtherWays] = useState(false);
  const [typed, setTyped] = useState("");
  const [token, setToken] = useState("");
  const [recorded, setRecorded] = useState<{ name: string; direction: "ENTRY" | "EXIT"; at: string } | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [arrivalId, setArrivalId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<GatePhotoDraft[]>([]);
  // J33-2: the visitor's way out, photographed before 确认退场.
  const [exitPhoto, setExitPhoto] = useState<File | null>(null);
  const [chosenHost, setChosenHost] = useState<{ id: string; name: string } | null>(null);
  const [changingHost, setChangingHost] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const eventId = useRef("");
  const startId = useRef("");

  // Where the gate is, when the phone can say; the record keeps it.
  useEffect(() => {
    requestLocation().then(setFix).catch(() => setFix(null));
  }, []);

  const check = useMutation({
    mutationFn: (value: string) => checkGatePass(project, value),
    onSuccess: (found) => {
      if (found.arrival) {
        queryClient.setQueryData(visitorArrivalKey(found.arrival.id), found.arrival);
        setArrivalId(found.arrival.id);
      }
    },
  });

  // The visit on screen, looked at again every few seconds while the host
  // decides (「门岗画面几秒内变绿」).
  const live = useQuery({
    queryKey: visitorArrivalKey(arrivalId ?? ""),
    queryFn: () => getVisitorArrival(arrivalId ?? ""),
    enabled: Boolean(arrivalId),
    refetchInterval: (query) =>
      query.state.data?.status === "AWAITING_HOST" ? WAITING_POLL_MS : false,
    refetchIntervalInBackground: true,
  });
  const arrival: VisitorArrival | null = arrivalId ? (live.data ?? null) : null;
  const result: GatePassCheck | undefined = check.data;
  const step = gateVisitorStep(result, arrival);

  // The minutes waited move on while the screen waits.
  useEffect(() => {
    if (step !== "waiting") return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [step]);

  const open = useQuery({
    queryKey: ["visitor-arrivals", "open", project],
    queryFn: () => getOpenVisitorArrivals(project),
    enabled: Boolean(project),
    refetchInterval: 10_000,
  });

  const passHost =
    result?.pass?.host_user && !changingHost
      ? { id: result.pass.host_user, name: result.pass.host_user_name ?? "" }
      : null;
  const host = chosenHost ?? passHost;

  const reset = () => {
    setToken("");
    setArrivalId(null);
    setPhotos([]);
    setExitPhoto(null);
    setChosenHost(null);
    setChangingHost(false);
    check.reset();
  };

  const confirm = useMutation({
    mutationFn: (direction: "ENTRY" | "EXIT") =>
      confirmGatePass({
        project,
        qr_value: token,
        direction,
        client_event_id: eventId.current,
        ...(direction === "ENTRY" && arrival ? { arrival: arrival.id } : {}),
        ...(fix ? { latitude: fix.latitude, longitude: fix.longitude } : {}),
        ...(direction === "EXIT" && exitPhoto ? { photo: exitPhoto } : {}),
      }),
    onSuccess: (row) => {
      setRecorded({
        name: row.pass.subject_name,
        direction: row.event.direction,
        at: row.event.occurred_at,
      });
      reset();
      void queryClient.invalidateQueries({ queryKey: ["visitor-arrivals"] });
      void queryClient.invalidateQueries({ queryKey: ["visitor-records"] });
      onRecorded?.();
    },
  });

  const start = useMutation({
    mutationFn: () =>
      startVisitorArrival({
        project,
        qr_value: token,
        ...(host ? { host: host.id } : {}),
        client_event_id: startId.current,
        photos,
        ...(fix
          ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
          : {}),
      }),
    onSuccess: (row) => {
      queryClient.setQueryData(visitorArrivalKey(row.id), row);
      setArrivalId(row.id);
      setPhotos([]);
      void queryClient.invalidateQueries({ queryKey: ["visitor-arrivals", "open"] });
    },
    onError: (error) => {
      // Somebody else started this visitor a moment ago: pick theirs up.
      if (error instanceof ApiError && error.code === "visitor_arrival_already_open") {
        check.mutate(token);
      }
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelVisitorArrival(id),
    onSuccess: (row) => {
      queryClient.setQueryData(visitorArrivalKey(row.id), row);
      setArrivalId(null);
      startId.current = newId("visitor-arrival");
      void queryClient.invalidateQueries({ queryKey: ["visitor-arrivals", "open"] });
      if (token) check.mutate(token);
    },
  });

  const read = (value: string) => {
    const bare = passToken(value);
    if (!bare || !project) return;
    setToken(bare);
    setRecorded(null);
    setArrivalId(null);
    setPhotos([]);
    setChosenHost(null);
    setChangingHost(false);
    confirm.reset();
    start.reset();
    // A new id per pass read: confirming twice after one read is one record.
    eventId.current = newId("visitor");
    startId.current = newId("visitor-arrival");
    check.mutate(bare);
  };

  // A pass link opened here (`?scan=`) reads that pass once.
  const opened = useRef("");
  useEffect(() => {
    if (!initialToken || !project || opened.current === initialToken) return;
    opened.current = initialToken;
    read(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken, project]);

  // A visit opened from its notice (`?gate_arrival=`): read its pass again,
  // and show that visit - green, red or still waiting.
  const resumed = useRef("");
  useEffect(() => {
    if (!initialArrival || !project || resumed.current === initialArrival) return;
    resumed.current = initialArrival;
    getVisitorArrival(initialArrival)
      .then((row) => {
        if (!row.qr_value) return;
        read(row.qr_value);
        queryClient.setQueryData(visitorArrivalKey(row.id), row);
        setArrivalId(row.id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialArrival, project]);

  const refusal: GatePassRefusal | null =
    result?.refusal ??
    (confirm.error instanceof ApiError && confirm.error.code?.startsWith("gate_pass_")
      ? (confirm.error.code.slice("gate_pass_".length) as GatePassRefusal)
      : null);

  const waiting = (open.data ?? []).filter((row) => row.id !== arrival?.id);
  const startError =
    start.isError && !(start.error instanceof ApiError && start.error.code === "visitor_arrival_already_open");

  return (
    <div className="surface-panel mx-auto w-full max-w-2xl space-y-4 rounded-xl p-4 sm:p-6" data-visitor-scan>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      {!lockProject && (
        <FieldWrapper label={t("project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(value) => {
              setProject(value);
              reset();
            }}
            placeholder={t("chooseProject")}
          />
        </FieldWrapper>
      )}
      <div className="grid gap-2">
        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-base"
          disabled={!project}
          disabledReason={!project ? t("chooseProjectFirst") : undefined}
          onClick={() => setScannerOpen(true)}
          data-gate-camera
        >
          <Camera />
          {t("scan")}
        </Button>
        <div className="rounded-lg border border-dashed">
          <button
            type="button"
            aria-expanded={otherWays}
            onClick={() => setOtherWays((value) => !value)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            <Keyboard className="size-4 shrink-0" />
            <span className="flex-1">{t("otherWays")}</span>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform", otherWays && "rotate-180")} />
          </button>
          {otherWays && (
            <div className="flex gap-2 px-3 pb-3">
              <Input
                autoFocus
                aria-label={t("otherWays")}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && typed.trim()) {
                    read(typed);
                    setTyped("");
                  }
                }}
                placeholder={t("typePlaceholder")}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!typed.trim() || !project}
                disabledReason={
                  !project ? t("chooseProjectFirst") : !typed.trim() ? t("typePlaceholder") : undefined
                }
                onClick={() => {
                  read(typed);
                  setTyped("");
                }}
              >
                <ScanLine />
                {t("read")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {check.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("reading")}
        </p>
      )}
      {check.isError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {check.error instanceof Error ? check.error.message : t("readFailed")}
        </p>
      )}

      {result?.pass && (
        <section className="space-y-3 rounded-lg border p-4" data-visitor-pass>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-lg font-semibold">{result.pass.subject_name ?? result.pass.pass_no}</p>
            <p className="text-sm tabular text-muted-foreground">{result.pass.pass_no}</p>
          </div>
          {result.refusal !== "other_project" && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {result.pass.subject_type && (
                <Fact label={t("field.type")} value={tType(result.pass.subject_type)} />
              )}
              <Fact label={t("field.company")} value={result.pass.subject_company ?? ""} />
              <Fact label={t("field.phone")} value={result.pass.phone ?? ""} />
              <Fact label={t("field.project")} value={result.pass.project_name} />
              <Fact label={t("field.purpose")} value={result.pass.purpose ?? ""} />
              {result.pass.vehicle_plate ? (
                <Fact label={t("field.vehicle")} value={result.pass.vehicle_plate} />
              ) : null}
              {result.pass.host_user_name || result.pass.host_name ? (
                <Fact label={t("field.host")} value={result.pass.host_user_name || result.pass.host_name || ""} />
              ) : null}
              <Fact label={t("field.approvedBy")} value={result.pass.approved_by_name ?? ""} />
              <Fact
                label={t("field.validity")}
                value={
                  result.pass.valid_from && result.pass.valid_until
                    ? `${df.dateTime(result.pass.valid_from)} – ${df.dateTime(result.pass.valid_until)}`
                    : ""
                }
              />
              {result.last_direction && result.last_at ? (
                <Fact
                  label={t("field.last")}
                  value={t(`last.${result.last_direction}`, { time: df.dateTime(result.last_at) })}
                />
              ) : null}
            </dl>
          )}
          {result.refusal === "other_project" && (
            <p className="text-sm text-muted-foreground">
              {t("field.project")}: {result.pass.project_name}
            </p>
          )}
        </section>
      )}

      {refusal && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          data-visitor-refusal={refusal}
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          {t(`refusal.${refusal}`)}
        </p>
      )}

      {result && !result.refusal && step === "other" && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-14 text-base"
            disabled={!result.can_enter || confirm.isPending}
            disabledReason={!result.can_enter ? t("refusal.already_inside") : undefined}
            onClick={() => confirm.mutate("ENTRY")}
          >
            {confirm.isPending && confirm.variables === "ENTRY" ? <Loader2 className="animate-spin" /> : <LogIn />}
            {t("confirmEntry")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-base"
            disabled={!result.can_exit || confirm.isPending}
            disabledReason={!result.can_exit ? t("refusal.already_outside") : undefined}
            onClick={() => confirm.mutate("EXIT")}
          >
            {confirm.isPending && confirm.variables === "EXIT" ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("confirmExit")}
          </Button>
        </div>
      )}

      {result && !result.refusal && step === "exit" && (
        <section className="space-y-3" data-visitor-step="exit">
          {/* 「退场没有照片证据」 (J33-2): photographed on the way out too,
              unless the company switched it off. */}
          {result.exit_photo_required !== false && (
            <FieldWrapper label={t("exitPhoto.label")} required hint={t("exitPhoto.hint")}>
              <FieldCamera
                label={exitPhoto ? t("exitPhoto.retake") : t("exitPhoto.take")}
                file={exitPhoto ?? undefined}
                onCapture={(file) => setExitPhoto(file)}
                onClear={() => setExitPhoto(null)}
              />
            </FieldWrapper>
          )}
          <Button
            size="lg"
            className="h-14 w-full text-base"
            requires={[[result.exit_photo_required === false || Boolean(exitPhoto), t("exitPhoto.label")]]}
            disabled={confirm.isPending}
            onClick={() => confirm.mutate("EXIT")}
            data-visitor-exit
          >
            {confirm.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("confirmExit")}
          </Button>
        </section>
      )}

      {result && !result.refusal && step === "photo" && (
        <section className="space-y-4 rounded-lg border p-4" data-visitor-step="photo">
          <FieldWrapper label={ta("field.photo")} required hint={ta("photoHint")}>
            <div className="space-y-2">
              <FieldCamera
                label={photos.length ? ta("takeAnother", { count: photos.length }) : ta("takePhoto")}
                fileCount={photos.length}
                onCapture={(file) =>
                  setPhotos((items) => [
                    ...items,
                    {
                      file,
                      captured_at: new Date().toISOString(),
                      client_event_id: newId("visitor-photo"),
                      ...(fix
                        ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
                        : {}),
                    },
                  ])
                }
                onClear={() => setPhotos([])}
              />
              <DraftTray
                photos={photos}
                onRemove={(id) => setPhotos((items) => items.filter((item) => item.client_event_id !== id))}
              />
            </div>
          </FieldWrapper>
          <FieldWrapper label={ta("field.host")} required hint={ta("hostHint")}>
            {passHost ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span className="font-medium">{passHost.name}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setChangingHost(true)}>
                  <UserRoundSearch />
                  {ta("changeHost")}
                </Button>
              </div>
            ) : (
              <VisitorHostPicker
                project={project}
                value={chosenHost?.id ?? ""}
                excludeSelf
                onChange={(id, name) => setChosenHost(id ? { id, name } : null)}
                selectedLabel={chosenHost?.name}
              />
            )}
          </FieldWrapper>
          {startError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {start.error instanceof Error ? start.error.message : ta("startFailed")}
            </p>
          )}
          <Button
            size="lg"
            className="h-14 w-full text-base"
            requires={[
              [photos.length > 0, ta("field.photo")],
              [canNotifyHost(1, host?.id), ta("field.host")],
            ]}
            disabled={start.isPending}
            onClick={() => start.mutate()}
            data-visitor-notify
          >
            {start.isPending ? <Loader2 className="animate-spin" /> : <BellRing />}
            {ta("notifyHost")}
          </Button>
        </section>
      )}

      {arrival && step === "waiting" && (
        <section
          className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4"
          role="status"
          data-visitor-step="waiting"
        >
          <div className="flex items-start gap-3">
            <ArrivalThumb arrival={arrival} />
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 font-semibold">
                <Loader2 className="size-4 animate-spin" />
                {ta("waiting", { host: arrival.host_name })}
              </p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" />
                {ta("waited", { minutes: waitedMinutes(arrival.arrived_at, now) })}
              </p>
              <p className="text-xs text-muted-foreground">{ta("waitingHelp")}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(arrival.id)}
          >
            {cancel.isPending ? <Loader2 className="animate-spin" /> : <X />}
            {ta("cancel")}
          </Button>
        </section>
      )}

      {arrival && step === "confirmed" && (
        <section
          className="space-y-3 rounded-lg border border-success/40 bg-success/10 p-4"
          role="status"
          data-visitor-step="confirmed"
        >
          <div className="flex items-start gap-3">
            <ArrivalThumb arrival={arrival} />
            <p className="flex items-start gap-2 text-lg font-bold text-success">
              <CheckCircle2 className="mt-1 size-6 shrink-0" />
              {answerText(arrival)}
            </p>
          </div>
          <Button
            size="lg"
            className="h-16 w-full text-lg"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate("ENTRY")}
            data-visitor-let-in
          >
            {confirm.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
            {ta("letIn")}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(arrival.id)}
          >
            <X />
            {ta("cancel")}
          </Button>
        </section>
      )}

      {arrival && step === "declined" && (
        <section
          className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
          role="alert"
          data-visitor-step="declined"
        >
          <p className="flex items-start gap-2 text-lg font-bold text-destructive">
            <XCircle className="mt-1 size-6 shrink-0" />
            {answerText(arrival)}
          </p>
          <p className="text-sm text-destructive">{ta("declinedHelp")}</p>
          <Button variant="outline" className="w-full" onClick={reset}>
            <ScanLine />
            {ta("next")}
          </Button>
        </section>
      )}
      <QueryFailedNote query={live} what={ta("what")} />

      {confirm.isError && !refusal && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {confirm.error instanceof Error ? confirm.error.message : t("recordFailed")}
        </p>
      )}

      {recorded && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-center" role="status">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="mt-2 font-semibold">{recorded.name}</p>
          <p className="text-sm text-muted-foreground">
            {t(`recorded.${recorded.direction}`, { time: df.dateTime(recorded.at) })}
          </p>
        </div>
      )}

      {waiting.length > 0 && (
        <section className="space-y-2" data-visitor-open>
          <h3 className="text-sm font-semibold">{ta("openTitle")}</h3>
          <ul className="divide-y rounded-lg border">
            {waiting.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  onClick={() => {
                    if (row.qr_value) read(row.qr_value);
                  }}
                >
                  <ArrivalThumb arrival={row} small />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.subject_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {ta("hostLine", { host: row.host_name })} · {df.time(row.arrived_at)}
                    </span>
                  </span>
                  <StatusBadge label={ta(`status.${row.visit_status}`)} tone={visitStatusTone(row.visit_status)} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <QueryFailedNote query={open} what={ta("whatOpen")} />

      <GateQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(value) => {
          setScannerOpen(false);
          read(value);
        }}
      />
    </div>
  );
}

/** The visitor's gate photo, stamped, so the guard can compare the face. */
function ArrivalThumb({ arrival, small = false }: { arrival: VisitorArrival; small?: boolean }) {
  const ta = useTranslations("siteControl.visitorArrival");
  const first = arrival.photos[0];
  if (!first) return null;
  return (
    <img
      src={first.thumbnail || first.watermarked_image}
      alt={ta("photoOf", { name: arrival.subject_name })}
      className={cn("shrink-0 rounded-md border object-cover", small ? "size-10" : "size-20")}
    />
  );
}

/** Photos taken and not yet sent, each removable. */
function DraftTray({ photos, onRemove }: { photos: GatePhotoDraft[]; onRemove: (id: string) => void }) {
  const ta = useTranslations("siteControl.visitorArrival");
  const urls = useMemo(
    () => photos.map((photo) => [photo.client_event_id, URL.createObjectURL(photo.file)] as const),
    [photos],
  );
  useEffect(() => () => urls.forEach(([, url]) => URL.revokeObjectURL(url)), [urls]);
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {urls.map(([id, url], index) => (
        <li key={id} className="relative overflow-hidden rounded-md border bg-muted">
          <img src={url} alt={ta("photoNumber", { number: index + 1 })} className="aspect-square w-full object-cover object-bottom" />
          <button
            type="button"
            aria-label={ta("removePhoto", { number: index + 1 })}
            className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-overlay text-overlay-foreground"
            onClick={() => onRemove(id)}
          >
            <X className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value || "—"}</dd>
    </>
  );
}
