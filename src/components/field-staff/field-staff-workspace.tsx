"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import {
  Camera,
  Check,
  Clock3,
  FileText,
  Grid2X2,
  House,
  Loader2,
  LogIn,
  LogOut,
  MapPinned,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { APP_VERSION } from "@/lib/app-version";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import {
  FieldRecordsPanel,
  type FieldRecordMode,
} from "@/components/field-staff/field-records-panel";
import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { FIELD_EVIDENCE_PHOTO_COUNT } from "@/components/field-staff/field-evidence-grid";
import { FieldHazardsPanel } from "@/components/site-operations/field-hazards";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldStaffGps } from "@/components/site-operations/field-staff-gps";
import { LocationField } from "@/components/field-staff/location-field";
import {
  type LocationFix,
  requestLocation as locate,
} from "@/lib/field-location";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FieldTask } from "@/interfaces/contractor-ops";
import type { AttendanceEvent, SafetyIncident } from "@/interfaces/site-operations";
import { ApiError } from "@/interfaces/api";
import { getFieldTask, getFieldTasks } from "@/services/contractor-ops.service";
import { getProjects } from "@/services/contractor.service";
import {
  submitAttendanceOfflineAware,
  submitFieldTaskPhotoOfflineAware,
  submitFieldTaskTransitionOfflineAware,
} from "@/services/offline-sync.service";
import { getAttendance } from "@/services/site-operations.service";
import {
  createFieldPwaBootstrap,
  getOrCreateFieldDeviceId,
} from "@/services/field-access.service";

type MobileTab = "home" | "tasks" | "attendance" | "records" | "location" | "incidents";
export function FieldStaffWorkspace() {
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams.get("task") ?? "";
  const requestedTab = searchParams.get("tab") as MobileTab | null;
  const requestedRecord = searchParams.get("record") as FieldRecordMode | null;
  const supplierToken = searchParams.get("supplier_token") ?? "";

  return (
    <FieldStaffWorkspaceContent
      requestedTaskId={requestedTaskId}
      requestedTab={requestedTab}
      requestedRecord={requestedRecord}
      supplierToken={supplierToken}
    />
  );
}

function FieldStaffWorkspaceContent({
  requestedTaskId,
  requestedTab,
  requestedRecord,
  supplierToken,
}: {
  requestedTaskId: string;
  requestedTab: MobileTab | null;
  requestedRecord: FieldRecordMode | null;
  supplierToken: string;
}) {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const [tab, setTab] = useState<MobileTab>(
    requestedTab && ["home", "tasks", "attendance", "records", "location", "incidents"].includes(requestedTab)
      ? requestedTab
      : requestedRecord
        ? "records"
        : requestedTaskId
        ? "tasks"
        : "home",
  );
  const [taskType, setTaskType] = useState<FieldTask["task_type"]>();
  const [focusedTaskId, setFocusedTaskId] = useState(requestedTaskId);
  const [activeTask, setActiveTask] = useState<FieldTask | null>(null);
  const [recordMode, setRecordMode] = useState<FieldRecordMode | null>(
    requestedRecord,
  );
  const [openedHazard, setOpenedHazard] = useState<SafetyIncident | null>(null);
  const requestedTask = useQuery({
    queryKey: ["field-staff", "task", requestedTaskId],
    queryFn: () => getFieldTask(requestedTaskId),
    enabled: Boolean(requestedTaskId),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (requestedRecord) {
        setRecordMode(requestedRecord);
        setTab("records");
        return;
      }
      if (requestedTaskId) {
        setFocusedTaskId(requestedTaskId);
        setTab("tasks");
        return;
      }
      if (
        requestedTab &&
        ["home", "tasks", "attendance", "records", "location", "incidents"].includes(
          requestedTab,
        )
      ) {
        setTab(requestedTab);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedRecord, requestedTab, requestedTaskId]);

  const replaceFieldUrl = (
    nextTab: MobileTab,
    nextRecord?: FieldRecordMode | null,
    nextTaskId?: string | null,
  ) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    url.searchParams.delete("record");
    url.searchParams.delete("supplier_token");
    if (nextTab === "home") url.searchParams.delete("tab");
    else url.searchParams.set("tab", nextTab);
    if (nextRecord) url.searchParams.set("record", nextRecord);
    if (nextTaskId) url.searchParams.set("task", nextTaskId);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  const openTab = (nextTab: MobileTab) => {
    setFocusedTaskId("");
    setTaskType(undefined);
    setRecordMode(null);
    setActiveTask(null);
    setTab(nextTab);
    replaceFieldUrl(nextTab);
  };

  const openRecord = (mode: FieldRecordMode) => {
    setFocusedTaskId("");
    setActiveTask(null);
    setRecordMode(mode);
    setTab("records");
    replaceFieldUrl("records", mode);
  };
  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });
  const projectNames = (projects.data?.results ?? []).map((project) => project.name);
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col gap-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <section className="-mx-4 -mt-5 border-b bg-card px-4 py-5 shadow-[0_8px_24px_rgb(0_0_0/0.035)]">
        <p className="text-xs font-medium text-muted-foreground">
          {t("today", { date: new Date().toLocaleDateString() })}
        </p>
        <h1 className="mt-1 text-xl font-semibold leading-tight">
          {t("greeting", { name: user?.full_name ?? "" })}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border bg-muted/40 px-2.5 py-1.5 font-medium">
            {t("identity.company", { company: user?.company_name ?? "-" })}
          </span>
          <span className="rounded-md border bg-muted/40 px-2.5 py-1.5 font-medium">
            {t("identity.role", { role: user?.role_name ?? "-" })}
          </span>
        </div>
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          {t("identity.projects", {
            projects: projectNames.length
              ? projectNames.join(", ")
              : t("identity.noProject"),
          })}
        </p>
      </section>

      {tab === "home" && (
        <FieldHomePanel onOpenWorkflow={(task, mode) => { setActiveTask(task); setRecordMode(mode); setTab("records"); replaceFieldUrl("records", mode, task.id); }} />
      )}
      {tab === "tasks" && (
        <FieldTaskPanel
          taskType={taskType}
          requestedTaskId={focusedTaskId}
          onOpenWorkflow={(task, mode) => {
            setActiveTask(task);
            setRecordMode(mode);
            setTab("records");
            replaceFieldUrl("records", mode, task.id);
          }}
        />
      )}
      {tab === "attendance" && <FieldDraft scope="attendance"><FieldAttendancePanel /></FieldDraft>}
      {tab === "records" && (
        <FieldRecordsPanel
          initialMode={recordMode}
          initialSupplierToken={supplierToken}
          task={activeTask ?? requestedTask.data ?? null}
          onModeChange={(mode) => {
            setRecordMode(mode);
            if (!mode) setActiveTask(null);
            replaceFieldUrl("records", mode);
          }}
          onWorkflowSaved={(mode, result) => {
            if (mode === "safety") {
              if (result?.status === "uploaded") setOpenedHazard(result.incident);
              openTab("incidents");
            }
          }}
        />
      )}
      {tab === "location" && <FieldStaffGps managedAutomatically />}
      {/* Was FieldIncidentsPanel (事故上报). The customer asked for that
          feature to go and its chat room to be folded into 隐患整改:
          「报告事故的聊天室是结合进去隐患整改的，然后报告事故移除掉」. The tab
          key stays `incidents` so a bookmarked ?tab= link still lands
          somewhere useful. */}
      {tab === "incidents" && (
        <FieldHazardsPanel
          initialOpen={openedHazard}
          onInitialOpenHandled={() => setOpenedHazard(null)}
          onHome={() => {
            openTab("home");
          }}
          onReport={() => openRecord("safety")}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgb(0_0_0/0.06)] backdrop-blur">
        {/* Five buttons since the duplicate 任务 entry was removed; the column
            count has to match or the icons bunch to the left of an empty cell. */}
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1 px-3">
          <MobileNavButton active={tab === "home"} icon={House} label={t("nav.home")} onClick={() => openTab("home")} />
          <MobileNavButton active={tab === "attendance"} icon={Clock3} label={t("nav.attendance")} onClick={() => openTab("attendance")} />
          <MobileNavButton active={tab === "records"} icon={Grid2X2} label={t("nav.records")} onClick={() => openTab("records")} />
          <MobileNavButton active={tab === "location"} icon={MapPinned} label={t("nav.location")} onClick={() => openTab("location")} />
          <MobileNavButton active={tab === "incidents"} icon={ShieldAlert} label={t("nav.hazards")} onClick={() => openTab("incidents")} />
        </div>
      </nav>
      {tab === "home" && (
        <p className="text-center text-xs text-muted-foreground">
          {t("identity.version", {
            version: APP_VERSION,
          })}
        </p>
      )}
    </div>
  );
}

function FieldHomePanel({
  onOpenWorkflow,
}: {
  onOpenWorkflow: (task: FieldTask, mode: FieldRecordMode) => void;
}) {
  const t = useTranslations("fieldStaffPwa");
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("home.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
        </div>
      </div>
      {/* Field staff have no profile screen and cannot open `/profile`, and
          theirs is the picture a delivery record shows - so this is their only
          way to set it. On the home panel rather than the workspace header,
          which renders above every tab. */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <AvatarUpload />
      </div>
      <FieldTaskPanel onOpenWorkflow={onOpenWorkflow} />
      <FieldDeviceHandoff />
    </section>
  );
}

/**
 * Move this field session onto another phone.
 *
 * The API issues the link from the *bound* device only, which is the whole
 * security property: whoever is already signed in on the old phone is the one
 * saying the new phone is theirs. So this lives here, on the field portal,
 * rather than in the admin screens - an administrator has no field session to
 * call it with, and giving them the button would put a control on the screen
 * that answers 403 every time.
 *
 * The link is shown once and is short-lived. It is not stored anywhere this
 * screen can read it back, so if it is lost the answer is to issue another,
 * not to hunt for it.
 */
function FieldDeviceHandoff() {
  const t = useTranslations("fieldStaffPwa");
  const [handoff, setHandoff] = useState<{
    url: string;
    expiresAt: string;
  } | null>(null);

  const issue = useMutation({
    mutationFn: createFieldPwaBootstrap,
    // The API answers with the token, not a link. The new phone opens the same
    // deployment, so the origin this page is already served from is the right
    // one to build with - hardcoding a host would break every environment but
    // the one it was written in.
    onSuccess: (result) =>
      setHandoff({
        url: `${window.location.origin}/field-pwa-bootstrap?token=${encodeURIComponent(result.token)}`,
        expiresAt: result.expires_at,
      }),
  });

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-sm font-semibold">{t("handoff.title")}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("handoff.help")}</p>

      {handoff ? (
        <div className="mt-3 space-y-2">
          <div className="grid place-items-center rounded-md border bg-background p-3">
            <QRCodeCanvas value={handoff.url} size={168} />
          </div>
          <p className="break-all rounded-md bg-muted/40 p-2 font-mono text-xs">
            {handoff.url}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("handoff.expires", {
              at: new Date(handoff.expiresAt).toLocaleString(),
            })}
          </p>
          <p className="text-xs text-muted-foreground">{t("handoff.once")}</p>
        </div>
      ) : (
        <Button
          className="mt-3"
          size="sm"
          disabled={issue.isPending}
          onClick={() => issue.mutate()}
        >
          <Smartphone className="size-4" />
          {t("handoff.action")}
        </Button>
      )}

      {issue.isError && (
        <p className="mt-2 text-xs text-destructive">{t("handoff.failed")}</p>
      )}
    </section>
  );
}

function MobileNavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Camera; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`relative z-10 flex min-h-12 min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}><Icon className="size-5" /><span className="max-w-full truncate">{label}</span></button>;
}

function taskRecordMode(task: FieldTask): FieldRecordMode | null {
  if (task.task_type === "MATERIAL") return "material";
  if (task.task_type === "EQUIPMENT") return "equipment";
  if (task.task_type === "PROGRESS") return "progress";
  if (task.task_type === "SAFETY") return "safety";
  if (task.task_type === "CONSULTANT") return "consultant";
  if (task.task_type === "WASTE") {
    const category = task.submission_category.toUpperCase();
    return category.includes("OUTGOING") || category.includes("RECYCLE")
      ? "waste"
      : "disposal";
  }
  return null;
}

function FieldTaskPanel({ taskType, requestedTaskId, onOpenWorkflow }: { taskType?: FieldTask["task_type"]; requestedTaskId?: string; onOpenWorkflow: (task: FieldTask, mode: FieldRecordMode) => void }) {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [actionError, setActionError] = useState("");
  const tasks = useQuery({
    queryKey: ["field-staff", "tasks", taskType],
    queryFn: () => getFieldTasks({ page_size: 100, sort_by: "due_at", task_type: taskType }),
  });
  const active = useMemo(() => {
    const rows = (tasks.data?.results ?? []).filter(
      (task) => !["ACCEPTED", "CANCELLED"].includes(task.status),
    );
    if (!requestedTaskId) return rows;
    return [...rows].sort((left, right) =>
      left.id === requestedTaskId ? -1 : right.id === requestedTaskId ? 1 : 0,
    );
  }, [requestedTaskId, tasks.data?.results]);
  const transition = useMutation({
    mutationFn: ({ task, status }: { task: FieldTask; status: "IN_PROGRESS" | "SUBMITTED" }) => {
      if (!user) throw new Error("session");
      if (status === "IN_PROGRESS") {
        return locate().then((fix) => submitFieldTaskTransitionOfflineAware(user.id, task.id, status, {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyM: fix.accuracy,
        }));
      }
      return submitFieldTaskTransitionOfflineAware(user.id, task.id, status);
    },
    onSuccess: () => { setActionError(""); void qc.invalidateQueries({ queryKey: ["field-staff", "tasks"] }); },
    onError: (error) => setActionError(error instanceof ApiError ? error.message : t("error.action")),
  });
  const photo = useMutation({
    mutationFn: async ({ task, file }: { task: FieldTask; file: File }) => {
      if (!user) throw new Error("session");
      const fix = await locate();
      return submitFieldTaskPhotoOfflineAware(user.id, {
        taskId: task.id,
        file,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        deviceId: getOrCreateFieldDeviceId(),
      });
    },
    onSuccess: () => { setActionError(""); void qc.invalidateQueries({ queryKey: ["field-staff", "tasks"] }); },
    onError: (error) => setActionError(error instanceof ApiError ? error.message : t("error.location")),
  });
  if (tasks.isLoading) return <LoadingState />;
  if (tasks.isError) return <ErrorState onRetry={() => void tasks.refetch()} />;
  return <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">{taskType === "CONSULTANT" ? t("consultantTasks.title") : t("tasks.title")}</h2><p className="text-sm text-muted-foreground">{t("tasks.count", { count: active.length })}</p></div><Button size="icon" variant="outline" title={t("action.refresh")} onClick={() => void tasks.refetch()}><RefreshCw /></Button></div>{actionError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}{active.length === 0 ? <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-card text-center"><div><Check className="mx-auto size-10 text-success" /><p className="mt-3 font-medium">{t("tasks.empty")}</p></div></div> : active.map((task) => <FieldTaskCard key={task.id} task={task} focused={task.id === requestedTaskId} busy={transition.isPending || photo.isPending} onTransition={(status) => transition.mutate({ task, status })} onPhoto={(file) => photo.mutate({ task, file })} onOpenWorkflow={() => { const mode = taskRecordMode(task); if (mode) onOpenWorkflow(task, mode); }} />)}</section>;
}

function FieldTaskCard({ task, focused, busy, onTransition, onPhoto, onOpenWorkflow }: { task: FieldTask; focused: boolean; busy: boolean; onTransition: (status: "IN_PROGRESS" | "SUBMITTED") => void; onPhoto: (file: File) => void; onOpenWorkflow: () => void }) {
  const t = useTranslations("fieldStaffPwa");
  const photos = task.photos.length || task.photo_count || 0;
  const requiredPhotos = Math.max(
    task.evidence_required,
    FIELD_EVIDENCE_PHOTO_COUNT,
  );
  const canSubmit = photos >= requiredPhotos;
  const workflowMode = taskRecordMode(task);
  const opensLinkedDisposal = task.linked_record_type === "DISPOSAL_EXECUTION";
  return <article className={`overflow-hidden rounded-xl border bg-card shadow-sm ${task.priority === "URGENT" ? "border-destructive/40" : ""} ${focused ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}><div className="p-4"><div className="flex items-start justify-between gap-3"><div><StatusBadge label={t(`status.${task.status}`)} tone={task.status === "RETURNED" ? "danger" : task.status === "SUBMITTED" ? "warning" : "info"} /><h3 className="mt-3 text-base font-semibold leading-snug">{task.title}</h3><p className="mt-1 text-sm text-muted-foreground">{task.project_name}</p></div><span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">{t(`type.${task.task_type}`)}</span></div><div className="mt-3 grid gap-1 text-xs text-muted-foreground"><p>{t("tasks.assignedBy", { name: task.created_by_name || task.assigned_to_name })}</p>{task.work_location && <p>{t("tasks.workLocation", { location: task.work_location })}</p>}{task.due_at && <p>{t("tasks.dueAt", { value: new Date(task.due_at).toLocaleString() })}</p>}</div>{task.instructions && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm leading-6">{task.instructions}</p>}{task.references.length ? <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="mb-3 text-sm font-semibold text-primary">{t("tasks.references", { count: task.references.length })}</p><div className="grid grid-cols-2 gap-2">{task.references.map((reference) => reference.kind === "PHOTO" ? <a key={reference.id} href={reference.file} target="_blank" rel="noreferrer"><Image src={reference.file} alt={reference.label || reference.original_filename} width={320} height={240} unoptimized className="aspect-[4/3] w-full rounded-lg object-cover" /></a> : <a key={reference.id} href={reference.file} target="_blank" rel="noreferrer" className="col-span-2 flex min-h-12 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-primary"><FileText className="size-5 shrink-0" /><span className="truncate">{reference.label || reference.original_filename}</span></a>)}</div></div> : null}{task.started_at && <p className="mt-3 text-xs text-muted-foreground">{t("tasks.startedAt", { value: new Date(task.started_at).toLocaleString() })}</p>}{task.status === "RETURNED" && task.review_note && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{task.review_note}</p>}{!workflowMode && <><div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">{task.photos.map((item, index) => <a key={item.id} href={item.watermarked || item.image} target="_blank" rel="noreferrer" className="w-24 shrink-0" title={`${index + 1} / ${task.photos.length}`}><Image src={item.watermarked || item.image} alt="" width={240} height={240} unoptimized className="aspect-square w-full rounded-lg border object-cover" /></a>)}</div><p className="mt-3 text-center text-sm font-medium">{t("tasks.evidence", { current: photos, required: requiredPhotos })}</p></>}</div><div className="grid gap-2 border-t bg-muted/20 p-3">{task.status === "OPEN" && (opensLinkedDisposal ? <Button className="h-12 text-sm" disabled={busy} onClick={onOpenWorkflow}><Camera />{t("action.openWorkflow")}</Button> : <Button className="h-12 text-sm" disabled={busy} onClick={() => onTransition("IN_PROGRESS")}><Play />{t("action.start")}</Button>)}{["IN_PROGRESS", "RETURNED"].includes(task.status) && (workflowMode ? <Button className="h-12 text-sm" disabled={busy} onClick={onOpenWorkflow}><Camera />{t("action.openWorkflow")}</Button> : <><FieldCamera label={t("action.takePhoto")} fileCount={photos} disabled={busy} onCapture={onPhoto} /><Button className="h-12 text-sm" disabledReason={!canSubmit ? t("action.morePhotos", { count: Math.max(0, requiredPhotos - photos) }) : undefined} disabled={busy || !canSubmit} onClick={() => onTransition("SUBMITTED")}><Send />{canSubmit ? t("action.submit") : t("action.morePhotos", { count: Math.max(0, requiredPhotos - photos) })}</Button></>)}{task.status === "SUBMITTED" && <div className="flex min-h-12 items-center justify-center gap-2 text-sm font-medium text-warning"><Clock3 className="size-5" />{task.linked_record_reference ? t("tasks.linkedSubmission", { reference: task.linked_record_reference }) : t("tasks.waitingReview")}</div>}</div></article>;
}

function FieldAttendancePanel() {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useDraftState("project", "");
  const [event, setEvent] = useDraftState<AttendanceEvent>("event", "CLOCK_IN");
  const [selfie, setSelfie] = useDraftState<File | undefined>("selfie");
  const [fix, setFix] = useDraftState<LocationFix | null>("fix", null);
  const [note, setNote] = useDraftState("note", "");
  const clearDraft = useClearDraft();
  const [error, setError] = useState("");
  const attendance = useQuery({ queryKey: ["field-staff", "attendance"], queryFn: () => getAttendance({ page_size: 30, sort_by: "occurred_at", sort_order: "desc" }) });
  const today = useMemo(() => (attendance.data?.results ?? []).filter((row) => row.user === user?.id && new Date(row.occurred_at).toDateString() === new Date().toDateString()), [attendance.data, user?.id]);
  const selectedProject = project || today[0]?.project || "";
  const submit = useMutation({ mutationFn: () => { if (!user || !selfie || !fix) throw new Error("missing"); return submitAttendanceOfflineAware(user.id, { project: selectedProject, event, note, photo: selfie, latitude: fix.latitude, longitude: fix.longitude, locationAccuracyM: fix.accuracy }); }, onSuccess: () => { clearDraft(); setSelfie(undefined); setFix(null); setNote(""); setError(""); void qc.invalidateQueries({ queryKey: ["field-staff", "attendance"] }); }, onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("error.action")) });
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t("attendance.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("attendance.todayCount", { count: today.length })}</p>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <ProjectPicker value={selectedProject} onValueChange={setProject} placeholder={t("attendance.selectProject")} className="h-11 w-full" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button className="h-12" variant={event === "CLOCK_IN" ? "default" : "outline"} onClick={() => setEvent("CLOCK_IN")}><LogIn />{t("attendance.clockIn")}</Button>
          <Button className="h-12" variant={event === "CLOCK_OUT" ? "default" : "outline"} onClick={() => setEvent("CLOCK_OUT")}><LogOut />{t("attendance.clockOut")}</Button>
        </div>
        <FieldCamera className="mt-4" label={selfie ? t("attendance.selfieReady") : t("attendance.takeSelfie")} file={selfie} fileCount={selfie ? 1 : 0} facingMode="user" onCapture={setSelfie} onClear={() => setSelfie(undefined)} />
        <LocationField
          className="mt-3"
          label={t("attendance.getLocation")}
          actionLabel={t("attendance.getLocation")}
          readyLabel={t("attendance.locationReady")}
          value={fix}
          onChange={setFix}
          required
        />
        <Textarea className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("attendance.note")} />
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <Button className="mt-4 h-12 w-full text-sm" requires={[[selectedProject, t("attendance.selectProject")], [selfie, t("attendance.takeSelfie")], [fix, t("attendance.getLocation")]]}
                                                       disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="animate-spin" /> : event === "CLOCK_IN" ? <LogIn /> : <LogOut />}{t("attendance.submit")}</Button>
      </div>
      <div className="space-y-3">
        {today.length === 0 && <p className="rounded-xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">{t("attendance.noRecords")}</p>}
        {today.map((row) => {
          const photoUrl = row.watermarked_photo || row.photo;
          const mapUrl = row.latitude && row.longitude
            ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}`
            : "";
          return (
            <article key={row.id} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex items-start gap-3">
                {photoUrl ? (
                  <a href={photoUrl} target="_blank" rel="noreferrer" title={t("attendance.openPhoto")}>
                    <Image src={photoUrl} alt="" width={160} height={160} unoptimized className="size-16 rounded-lg object-cover" />
                  </a>
                ) : <span className="grid size-16 place-items-center rounded-lg bg-muted"><Camera className="size-6 text-muted-foreground" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={t(row.event === "CLOCK_IN" ? "attendance.clockIn" : "attendance.clockOut")} tone={row.event === "CLOCK_IN" ? "positive" : "neutral"} />
                    <StatusBadge label={t(`attendance.geofence.${row.geofence_result}`)} tone={row.geofence_result === "INSIDE" ? "positive" : row.geofence_result === "OUTSIDE" ? "danger" : "neutral"} />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">{row.project_name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(row.occurred_at).toLocaleString()}</p>
                  {row.matched_geofence_name && <p className="mt-1 text-xs text-muted-foreground">{row.matched_geofence_name}</p>}
                  {row.distance_m && <p className="mt-1 text-xs text-muted-foreground">{t("attendance.distance", { distance: Math.round(Number(row.distance_m)) })}</p>}
                </div>
              </div>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-background text-sm font-semibold text-primary">
                  <MapPinned className="size-5" />
                  {t("attendance.viewMap")}
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LoadingState() {
  return <div className="grid min-h-64 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("fieldStaffPwa");
  return <div className="grid min-h-64 place-items-center rounded-xl border border-destructive/30 bg-destructive/5 text-center"><div><p className="text-sm text-destructive">{t("error.load")}</p><Button className="mt-3" variant="outline" onClick={onRetry}><RefreshCw />{t("action.retry")}</Button></div></div>;
}
