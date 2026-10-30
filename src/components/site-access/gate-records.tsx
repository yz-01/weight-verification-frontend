"use client";

/**
 * 门岗 on the phone (C22; batch H HD5/HD6; I14 ID31/ID32): what a guard does
 * at the gate.
 *
 * Two big buttons, 「拍照」 and 「扫访客二维码」 - the client: 「门岗扫访客二维码
 * 为什么分开两个模块？」 - so the visitor scan (`VisitorScanPanel`) is here
 * rather than a tile of its own. The photo needs no typing (「门岗手机端不需要
 * 给他有备注住打字，门岗只需要有沟通按钮让他沟通」): take the photos, then
 * 「发送」 - every photo its own Photo Record, 「进场及退场照片分别保存」, filed
 * with no bell rung - or 「发送并沟通」: pick who on the project should deal
 * with it, the photos become one Gate Issue, those people get a to-do with
 * its sound, and its conversation opens, where saying something is
 * optional. Every recent record has 「沟通」 too: a plain photo becomes an
 * issue the same way (`start_gate_conversation`). An issue stays 处理中 until
 * one of those asked in (or whoever manages site access) confirms it
 * finished.
 *
 * The office reads the same records under 工地门禁 → 日常拍照记录 / 门岗事项
 * (`gate-records-office.tsx`) and opens them in the same detail dialog.
 *
 * Every photo carries its own project, guard, time and GPS, and a photo taken
 * where the phone could not say where it was says so instead of borrowing a
 * position (D09). Sent through the offline queue (H12): taken offline, it
 * goes once the network is back, once.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CheckCircle2,
  DoorOpen,
  Images,
  Loader2,
  Lock,
  MapPin,
  MessagesSquare,
  Plus,
  ScanLine,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { RecordConversationPanel } from "@/components/shared/record-conversation";
import {
  RecordDetailDialog,
  RecordDetailShell,
  RecordRecorder,
  ShellPanel,
} from "@/components/shared/record-detail-shell";
import {
  CORRECTED_ROW_CLASS,
  CorrectedTag,
  RecordCorrectionButton,
  RecordCorrectionHistory,
} from "@/components/shared/record-correction";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { VisitorScanPanel } from "@/components/site-access/visitor-scan";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import {
  type GateIncident,
  type GateIncidentDetail,
  type GateIssueStatus,
  type GateMemberOption,
  type GatePhotoDraft,
} from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { requestLocation, type LocationFix } from "@/lib/field-location";
import { recordConversationKey } from "@/lib/record-chat";
import { cn } from "@/lib/utils";
import { useRoleLabel } from "@/lib/role-labels";
import {
  submitGateIssueOfflineAware,
  submitGatePhotoOfflineAware,
} from "@/services/offline-sync.service";
import {
  addGateIncidentMembers,
  addGateIncidentPhotos,
  closeGateIssue,
  getGateIncident,
  getGateIncidents,
  getGateMemberOptions,
  startGateConversation,
} from "@/services/site-access.service";

const PAGE_SIZE = 20;

function newEventId() {
  return `gate-${crypto.randomUUID()}`;
}

/** Ask once for where the phone is; a refusal is an answer, not an error. */
function useGateLocation() {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  const refresh = () => {
    requestLocation()
      .then((value) => {
        setFix(value);
        setFailed(false);
      })
      .catch(() => {
        setFix(null);
        setFailed(true);
      });
  };
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    refresh();
  }, []);
  return { fix, failed, refresh };
}

/** The two big buttons at the top of the phone's 门岗 (I14, ID32). */
export type GateAction = "photo" | "scan";

/**
 * The guard's 门岗 on the phone: 「拍照」 or 「扫访客二维码」, and the latest
 * gate records of the project below, each with 「沟通」. A person asked into a
 * gate issue lands here from the notice (`?gate_incident=`) and the issue
 * opens over it.
 */
export function GateRecordsPanel({
  initialProject = "",
  initialAction = "photo",
}: {
  /** The phone's bound project. */
  initialProject?: string;
  /** An old 访客扫码 link opens on the scan (the tile it named is gone). */
  initialAction?: GateAction;
} = {}) {
  const t = useTranslations("siteControl.gateRecords");
  const tp = useTranslations("siteControl.gatePhoto");
  const { can } = useAuth();
  const search = useSearchParams();
  // `gate_incident`, not `incident`: the phone already reads `incident` as a
  // hazard, and a gate record's id there would open the wrong thing.
  const [openId, setOpenId] = useState<string | null>(() => search.get("gate_incident"));
  // Opened to talk (「沟通」): the dialog scrolls to the conversation.
  const [openToTalk, setOpenToTalk] = useState(() => search.get("talk") === "1");
  // Every notice tapped opens its issue, not only the first: the phone
  // writes the address in place (`openFieldHref`), so this page may already
  // be showing - or read the address a moment before it changed - and the
  // capture screen came up with nothing open (客户 10-30: 「他就飘到门岗的页面」).
  // A message's notice (`&talk=1`) opens it at the conversation.
  const linked = `${search.get("gate_incident") ?? ""}|${search.get("talk") ?? ""}`;
  const [followed, setFollowed] = useState(linked);
  if (linked !== followed) {
    setFollowed(linked);
    const id = search.get("gate_incident");
    if (id) {
      setOpenId(id);
      setOpenToTalk(search.get("talk") === "1");
    }
  }
  const [talkingAbout, setTalkingAbout] = useState<GateIncident | null>(null);
  const [project, setProject] = useState(initialProject);
  // A visit opened from its notice (I26: 「访客已确认，可以放行」) opens the scan on it.
  const gateArrival = search.get("gate_arrival") ?? "";
  const [action, setAction] = useState<GateAction>(gateArrival ? "scan" : initialAction);
  const mayScan = can("site_access.scan");
  const open = (id: string, talk = false) => {
    setOpenId(id);
    setOpenToTalk(talk);
  };
  // 「沟通」: an issue opens at its conversation; a plain photo first asks who
  // to talk to, which makes it an issue (ID31).
  const talk = (row: GateIncident) => (row.is_issue ? open(row.id, true) : setTalkingAbout(row));

  const rows = useInfiniteQuery({
    queryKey: ["gate-incidents", "phone", project],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getGateIncidents({
        page: pageParam,
        page_size: PAGE_SIZE,
        sort_by: "occurred_at",
        sort_order: "desc",
        ...(project ? { project } : {}),
      }),
    getNextPageParam: (last, pages) =>
      pages.reduce((sum, page) => sum + page.results.length, 0) < last.count
        ? pages.length + 1
        : undefined,
  });
  const loaded = rows.data?.pages.flatMap((page) => page.results) ?? [];
  const total = rows.data?.pages[0]?.count ?? 0;

  return (
    <div className="space-y-4">
      {mayScan && (
        <>
          <div className="grid grid-cols-2 gap-3" role="group" aria-label={tp("title")} data-gate-actions>
            {(["photo", "scan"] as const).map((key) => {
              const Icon = key === "photo" ? Camera : ScanLine;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={action === key}
                  data-gate-action={key}
                  onClick={() => setAction(key)}
                  className={cn(
                    "surface-panel flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl p-3 text-base font-semibold transition-colors active:scale-[0.98]",
                    action === key
                      ? "border-primary bg-primary/10 text-primary shadow-glow-sm"
                      : "hover:border-primary/50",
                  )}
                >
                  <Icon className="size-7" />
                  {tp(`action.${key}`)}
                </button>
              );
            })}
          </div>
          {action === "photo" ? (
            <GatePhotoCapture
              project={project}
              lockProject={Boolean(initialProject)}
              onProjectChange={setProject}
              onTalk={(id) => open(id, true)}
            />
          ) : (
            <VisitorScanPanel
              project={project}
              lockProject={Boolean(initialProject)}
              initialArrival={gateArrival}
            />
          )}
        </>
      )}

      <div className="flex items-center gap-2 pt-2">
        <DoorOpen className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("recentTitle")}</h3>
      </div>
      <QueryFailedNote query={rows} what={t("what")} />
      {rows.isLoading ? (
        <Empty text={t("loading")} />
      ) : !total ? (
        <Empty text={t("empty")} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("count", { shown: loaded.length, total })}</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {loaded.map((row) => (
              <li key={row.id}>
                <GateIncidentCard
                  row={row}
                  onOpen={() => open(row.id)}
                  onTalk={mayScan ? () => talk(row) : undefined}
                />
              </li>
            ))}
          </ul>
          {rows.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={rows.isFetchingNextPage}
              onClick={() => void rows.fetchNextPage()}
            >
              {rows.isFetchingNextPage && <Loader2 className="animate-spin" />}
              {t("loadMore")}
            </Button>
          )}
        </>
      )}

      {openId && (
        <GateIncidentDetailDialog
          id={openId}
          focusConversation={openToTalk}
          onClose={() => {
            setOpenId(null);
            setOpenToTalk(false);
          }}
        />
      )}
      {talkingAbout && (
        <GateTalkDialog
          incident={talkingAbout}
          onClose={() => setTalkingAbout(null)}
          onStarted={(row) => {
            setTalkingAbout(null);
            open(row.id, true);
          }}
        />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/** 处理中 / 已完成 on a Gate Issue (HD6); nothing on a plain photo. */
export function GateIssueStatusBadge({ status }: { status: GateIssueStatus | null }) {
  const t = useTranslations("siteControl.gateRecords");
  if (!status) return null;
  return (
    <StatusBadge
      label={t(`issueStatus.${status}`)}
      tone={status === "OPEN" ? "warning" : "positive"}
    />
  );
}

function GateIncidentCard({
  row,
  onOpen,
  onTalk,
}: {
  row: GateIncident;
  onOpen: () => void;
  /** 「沟通」 (I14): absent for somebody who may only read gate records. */
  onTalk?: () => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const df = useDateFormat();
  return (
    <div className={cn("surface-panel flex w-full items-center gap-2 rounded-xl p-3", row.was_corrected && CORRECTED_ROW_CLASS)}>
      {/* 「已修改」 at the front (J20); it opens the history, the card the record. */}
      {row.was_corrected && <CorrectedTag kind="GATE_INCIDENT" recordId={row.id} />}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 gap-3 rounded-lg text-left transition-colors hover:bg-muted/40"
      >
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
          {row.cover_photo ? (
            <img loading="lazy" decoding="async" src={row.cover_photo} alt={t("photoAlt")} className="size-full object-cover" />
          ) : (
            <Images className="text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular">{row.incident_no}</span>
            {row.is_issue && <span className="text-xs font-medium text-warning">{t("kind.issue")}</span>}
            <GateIssueStatusBadge status={row.issue_status} />
          </span>
          <span className="block truncate text-sm text-muted-foreground">{row.project_name}</span>
          <span className="block text-xs text-muted-foreground">
            {row.guard_name} · {df.dateTime(row.occurred_at)} · {t("photoCount", { count: row.photo_count })}
          </span>
          {row.issue_note && (
            <span className="block truncate text-xs text-foreground">{row.issue_note}</span>
          )}
        </span>
      </button>
      {onTalk ? (
        <Button
          variant="outline"
          className="h-11 shrink-0 self-center"
          data-gate-talk={row.id}
          onClick={onTalk}
        >
          <MessagesSquare />
          {t("talk")}
        </Button>
      ) : null}
    </div>
  );
}

/** Photos taken but not yet saved, each with its own moment and fix. */
function PhotoTray({
  photos,
  onRemove,
}: {
  photos: GatePhotoDraft[];
  onRemove: (eventId: string) => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const urls = useMemo(
    () => photos.map((photo) => [photo.client_event_id, URL.createObjectURL(photo.file)] as const),
    [photos],
  );
  useEffect(() => () => urls.forEach(([, url]) => URL.revokeObjectURL(url)), [urls]);
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {urls.map(([eventId, url], index) => (
        <li key={eventId} className="relative overflow-hidden rounded-md border bg-muted">
          <img src={url} alt={t("photoNumber", { number: index + 1 })} className="aspect-4/3 w-full object-cover object-bottom" />
          <button
            type="button"
            aria-label={t("removePhoto", { number: index + 1 })}
            className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-overlay text-overlay-foreground"
            onClick={() => onRemove(eventId)}
          >
            <X className="size-4" />
          </button>
          <span className="absolute bottom-0 left-0 right-0 bg-overlay px-1 py-0.5 text-xs text-overlay-foreground">
            {photos[index]?.latitude ? t("gpsShort") : t("noGpsShort")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function useContinuousCamera(fix: LocationFix | null) {
  const [photos, setPhotos] = useState<GatePhotoDraft[]>([]);
  const add = (file: File) =>
    setPhotos((items) => [
      ...items,
      {
        file,
        captured_at: new Date().toISOString(),
        client_event_id: newEventId(),
        ...(fix
          ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
          : {}),
      },
    ]);
  const remove = (eventId: string) =>
    setPhotos((items) => items.filter((item) => item.client_event_id !== eventId));
  return { photos, add, remove, clear: () => setPhotos([]) };
}

function LocationLine({ fix, failed, onRetry }: { fix: LocationFix | null; failed: boolean; onRetry: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <MapPin className={fix ? "size-4 text-success" : "size-4 text-muted-foreground"} />
      <span className={failed ? "text-destructive" : "text-muted-foreground"}>
        {fix
          ? t("locationReady", { latitude: fix.latitude, longitude: fix.longitude })
          : failed
            ? t("locationFailed")
            : t("locating")}
      </span>
      {!fix && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t("retryLocation")}
        </Button>
      )}
    </div>
  );
}

/**
 * 门岗拍照 (HD5, I14): photos, then 「发送」 or 「发送并沟通」. Nothing to type.
 *
 * 「发送」: each photo is sent as its own record and filed. 「发送并沟通」:
 * pick the people of this project who should deal with it; the photos go as
 * one Gate Issue, they get a to-do with its sound, and its conversation opens
 * - typing there is optional. Both wait only for the project and a photo,
 * and say so on the form, not only in a tooltip a phone never shows (F1).
 */
function GatePhotoCapture({
  project,
  lockProject,
  onProjectChange,
  onTalk,
}: {
  project: string;
  /** The phone is bound to its project; only an unbound account chooses. */
  lockProject: boolean;
  onProjectChange: (project: string) => void;
  /** 「发送并沟通」 reached the server: open the new issue at its conversation. */
  onTalk: (id: string) => void;
}) {
  const t = useTranslations("siteControl.gatePhoto");
  const tr = useTranslations("siteControl.gateRecords");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { fix, failed, refresh } = useGateLocation();
  const camera = useContinuousCamera(fix);
  const [choosing, setChoosing] = useState(false);
  const [sent, setSent] = useState<{ count: number; queued: boolean; talk: boolean } | null>(null);
  // One id per Gate Issue being sent, kept across a retry so a resend after
  // a lost answer lands once.
  const issueEventId = useRef(newEventId());
  // One key per 「发送」 (JB35), kept across a retry: the office shows the
  // press's photos as one row. Nothing changes on the phone.
  const uploadBatch = useRef(newEventId());
  const where = fix
    ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
    : {};

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
    void queryClient.invalidateQueries({ queryKey: ["gate-summary"] });
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("signedOut"));
      // 「进场及退场照片分别保存」: one photo, one record. Each record's id is
      // its photo's own, so a retry of any of them lands once.
      const outcomes = [];
      for (const photo of camera.photos) {
        outcomes.push(
          await submitGatePhotoOfflineAware(user.id, {
            project,
            is_issue: false,
            members: [],
            client_event_id: `${photo.client_event_id}-record`,
            upload_batch: uploadBatch.current,
            photos: [photo],
            ...where,
          }),
        );
      }
      return outcomes;
    },
    onSuccess: (outcomes) => {
      setSent({ count: camera.photos.length, queued: outcomes.includes("queued"), talk: false });
      camera.clear();
      uploadBatch.current = newEventId();
      refreshLists();
    },
  });

  const sendAndTalk = useMutation({
    mutationFn: async (members: string[]) => {
      if (!user) throw new Error(t("signedOut"));
      return submitGateIssueOfflineAware(user.id, {
        project,
        is_issue: true,
        members,
        client_event_id: issueEventId.current,
        photos: camera.photos,
        ...where,
      });
    },
    onSuccess: (outcome) => {
      setChoosing(false);
      setSent({ count: camera.photos.length, queued: outcome.status === "queued", talk: true });
      camera.clear();
      issueEventId.current = newEventId();
      refreshLists();
      if (outcome.status === "uploaded") onTalk(outcome.incident.id);
    },
  });

  const failure = send.error ?? sendAndTalk.error;

  return (
    <section className="surface-panel space-y-4 rounded-xl p-4" data-gate-photo-capture>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      {!lockProject && (
        <FieldWrapper label={tr("field.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={onProjectChange}
            placeholder={tr("field.chooseProject")}
          />
        </FieldWrapper>
      )}
      <FieldWrapper label={tr("field.photos")} required hint={t("photosHint")}>
        <div className="space-y-2">
          <FieldCamera
            label={camera.photos.length ? tr("takeAnother", { count: camera.photos.length }) : tr("takePhoto")}
            fileCount={camera.photos.length}
            onCapture={(file) => {
              setSent(null);
              camera.add(file);
            }}
            onClear={camera.clear}
          />
          <PhotoTray photos={camera.photos} onRemove={camera.remove} />
          <LocationLine fix={fix} failed={failed} onRetry={refresh} />
        </div>
      </FieldWrapper>

      {failure && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {failure instanceof Error ? failure.message : tr("saveError")}
        </p>
      )}
      {sent && (
        <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success" role="status">
          <CheckCircle2 className="size-4 shrink-0" />
          {sent.queued
            ? sent.talk
              ? t("sentTalkQueued")
              : t("sentQueued")
            : sent.talk
              ? t("sentTalk")
              : t("sentPhotos", { count: sent.count })}
        </p>
      )}
      {!camera.photos.length && !sent && (
        <p className="text-sm text-muted-foreground">{tr("photoFirst")}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          className="h-12"
          requires={[
            [project, tr("field.project")],
            [camera.photos.length > 0, tr("field.photos")],
          ]}
          disabled={send.isPending || sendAndTalk.isPending}
          data-gate-send="plain"
          onClick={() => send.mutate()}
        >
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          {t("send")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          requires={[
            [project, tr("field.project")],
            [camera.photos.length > 0, tr("field.photos")],
          ]}
          disabled={send.isPending || sendAndTalk.isPending}
          data-gate-send="talk"
          onClick={() => setChoosing(true)}
        >
          {sendAndTalk.isPending ? <Loader2 className="animate-spin" /> : <MessagesSquare />}
          {t("sendAndTalk")}
        </Button>
      </div>
      {choosing && project && camera.photos.length > 0 ? (
        <GatePeopleDialog
          project={project}
          description={t("chooseHelpSend", { count: camera.photos.length })}
          confirmLabel={t("sendAndTalk")}
          pending={sendAndTalk.isPending}
          error={sendAndTalk.error}
          onConfirm={(members) => sendAndTalk.mutate(members)}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * 「选处理人员」 (I14, ID31): at least one person on this project, read from
 * the phone's last copy when there is no network (H12), so 「发送并沟通」 can
 * be queued offline too.
 */
function GatePeopleDialog({
  project,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  project: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error: unknown;
  onConfirm: (members: string[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("siteControl.gatePhoto");
  const tr = useTranslations("siteControl.gateRecords");
  const [members, setMembers] = useState<string[]>([]);
  const people = useQuery({
    queryKey: ["gate-member-options", project],
    queryFn: () => memberOptionsOfflineAware(project),
    enabled: Boolean(project),
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg" data-gate-people>
        <DialogHeader>
          <DialogTitle>{t("chooseTitle")}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={people} what={tr("whatPeople")} />
        <FieldWrapper label={t("assignees")} required hint={t("assigneesHint")}>
          <MemberChecklist
            options={people.data ?? []}
            loading={people.isLoading && Boolean(project)}
            selected={members}
            onChange={setMembers}
          />
        </FieldWrapper>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof Error ? error.message : tr("saveError")}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tr("cancel")}
          </Button>
          <Button
            requires={[[members.length > 0, t("assignees")]]}
            disabled={pending}
            onClick={() => onConfirm(members)}
          >
            {pending ? <Loader2 className="animate-spin" /> : <MessagesSquare />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「沟通」 on a gate record already sent (I14, ID31): pick people; a plain
 * photo becomes a Gate Issue (its photo, time and GPS untouched) and its
 * conversation opens. Needs the network - the record is on the server.
 */
function GateTalkDialog({
  incident,
  onClose,
  onStarted,
}: {
  incident: GateIncident;
  onClose: () => void;
  onStarted: (row: GateIncidentDetail) => void;
}) {
  const t = useTranslations("siteControl.gatePhoto");
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: (members: string[]) => startGateConversation(incident.id, members),
    onSuccess: (row) => {
      queryClient.setQueryData(["gate-incident", row.id], row);
      void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["gate-summary"] });
      onStarted(row);
    },
  });
  return (
    <GatePeopleDialog
      project={incident.project}
      description={t("chooseHelpTalk", { reference: incident.incident_no })}
      confirmLabel={t("startTalk")}
      pending={start.isPending}
      error={start.error}
      onConfirm={(members) => start.mutate(members)}
      onClose={onClose}
    />
  );
}

/** Where the phone keeps each project's last list of people to ask in. */
function memberOptionsKey(project: string) {
  return `mse.gate.member-options:${project}`;
}

/**
 * The people a guard may ask in, kept from the last time the phone had a
 * network (H12: 「断网期间仍可拍照、填写资料」), so 「发送并沟通」 can be
 * queued offline. A fresh list from the server always wins.
 */
async function memberOptionsOfflineAware(project: string): Promise<GateMemberOption[]> {
  try {
    const rows = await getGateMemberOptions(project);
    try {
      window.localStorage.setItem(memberOptionsKey(project), JSON.stringify(rows));
    } catch {
      // Storage blocked: the list just needs a network next time.
    }
    return rows;
  } catch (error) {
    if (error instanceof ApiError && error.isNetwork) {
      try {
        const kept = window.localStorage.getItem(memberOptionsKey(project));
        if (kept) return JSON.parse(kept) as GateMemberOption[];
      } catch {
        // Nothing kept: say the list could not be read.
      }
    }
    throw error;
  }
}

function MemberChecklist({
  options,
  loading,
  selected,
  onChange,
}: {
  options: { id: string; full_name: string; role_name: string }[];
  loading: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const roleOf = useRoleLabel();
  if (loading) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (!options.length) return <p className="text-sm text-muted-foreground">{t("noMembers")}</p>;
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
      {options.map((person) => {
        const checked = selected.includes(person.id);
        return (
          <li key={person.id}>
            <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded px-2 hover:bg-muted/50">
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onChange(
                    value
                      ? [...selected, person.id]
                      : selected.filter((id) => id !== person.id),
                  )
                }
              />
              <span className="text-sm font-medium">{person.full_name}</span>
              {person.role_name && (
                <span className="text-xs text-muted-foreground">{roleOf(null, person.role_name)}</span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 「确认结束」 on a Gate Issue (HD6): the record closure every module shares,
 * offered to the people asked in and to whoever manages site access. After
 * it the issue is read-only and keeps all it holds.
 */
function GateIssueClosePanel({ incident }: { incident: GateIncidentDetail }) {
  const t = useTranslations("siteControl.gateRecords");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const close = useMutation({
    mutationFn: () => closeGateIssue(incident.id, note.trim()),
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["gate-incident", incident.id] });
      void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["gate-summary"] });
      void queryClient.invalidateQueries({
        queryKey: recordConversationKey("GATE_INCIDENT", incident.id),
      });
    },
  });

  if (incident.issue_status === "CLOSED") {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-3" data-gate-issue="closed">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="size-4" />
          {t("closedTitle")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("closedBy", {
            name: incident.closed_by_name ?? "",
            when: incident.closed_at ? df.dateTime(incident.closed_at) : "",
          })}
        </p>
      </div>
    );
  }
  if (!incident.may_close) {
    return <p className="text-sm text-muted-foreground">{t("closeWho")}</p>;
  }
  return (
    <div className="space-y-2" data-gate-issue="open">
      <p className="text-xs leading-5 text-muted-foreground">{t("closeHelp")}</p>
      <Textarea
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("closeNotePlaceholder")}
      />
      <Button className="w-full" disabled={close.isPending} onClick={() => close.mutate()}>
        {close.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
        {t("close")}
      </Button>
    </div>
  );
}

/**
 * One gate record in the record popup (E8, Q31). The office's 门岗记录 and the
 * guard's phone open this same dialog; the shell goes to one column on a
 * phone, photographs first. A Gate Issue also shows its note, the people
 * asked in, its status and its conversation; a plain photo is just the photo
 * and its facts.
 */
export function GateIncidentDetailDialog({
  id,
  onClose,
  focusConversation = false,
}: {
  id: string;
  onClose: () => void;
  /** Opened by 「沟通」: bring the conversation into view (I14). */
  focusConversation?: boolean;
}) {
  const t = useTranslations("siteControl.gateRecords");
  const category = useTranslations("siteControl.gateCategory");
  const roleOf = useRoleLabel();
  const df = useDateFormat();
  const { can } = useAuth();
  const detail = useQuery({
    queryKey: ["gate-incident", id],
    queryFn: () => getGateIncident(id),
  });
  const row = detail.data;
  const gateQueries = useQueryClient();
  const [adding, setAdding] = useState<"photos" | "members" | "talk" | null>(null);
  // Each ask to talk (opened by 「沟通」, or 「沟通」 pressed here) brings the
  // conversation into view once it is there.
  const [talkAsks, setTalkAsks] = useState(focusConversation ? 1 : 0);
  const open = row?.issue_status === "OPEN";
  const mayAdd = open && can("site_access.scan");
  const chatRef = useRef<HTMLDivElement>(null);
  const isIssue = Boolean(row?.is_issue);
  useEffect(() => {
    if (!talkAsks || !isIssue) return;
    chatRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [talkAsks, isIssue]);

  return (
    <RecordDetailDialog
      title={row?.incident_no ?? t("title")}

      description={row?.is_issue ? t("issueHelp") : t("detailHelp")}
      onClose={onClose}
      // 预览 · 打印 · 导出 · 发送 on this one record (H16, HD13).
      exportRecord={
        row
          ? { kind: "GATE_INCIDENT", recordId: row.id, reference: row.incident_no, href: `/gate-records?gate_incident=${row.id}` }
          : null
      }
    >
      <QueryFailedNote query={detail} what={t("whatOne")} />
      {detail.isLoading && <Empty text={t("loading")} />}
      {row && (
        <RecordDetailShell
          reference={row.incident_no}
          // 记录人 (E8): who recorded it, with a number to call.
          recorder={<RecordRecorder record={row} />}
          facts={[
            { label: t("field.kind"), value: row.is_issue ? t("kind.issue") : t("kind.photo") },
            ...(row.is_issue
              ? [{ label: t("field.status"), value: <GateIssueStatusBadge status={row.issue_status} /> }]
              : []),
            // Q18: new records carry no category; an older one keeps the one it was given.
            ...(row.category !== "OTHER"
              ? [{ label: t("field.category"), value: category(row.category) }]
              : []),
            { label: t("field.project"), value: row.project_name },
            ...(row.gate_name ? [{ label: t("field.gate"), value: row.gate_name }] : []),
            { label: t("field.guard"), value: row.guard_name },
            { label: t("field.time"), value: df.dateTime(row.occurred_at) },
            // An older record may still point at a pass; new ones never do (HD5).
            ...(row.pass_no
              ? [{ label: t("field.pass"), value: `${row.pass_no} · ${row.pass_subject_name ?? ""}` }]
              : []),
            ...(row.issue_note
              ? [
                  {
                    label: t("field.note"),
                    value: <span className="whitespace-pre-wrap">{row.issue_note}</span>,
                    wide: true,
                  },
                ]
              : []),
            ...(row.description
              ? [
                  {
                    label: t("field.description"),
                    value: <span className="whitespace-pre-wrap">{row.description}</span>,
                    wide: true,
                  },
                ]
              : []),
            ...(row.closed_at
              ? [
                  { label: t("field.closedBy"), value: row.closed_by_name ?? "" },
                  { label: t("field.closedAt"), value: df.dateTime(row.closed_at) },
                ]
              : []),
          ]}
          // Every photo keeps its own gate, guard, time and GPS (D09): the
          // gate and guard in its name, the time and GPS in the viewer.
          photos={row.photos.map((photo, index) => ({
            id: photo.id,
            url: photo.watermarked_image || photo.image,
            label: [
              t("photoNumber", { number: index + 1 }),
              photo.gate_name ? `${t("field.gate")}: ${photo.gate_name}` : "",
              `${t("field.guard")}: ${photo.guard_name}`,
            ]
              .filter(Boolean)
              .join(" · "),
            takenAt: photo.captured_at,
            latitude: photo.latitude,
            longitude: photo.longitude,
          }))}
          photoActions={
            mayAdd ? (
              <Button size="sm" variant="outline" onClick={() => setAdding("photos")}>
                <Plus />
                {t("addPhotos")}
              </Button>
            ) : undefined
          }
          // 【改正】 (I30): only the words - the note and the gate; the
          // photos, time, GPS and guard stay as taken.
          actions={
            can("site_access.manage") ? (
              <RecordCorrectionButton
                kind="GATE_INCIDENT"
                recordId={row.id}
                onCorrected={() => {
                  void detail.refetch();
                  void gateQueries.invalidateQueries({ queryKey: ["gate-incidents"] });
                }}
              />
            ) : undefined
          }
          corrections={<RecordCorrectionHistory kind="GATE_INCIDENT" recordId={row.id} />}
          aside={
            !row.is_issue && can("site_access.scan") ? (
              // 「沟通」 on a plain photo (I14, ID31): pick people, and it
              // becomes a Gate Issue with its conversation.
              <ShellPanel title={t("talkTitle")}>
                <p className="mb-3 text-sm text-muted-foreground">{t("talkHelp")}</p>
                <Button className="w-full" data-gate-talk={row.id} onClick={() => setAdding("talk")}>
                  <MessagesSquare />
                  {t("talk")}
                </Button>
              </ShellPanel>
            ) : row.is_issue ? (
              <div className="space-y-4">
                <ShellPanel
                  title={t("membersTitle")}
                  aside={
                    mayAdd ? (
                      <Button size="sm" variant="outline" onClick={() => setAdding("members")}>
                        <UserPlus />
                        {t("addMembers")}
                      </Button>
                    ) : undefined
                  }
                >
                  {row.members.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {row.members.map((member) => (
                        <li key={member.id} className="rounded-full border px-3 py-1 text-sm">
                          {member.full_name}
                          {member.role_name ? (
                            <span className="text-muted-foreground"> · {roleOf(null, member.role_name)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noMembersYet")}</p>
                  )}
                </ShellPanel>
                <ShellPanel title={t("closeTitle")}>
                  <GateIssueClosePanel incident={row} />
                </ShellPanel>
              </div>
            ) : undefined
          }
          // A Gate Issue is talked through in its own conversation (C22); a
          // plain photo is filed and has nothing to discuss.
          chat={
            row.is_issue ? (
              <div className="space-y-2" ref={chatRef} data-gate-conversation>
                <p className="text-xs text-muted-foreground">{t("conversationHelp")}</p>
                <RecordConversationPanel kind="GATE_INCIDENT" recordId={row.id} />
              </div>
            ) : undefined
          }
        />
      )}
      {row && adding === "photos" && (
        <AddPhotosDialog incident={row} onClose={() => setAdding(null)} />
      )}
      {row && adding === "members" && (
        <AddMembersDialog incident={row} onClose={() => setAdding(null)} />
      )}
      {row && adding === "talk" && (
        <GateTalkDialog
          incident={row}
          onClose={() => setAdding(null)}
          onStarted={() => {
            setAdding(null);
            setTalkAsks((count) => count + 1);
          }}
        />
      )}
    </RecordDetailDialog>
  );
}

function AddPhotosDialog({ incident, onClose }: { incident: GateIncidentDetail; onClose: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const queryClient = useQueryClient();
  const { fix, failed, refresh } = useGateLocation();
  const camera = useContinuousCamera(fix);
  const save = useMutation({
    mutationFn: () =>
      addGateIncidentPhotos(
        incident.id,
        camera.photos,
        fix ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy } : undefined,
      ),
    onSuccess: (row) => {
      queryClient.setQueryData(["gate-incident", incident.id], row);
      void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addPhotos")}</DialogTitle>
          <DialogDescription>{incident.incident_no}</DialogDescription>
        </DialogHeader>
        <FieldWrapper label={t("field.photos")} required hint={t("field.photosHint")}>
          <div className="space-y-2">
            <FieldCamera
              label={camera.photos.length ? t("takeAnother", { count: camera.photos.length }) : t("takePhoto")}
              fileCount={camera.photos.length}
              onCapture={camera.add}
              onClear={camera.clear}
            />
            <PhotoTray photos={camera.photos} onRemove={camera.remove} />
            <LocationLine fix={fix} failed={failed} onRetry={refresh} />
          </div>
        </FieldWrapper>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            {save.error instanceof Error ? save.error.message : t("saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[[camera.photos.length > 0, t("field.photos")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("save", { count: camera.photos.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersDialog({ incident, onClose }: { incident: GateIncidentDetail; onClose: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<string[]>([]);
  const people = useQuery({
    queryKey: ["gate-member-options", incident.project],
    queryFn: () => getGateMemberOptions(incident.project),
  });
  const already = new Set(incident.members.map((member) => member.user));
  const options = (people.data ?? []).filter((person) => !already.has(person.id));
  const save = useMutation({
    mutationFn: () => addGateIncidentMembers(incident.id, members),
    onSuccess: (row) => {
      queryClient.setQueryData(["gate-incident", incident.id], row);
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addMembers")}</DialogTitle>
          <DialogDescription>{t("field.membersHint")}</DialogDescription>
        </DialogHeader>
        <QueryFailedNote query={people} what={t("whatPeople")} />
        <FieldWrapper label={t("field.members")} required>
          <MemberChecklist
            options={options}
            loading={people.isLoading}
            selected={members}
            onChange={setMembers}
          />
        </FieldWrapper>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            {save.error instanceof Error ? save.error.message : t("saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            requires={[[members.length > 0, t("field.members")]]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("addMembers")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
