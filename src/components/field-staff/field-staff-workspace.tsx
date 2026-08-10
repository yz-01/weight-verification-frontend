"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Grid2X2,
  HardHat,
  House,
  ListChecks,
  Loader2,
  LocateFixed,
  LogIn,
  LogOut,
  MapPinned,
  Play,
  Recycle,
  RefreshCw,
  Send,
  ShieldAlert,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FieldRecordsPanel,
  type FieldRecordMode,
} from "@/components/field-staff/field-records-panel";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldStaffGps } from "@/components/site-operations/field-staff-gps";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FieldTask } from "@/interfaces/contractor-ops";
import type { AttendanceEvent } from "@/interfaces/site-operations";
import { ApiError } from "@/interfaces/api";
import { getFieldTasks } from "@/services/contractor-ops.service";
import {
  submitAttendanceOfflineAware,
  submitFieldTaskPhotoOfflineAware,
  submitFieldTaskTransitionOfflineAware,
} from "@/services/offline-sync.service";
import { getAttendance } from "@/services/site-operations.service";

type MobileTab = "home" | "tasks" | "attendance" | "records" | "location";
type LocationFix = { latitude: string; longitude: string; accuracy: string };

function locate(): Promise<LocationFix> {
  if (!("geolocation" in navigator)) return Promise.reject(new Error("location"));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({
      latitude: position.coords.latitude.toFixed(7),
      longitude: position.coords.longitude.toFixed(7),
      accuracy: position.coords.accuracy.toFixed(2),
    }),
    reject,
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
  ));
}

function deviceId(): string {
  const key = "mse-field-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

export function FieldStaffWorkspace() {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams.get("task") ?? "";
  const requestedTab = searchParams.get("tab") as MobileTab | null;
  const [tab, setTab] = useState<MobileTab>(
    requestedTab && ["home", "tasks", "attendance", "records", "location"].includes(requestedTab)
      ? requestedTab
      : requestedTaskId
        ? "tasks"
        : "home",
  );
  const [taskType, setTaskType] = useState<FieldTask["task_type"]>();
  const [recordMode, setRecordMode] = useState<FieldRecordMode | null>(null);
  return (
    <div className="space-y-5 pb-24">
      <section className="rounded-xl bg-foreground px-5 py-5 text-background shadow-sm">
        <p className="text-sm text-background/70">{t("today", { date: new Date().toLocaleDateString() })}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t("greeting", { name: user?.full_name ?? "" })}</h1>
      </section>

      {tab === "home" && (
        <FieldHomePanel
          onOpen={(next) => {
            setTaskType(undefined);
            setRecordMode(null);
            setTab(next);
          }}
          onRecord={(mode) => {
            setRecordMode(mode);
            setTab("records");
          }}
        />
      )}
      {tab === "tasks" && <FieldTaskPanel taskType={taskType} requestedTaskId={requestedTaskId} />}
      {tab === "attendance" && <FieldAttendancePanel />}
      {tab === "records" && (
        <FieldRecordsPanel initialMode={recordMode} onModeChange={setRecordMode} />
      )}
      {tab === "location" && <FieldStaffGps />}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1 px-3">
          <MobileNavButton active={tab === "home"} icon={House} label={t("nav.home")} onClick={() => setTab("home")} />
          <MobileNavButton active={tab === "tasks"} icon={ClipboardCheck} label={t("nav.tasks")} onClick={() => { setTaskType(undefined); setTab("tasks"); }} />
          <MobileNavButton active={tab === "attendance"} icon={Clock3} label={t("nav.attendance")} onClick={() => setTab("attendance")} />
          <MobileNavButton active={tab === "records"} icon={Grid2X2} label={t("nav.records")} onClick={() => { setRecordMode(null); setTab("records"); }} />
          <MobileNavButton active={tab === "location"} icon={MapPinned} label={t("nav.location")} onClick={() => setTab("location")} />
        </div>
      </nav>
    </div>
  );
}

function FieldHomePanel({
  onOpen,
  onRecord,
}: {
  onOpen: (tab: Exclude<MobileTab, "home">) => void;
  onRecord: (mode: FieldRecordMode) => void;
}) {
  const t = useTranslations("fieldStaffPwa");
  const { can } = useAuth();
  const actions: Array<{
    key: string;
    permission?: string;
    icon: typeof Camera;
    tone: string;
    open: () => void;
  }> = [
    { key: "tasks", permission: "field_task.view", icon: ClipboardCheck, tone: "bg-primary/10 text-primary", open: () => onOpen("tasks") },
    { key: "attendance", permission: "attendance.clock", icon: Clock3, tone: "bg-success/10 text-success", open: () => onOpen("attendance") },
    { key: "material", permission: "receipt.create", icon: ClipboardList, tone: "bg-info/10 text-info", open: () => onRecord("material") },
    { key: "equipment", permission: "equipment.capture", icon: HardHat, tone: "bg-warning/15 text-warning", open: () => onRecord("equipment") },
    { key: "progress", permission: "progress.manage", icon: ListChecks, tone: "bg-primary/10 text-primary", open: () => onRecord("progress") },
    { key: "disposal", permission: "disposal.submit", icon: Recycle, tone: "bg-success/10 text-success", open: () => onRecord("disposal") },
    { key: "outgoing", permission: "material_outgoing.submit", icon: Truck, tone: "bg-destructive/10 text-destructive", open: () => onRecord("outgoing") },
    { key: "safety", permission: "safety.manage", icon: ShieldAlert, tone: "bg-warning/15 text-warning", open: () => onRecord("safety") },
    { key: "consultant", permission: "consultant.submit", icon: UserRoundCheck, tone: "bg-primary/10 text-primary", open: () => onRecord("consultant") },
  ];
  const visibleActions = actions.filter((action) => !action.permission || can(action.permission));
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("home.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {visibleActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              type="button"
              className="flex min-h-36 flex-col items-start justify-between rounded-xl border bg-card p-4 text-left shadow-sm active:scale-[0.98]"
              onClick={action.open}
            >
              <span className={`grid size-12 place-items-center rounded-xl ${action.tone}`}><Icon className="size-7" /></span>
              <span className="mt-5 text-lg font-semibold leading-6">{t(`home.${action.key}`)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MobileNavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Camera; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ${active ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}><Icon className="size-5" />{label}</button>;
}

function FieldTaskPanel({ taskType, requestedTaskId }: { taskType?: FieldTask["task_type"]; requestedTaskId?: string }) {
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
        deviceId: deviceId(),
      });
    },
    onSuccess: () => { setActionError(""); void qc.invalidateQueries({ queryKey: ["field-staff", "tasks"] }); },
    onError: (error) => setActionError(error instanceof ApiError ? error.message : t("error.location")),
  });
  if (tasks.isLoading) return <LoadingState />;
  if (tasks.isError) return <ErrorState onRetry={() => void tasks.refetch()} />;
  return <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">{taskType === "CONSULTANT" ? t("consultantTasks.title") : t("tasks.title")}</h2><p className="text-sm text-muted-foreground">{t("tasks.count", { count: active.length })}</p></div><Button size="icon" variant="outline" title={t("action.refresh")} onClick={() => void tasks.refetch()}><RefreshCw /></Button></div>{actionError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}{active.length === 0 ? <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-card text-center"><div><Check className="mx-auto size-10 text-success" /><p className="mt-3 font-medium">{t("tasks.empty")}</p></div></div> : active.map((task) => <FieldTaskCard key={task.id} task={task} focused={task.id === requestedTaskId} busy={transition.isPending || photo.isPending} onTransition={(status) => transition.mutate({ task, status })} onPhoto={(file) => photo.mutate({ task, file })} />)}</section>;
}

function FieldTaskCard({ task, focused, busy, onTransition, onPhoto }: { task: FieldTask; focused: boolean; busy: boolean; onTransition: (status: "IN_PROGRESS" | "SUBMITTED") => void; onPhoto: (file: File) => void }) {
  const t = useTranslations("fieldStaffPwa");
  const photos = task.photos.length || task.photo_count || 0;
  const canSubmit = photos >= task.evidence_required;
  return <article className={`overflow-hidden rounded-xl border bg-card shadow-sm ${task.priority === "URGENT" ? "border-destructive/40" : ""} ${focused ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}><div className="p-4"><div className="flex items-start justify-between gap-3"><div><StatusBadge label={t(`status.${task.status}`)} tone={task.status === "RETURNED" ? "danger" : task.status === "SUBMITTED" ? "warning" : "info"} /><h3 className="mt-3 text-lg font-semibold leading-snug">{task.title}</h3><p className="mt-1 text-sm text-muted-foreground">{task.project_name}</p></div><span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">{t(`type.${task.task_type}`)}</span></div><div className="mt-3 grid gap-1 text-xs text-muted-foreground"><p>{t("tasks.assignedBy", { name: task.created_by_name || task.assigned_to_name })}</p>{task.work_location && <p>{t("tasks.workLocation", { location: task.work_location })}</p>}{task.due_at && <p>{t("tasks.dueAt", { value: new Date(task.due_at).toLocaleString() })}</p>}</div>{task.instructions && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm leading-6">{task.instructions}</p>}{task.started_at && <p className="mt-3 text-xs text-muted-foreground">{t("tasks.startedAt", { value: new Date(task.started_at).toLocaleString() })}</p>}{task.status === "RETURNED" && task.review_note && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{task.review_note}</p>}<div className="mt-4 grid grid-cols-3 gap-2">{task.photos.slice(-3).map((item) => <Image key={item.id} src={item.image} alt="" width={240} height={240} unoptimized className="aspect-square w-full rounded-lg object-cover" />)}</div><p className="mt-3 text-center text-sm font-medium">{t("tasks.evidence", { current: photos, required: task.evidence_required })}</p></div><div className="grid gap-2 border-t bg-muted/20 p-3">{task.status === "OPEN" && <Button className="h-12 text-base" disabled={busy} onClick={() => onTransition("IN_PROGRESS")}><Play />{t("action.start")}</Button>}{["IN_PROGRESS", "RETURNED"].includes(task.status) && <><FieldCamera label={t("action.takePhoto")} fileCount={photos} disabled={busy} onCapture={onPhoto} /><Button className="h-12 text-base" disabled={busy || !canSubmit} onClick={() => onTransition("SUBMITTED")}><Send />{canSubmit ? t("action.submit") : t("action.morePhotos", { count: Math.max(0, task.evidence_required - photos) })}</Button></>}{task.status === "SUBMITTED" && <div className="flex min-h-12 items-center justify-center gap-2 text-sm font-medium text-warning"><Clock3 className="size-5" />{t("tasks.waitingReview")}</div>}</div></article>;
}

function FieldAttendancePanel() {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [event, setEvent] = useState<AttendanceEvent>("CLOCK_IN");
  const [selfie, setSelfie] = useState<File>();
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const attendance = useQuery({ queryKey: ["field-staff", "attendance"], queryFn: () => getAttendance({ page_size: 30, sort_by: "-occurred_at" }) });
  const today = useMemo(() => (attendance.data?.results ?? []).filter((row) => row.user === user?.id && new Date(row.occurred_at).toDateString() === new Date().toDateString()), [attendance.data, user?.id]);
  const selectedProject = project || today[0]?.project || "";
  const captureLocation = async () => { setLocating(true); setError(""); try { setFix(await locate()); } catch { setError(t("error.location")); } finally { setLocating(false); } };
  const submit = useMutation({ mutationFn: () => { if (!user || !selfie || !fix) throw new Error("missing"); return submitAttendanceOfflineAware(user.id, { project: selectedProject, event, note, photo: selfie, latitude: fix.latitude, longitude: fix.longitude, locationAccuracyM: fix.accuracy }); }, onSuccess: () => { setSelfie(undefined); setFix(null); setNote(""); setError(""); void qc.invalidateQueries({ queryKey: ["field-staff", "attendance"] }); }, onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("error.action")) });
  return <section className="space-y-4"><div><h2 className="text-lg font-semibold">{t("attendance.title")}</h2><p className="text-sm text-muted-foreground">{t("attendance.todayCount", { count: today.length })}</p></div><div className="rounded-xl border bg-card p-4 shadow-sm"><ProjectPicker value={selectedProject} onValueChange={setProject} placeholder={t("attendance.selectProject")} className="h-11 w-full" /><div className="mt-4 grid grid-cols-2 gap-2"><Button className="h-12" variant={event === "CLOCK_IN" ? "default" : "outline"} onClick={() => setEvent("CLOCK_IN")}><LogIn />{t("attendance.clockIn")}</Button><Button className="h-12" variant={event === "CLOCK_OUT" ? "default" : "outline"} onClick={() => setEvent("CLOCK_OUT")}><LogOut />{t("attendance.clockOut")}</Button></div><FieldCamera className="mt-4" label={selfie ? t("attendance.selfieReady") : t("attendance.takeSelfie")} fileCount={selfie ? 1 : 0} facingMode="user" onCapture={setSelfie} onClear={() => setSelfie(undefined)} /><Button className="mt-3 h-12 w-full" variant="outline" disabled={locating} onClick={() => void captureLocation()}>{locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}{fix ? t("attendance.locationReady") : t("attendance.getLocation")}</Button><Textarea className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("attendance.note")} />{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<Button className="mt-4 h-14 w-full text-base" disabled={!selectedProject || !selfie || !fix || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="animate-spin" /> : event === "CLOCK_IN" ? <LogIn /> : <LogOut />}{t("attendance.submit")}</Button></div><div className="space-y-2">{today.map((row) => <div key={row.id} className="flex items-center gap-3 rounded-lg border bg-card p-3"><StatusBadge label={t(row.event === "CLOCK_IN" ? "attendance.clockIn" : "attendance.clockOut")} tone={row.event === "CLOCK_IN" ? "positive" : "neutral"} /><span className="text-sm font-medium">{new Date(row.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{row.photo && <Image src={row.photo} alt="" width={80} height={80} unoptimized className="ml-auto size-10 rounded-lg object-cover" />}</div>)}</div></section>;
}

function LoadingState() {
  return <div className="grid min-h-64 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("fieldStaffPwa");
  return <div className="grid min-h-64 place-items-center rounded-xl border border-destructive/30 bg-destructive/5 text-center"><div><p className="text-sm text-destructive">{t("error.load")}</p><Button className="mt-3" variant="outline" onClick={onRetry}><RefreshCw />{t("action.retry")}</Button></div></div>;
}
