"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCheck,
  Camera,
  Copy,
  Hash,
  Link2,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Truck,
  UserRound,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { useSearchParams } from "next/navigation";

import { LocationField } from "@/components/field-staff/location-field";
import { AddToPackageButton } from "@/components/contractor-ops/add-to-package";
import { useAuth } from "@/components/providers/auth-provider";
import { DrillNote } from "@/components/shared/drill-note";
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FieldEvidenceGrid,
} from "@/components/field-staff/field-evidence-grid";
import { ExportButton } from "@/components/shared/export-button";
import { photoColumn, rowPhotos } from "@/components/shared/photo-thumb";
import { RecordNo } from "@/components/shared/record-no";
import { FieldCamera } from "@/components/shared/field-camera";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import { EmptyState, FieldWrapper, FilterBar, ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Timeline } from "@/components/shared/timeline";
import { RecordDetailDialog, RecordDetailShell, RecordRecorder } from "@/components/shared/record-detail-shell";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type {
  DisposalEvidenceKind,
  DisposalEvidenceStage,
  DisposalRequest,
  DisposalRequestStatus,
  DisposalSiteEvidenceKind,
  DisposalTrip,
  DisposalTripStatus,
  ExternalDisposalTask,
} from "@/interfaces/contractor-ops";
import {
  acceptDisposalTrip,
  addDisposalSiteEvidence,
  addDisposalTrip,
  addExternalDisposalEvidence,
  addInternalDisposalEvidence,
  assignDisposalCollector,
  assignDisposalInternal,
  cancelDisposalRequest,
  correctDisposalTrip,
  endDisposalEarly,
  getDisposalRequest,
  getDisposalRequests,
  getExternalDisposalTask,
  getInternalDisposalTask,
  regenerateDisposalExternalLink,
  exportDisposalRequests,
  recordDisposalNumbers,
  reviewDisposalRequest,
  startExternalDisposalTask,
  startInternalDisposalTask,
  submitExternalDisposalTask,
  submitInternalDisposalTask,
} from "@/services/contractor-ops.service";
import { getProjectAssignments } from "@/services/contractor.service";
import { submitDisposalRequestOfflineAware } from "@/services/offline-sync.service";

type Coordinates = { latitude: string; longitude: string; accuracy: string };

function getCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("location_unavailable"));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude.toFixed(7),
        longitude: position.coords.longitude.toFixed(7),
        accuracy: String(position.coords.accuracy),
      }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function statusTone(status: DisposalRequestStatus): "neutral" | "positive" | "warning" | "danger" | "info" {
  // AWAITING_CONFIRMATION is history only: its final proof was submitted,
  // which is the end of the job since E04.
  if (status === "COMPLETED" || status === "AWAITING_CONFIRMATION") return "positive";
  if (["REJECTED", "CANCELLED", "RETURNED"].includes(status)) return "danger";
  if (status === "IN_PROGRESS") return "warning";
  if (["APPROVED", "ASSIGNED"].includes(status)) return "info";
  return "neutral";
}

export function SiteDisposalWorkspace({ initialProject = "", fieldTaskId, onRecordSaved }: { initialProject?: string; fieldTaskId?: string; onRecordSaved?: () => void } = {}) {
  const t = useTranslations("siteDisposal");
  const { can } = useAuth();
  // The word 「分类」 for an old record's category lives in `contractorOps`.
  const ops = useTranslations("contractorOps");
  const qc = useQueryClient();
  const [project, setProject] = useState(initialProject);
  // Kept in the draft, so tapping this 挂号 again reopens the form it was in
  // (D-259). Outside a draft (the office) this is ordinary state.
  const [creating, setCreating] = useDraftState("open:creating", Boolean(fieldTaskId));
  const [viewing, setViewing] = useState<DisposalRequest | null>(null);
  // Which step dialog is open, and for which request.
  const [step, setStep] = useState<{ step: DisposalStep; row: DisposalRequest } | null>(null);
  const rows = useQuery({
    queryKey: ["site-disposals", project],
    queryFn: () => getDisposalRequests({ page_size: 200, project: project || undefined }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["site-disposals"] });
  // The approval / vehicle notice links to `?disposal=<id>` (C08): that job
  // opens straight away, where its vehicle exit and Gate Pass are taken.
  // Derived, not copied into state: closing it is the only thing remembered.
  const searchParams = useSearchParams();
  const linked = searchParams.get("disposal");
  const [linkClosed, setLinkClosed] = useState(false);
  const linkedRow = linked && !linkClosed ? rows.data?.results.find((row) => row.id === linked) ?? null : null;
  const shownRow = viewing ? (rows.data?.results.find((row) => row.id === viewing.id) ?? viewing) : linkedRow;

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={can("disposal.submit") ? <Button onClick={() => setCreating(true)}><Plus />{t("action.new")}</Button> : undefined}
      />
      <FilterBar className="items-center">
        <ProjectPicker
          value={project}
          onValueChange={(value) => setProject(value === "all" ? "" : value)}
          placeholder={t("field.project")}
          allowAll
          allLabel={t("field.allProjects")}
          className="w-full sm:w-80"
        />
        <p className="text-xs text-muted-foreground">{t("count", { count: rows.data?.count ?? 0 })}</p>
      </FilterBar>

      {rows.isLoading && <div className="grid min-h-56 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>}
      {rows.isError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">{t("error.load")}</div>}
      {!rows.isLoading && !rows.data?.count && <EmptyState icon={Truck} title={t("empty")} />}
      {!!rows.data?.count && (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.data.results.map((row) => (
            /* 「36 小时内仍未收到处理照片…**整条记录显示红色**」 (D-217). The
               whole card, not just a badge: a marker inside a list of grey
               cards is something you have to be looking for, and this one has
               to be noticed by somebody scanning the page. */
            <article key={row.id} className={`surface-panel min-w-0 rounded-xl p-4 sm:p-6${row.disposal_evidence_is_overdue ? " border-destructive/50 bg-destructive/5" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Truck className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-muted-foreground">{row.reference_no}</p>
                    <StatusBadge label={t(`status.${row.status}`)} tone={statusTone(row.status)} />
                    {row.disposal_evidence_is_overdue && (
                      <StatusBadge label={t("overdue.badge")} tone="danger" />
                    )}
                  </div>
                  {row.disposal_evidence_is_overdue && (
                    /* Said, not just coloured. A red card tells a reader
                       something is wrong; it does not tell them what to chase. */
                    <p className="mt-1 text-xs font-medium text-destructive">{t(overdueHelpKey(row))}</p>
                  )}
                  <h3 className="mt-1 truncate font-semibold">{row.waste_description}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{row.project_name} / {row.location_description}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-y border-panel-border py-3 text-sm">
                <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{t("field.requestedBy")}</p><p className="mt-1 break-words font-medium">{row.requested_by_name || "-"}</p></div>
                <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{t("field.executor")}</p><p className="mt-1 break-words font-medium">{row.assigned_staff_name || row.collector_company_name || t("notAssigned")}</p></div>
                {/* 「已验收 x / N 车」 (X11), once the job has lorries. */}
                {row.trips_total > 0 && <div className="col-span-2"><p className="text-xs font-medium text-muted-foreground">{t("field.tripsProgress")}</p><p className="mt-1 font-medium tabular">{t("trips.progress", { accepted: row.trips_accepted, total: row.trips_total })}</p></div>}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {/* Clearance has no categories since 2026-10 (B1, X5); one
                    filed before keeps it, shown as it was. */}
                <span className="mr-auto self-center text-xs text-muted-foreground">{row.category_name ? <>{ops("field.category")}: <span className="font-medium text-foreground">{row.category_name}</span></> : null}</span>
                <Button size="sm" variant="outline" onClick={() => setViewing(row)}>{t("action.view")}</Button>
                <DisposalActions row={row} onStep={(next) => setStep({ step: next, row })} />
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && <CreateDisposalDialog initialProject={project} fieldTaskId={fieldTaskId} onClose={() => setCreating(false)} onSaved={() => { void refresh(); setCreating(false); onRecordSaved?.(); }} />}
      {shownRow && (
        <DisposalDetailDialog
          row={shownRow}
          onClose={() => {
            setViewing(null);
            setLinkClosed(true);
          }}
          actions={<DisposalActions row={shownRow} onStep={(next) => setStep({ step: next, row: shownRow })} />}
        />
      )}
      <DisposalStepDialogs step={step?.step ?? null} row={step?.row ?? null} onClose={() => setStep(null)} onChanged={() => void refresh()} />
    </div>
  );
}

function CreateDisposalDialog({ initialProject = "", fieldTaskId, onClose, onSaved }: { initialProject?: string; fieldTaskId?: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  // F-282. Saved even when this dialog is opened from the office console:
  // `useDraftState` falls back to plain component state when there is no
  // `<FieldDraft>` above it, so one call site serves both without a branch.
  const [project, setProject] = useDraftState("project", initialProject);
  // No category (2026-10 B1, X5): a draft saved with one leaves it unread.
  const [description, setDescription] = useDraftState("description", "");
  const [locationDescription, setLocationDescription] = useDraftState("locationDescription", "");
  const [volume, setVolume] = useDraftState("volume", "");
  const [weight, setWeight] = useDraftState("weight", "");
  const [preferred, setPreferred] = useDraftState("preferred", "");
  const [note, setNote] = useDraftState("note", "");
  // 「申请时填「预计车次」」 (X11): one number, 1 unless the site says more.
  const [plannedTrips, setPlannedTrips] = useDraftState("plannedTrips", "1");
  const [photos, setPhotos] = useDraftState<File[]>("photos", []);
  const [fieldEvidence, setFieldEvidence] = useDraftState("fieldEvidence", createEmptyFieldEvidence);
  const clearDraft = useClearDraft();
  // Not saved: a stale fix would be submitted as a fresh one.
  const [location, setLocation] = useState<Coordinates | null>(null);
  const fieldPhotos = completedFieldEvidence(fieldEvidence);
  const submissionPhotos = isFieldStaff ? fieldPhotos : photos;
  const evidenceLabels = [
    t("fieldEvidence.overview"),
    t("fieldEvidence.quantity"),
    t("fieldEvidence.access"),
    t("fieldEvidence.surroundings"),
  ];
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      return submitDisposalRequestOfflineAware(user.id, {
        project,
        waste_description: description,
        location_description: isFieldStaff ? "GPS captured site location" : locationDescription,
        estimated_volume_m3: isFieldStaff ? "" : volume,
        estimated_weight_kg: isFieldStaff ? "" : weight,
        preferred_at: !isFieldStaff && preferred ? new Date(preferred).toISOString() : undefined,
        request_note: note,
        planned_trips: plannedTrips,
        captured_at: new Date().toISOString(),
        latitude: location!.latitude,
        longitude: location!.longitude,
        accuracy_m: location!.accuracy,
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        photos: submissionPhotos,
      });
    },
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-w-0 flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0"><DialogTitle>{t("create.title")}</DialogTitle><DialogDescription>{t("create.description")}</DialogDescription></DialogHeader>
        <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto overflow-x-hidden pr-1 sm:grid-cols-2">
          <FieldWrapper label={t("field.project")} required className="sm:col-span-2"><ProjectPicker value={project} onValueChange={setProject} placeholder={t("field.project")} /></FieldWrapper>
          <FieldWrapper label={t("field.waste")} required className="sm:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></FieldWrapper>
          <FieldWrapper label={t("field.plannedTrips")} required><Input inputMode="numeric" type="number" min="1" max={MAX_PLANNED_TRIPS} value={plannedTrips} onChange={(e) => setPlannedTrips(e.target.value)} /></FieldWrapper>
          {!isFieldStaff ? <>
            <FieldWrapper label={t("field.siteLocation")} required className="sm:col-span-2"><Input value={locationDescription} onChange={(e) => setLocationDescription(e.target.value)} /></FieldWrapper>
            <FieldWrapper label={t("field.volume")} optional={t("optional")}><Input type="number" min="0" step="0.001" value={volume} onChange={(e) => setVolume(e.target.value)} /></FieldWrapper>
            <FieldWrapper label={t("field.estimatedWeight")} optional={t("optional")}><Input type="number" min="0" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} /></FieldWrapper>
            <FieldWrapper label={t("field.preferredAt")} optional={t("optional")}><Input type="datetime-local" value={preferred} onChange={(e) => setPreferred(e.target.value)} /></FieldWrapper>
          </> : null}
          <LocationField label={t("field.gps")} actionLabel={t("action.getLocation")} readyLabel={t("action.locationReady")} value={location} onChange={setLocation} required />
          {/* General waste (L6 / B24): none required on the phone, at most four -
              「一次最多 4 张，不要求拍满」. The office still attaches one. */}
          <FieldWrapper label={t("field.photos")} required={!isFieldStaff} className="sm:col-span-2">
            {isFieldStaff ? (
              <FieldEvidenceGrid
                labels={evidenceLabels}
                files={fieldEvidence}
                progressLabel={t("fieldEvidence.progress", {
                  current: fieldPhotos.length,
                  max: DISPOSAL_PHOTO_MAX,
                })}
                onChange={setFieldEvidence}
                maxFiles={DISPOSAL_PHOTO_MAX}
              />
            ) : (
              <FieldCamera
                label={t("field.photos")}
                fileCount={photos.length}
                onCapture={(file) => setPhotos((current) => [...current, file])}
                onClear={() => setPhotos([])}
              />
            )}
          </FieldWrapper>
          <FieldWrapper label={t("field.note")} optional={t("optional")} className="sm:col-span-2"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper>
        </div>
        <DialogFooter className="shrink-0"><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[project, t("field.project")], [description, t("field.waste")], [isFieldStaff || locationDescription, t("field.siteLocation")], [isFieldStaff || submissionPhotos.length >= 1, t("field.photos")], [isFieldStaff ? location : true, t("field.gps")], [validTrips(plannedTrips), t("field.plannedTrips")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Send />}{t("action.submit")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewDisposalDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [note, setNote] = useState("");
  // "Approve 3 lorries" (X11): the site's number, which the approver may change.
  const [trips, setTrips] = useState(String(row.planned_trips || 1));
  /*
   * Approving mints the temporary link and hands it back once (D-217).
   *
   * So this dialog does not close on success: the server keeps only the hash,
   * and closing would throw away the one copy the applicant is supposed to
   * forward. The list behind it is refreshed straight away, so what stays open
   * is only the link.
   */
  const [link, setLink] = useState("");
  const save = useMutation({
    mutationFn: () => reviewDisposalRequest(row.id, decision, note, Number(trips)),
    onSuccess: (data) => {
      onSaved();
      if (data.external_url) setLink(data.external_url);
      else onClose();
    },
  });
  if (link) {
    return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("review.linkTitle")}</DialogTitle><DialogDescription>{t("review.linkHelp")}</DialogDescription></DialogHeader><div className="space-y-3"><div className="break-all rounded-lg border bg-muted/30 p-3 font-mono text-sm">{link}</div><Button className="w-full" onClick={() => void navigator.clipboard.writeText(link)}><Copy />{t("action.copyLink")}</Button></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.close")}</Button></DialogFooter></DialogContent></Dialog>;
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("review.title")}</DialogTitle><DialogDescription>{row.reference_no} / {row.waste_description}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><Button variant={decision === "APPROVED" ? "default" : "outline"} onClick={() => setDecision("APPROVED")}><CheckCircle2 />{t("action.approve")}</Button><Button variant={decision === "REJECTED" ? "destructive" : "outline"} onClick={() => setDecision("REJECTED")}><XCircle />{t("action.reject")}</Button></div>{decision === "APPROVED" && <FieldWrapper label={t("field.plannedTrips")} required><Input inputMode="numeric" type="number" min="1" max={MAX_PLANNED_TRIPS} value={trips} onChange={(e) => setTrips(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{t("review.tripsHelp")}</p></FieldWrapper>}<FieldWrapper label={t("field.reviewNote")} required={decision === "REJECTED"}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[decision !== "REJECTED" || note, t("field.reviewNote")], [decision !== "APPROVED" || validTrips(trips), t("field.plannedTrips")]]} disabled={save.isPending} onClick={() => save.mutate()}>{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function defaultLinkExpiry() {
  const value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function AssignExecutorDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [mode, setMode] = useState<"INTERNAL" | "EXTERNAL">(row.assignment_type === "EXTERNAL" ? "EXTERNAL" : "INTERNAL");
  const [staff, setStaff] = useState(row.assigned_staff || "");
  const [company, setCompany] = useState(row.assignment_type === "EXTERNAL" ? row.collector_company_name : "");
  const [contact, setContact] = useState(row.assignment_type === "EXTERNAL" ? row.collector_contact_name : "");
  const [phone, setPhone] = useState(row.assignment_type === "EXTERNAL" ? row.collector_phone : "");
  const [email, setEmail] = useState(row.assignment_type === "EXTERNAL" ? row.collector_email : "");
  const [expires, setExpires] = useState(defaultLinkExpiry);
  const [link, setLink] = useState("");
  const team = useQuery({ queryKey: ["projects", "assignments", row.project], queryFn: () => getProjectAssignments(row.project) });
  const fieldStaff = (team.data?.results ?? []).filter((assignment) => assignment.is_field_staff);
  const save = useMutation({
    mutationFn: () => mode === "INTERNAL"
      ? assignDisposalInternal(row.id, { assigned_staff: staff })
      : assignDisposalCollector(row.id, { collector_company_name: company, collector_contact_name: contact, collector_phone: phone, collector_email: email, expires_at: new Date(expires).toISOString() }),
    onSuccess: (data) => {
      if ("external_url" in data && typeof data.external_url === "string") setLink(data.external_url);
      else onClose();
      onSaved();
    },
  });
  const disabled = save.isPending || (mode === "INTERNAL" ? !staff : !company.trim() || !contact.trim() || !phone.trim() || !expires);
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t("assign.title")}</DialogTitle><DialogDescription>{link ? t("assign.copyNow") : t("assign.description")}</DialogDescription></DialogHeader>{link ? <div className="space-y-3"><div className="break-all rounded-lg border bg-muted/30 p-3 font-mono text-sm">{link}</div><Button className="w-full" onClick={() => void navigator.clipboard.writeText(link)}><Copy />{t("action.copyLink")}</Button></div> : <><div className="grid grid-cols-2 gap-2"><Button type="button" variant={mode === "INTERNAL" ? "default" : "outline"} onClick={() => setMode("INTERNAL")}><UserRound />{t("assignment.internal")}</Button><Button type="button" variant={mode === "EXTERNAL" ? "default" : "outline"} onClick={() => setMode("EXTERNAL")}><Link2 />{t("assignment.external")}</Button></div>{mode === "INTERNAL" ? <FieldWrapper label={t("field.fieldStaff")} required><Select value={staff} onValueChange={setStaff}><SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseFieldStaff")} /></SelectTrigger><SelectContent>{fieldStaff.map((assignment) => <SelectItem key={assignment.user} value={assignment.user}>{assignment.user_name}</SelectItem>)}</SelectContent></Select>{!team.isLoading && !team.isError && !fieldStaff.length && <p className="mt-2 text-xs text-destructive">{t("assign.noFieldStaff")}</p>}<QueryFailedNote query={team} what={t("what.fieldStaff")} className="mt-2" /></FieldWrapper> : <div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.collectorCompany")} required className="sm:col-span-2"><Input value={company} onChange={(e) => setCompany(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.contact")} required><Input value={contact} onChange={(e) => setContact(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.phone")} required><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.email")} optional={t("optional")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.linkExpiry")} required><Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></FieldWrapper></div>}</>}<DialogFooter><Button variant="outline" onClick={onClose}>{link ? t("action.close") : t("action.cancel")}</Button>{!link && <Button disabled={disabled} onClick={() => save.mutate()}><Send />{mode === "INTERNAL" ? t("action.sendToStaff") : t("action.createLink")}</Button>}</DialogFooter></DialogContent></Dialog>;
}

function RegenerateLinkDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [expires, setExpires] = useState(defaultLinkExpiry);
  const [link, setLink] = useState("");
  const save = useMutation({ mutationFn: () => regenerateDisposalExternalLink(row.id, new Date(expires).toISOString()), onSuccess: (data) => { setLink(data.external_url); onSaved(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("regenerate.title")}</DialogTitle><DialogDescription>{link ? t("regenerate.copyNow") : t("regenerate.description")}</DialogDescription></DialogHeader>{link ? <div className="space-y-3"><div className="break-all rounded-lg border bg-muted/30 p-3 font-mono text-sm">{link}</div><Button className="w-full" onClick={() => void navigator.clipboard.writeText(link)}><Copy />{t("action.copyLink")}</Button></div> : <FieldWrapper label={t("field.linkExpiry")} required><Input type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} /></FieldWrapper>}<DialogFooter><Button variant="outline" onClick={onClose}>{link ? t("action.close") : t("action.cancel")}</Button>{!link && <Button requires={[[expires, t("field.linkExpiry")]]} disabled={save.isPending} onClick={() => save.mutate()}><RefreshCw />{t("action.regenerateLink")}</Button>}</DialogFooter></DialogContent></Dialog>;
}

function CancelDisposalDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [reason, setReason] = useState("");
  const save = useMutation({ mutationFn: () => cancelDisposalRequest(row.id, reason), onSuccess: onSaved });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("cancel.title")}</DialogTitle><DialogDescription>{t("cancel.description", { reference: row.reference_no })}</DialogDescription></DialogHeader><FieldWrapper label={t("field.cancelReason")} required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.close")}</Button><Button variant="destructive" requires={[[reason, t("field.cancelReason")]]} disabled={save.isPending} onClick={() => save.mutate()}><XCircle />{t("action.cancelDisposal")}</Button></DialogFooter></DialogContent></Dialog>;
}

/**
 * The office fills in weight, trips and DO number after the job (D06, E04).
 *
 * These used to be typed on the confirmation dialog; E04 removed the
 * confirmation (submitting the final proof ends the job), so they get their
 * own small dialog. Not a confirmation, no status change: blank leaves what
 * is there, and the server appends every change to the timeline.
 */
function RecordNumbersDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [weight, setWeight] = useState(row.actual_weight_kg ?? "");
  const [trips, setTrips] = useState(row.trip_count ? String(row.trip_count) : "");
  const [doNo, setDoNo] = useState(row.disposal_do_no ?? "");
  // A job with lorries counts them (X11): the count is not typed, and one
  // lorry's weight / DO is corrected on that lorry (Q29.7).
  const counted = row.trips_total > 0;
  const save = useMutation({
    mutationFn: () => recordDisposalNumbers(row.id, { actual_weight_kg: weight, trip_count: counted ? undefined : trips, disposal_do_no: doNo }),
    onSuccess: onSaved,
  });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("recordNumbers.title")}</DialogTitle><DialogDescription>{t("recordNumbers.description", { reference: row.reference_no })}</DialogDescription></DialogHeader><div className={`grid gap-3 ${counted ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}><FieldWrapper label={t("field.actualWeight")} optional={t("optional")}><Input inputMode="decimal" type="number" min="0" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} /></FieldWrapper>{!counted && <FieldWrapper label={t("field.trips")} optional={t("optional")}><Input inputMode="numeric" type="number" min="1" value={trips} onChange={(e) => setTrips(e.target.value)} /></FieldWrapper>}<FieldWrapper label={t("field.doNo")} optional={t("optional")}><Input value={doNo} onChange={(e) => setDoNo(e.target.value)} /></FieldWrapper></div>{counted && <p className="text-sm text-muted-foreground">{t("recordNumbers.tripsCounted")}</p>}<DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={save.isPending} onClick={() => save.mutate()}>{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

const SITE_EVIDENCE_KINDS: DisposalSiteEvidenceKind[] = ["VEHICLE_EXIT", "GATE_PASS"];

/**
 * The site photographs the load leaving: vehicle exit, Gate Pass (C08).
 *
 * Opened from the same disposal after approval. General waste rules (E03):
 * up to four per submission in any mix, none required per kind, note
 * optional. Stored apart from the driver's final proof on the same ID.
 */
function SiteEvidenceDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const [shots, setShots] = useState<Array<{ file: File; kind: DisposalSiteEvidenceKind }>>([]);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<Coordinates | null>(null);
  const full = shots.length >= DISPOSAL_PHOTO_MAX;
  const save = useMutation({
    mutationFn: () => addDisposalSiteEvidence(row.id, {
      photos: shots,
      note,
      latitude: location?.latitude,
      longitude: location?.longitude,
      accuracy_m: location?.accuracy,
      client_event_id: crypto.randomUUID(),
    }),
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-w-0 flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0"><DialogTitle>{t("siteEvidence.title")}</DialogTitle><DialogDescription>{t("siteEvidence.description", { reference: row.reference_no })}</DialogDescription></DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
          <FieldWrapper label={t("siteEvidence.photos")} required>
          <p className="mb-2 text-xs text-muted-foreground">{t("siteEvidence.progress", { current: shots.length, max: DISPOSAL_PHOTO_MAX })}</p>
          <div className="grid gap-3">
          {SITE_EVIDENCE_KINDS.map((kind) => {
            const taken = shots.filter((shot) => shot.kind === kind);
            return (
              <FieldCamera
                key={kind}
                label={t(kind === "VEHICLE_EXIT" ? "siteEvidence.vehicleExit" : "siteEvidence.gatePass")}
                fileCount={taken.length}
                file={taken[taken.length - 1]?.file}
                disabled={full}
                onCapture={(file) => setShots((current) => (current.length >= DISPOSAL_PHOTO_MAX ? current : [...current, { file, kind }]))}
                onClear={() => setShots((current) => current.filter((shot) => shot.kind !== kind))}
              />
            );
          })}
          </div>
          </FieldWrapper>
          {isFieldStaff && <LocationField label={t("field.gps")} actionLabel={t("action.getLocation")} readyLabel={t("action.locationReady")} value={location} onChange={setLocation} required />}
          <FieldWrapper label={t("siteEvidence.note")} optional={t("optional")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper>
        </div>
        <DialogFooter className="shrink-0"><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[shots.length > 0, t("siteEvidence.photos")], [isFieldStaff ? location : true, t("field.gps")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Send />}{t("siteEvidence.submit")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The stage of one photograph; the server says, this is only a fallback. */
function stageOf(item: { kind: DisposalEvidenceKind; stage?: DisposalEvidenceStage }): DisposalEvidenceStage {
  if (item.stage) return item.stage;
  if (item.kind === "REQUEST") return "REQUEST";
  if (["VEHICLE_EXIT", "GATE_PASS", "LOADING"].includes(item.kind)) return "SITE_EXIT";
  if (item.kind === "CONFIRMATION") return "OFFICE_CHECK";
  return "FINAL_PROOF";
}

/** The server's ceiling on one request's lorries (X11). */
const MAX_PLANNED_TRIPS = 50;

function validTrips(value: string) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_PLANNED_TRIPS;
}

/**
 * The detail's photograph rows (B23, X11): request, leaving site, then one row
 * per lorry, then any final proof from before C5 (no lorry), then the office
 * check from before E04.
 */
export function disposalPhotoGroups(row: Pick<DisposalRequest, "evidence" | "trips">): string[] {
  const trips = row.trips.filter((trip) => trip.status !== "CANCELLED" || trip.evidence.length > 0);
  const loose = row.evidence.some((item) => !item.trip && stageOf(item) === "FINAL_PROOF");
  return [
    "REQUEST",
    "SITE_EXIT",
    ...trips.map((trip) => `TRIP-${trip.seq}`),
    ...(loose || !trips.length ? ["FINAL_PROOF"] : []),
    ...(row.evidence.some((item) => stageOf(item) === "OFFICE_CHECK") ? ["OFFICE_CHECK"] : []),
  ];
}

function photoGroupOf(
  row: Pick<DisposalRequest, "trips">,
  item: { kind: DisposalEvidenceKind; stage?: DisposalEvidenceStage; trip?: string | null },
): string {
  const trip = item.trip ? row.trips.find((candidate) => candidate.id === item.trip) : undefined;
  return trip ? `TRIP-${trip.seq}` : stageOf(item);
}

/** Every photograph in the order of its row. */
function disposalPhotos(row: DisposalRequest) {
  const groups = disposalPhotoGroups(row);
  return [...row.evidence].sort((a, b) => groups.indexOf(photoGroupOf(row, a)) - groups.indexOf(photoGroupOf(row, b)));
}

/**
 * Which sentence explains a red job (D-217, Q29.8): no load yet after the 36
 * hours from approval, or the next lorry 48 hours late after one has come.
 */
export function overdueHelpKey(row: Pick<DisposalRequest, "trips">): "overdue.help" | "overdue.helpNextLoad" {
  return row.trips.some((trip) => trip.status === "SUBMITTED" || trip.status === "ACCEPTED") ? "overdue.helpNextLoad" : "overdue.help";
}

/** A load the office may correct: sent, on a job that runs or has finished (Q29.7). */
export function canCorrectTrip(row: Pick<DisposalRequest, "status">, trip: Pick<DisposalTrip, "status">): boolean {
  return (trip.status === "SUBMITTED" || trip.status === "ACCEPTED") && (RUNNING.includes(row.status) || row.status === "COMPLETED");
}

/**
 * The office corrects one load's weight and/or DO number (Q29.7).
 *
 * 「清运进行中，后台可以更正某一车的重量或 DO，要写原因、留记录」: a reason is
 * required, and the server keeps the original and every change - shown on
 * the load, newest first. Only what was changed is sent.
 */
function CorrectTripDialog({ row, trip, onClose, onSaved }: { row: DisposalRequest; trip: DisposalTrip; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [weight, setWeight] = useState(trip.weight_kg ?? "");
  const [doNo, setDoNo] = useState(trip.do_no);
  const [reason, setReason] = useState("");
  const weightChanged = weight.trim() !== "" && (trip.weight_kg === null || Number(weight) !== Number(trip.weight_kg));
  const doChanged = doNo.trim() !== "" && doNo.trim() !== trip.do_no;
  const unchanged = !weightChanged && !doChanged;
  const save = useMutation({
    mutationFn: () =>
      correctDisposalTrip(row.id, trip.id, {
        weight_kg: weightChanged ? weight.trim() : undefined,
        do_no: doChanged ? doNo.trim() : undefined,
        reason,
      }),
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("trips.correctTitle", { seq: trip.seq })}</DialogTitle>
          <DialogDescription>{t("trips.correctHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("field.actualWeight")} optional={t("optional")}>
            <Input inputMode="decimal" type="number" min="0" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.doNo")} optional={t("optional")}>
            <Input value={doNo} onChange={(event) => setDoNo(event.target.value)} />
          </FieldWrapper>
        </div>
        <FieldWrapper label={t("trips.correctReason")} required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
        </FieldWrapper>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button
            requires={[[reason, t("trips.correctReason")]]}
            disabledReason={unchanged ? t("trips.correctUnchanged") : undefined}
            disabled={unchanged || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Pencil />}
            {t("trips.correctSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function tripTone(status: DisposalTripStatus): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "ACCEPTED") return "positive";
  if (status === "SUBMITTED") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

/**
 * The lorries of one disposal job and the office's check of each (X11, C5).
 *
 * 「批准 3 车 → 司机回传第 1 车 → 后台收到待办 → 验收 → 1/3 … 3/3 → 清运单
 * 完成」. Each sent lorry shows its photographs and one 【验收这一车】; the last
 * check completes the job on the server. 【加一车】 adds a lorry after the
 * last; ending early is armed by a switch, never a confirm dialog (spec
 * rule 8), and is only offered once a lorry has been sent - before that it is
 * a cancellation, which asks for a reason.
 *
 * Nothing on a job from before C5, which has no lorries.
 */
export function DisposalTripsPanel({
  row,
  canCheck,
  onChanged,
}: {
  row: DisposalRequest;
  canCheck: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("siteDisposal");
  const df = useDateFormat();
  const [endArmed, setEndArmed] = useState(false);
  const [correcting, setCorrecting] = useState<DisposalTrip | null>(null);
  const accept = useMutation({ mutationFn: (trip: string) => acceptDisposalTrip(row.id, trip), onSuccess: onChanged });
  const add = useMutation({ mutationFn: () => addDisposalTrip(row.id), onSuccess: onChanged });
  const end = useMutation({
    mutationFn: () => endDisposalEarly(row.id),
    onSuccess: () => {
      setEndArmed(false);
      onChanged();
    },
  });
  if (!row.trips.length) return null;
  const running = RUNNING.includes(row.status) && !row.trips_closed_at;
  const sentAny = row.trips.some((trip) => trip.status === "SUBMITTED" || trip.status === "ACCEPTED");
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("trips.title")}</h3>
        <span className="text-sm font-semibold tabular">{t("trips.progress", { accepted: row.trips_accepted, total: row.trips_total })}</span>
      </div>
      {row.trips_closed_at && <p className="mb-2 text-xs text-muted-foreground">{t("trips.ended")}</p>}
      <ul className="space-y-2">
        {row.trips.map((trip) => (
          <li key={trip.id} className="rounded-md border px-2 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t("trips.seq", { seq: trip.seq })}</span>
              <StatusBadge label={t(`tripStatus.${trip.status}`)} tone={tripTone(trip.status)} />
            </div>
            {trip.submitted_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                {[trip.submitted_by_name, df.dateTime(trip.submitted_at), trip.weight_kg ? `${trip.weight_kg} kg` : "", trip.do_no].filter(Boolean).join(" · ")}
              </p>
            )}
            {trip.evidence.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trip.evidence.map((item) => (
                  <a key={item.id} href={item.watermarked || item.image} target="_blank" rel="noreferrer" title={t(`evidenceKind.${item.kind}`)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed, watermarked evidence URL, not a static asset */}
                    <img src={item.watermarked || item.image} alt={t(`evidenceKind.${item.kind}`)} className="size-12 rounded object-cover" />
                  </a>
                ))}
              </div>
            )}
            {trip.accepted_at && (
              <p className="mt-1 text-xs text-muted-foreground">{t("trips.checkedBy", { name: trip.accepted_by_name ?? "", at: df.dateTime(trip.accepted_at) })}</p>
            )}
            {/* Q29.7: the original and every correction, newest first; the
                line above shows the current value. */}
            {trip.corrections.length > 0 && (
              <div className="mt-2 border-l-2 border-warning/60 pl-2">
                <p className="text-xs font-medium">{t("trips.history")}</p>
                <ul className="mt-1 space-y-1">
                  {trip.corrections.map((item) => (
                    <li key={item.id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t(item.field === "weight_kg" ? "trips.historyWeight" : "trips.historyDo", { from: item.from || t("trips.blank"), to: item.to })}
                      </span>
                      <span className="block">{t("trips.historyMeta", { name: item.by_name, at: df.dateTime(item.at), reason: item.reason })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {canCheck && (trip.status === "SUBMITTED" || canCorrectTrip(row, trip)) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {trip.status === "SUBMITTED" && RUNNING.includes(row.status) && (
                  <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate(trip.id)}>
                    {accept.isPending && accept.variables === trip.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    {t("trips.accept")}
                  </Button>
                )}
                {canCorrectTrip(row, trip) && (
                  <Button size="sm" variant="outline" onClick={() => setCorrecting(trip)}>
                    <Pencil />
                    {t("trips.correct")}
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {canCheck && running && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate()}>
            <Plus />
            {t("trips.add")}
          </Button>
          {sentAny && (
            <div className="space-y-2 rounded-md border border-destructive/20 p-2">
              <label className="flex items-start gap-2">
                <Switch checked={endArmed} onCheckedChange={setEndArmed} aria-label={t("trips.endSwitch")} />
                <span className="text-xs text-muted-foreground">{t("trips.endHint")}</span>
              </label>
              {endArmed && (
                <Button size="sm" variant="destructive" className="w-full" disabled={end.isPending} onClick={() => end.mutate()}>
                  {end.isPending ? <Loader2 className="animate-spin" /> : <XCircle />}
                  {t("trips.end")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {correcting && (
        <CorrectTripDialog
          row={row}
          trip={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={() => {
            setCorrecting(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

/**
 * One disposal request on the shared detail shell (T-369, C-020).
 *
 * The timeline is the right column's panel: what happened, by whom, when -
 * the thing a reader checks before deciding the next step, which is the
 * button under it.
 */
function DisposalDetailDialog({
  row,
  onClose,
  actions,
}: {
  row: DisposalRequest;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const t = useTranslations("siteDisposal");
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  return (
    <RecordDetailDialog
      title={row.reference_no}
      description={`${row.project_name} / ${row.waste_description}`}
      exportRecord={{ kind: "DISPOSAL_REQUEST", recordId: row.id, reference: row.reference_no }}
      onClose={onClose}
    >
      <RecordDetailShell
        reference={row.reference_no}
        // 记录人 (E8): who recorded it, with a number to call.
        recorder={<RecordRecorder record={row} />}
        notices={
          row.disposal_evidence_is_overdue ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
              {t(overdueHelpKey(row))}
            </p>
          ) : null
        }
        facts={[
          { label: t("field.status"), value: <StatusBadge label={t(`status.${row.status}`)} tone={statusTone(row.status)} /> },
          { label: t("field.project"), value: row.project_name },
          { label: t("field.siteLocation"), value: row.location_description },
          { label: t("field.preferredAt"), value: row.preferred_at ? df.dateTime(row.preferred_at) : "—" },
          { label: t("field.requestedBy"), value: row.requested_by_name || "—" },
          { label: t("field.executor"), value: row.assigned_staff_name || row.collector_company_name || t("notAssigned") },
          { label: t("field.actualWeight"), value: row.actual_weight_kg ? `${row.actual_weight_kg} kg` : "—" },
          // 「已验收 x / N 车」 (X11); a job from before C5 keeps its typed count.
          row.trips_total
            ? { label: t("field.tripsProgress"), value: t("trips.progress", { accepted: row.trips_accepted, total: row.trips_total }) }
            : { label: t("field.trips"), value: row.trip_count ? String(row.trip_count) : "—" },
          { label: t("field.doNo"), value: row.disposal_do_no || "—" },
          { label: t("field.ocr"), value: t(`ocr.${row.ocr_status}`) },
          // A job from before C5 ended on the final proof's submission (E04).
          ...(row.trips.length ? [] : [{ label: t("field.finalProofSubmitted"), value: row.submitted_at && ["COMPLETED", "AWAITING_CONFIRMATION"].includes(row.status) ? df.dateTime(row.submitted_at) : "—" }]),
          // Only on a job confirmed under the earlier rule; kept readable.
          ...(row.confirmed_at ? [{ label: t("field.legacyConfirmation"), value: `${row.confirmed_by_name ?? ""} · ${df.dateTime(row.confirmed_at)}${row.confirmation_note ? ` · ${row.confirmation_note}` : ""}` }] : []),
          { label: t("field.waste"), value: row.waste_description, wide: true },
          ...(row.request_note ? [{ label: t("field.note"), value: row.request_note, wide: true }] : []),
          ...(row.review_note ? [{ label: t("field.reviewNote"), value: row.review_note, wide: true }] : []),
        ]}
        photos={disposalPhotos(row).map((item) => ({
          id: item.id,
          url: item.watermarked || item.image,
          label: t(`evidenceKind.${item.kind}`),
          takenAt: item.captured_at,
          latitude: item.latitude,
          longitude: item.longitude,
          group: photoGroupOf(row, item),
        }))}
        // B23: request / loading and leaving site / final proof, apart - and
        // since C5 the final proof one row per lorry (X11). The office-check
        // row only appears on a job that has one (pre-E04).
        photoGroups={disposalPhotoGroups(row).map((group) => ({
          key: group,
          label: group.startsWith("TRIP-") ? t("trips.seq", { seq: Number(group.slice(5)) }) : t(`stage.${group}`),
        }))}
        emptyGroupLabel={t("stage.empty")}
        panel={
          <div className="space-y-3">
          <DisposalTripsPanel row={row} canCheck={can("disposal.confirm") || can("disposal.manage")} onChanged={() => void qc.invalidateQueries({ queryKey: ["site-disposals"] })} />
          <section className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("timeline")}</h3>
            {/* The shared timeline (E2): dots on the line, one per step. */}
            <Timeline
              size="compact"
              className="max-h-64 overflow-y-auto"
              items={row.timeline.map((item) => ({
                key: item.id,
                title: t.has(`timelineEvent.${item.event}`) ? t(`timelineEvent.${item.event}`) : item.event,
                meta: `${item.actor_name || t("externalActor")} · ${df.dateTime(item.happened_at)}`,
                note: item.note || undefined,
                tone: "info",
              }))}
            />
          </section>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {actions}
            <AddToPackageButton kind="DISPOSAL_REQUEST" recordId={row.id} projectId={row.project} reference={row.reference_no} />
          </div>
        }
        // The conversation bound to this Record ID (T-316, C-014, D-233), on
        // the screen where the work is done rather than in the archive queue.
        conversation={{ kind: "DISPOSAL_REQUEST", recordId: row.id }}
        // 【确认归档】 once the disposal is completed (C4).
        closure={{ kind: "DISPOSAL_REQUEST", recordId: row.id }}
      />
    </RecordDetailDialog>
  );
}

type DisposalStep = "reviewing" | "assigning" | "regenerating" | "numbers" | "siteEvidence" | "cancelling";

/** Approved and not yet finished: the only time the job takes photographs. */
const RUNNING: DisposalRequestStatus[] = ["APPROVED", "ASSIGNED", "IN_PROGRESS", "RETURNED"];

/**
 * The steps one disposal request can take next, for whoever is looking.
 *
 * One component for the phone card and the office detail's right column
 * (C-020: 「那些按钮放在图 2 的圈起来的位置」), so the two never offer
 * different steps for the same state.
 */
function DisposalActions({ row, onStep }: { row: DisposalRequest; onStep: (step: DisposalStep) => void }) {
  const t = useTranslations("siteDisposal");
  const { can } = useAuth();
  return (
    <>
      {can("disposal.manage") && row.status === "REQUESTED" && <Button size="sm" onClick={() => onStep("reviewing")}><ClipboardCheck />{t("action.review")}</Button>}
      {can("disposal.manage") && ["APPROVED", "ASSIGNED", "RETURNED"].includes(row.status) && <Button size="sm" onClick={() => onStep("assigning")}><Send />{t("action.assign")}</Button>}
      {can("disposal.manage") && row.assignment_type === "EXTERNAL" && ["ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(row.status) && <Button size="sm" variant="outline" onClick={() => onStep("regenerating")}><RefreshCw />{t("action.regenerateLink")}</Button>}
      {/* C08: the site's vehicle exit / Gate Pass, on the same job. */}
      {can("disposal.submit") && RUNNING.includes(row.status) && <Button size="sm" variant="outline" onClick={() => onStep("siteEvidence")}><Camera />{t("action.siteEvidence")}</Button>}
      {/* E04: no 验收 / 退回 - the final proof's submission ended the job.
          What the office still does is fill in the numbers (D06). */}
      {can("disposal.confirm") && ["COMPLETED", "AWAITING_CONFIRMATION"].includes(row.status) && <Button size="sm" variant="outline" onClick={() => onStep("numbers")}><Hash />{t("action.recordNumbers")}</Button>}
      {can("disposal.manage") && !["COMPLETED", "AWAITING_CONFIRMATION", "CANCELLED", "REJECTED"].includes(row.status) && <Button size="sm" variant="destructive" onClick={() => onStep("cancelling")}><XCircle />{t("action.cancelDisposal")}</Button>}
    </>
  );
}

/** The step dialogs, mounted once by whichever screen owns the request list. */
function DisposalStepDialogs({
  step,
  row,
  onClose,
  onChanged,
}: {
  step: DisposalStep | null;
  row: DisposalRequest | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  if (!step || !row) return null;
  const done = () => {
    onChanged();
    onClose();
  };
  switch (step) {
    case "reviewing":
      return <ReviewDisposalDialog row={row} onClose={onClose} onSaved={done} />;
    case "assigning":
      return <AssignExecutorDialog row={row} onClose={onClose} onSaved={onChanged} />;
    case "regenerating":
      return <RegenerateLinkDialog row={row} onClose={onClose} onSaved={onChanged} />;
    case "cancelling":
      return <CancelDisposalDialog row={row} onClose={onClose} onSaved={done} />;
    case "numbers":
      return <RecordNumbersDialog row={row} onClose={onClose} onSaved={done} />;
    case "siteEvidence":
      return <SiteEvidenceDialog row={row} onClose={onClose} onSaved={done} />;
  }
}

/**
 * The office list of disposal requests, in the receipt list's layout (图 4,
 * T-370); each request opens on the shared shell (T-369). The phone keeps
 * `SiteDisposalWorkspace`'s cards.
 */
export function SiteDisposalOffice() {
  const t = useTranslations("siteDisposal");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  // `counted=1` arrives from the head office's 原工地清运 card (F8): only the
  // jobs it counts - not rejected, not cancelled.
  const list = useListQuery(["project", "status", "counted"]);
  const rows = useQuery({
    queryKey: ["site-disposals", "office", list.query],
    queryFn: () => getDisposalRequests(list.query),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["site-disposals"] });
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  // A task card links here with ?record=<id>.
  const [viewingId, setViewingId] = useUrlSelection("record");
  const [step, setStep] = useState<{ step: DisposalStep; row: DisposalRequest } | null>(null);
  const total = rows.data?.count ?? 0;
  const listed = viewingId ? rows.data?.results.find((row) => row.id === viewingId) : undefined;
  // A linked request may be on another page of the list, or filtered out.
  const viewingRecord = useQuery({
    queryKey: ["site-disposals", "record", viewingId],
    queryFn: () => getDisposalRequest(viewingId as string),
    enabled: Boolean(viewingId) && !listed && rows.isSuccess,
  });
  // The open request follows the list, so a step taken from the detail shows
  // its result without closing and reopening.
  const shown = listed ?? viewingRecord.data ?? null;

  const columns = useMemo<ColumnDef<DisposalRequest, unknown>[]>(
    () => [
      {
        accessorKey: "reference_no",
        meta: { label: tRoot("moduleTable.reference") },
        header: sortable(tRoot("moduleTable.reference")),
        // Short number big, project small (2026-10 D4).
        cell: ({ row }) => <RecordNo value={row.original.reference_no} />,
      },
      // The record's photograph beside its main column (E3).
      photoColumn<DisposalRequest>({
        label: tRoot("moduleTable.photos"),
        icon: Trash2,
        reference: (row) => row.reference_no,
        photos: (row) => rowPhotos(row.evidence, row.reference_no),
      }),
      {
        accessorKey: "status",
        meta: { label: t("field.status") },
        header: sortable(t("field.status")),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge label={t(`status.${row.original.status}`)} tone={statusTone(row.original.status)} />
            {row.original.disposal_evidence_is_overdue && <StatusBadge label={t("overdue.badge")} tone="danger" />}
          </div>
        ),
      },
      {
        // 「已验收 x / N 车」 (X11).
        id: "trips",
        meta: { label: t("field.tripsProgress") },
        header: () => <PlainHeader label={t("field.tripsProgress")} />,
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap">
            {row.original.trips_total ? t("trips.progress", { accepted: row.original.trips_accepted, total: row.original.trips_total }) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "waste_description",
        meta: { label: t("field.waste") },
        header: () => <PlainHeader label={t("field.waste")} />,
        cell: ({ row }) => (
          <span className="block max-w-55 truncate font-medium text-foreground" title={row.original.waste_description}>
            {row.original.waste_description}
          </span>
        ),
      },
      {
        accessorKey: "location_description",
        meta: { label: t("field.siteLocation") },
        header: () => <PlainHeader label={t("field.siteLocation")} />,
        cell: ({ row }) => <span className="block max-w-45 truncate">{row.original.location_description}</span>,
      },
      {
        accessorKey: "preferred_at",
        meta: { label: t("field.preferredAt") },
        header: sortable(t("field.preferredAt")),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {row.original.preferred_at ? df.dateTime(row.original.preferred_at) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "requested_by_name",
        meta: { label: t("field.requestedBy") },
        header: () => <PlainHeader label={t("field.requestedBy")} />,
        cell: ({ row }) => row.original.requested_by_name || "—",
      },
      {
        id: "executor",
        meta: { label: t("field.executor") },
        header: () => <PlainHeader label={t("field.executor")} />,
        cell: ({ row }) => row.original.assigned_staff_name || row.original.collector_company_name || t("notAssigned"),
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => <p className="max-w-45 truncate">{row.original.project_name}</p>,
      },
    ],
    [t, tRoot, df],
  );

  return (
    <>
      <QueryFailedNote query={viewingRecord} what={tRoot("notifications.actionCards.linkedRecord")} />
      {list.filters.counted === "1" && (
        <DrillNote
          label={t("countedOnly")}
          clearLabel={t("showAll")}
          params={["counted"]}
        />
      )}
      <ModuleRecordsTable
        title={tRoot("nav.submodule.siteDisposals")}
        countLabel={tRoot("moduleTable.count", { count: total })}
        headerAction={
          can("disposal.submit") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t("action.new")}
            </Button>
          ) : undefined
        }
        list={list}
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        needsActionCount={rows.data?.needs_action_count}
        isLoading={rows.isLoading}
        isError={rows.isError}
        storageKey="site-disposals"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <FilterSelect
              list={list}
              param="status"
              allLabel={tRoot("moduleTable.allStatuses")}
              options={DISPOSAL_STATES.map((state) => ({ value: state, label: t(`status.${state}`) }))}
            />
            {can("report.export") || can("disposal.view") ? (
              <ExportButton
                disabled={total === 0}
                onExport={(format) =>
                  exportDisposalRequests({
                    format,
                    title: tRoot("nav.submodule.siteDisposals"),
                    subtitle: tRoot("moduleTable.count", { count: total }),
                    emptyLabel: t("empty"),
                    query: list.query,
                    columns: [
                      { key: "reference_no", label: tRoot("moduleTable.reference") },
                      { key: "project_name", label: t("field.project") },
                      {
                        key: "status",
                        label: t("field.status"),
                        values: Object.fromEntries(DISPOSAL_STATES.map((state) => [state, t(`status.${state}`)])),
                      },
                      { key: "waste_description", label: t("field.waste") },
                      { key: "location_description", label: t("field.siteLocation") },
                      { key: "preferred_at", label: t("field.preferredAt") },
                      { key: "requested_by_name", label: t("field.requestedBy") },
                      { key: "actual_weight_kg", label: t("field.actualWeight") },
                      { key: "trips_accepted", label: t("field.tripsAccepted") },
                      { key: "trips_total", label: t("field.tripsTotal") },
                      { key: "disposal_do_no", label: t("field.doNo") },
                    ],
                  })
                }
              />
            ) : null}
          </>
        }
        // 「36 小时内仍未收到处理照片…整条记录显示红色」 (D-217): the whole
        // row, because a badge in a column is something you have to be
        // looking for.
        rowClassName={(row) => (row.disposal_evidence_is_overdue ? "bg-destructive/5 text-destructive" : undefined)}
        onOpen={(row) => setViewingId(row.id)}
      />
      {shown && (
        <DisposalDetailDialog
          row={shown}
          onClose={() => setViewingId(null)}
          actions={<DisposalActions row={shown} onStep={(next) => setStep({ step: next, row: shown })} />}
        />
      )}
      <DisposalStepDialogs step={step?.step ?? null} row={step?.row ?? null} onClose={() => setStep(null)} onChanged={refresh} />
      {creating && (
        <CreateDisposalDialog
          initialProject={list.filters.project ?? ""}
          onClose={() => setCreating(false)}
          onSaved={() => {
            refresh();
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

const DISPOSAL_STATES: DisposalRequestStatus[] = [
  "REQUESTED",
  "APPROVED",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CONFIRMATION",
  "RETURNED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

/** What the person carrying out the job may upload (not request / office photos). */
type ExecutionEvidenceKind = Exclude<DisposalEvidenceKind, "REQUEST" | "CONFIRMATION" | "VEHICLE_EXIT" | "GATE_PASS">;

const EXECUTION_EVIDENCE: DisposalEvidenceKind[] = ["LOADING", "UNLOADING", "DISPOSAL_DO", "OTHER", "DISPOSAL_PROOF"];

/**
 * General waste photographs, per submission (L6 / B24).
 *
 * 「一次最多 4 张，不要求拍满，不规定每阶段几张」, and on the driver's link
 * 「取消装车 / 卸货 / DO / 其他四类强制模板」 - but 「没有最终处理证明不能算
 * 完成」, so submitting takes one. The server holds the same three numbers.
 */
const DISPOSAL_PHOTO_MAX = 4;

/**
 * The lorry the next submission fills, and its photographs (X11, C5).
 *
 * One submission is one lorry. `current` is the first lorry still planned;
 * `allSent` means every planned lorry has gone and the job waits for the
 * office's checks (or for the office to add one). A job from before C5 has
 * no lorries until its first photograph - the server plans them then - so
 * its photographs are the ones not yet filed under any lorry.
 */
export function currentLoad<E extends { kind: DisposalEvidenceKind; trip?: string | null }>(task: {
  evidence: E[];
  trips: Array<{ id: string; seq: number; status: DisposalTripStatus }>;
}): { current: { id: string; seq: number } | null; total: number; sent: number; allSent: boolean; photos: E[] } {
  const live = task.trips.filter((trip) => trip.status !== "CANCELLED");
  const current = live.find((trip) => trip.status === "PLANNED") ?? null;
  const unplanned = task.trips.length === 0;
  return {
    current: current ? { id: current.id, seq: current.seq } : null,
    total: live.length,
    sent: live.filter((trip) => trip.status !== "PLANNED").length,
    allSent: !unplanned && !current,
    photos: task.evidence.filter(
      (item) => EXECUTION_EVIDENCE.includes(item.kind) && (unplanned ? !item.trip : current !== null && item.trip === current.id),
    ),
  };
}

/** How often the link page asks again while every lorry has gone (FABLE_AUDIT_B4 #8). */
export const LINK_POLL_MS = 30_000;

/**
 * Whether the driver's page (or the field form) should ask the server again.
 *
 * Every 30 s while every planned lorry has been sent and the job still runs:
 * that is when the office's 「加一车」 or its last check changes what the
 * page should offer, and a driver waiting at the tip will not think to
 * reload. Not while a load is being filled (nothing changes under him), and
 * not once the link is gone.
 */
export function linkPollInterval(
  task: { status: DisposalRequestStatus; evidence: Array<{ kind: DisposalEvidenceKind; trip?: string | null }>; trips: Array<{ id: string; seq: number; status: DisposalTripStatus }> } | undefined,
  error?: unknown,
): number | false {
  if (!task || (error instanceof ApiError && error.isNotFound)) return false;
  if (!RUNNING.includes(task.status)) return false;
  return currentLoad(task).allSent ? LINK_POLL_MS : false;
}

/**
 * A refusal on the driver's page, in the driver's language (FABLE_AUDIT_B4 #9).
 *
 * The link has no session and its own fetch, so the app's toast never words
 * it; the server names the reason with a code - every lorry sent, the job
 * ended early, the link closed - and the catalogue's `errors.api.<code>`
 * says it. Anything else is the page's own "could not be completed".
 */
export function linkErrorText(
  reason: unknown,
  catalogue: { has: (code: string) => boolean; word: (code: string) => string },
  fallback: string,
): string {
  if (reason instanceof ApiError && reason.code && catalogue.has(reason.code)) return catalogue.word(reason.code);
  return fallback;
}

function useLinkErrorText() {
  const tApi = useTranslations("errors.api");
  return (reason: unknown, fallback: string) =>
    linkErrorText(reason, { has: (code) => tApi.has(code as never), word: (code) => tApi(code as never) }, fallback);
}

export function ExternalDisposalWorkspace({ token }: { token: string }) {
  const t = useTranslations("siteDisposal.external");
  const tTrips = useTranslations("siteDisposal.trips");
  const reasonText = useLinkErrorText();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<DisposalEvidenceKind | null>(null);
  // No weight / trips / DO state here any more (T-224): the inputs are gone,
  // and posting a default would be worse than posting nothing.
  const [note, setNote] = useState("");
  // Which lorry was just sent, so the driver sees it went (X11).
  const [justSent, setJustSent] = useState<number | null>(null);
  // One source of truth (FABLE_AUDIT_B4 #8): every answer goes into this
  // query's cache, and the page reads only the query - so a poll can show
  // the office's 「加一车」 without the driver reloading.
  const taskKey = ["external-disposal", token];
  const taskQuery = useQuery({
    queryKey: taskKey,
    queryFn: () => getExternalDisposalTask(token),
    retry: false,
    refetchInterval: (query) => linkPollInterval(query.state.data, query.state.error),
  });
  const current = taskQuery.data ?? null;
  const remember = (saved: ExternalDisposalTask) => qc.setQueryData(taskKey, saved);
  const start = useMutation({ mutationFn: () => startExternalDisposalTask(token), onSuccess: remember, onError: (reason) => setError(reasonText(reason, t("error.action"))) });
  const submit = useMutation({
    mutationFn: () => submitExternalDisposalTask(token, { note }),
    onSuccess: (saved) => {
      setJustSent(load.current?.seq ?? null);
      setNote("");
      remember(saved);
    },
    onError: (reason) => setError(reasonText(reason, t("error.action"))),
  });
  const upload = async (kind: ExecutionEvidenceKind, image?: File) => {
    if (!image || !current) return;
    setError("");
    setJustSent(null);
    setUploading(kind);
    try {
      const location = await getCoordinates();
      await addExternalDisposalEvidence(token, { kind, image, ...location, client_event_id: crypto.randomUUID() });
      await taskQuery.refetch();
    } catch (reason) {
      setError(reasonText(reason, t("error.action")));
    } finally { setUploading(null); }
  };

  const load = currentLoad(current ?? { evidence: [], trips: [] });
  // The link is gone (ended early, finished, replaced): say why, in words.
  const gone = taskQuery.error instanceof ApiError && taskQuery.error.isNotFound;
  if (taskQuery.isLoading) return <main className="grid min-h-dvh place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></main>;
  if (gone || (taskQuery.isError && !current) || !current) return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="text-xl font-semibold">{t("invalid")}</h1><p className="mt-2 text-sm text-muted-foreground">{reasonText(taskQuery.error, t("invalidBody"))}</p></main>;
  // APPROVED too (D05 / D10): the link is handed out at approval and the
  // driver can start from it before anybody is assigned.
  const editable = ["APPROVED", "ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(current.status);
  const startable = current.status === "APPROVED" || current.status === "ASSIGNED";
  const finished = current.status === "COMPLETED" || current.status === "AWAITING_CONFIRMATION";
  // The server's rule, restated so the button can say no before the request:
  // one photograph at least, four at most - per lorry.
  const sent = load.photos;
  const evidenceComplete = sent.length > 0;
  const full = sent.length >= DISPOSAL_PHOTO_MAX;

  return (
    <main className="mx-auto min-h-dvh max-w-xl bg-background px-4 py-5 pb-28">
      <header className="border-b border-panel-border pb-4">
        <p className="text-xs font-semibold text-primary">{current.company_name}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{current.reference_no}</p>
      </header>

      <section className="surface-panel mt-4 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Truck /></span>
          <div className="min-w-0">
            <h2 className="break-words font-semibold">{current.waste_description}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{current.project_name}</p>
            <p className="text-sm text-muted-foreground">{current.location_description}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge label={t(`status.${current.status}`)} tone={statusTone(current.status)} />
          {load.total > 0 && <span className="text-sm text-muted-foreground">{tTrips("sentProgress", { sent: load.sent, total: load.total })}</span>}
        </div>
      </section>

      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {justSent !== null && <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm font-medium">{tTrips("justSent", { seq: justSent })}</div>}

      {startable && (
        <Button size="lg" className="mt-5 h-14 w-full text-base" disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
          {t("action.start")}
        </Button>
      )}

      {editable && !startable && !load.allSent && (
        <>
          <section className="mt-6">
            {/* One field, not four (L6 / B24): no category per photograph, up
                to four, and the submit button waits on one - for this lorry. */}
            {load.current && <h2 className="mb-2 text-lg font-semibold">{tTrips("loadTitle", { seq: load.current.seq, total: load.total })}</h2>}
            <FieldWrapper label={t("photosTitle")} required>
              <p className="text-sm text-muted-foreground">{t("photosBody")}</p>
              <div className="mt-2 grid gap-3">
                <FieldCamera
                  label={t("photosTitle")}
                  fileCount={sent.length}
                  // The newest of this lorry's photos, whatever its kind.
                  previewUrl={sent.length ? (sent[sent.length - 1].watermarked || sent[sent.length - 1].image || undefined) : undefined}
                  disabled={uploading !== null || full}
                  onCapture={(file) => void upload("DISPOSAL_PROOF", file)}
                />
              </div>
            </FieldWrapper>
          </section>
          <section className="surface-panel mt-6 space-y-4 rounded-xl p-4">
            <h2 className="panel-title">{t("submitTitle")}</h2>
            {/* Still nothing typed but an optional note (T-224, D-116): the
                contractor reads weight and DO off these photographs. */}
            <FieldWrapper label={t("field.note")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper>
            <Button size="lg" className="h-14 w-full text-base" requires={[[evidenceComplete, t("photosTitle")]]} disabled={submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {t("action.submit")}
            </Button>
          </section>
        </>
      )}

      {editable && !startable && load.allSent && (
        <section className="surface-panel mt-8 rounded-xl p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h2 className="mt-3 text-lg font-semibold">{tTrips("allSentTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{tTrips("allSentBody")}</p>
        </section>
      )}

      {finished && (
        <section className="mt-8 rounded-xl border border-success/30 bg-success/5 p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h2 className="mt-3 text-lg font-semibold">{t("waitingTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("waitingBody")}</p>
        </section>
      )}
    </main>
  );
}

export function InternalDisposalWorkspace({ disposalId, onSubmitted }: { disposalId: string; onSubmitted: () => void }) {
  const t = useTranslations("siteDisposal.internal");
  const tTrips = useTranslations("siteDisposal.trips");
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<DisposalEvidenceKind | null>(null);
  // Per lorry (X11): its weight and DO; the trip count is no longer typed.
  const [weight, setWeight] = useState("");
  const [doNo, setDoNo] = useState("");
  const [note, setNote] = useState("");
  const [justSent, setJustSent] = useState<number | null>(null);
  // As on the driver's link (FABLE_AUDIT_B4 #8): answers go into the query's
  // cache, the page reads only the query, and it asks again while every
  // lorry has gone, so the office's 「加一车」 shows up by itself.
  const taskKey = ["internal-disposal", disposalId];
  const taskQuery = useQuery({
    queryKey: taskKey,
    queryFn: () => getInternalDisposalTask(disposalId),
    retry: false,
    refetchInterval: (query) => linkPollInterval(query.state.data, query.state.error),
  });
  const current = taskQuery.data ?? null;
  const remember = (saved: DisposalRequest) => qc.setQueryData(taskKey, saved);
  const load = currentLoad(current ?? { evidence: [], trips: [] });
  const start = useMutation({
    mutationFn: async () => {
      const location = await getCoordinates();
      return startInternalDisposalTask(disposalId, {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
      });
    },
    onSuccess: remember,
    onError: (reason) => setError(reason instanceof Error ? reason.message : t("error.action")),
  });
  const submit = useMutation({
    mutationFn: () => submitInternalDisposalTask(disposalId, { actual_weight_kg: weight, disposal_do_no: doNo, note }),
    onSuccess: (saved) => {
      setJustSent(load.current?.seq ?? null);
      setWeight("");
      setDoNo("");
      setNote("");
      remember(saved);
      void qc.invalidateQueries({ queryKey: ["field-staff", "tasks"] });
      onSubmitted();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : t("error.action")),
  });
  const upload = async (kind: ExecutionEvidenceKind, image?: File) => {
    if (!image || !current) return;
    setError("");
    setJustSent(null);
    setUploading(kind);
    try {
      const location = await getCoordinates();
      await addInternalDisposalEvidence(disposalId, {
        kind,
        image,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
        client_event_id: crypto.randomUUID(),
      });
      await taskQuery.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.action"));
    } finally {
      setUploading(null);
    }
  };

  if (taskQuery.isLoading) return <div className="grid min-h-64 place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  // A failed poll keeps what is on screen; only a page with nothing to show says so.
  if ((taskQuery.isError && !current) || !current) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{t("invalid")}</div>;
  const editable = ["ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(current.status);
  // At least one, at most four, of whichever kinds - per lorry (L6 / B24, X11).
  const sent = load.photos;
  const evidenceComplete = sent.length > 0;
  const full = sent.length >= DISPOSAL_PHOTO_MAX;

  return <div className="flex flex-col gap-4">
    <section className="surface-panel rounded-xl p-4">
      <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Truck /></span><div className="min-w-0"><p className="font-mono text-xs text-muted-foreground">{current.reference_no}</p><h2 className="mt-1 text-lg font-semibold">{current.waste_description}</h2><p className="mt-1 text-sm text-muted-foreground">{current.project_name} / {current.location_description}</p></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge label={t(`status.${current.status}`)} tone={statusTone(current.status)} />{load.total > 0 && <span className="text-sm text-muted-foreground">{tTrips("sentProgress", { sent: load.sent, total: load.total })}</span>}</div>
    </section>
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    {justSent !== null && <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm font-medium">{tTrips("justSent", { seq: justSent })}</div>}
    {current.status === "ASSIGNED" && <Button size="lg" className="h-14 w-full text-base" disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}{t("action.start")}</Button>}
    {editable && current.status !== "ASSIGNED" && !load.allSent && <>
      {/* One camera, like the driver's link (DEV_BRIEF Q2): this lorry's
          proof, up to four, any kind. Vehicle exit / Gate Pass are the
          site's own photographs, taken from the job itself (C08). */}
      <section><h3 className="text-base font-semibold">{load.current ? tTrips("loadTitle", { seq: load.current.seq, total: load.total }) : t("photosTitle")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("photosBody")}</p><div className="mt-3 grid gap-3"><FieldCamera label={t("photosTitle")} fileCount={sent.length} previewUrl={sent.length ? (sent[sent.length - 1].watermarked || sent[sent.length - 1].image || undefined) : undefined} disabled={uploading !== null || full} onCapture={(file) => void upload("DISPOSAL_PROOF", file)} /></div></section>
      <section className="surface-panel space-y-4 rounded-xl p-4"><h3 className="panel-title">{t("submitTitle")}</h3><FieldWrapper label={t("field.weight")} required><Input inputMode="decimal" type="number" min="0" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.doNo")} required><Input value={doNo} onChange={(event) => setDoNo(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper><Button size="lg" className="h-14 w-full text-base" disabledReason={!evidenceComplete ? t("action.photosRequired") : undefined} requires={[[weight, t("field.weight")], [doNo, t("field.doNo")]]} disabled={!evidenceComplete || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}{evidenceComplete ? t("action.submit") : t("action.photosRequired")}</Button></section>
    </>}
    {editable && current.status !== "ASSIGNED" && load.allSent && <section className="surface-panel rounded-xl p-6 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h3 className="mt-3 text-lg font-semibold">{tTrips("allSentTitle")}</h3><p className="mt-2 text-sm text-muted-foreground">{tTrips("allSentBody")}</p></section>}
    {(current.status === "COMPLETED" || current.status === "AWAITING_CONFIRMATION") && <section className="rounded-xl border border-success/30 bg-success/5 p-6 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h3 className="mt-3 text-lg font-semibold">{t("waitingTitle")}</h3><p className="mt-2 text-sm text-muted-foreground">{t("waitingBody")}</p></section>}
  </div>;
}
