"use client";

/**
 * 门岗拍照 (C22; batch H HD5/HD6): what a guard photographs at the gate.
 *
 * 「门岗拍照不需要扫描二维码，也不需要关联 Visitor」: the phone page is a camera
 * and a 「特殊事项」 switch, nothing else. Off, every photo is its own Photo
 * Record - 「进场及退场照片分别保存，不需要自动配对」 - filed at once with no
 * bell rung. On, the photos, a note and the project people asked in make one
 * Gate Issue: they get a to-do, the note opens its conversation, and it stays
 * 处理中 until one of them (or whoever manages site access) confirms it
 * finished.
 *
 * The office reads the same records under EHS / Safety → 门岗记录
 * (`gate-records-office.tsx`) and opens them in the same detail dialog.
 *
 * Every photo carries its own project, guard, time and GPS, and a photo taken
 * where the phone could not say where it was says so instead of borrowing a
 * position (D09). Sent through the offline queue (H12): taken offline, it
 * goes once the network is back, once.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, DoorOpen, Images, Loader2, Lock, MapPin, Plus, Send, UserPlus, X } from "lucide-react";
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
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import { Switch } from "@/components/ui/switch";
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
import { submitGatePhotoOfflineAware } from "@/services/offline-sync.service";
import {
  addGateIncidentMembers,
  addGateIncidentPhotos,
  closeGateIssue,
  getGateIncident,
  getGateIncidents,
  getGateMemberOptions,
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

/**
 * The guard's 门岗拍照 page on the phone: take photos, send, and the latest
 * gate records of the project below. A person asked into a gate issue lands
 * here from the notice (`?gate_incident=`) and the issue opens over it.
 */
export function GateRecordsPanel({
  initialProject = "",
}: {
  /** The phone's bound project. */
  initialProject?: string;
} = {}) {
  const t = useTranslations("siteControl.gateRecords");
  const { can } = useAuth();
  const search = useSearchParams();
  // `gate_incident`, not `incident`: the phone already reads `incident` as a
  // hazard, and a gate record's id there would open the wrong thing.
  const [openId, setOpenId] = useState<string | null>(() => search.get("gate_incident"));
  const [project, setProject] = useState(initialProject);

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
      {can("site_access.scan") && (
        <GatePhotoCapture
          project={project}
          lockProject={Boolean(initialProject)}
          onProjectChange={setProject}
        />
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
                <GateIncidentCard row={row} onOpen={() => setOpenId(row.id)} />
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

      {openId && <GateIncidentDetailDialog id={openId} onClose={() => setOpenId(null)} />}
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

function GateIncidentCard({ row, onOpen }: { row: GateIncident; onOpen: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const df = useDateFormat();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-panel flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted/40"
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
          <img src={url} alt={t("photoNumber", { number: index + 1 })} className="aspect-square w-full object-cover" />
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
 * 门岗拍照 (HD5): photos, the 「特殊事项」 switch, send. Nothing else.
 *
 * Off: each photo is sent as its own record and filed. On: a note and the
 * people of this project who should deal with it, and the whole lot is one
 * Gate Issue. The send button waits only for what the mode needs, and says
 * so on the form, not only in a tooltip a phone never shows (F1).
 */
function GatePhotoCapture({
  project,
  lockProject,
  onProjectChange,
}: {
  project: string;
  /** The phone is bound to its project; only an unbound account chooses. */
  lockProject: boolean;
  onProjectChange: (project: string) => void;
}) {
  const t = useTranslations("siteControl.gatePhoto");
  const tr = useTranslations("siteControl.gateRecords");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { fix, failed, refresh } = useGateLocation();
  const camera = useContinuousCamera(fix);
  const [special, setSpecial] = useState(false);
  const [note, setNote] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [sent, setSent] = useState<{ count: number; queued: boolean; issue: boolean } | null>(null);
  // One id per Gate Issue being written, kept across a retry so a resend
  // after a lost answer lands once.
  const issueEventId = useRef(newEventId());

  const people = useQuery({
    queryKey: ["gate-member-options", project],
    queryFn: () => memberOptionsOfflineAware(project),
    enabled: special && Boolean(project),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("signedOut"));
      const where = fix
        ? { latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracy }
        : {};
      if (special) {
        const outcome = await submitGatePhotoOfflineAware(user.id, {
          project,
          is_issue: true,
          members,
          first_message: note.trim(),
          client_event_id: issueEventId.current,
          photos: camera.photos,
          ...where,
        });
        return [outcome];
      }
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
            photos: [photo],
            ...where,
          }),
        );
      }
      return outcomes;
    },
    onSuccess: (outcomes) => {
      setSent({
        count: camera.photos.length,
        queued: outcomes.includes("queued"),
        issue: special,
      });
      camera.clear();
      setNote("");
      setMembers([]);
      setSpecial(false);
      issueEventId.current = newEventId();
      void queryClient.invalidateQueries({ queryKey: ["gate-incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["gate-summary"] });
    },
  });

  return (
    <section className="surface-panel space-y-4 rounded-xl p-4" data-gate-photo-capture>
      <p className="text-sm text-muted-foreground">{t("help")}</p>
      {!lockProject && (
        <FieldWrapper label={tr("field.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(value) => {
              onProjectChange(value);
              setMembers([]);
            }}
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

      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{t("special")}</span>
          <span className="block text-xs text-muted-foreground">
            {special ? t("specialOnHelp") : t("specialOffHelp")}
          </span>
        </span>
        <Switch checked={special} onCheckedChange={setSpecial} aria-label={t("special")} />
      </label>

      {special && (
        <>
          <FieldWrapper label={t("note")} required>
            <Textarea
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder")}
            />
          </FieldWrapper>
          <FieldWrapper label={t("assignees")} required hint={t("assigneesHint")}>
            <QueryFailedNote query={people} what={tr("whatPeople")} />
            <MemberChecklist
              options={people.data ?? []}
              loading={people.isLoading && Boolean(project)}
              selected={members}
              onChange={setMembers}
            />
          </FieldWrapper>
        </>
      )}

      {save.isError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {save.error instanceof Error ? save.error.message : tr("saveError")}
        </p>
      )}
      {sent && (
        <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success" role="status">
          <CheckCircle2 className="size-4 shrink-0" />
          {sent.queued
            ? t("sentQueued")
            : sent.issue
              ? t("sentIssue")
              : t("sentPhotos", { count: sent.count })}
        </p>
      )}
      {!camera.photos.length && !sent && (
        <p className="text-sm text-muted-foreground">{tr("photoFirst")}</p>
      )}
      <Button
        size="lg"
        className="h-12 w-full"
        requires={[
          [project, tr("field.project")],
          [camera.photos.length > 0, tr("field.photos")],
          ...(special
            ? ([
                [note.trim(), t("note")],
                [members.length > 0, t("assignees")],
              ] as const)
            : []),
        ]}
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        {special ? t("sendIssue") : t("sendPhotos", { count: camera.photos.length })}
      </Button>
    </section>
  );
}

/** Where the phone keeps each project's last list of people to ask in. */
function memberOptionsKey(project: string) {
  return `mse.gate.member-options:${project}`;
}

/**
 * The people a guard may ask in, kept from the last time the phone had a
 * network (H12: 「断网期间仍可拍照、填写资料」), so a 「特殊事项」 can be written
 * and queued offline. A fresh list from the server always wins.
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
                <span className="text-xs text-muted-foreground">{person.role_name}</span>
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
export function GateIncidentDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("siteControl.gateRecords");
  const category = useTranslations("siteControl.gateCategory");
  const df = useDateFormat();
  const { can } = useAuth();
  const detail = useQuery({
    queryKey: ["gate-incident", id],
    queryFn: () => getGateIncident(id),
  });
  const row = detail.data;
  const [adding, setAdding] = useState<"photos" | "members" | null>(null);
  const open = row?.issue_status === "OPEN";
  const mayAdd = open && can("site_access.scan");

  return (
    <RecordDetailDialog
      title={row?.incident_no ?? t("title")}
      description={row?.is_issue ? t("issueHelp") : t("detailHelp")}
      onClose={onClose}
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
          aside={
            row.is_issue ? (
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
                            <span className="text-muted-foreground"> · {member.role_name}</span>
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
              <div className="space-y-2">
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
