"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FolderOpen,
  Link2,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
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
import { FileIntoColumnDialog } from "@/components/contractor-ops/file-into-column";
import { useAuth } from "@/components/providers/auth-provider";
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { ExportButton } from "@/components/shared/export-button";
import { FieldCamera } from "@/components/shared/field-camera";
import {
  ColumnFilter,
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import { FieldWrapper, ListHeader, QueryFailedNote, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { RecordDetailDialog, RecordDetailShell } from "@/components/shared/record-detail-shell";
import { useListQuery } from "@/hooks/use-list-query";
import { useUrlSelection } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { ProjectColumnPicker } from "@/components/site-operations/project-column-picker";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  DisposalEvidenceKind,
  DisposalRequest,
  DisposalRequestStatus,
  ExternalDisposalTask,
} from "@/interfaces/contractor-ops";
import {
  addExternalDisposalEvidence,
  addInternalDisposalEvidence,
  assignDisposalCollector,
  assignDisposalInternal,
  cancelDisposalRequest,
  confirmDisposalCompletion,
  getDisposalRequest,
  getDisposalRequests,
  getExternalDisposalTask,
  getInternalDisposalTask,
  regenerateDisposalExternalLink,
  exportDisposalRequests,
  fileDisposalRequest,
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

/**
 * The most recent photograph of one kind, as a URL the tile can show.
 *
 * F-289: both disposal execution screens upload each shot immediately and then
 * re-read the record, so they hold no `File` to preview and were passing only a
 * count - which draws the same empty-looking tile as having taken nothing. The
 * watermarked copy is preferred because that is the one that carries the site,
 * time and device stamp, so what the collector sees is what was filed.
 */
function latestEvidencePhoto(
  evidence: ReadonlyArray<{ kind: string; image?: string | null; watermarked?: string | null }>,
  kind: string,
): string | undefined {
  const shots = evidence.filter((item) => item.kind === kind);
  const newest = shots[shots.length - 1];
  return newest ? (newest.watermarked || newest.image || undefined) : undefined;
}

function statusTone(status: DisposalRequestStatus): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "COMPLETED") return "positive";
  if (["REJECTED", "CANCELLED", "RETURNED"].includes(status)) return "danger";
  if (["IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(status)) return "warning";
  if (["APPROVED", "ASSIGNED"].includes(status)) return "info";
  return "neutral";
}

export function SiteDisposalWorkspace({ initialProject = "", fieldTaskId, onRecordSaved }: { initialProject?: string; fieldTaskId?: string; onRecordSaved?: () => void } = {}) {
  const t = useTranslations("siteDisposal");
  const { can } = useAuth();
  // The filing dialog's words live in the `contractorOps` namespace, with the
  // one component that shows them on both this screen and the progress screen
  // - so they are read from there rather than copied into this one.
  const ops = useTranslations("contractorOps");
  const qc = useQueryClient();
  const [project, setProject] = useState(initialProject);
  // Kept in the draft, so tapping this 挂号 again reopens the form it was in
  // (D-259). Outside a draft (the office) this is ordinary state.
  const [creating, setCreating] = useDraftState("open:creating", Boolean(fieldTaskId));
  const [viewing, setViewing] = useState<DisposalRequest | null>(null);
  // Which step dialog is open, and for which request (filing under a
  // construction-waste column is one of them, T-232).
  const [step, setStep] = useState<{ step: DisposalStep; row: DisposalRequest } | null>(null);
  const rows = useQuery({
    queryKey: ["site-disposals", project],
    queryFn: () => getDisposalRequests({ page_size: 200, project: project || undefined }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["site-disposals"] });
  const shownRow = viewing ? (rows.data?.results.find((row) => row.id === viewing.id) ?? viewing) : null;

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={can("disposal.submit") ? <Button onClick={() => setCreating(true)}><Plus />{t("action.new")}</Button> : undefined}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm">
        <ProjectPicker
          value={project}
          onValueChange={(value) => setProject(value === "all" ? "" : value)}
          placeholder={t("field.project")}
          allowAll
          allLabel={t("field.allProjects")}
          className="w-full sm:w-80"
        />
        <p className="text-xs text-muted-foreground">{t("count", { count: rows.data?.count ?? 0 })}</p>
      </div>

      {rows.isLoading && <div className="grid min-h-56 place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div>}
      {rows.isError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">{t("error.load")}</div>}
      {!rows.isLoading && !rows.data?.count && <div className="rounded-lg border border-dashed bg-muted/20 p-12 text-center text-sm text-muted-foreground">{t("empty")}</div>}
      {!!rows.data?.count && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.data.results.map((row) => (
            /* 「36 小时内仍未收到处理照片…**整条记录显示红色**」 (D-217). The
               whole card, not just a badge: a marker inside a list of grey
               cards is something you have to be looking for, and this one has
               to be noticed by somebody scanning the page. */
            <article key={row.id} className={`rounded-lg border bg-card p-4 shadow-sm${row.disposal_evidence_is_overdue ? " border-destructive/50 bg-destructive/5" : ""}`}>
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
                    <p className="mt-1 text-xs font-medium text-destructive">{t("overdue.help")}</p>
                  )}
                  <h3 className="mt-1 truncate font-semibold">{row.waste_description}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{row.project_name} / {row.location_description}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-y py-3 text-sm">
                <div><p className="text-xs text-muted-foreground">{t("field.requestedBy")}</p><p className="mt-1 font-medium">{row.requested_by_name || "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("field.executor")}</p><p className="mt-1 font-medium">{row.assigned_staff_name || row.collector_company_name || t("notAssigned")}</p></div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <span className="mr-auto self-center text-xs text-muted-foreground">{ops("filing.fileInto")}: <span className="font-medium text-foreground">{row.category_name || ops("filing.unfiled")}</span></span>
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
          onClose={() => setViewing(null)}
          actions={<DisposalActions row={shownRow} onStep={(next) => setStep({ step: next, row: shownRow })} />}
        />
      )}
      <DisposalStepDialogs step={step?.step ?? null} row={step?.row ?? null} onClose={() => setStep(null)} onChanged={() => void refresh()} />
    </div>
  );
}

function CreateDisposalDialog({ initialProject = "", fieldTaskId, onClose, onSaved }: { initialProject?: string; fieldTaskId?: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const columnT = useTranslations("contractorOps");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  // F-282. Saved even when this dialog is opened from the office console:
  // `useDraftState` falls back to plain component state when there is no
  // `<FieldDraft>` above it, so one call site serves both without a branch.
  const [project, setProject] = useDraftState("project", initialProject);
  const [category, setCategory] = useDraftState("category", "");
  const [description, setDescription] = useDraftState("description", "");
  const [locationDescription, setLocationDescription] = useDraftState("locationDescription", "");
  const [volume, setVolume] = useDraftState("volume", "");
  const [weight, setWeight] = useDraftState("weight", "");
  const [preferred, setPreferred] = useDraftState("preferred", "");
  const [note, setNote] = useDraftState("note", "");
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
        category,
        waste_description: description,
        location_description: isFieldStaff ? "GPS captured site location" : locationDescription,
        estimated_volume_m3: isFieldStaff ? "" : volume,
        estimated_weight_kg: isFieldStaff ? "" : weight,
        preferred_at: !isFieldStaff && preferred ? new Date(preferred).toISOString() : undefined,
        request_note: note,
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
          <FieldWrapper label={t("field.project")} required className="sm:col-span-2"><ProjectPicker value={project} onValueChange={(value) => { setProject(value); setCategory(""); }} placeholder={t("field.project")} /></FieldWrapper>
          <ProjectColumnPicker project={project} kind="CONSTRUCTION_WASTE" value={category} onChange={setCategory} className="sm:col-span-2" />
          <FieldWrapper label={t("field.waste")} required className="sm:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></FieldWrapper>
          {!isFieldStaff ? <>
            <FieldWrapper label={t("field.siteLocation")} required className="sm:col-span-2"><Input value={locationDescription} onChange={(e) => setLocationDescription(e.target.value)} /></FieldWrapper>
            <FieldWrapper label={t("field.volume")} optional={t("optional")}><Input type="number" min="0" step="0.001" value={volume} onChange={(e) => setVolume(e.target.value)} /></FieldWrapper>
            <FieldWrapper label={t("field.estimatedWeight")} optional={t("optional")}><Input type="number" min="0" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} /></FieldWrapper>
            <FieldWrapper label={t("field.preferredAt")} optional={t("optional")}><Input type="datetime-local" value={preferred} onChange={(e) => setPreferred(e.target.value)} /></FieldWrapper>
          </> : null}
          <LocationField label={t("field.gps")} actionLabel={t("action.getLocation")} readyLabel={t("action.locationReady")} value={location} onChange={setLocation} required />
          <FieldWrapper label={t("field.photos")} required className="sm:col-span-2">
            {isFieldStaff ? (
              <FieldEvidenceGrid
                labels={evidenceLabels}
                files={fieldEvidence}
                progressLabel={t("fieldEvidence.progress", {
                  current: fieldPhotos.length,
                  required: FIELD_EVIDENCE_PHOTO_COUNT,
                })}
                onChange={setFieldEvidence}
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
        <DialogFooter className="shrink-0"><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[project, t("field.project")], [category, columnT("field.category")], [description, t("field.waste")], [isFieldStaff || locationDescription, t("field.siteLocation")], [submissionPhotos.length >= (isFieldStaff ? FIELD_EVIDENCE_PHOTO_COUNT : 1) && (!isFieldStaff || hasRequiredFieldEvidence(fieldEvidence)), t("field.photos")], [location, t("field.gps")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Send />}{t("action.submit")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDisposalDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [note, setNote] = useState("");
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
    mutationFn: () => reviewDisposalRequest(row.id, decision, note),
    onSuccess: (data) => {
      onSaved();
      if (data.external_url) setLink(data.external_url);
      else onClose();
    },
  });
  if (link) {
    return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("review.linkTitle")}</DialogTitle><DialogDescription>{t("review.linkHelp")}</DialogDescription></DialogHeader><div className="space-y-3"><div className="break-all rounded-lg border bg-muted/30 p-3 font-mono text-sm">{link}</div><Button className="w-full" onClick={() => void navigator.clipboard.writeText(link)}><Copy />{t("action.copyLink")}</Button></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.close")}</Button></DialogFooter></DialogContent></Dialog>;
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("review.title")}</DialogTitle><DialogDescription>{row.reference_no} / {row.waste_description}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><Button variant={decision === "APPROVED" ? "default" : "outline"} onClick={() => setDecision("APPROVED")}><CheckCircle2 />{t("action.approve")}</Button><Button variant={decision === "REJECTED" ? "destructive" : "outline"} onClick={() => setDecision("REJECTED")}><XCircle />{t("action.reject")}</Button></div><FieldWrapper label={t("field.reviewNote")} required={decision === "REJECTED"}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[decision !== "REJECTED" || note, t("field.reviewNote")]]} disabled={save.isPending} onClick={() => save.mutate()}>{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
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
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{t("assign.title")}</DialogTitle><DialogDescription>{link ? t("assign.copyNow") : t("assign.description")}</DialogDescription></DialogHeader>{link ? <div className="space-y-3"><div className="break-all rounded-lg border bg-muted/30 p-3 font-mono text-sm">{link}</div><Button className="w-full" onClick={() => void navigator.clipboard.writeText(link)}><Copy />{t("action.copyLink")}</Button></div> : <><div className="grid grid-cols-2 gap-2"><Button type="button" variant={mode === "INTERNAL" ? "default" : "outline"} onClick={() => setMode("INTERNAL")}><UserRound />{t("assignment.internal")}</Button><Button type="button" variant={mode === "EXTERNAL" ? "default" : "outline"} onClick={() => setMode("EXTERNAL")}><Link2 />{t("assignment.external")}</Button></div>{mode === "INTERNAL" ? <FieldWrapper label={t("field.fieldStaff")} required><Select value={staff} onValueChange={setStaff}><SelectTrigger className="h-10 w-full"><SelectValue placeholder={t("field.chooseFieldStaff")} /></SelectTrigger><SelectContent>{fieldStaff.map((assignment) => <SelectItem key={assignment.user} value={assignment.user}>{assignment.user_name}</SelectItem>)}</SelectContent></Select>{!team.isLoading && !team.isError && !fieldStaff.length && <p className="mt-2 text-xs text-destructive">{t("assign.noFieldStaff")}</p>}<QueryFailedNote query={team} what={t("what.fieldStaff")} className="mt-2" /></FieldWrapper> : <div className="grid gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.collectorCompany")} required className="sm:col-span-2"><Input value={company} onChange={(e) => setCompany(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.contact")} required><Input value={contact} onChange={(e) => setContact(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.phone")} required><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.email")} optional={t("optional")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.linkExpiry")} required><Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></FieldWrapper></div>}</>}<DialogFooter><Button variant="outline" onClick={onClose}>{link ? t("action.close") : t("action.cancel")}</Button>{!link && <Button disabled={disabled} onClick={() => save.mutate()}><Send />{mode === "INTERNAL" ? t("action.sendToStaff") : t("action.createLink")}</Button>}</DialogFooter></DialogContent></Dialog>;
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
 * The contractor confirms the work, and fills in the numbers (T-224, D-116).
 *
 * The three fields are here because the outside collector no longer types
 * them - 「那两个数据从后台补吧」 - and this is the only screen that still
 * touches a submitted request. Before T-224 it took a decision, a note and a
 * photo, so removing the inputs from the link without adding them here would
 * have left three columns nobody could fill: the exact shape F-244 recorded.
 *
 * Prefilled from the row rather than blank. A collector who did send the
 * numbers should not have them erased by a confirmation that leaves the boxes
 * empty, and the office is usually correcting a reading rather than entering
 * one from nothing.
 */
function ConfirmDisposalDialog({ row, onClose, onSaved }: { row: DisposalRequest; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteDisposal");
  const [decision, setDecision] = useState<"COMPLETED" | "RETURNED">("COMPLETED");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File>();
  const [weight, setWeight] = useState(row.actual_weight_kg ?? "");
  const [trips, setTrips] = useState(row.trip_count ? String(row.trip_count) : "");
  const [doNo, setDoNo] = useState(row.disposal_do_no ?? "");
  const save = useMutation({
    mutationFn: () =>
      confirmDisposalCompletion(row.id, decision, note, photo, {
        actual_weight_kg: weight,
        trip_count: trips,
        disposal_do_no: doNo,
      }),
    onSuccess: onSaved,
  });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("confirm.title")}</DialogTitle><DialogDescription>{t("confirm.description", { reference: row.reference_no })}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><Button variant={decision === "COMPLETED" ? "default" : "outline"} onClick={() => setDecision("COMPLETED")}><CheckCircle2 />{t("action.complete")}</Button><Button variant={decision === "RETURNED" ? "destructive" : "outline"} onClick={() => setDecision("RETURNED")}><RotateCcw />{t("action.return")}</Button></div><div className="grid gap-3 sm:grid-cols-3"><FieldWrapper label={t("field.actualWeight")} optional={t("optional")}><Input inputMode="decimal" type="number" min="0" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.trips")} optional={t("optional")}><Input inputMode="numeric" type="number" min="1" value={trips} onChange={(e) => setTrips(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.doNo")} optional={t("optional")}><Input value={doNo} onChange={(e) => setDoNo(e.target.value)} /></FieldWrapper></div><FieldWrapper label={t("field.confirmationNote")} required={decision === "RETURNED"}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.confirmationPhoto")} optional={t("optional")}><FieldCamera label={t("field.confirmationPhoto")} file={photo} fileCount={photo ? 1 : 0} onCapture={setPhoto} onClear={() => setPhoto(undefined)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[decision !== "RETURNED" || note, t("field.confirmationNote")]]} disabled={save.isPending} onClick={() => save.mutate()}>{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
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
  return (
    <RecordDetailDialog
      title={row.reference_no}
      description={`${row.project_name} / ${row.waste_description}`}
      exportRecord={{ kind: "DISPOSAL_REQUEST", recordId: row.id, reference: row.reference_no }}
      onClose={onClose}
    >
      <RecordDetailShell
        reference={row.reference_no}
        notices={
          row.disposal_evidence_is_overdue ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
              {t("overdue.help")}
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
          { label: t("field.trips"), value: row.trip_count ? String(row.trip_count) : "—" },
          { label: t("field.doNo"), value: row.disposal_do_no || "—" },
          { label: t("field.ocr"), value: t(`ocr.${row.ocr_status}`) },
          { label: t("field.waste"), value: row.waste_description, wide: true },
          ...(row.request_note ? [{ label: t("field.note"), value: row.request_note, wide: true }] : []),
          ...(row.review_note ? [{ label: t("field.reviewNote"), value: row.review_note, wide: true }] : []),
        ]}
        photos={row.evidence.map((item) => ({
          id: item.id,
          url: item.watermarked || item.image,
          label: t(`evidenceKind.${item.kind}`),
          takenAt: item.captured_at,
          latitude: item.latitude,
          longitude: item.longitude,
        }))}
        panel={
          <section className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("timeline")}</h3>
            <ol className="max-h-64 space-y-2 overflow-y-auto border-l pl-3">
              {row.timeline.map((item) => (
                <li key={item.id} className="text-xs">
                  <p className="font-medium">{t.has(`timelineEvent.${item.event}`) ? t(`timelineEvent.${item.event}`) : item.event}</p>
                  <p className="text-muted-foreground">{item.actor_name || t("externalActor")} · {df.dateTime(item.happened_at)}</p>
                  {item.note && <p className="mt-0.5 text-muted-foreground">{item.note}</p>}
                </li>
              ))}
            </ol>
          </section>
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
      />
    </RecordDetailDialog>
  );
}

type DisposalStep = "filing" | "reviewing" | "assigning" | "regenerating" | "confirming" | "cancelling";

/**
 * The steps one disposal request can take next, for whoever is looking.
 *
 * One component for the phone card and the office detail's right column
 * (C-020: 「那些按钮放在图 2 的圈起来的位置」), so the two never offer
 * different steps for the same state.
 */
function DisposalActions({ row, onStep }: { row: DisposalRequest; onStep: (step: DisposalStep) => void }) {
  const t = useTranslations("siteDisposal");
  const ops = useTranslations("contractorOps");
  const { can } = useAuth();
  return (
    <>
      {/* Construction waste had no column at all until T-232, so this is the
          only way one of those columns ever gets used. */}
      {can("disposal.manage") && <Button size="sm" variant="outline" onClick={() => onStep("filing")}><FolderOpen />{ops("filing.action")}</Button>}
      {can("disposal.manage") && row.status === "REQUESTED" && <Button size="sm" onClick={() => onStep("reviewing")}><ClipboardCheck />{t("action.review")}</Button>}
      {can("disposal.manage") && ["APPROVED", "ASSIGNED", "RETURNED"].includes(row.status) && <Button size="sm" onClick={() => onStep("assigning")}><Send />{t("action.assign")}</Button>}
      {can("disposal.manage") && row.assignment_type === "EXTERNAL" && ["ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(row.status) && <Button size="sm" variant="outline" onClick={() => onStep("regenerating")}><RefreshCw />{t("action.regenerateLink")}</Button>}
      {can("disposal.confirm") && row.status === "AWAITING_CONFIRMATION" && <Button size="sm" onClick={() => onStep("confirming")}><CheckCircle2 />{t("action.confirm")}</Button>}
      {can("disposal.manage") && !["COMPLETED", "CANCELLED"].includes(row.status) && <Button size="sm" variant="destructive" onClick={() => onStep("cancelling")}><XCircle />{t("action.cancelDisposal")}</Button>}
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
    case "filing":
      return (
        <FileIntoColumnDialog
          projectId={row.project}
          kind="CONSTRUCTION_WASTE"
          current={row.category ?? null}
          reference={row.reference_no}
          onFile={(category, reason) => fileDisposalRequest(row.id, { category, reason })}
          onFiled={onChanged}
          onClose={onClose}
        />
      );
    case "reviewing":
      return <ReviewDisposalDialog row={row} onClose={onClose} onSaved={done} />;
    case "assigning":
      return <AssignExecutorDialog row={row} onClose={onClose} onSaved={onChanged} />;
    case "regenerating":
      return <RegenerateLinkDialog row={row} onClose={onClose} onSaved={onChanged} />;
    case "cancelling":
      return <CancelDisposalDialog row={row} onClose={onClose} onSaved={done} />;
    case "confirming":
      return <ConfirmDisposalDialog row={row} onClose={onClose} onSaved={done} />;
  }
}

/**
 * The office list of disposal requests, in the receipt list's layout (图 4,
 * T-370); each request opens on the shared shell (T-369). The phone keeps
 * `SiteDisposalWorkspace`'s cards.
 */
export function SiteDisposalOffice() {
  const t = useTranslations("siteDisposal");
  const ops = useTranslations("contractorOps");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const list = useListQuery(["project", "status", "category", "uncategorised"]);
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
        cell: ({ row }) => <span className="tabular text-foreground">{row.original.reference_no}</span>,
      },
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
        accessorKey: "category_name",
        meta: { label: ops("field.category") },
        header: () => <PlainHeader label={ops("field.category")} />,
        cell: ({ row }) => row.original.category_name || <span className="text-muted-foreground">{ops("filing.unfiled")}</span>,
      },
      {
        accessorKey: "waste_description",
        meta: { label: t("field.waste") },
        header: () => <PlainHeader label={t("field.waste")} />,
        cell: ({ row }) => (
          <span className="block max-w-[220px] truncate font-medium text-foreground" title={row.original.waste_description}>
            {row.original.waste_description}
          </span>
        ),
      },
      {
        accessorKey: "location_description",
        meta: { label: t("field.siteLocation") },
        header: () => <PlainHeader label={t("field.siteLocation")} />,
        cell: ({ row }) => <span className="block max-w-[180px] truncate">{row.original.location_description}</span>,
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
        cell: ({ row }) => <p className="max-w-[180px] truncate">{row.original.project_name}</p>,
      },
      {
        id: "photos",
        meta: { label: tRoot("moduleTable.photos") },
        header: () => <PlainHeader label={tRoot("moduleTable.photos")} />,
        cell: ({ row }) => <TypeBadge label={String(row.original.evidence.length)} />,
      },
    ],
    [t, ops, tRoot, df],
  );

  return (
    <>
      <QueryFailedNote query={viewingRecord} what={tRoot("notifications.actionCards.linkedRecord")} />
      <ModuleRecordsTable
        title={tRoot("nav.submodule.siteDisposals")}
        countLabel={tRoot("moduleTable.count", { count: total })}
        headerAction={
          can("disposal.submit") ? (
            <Button size="sm" className="rounded-full px-4 shadow-sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("action.new")}
            </Button>
          ) : undefined
        }
        list={list}
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        isLoading={rows.isLoading}
        isError={rows.isError}
        storageKey="site-disposals"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <ColumnFilter list={list} kind="CONSTRUCTION_WASTE" />
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
                      { key: "category_name", label: ops("field.category") },
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
                      { key: "trip_count", label: t("field.trips") },
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

const EXECUTION_EVIDENCE: Array<Exclude<DisposalEvidenceKind, "REQUEST" | "CONFIRMATION">> = ["LOADING", "UNLOADING", "DISPOSAL_DO", "OTHER"];

export function ExternalDisposalWorkspace({ token }: { token: string }) {
  const t = useTranslations("siteDisposal.external");
  const [task, setTask] = useState<ExternalDisposalTask | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<DisposalEvidenceKind | null>(null);
  // No weight / trips / DO state here any more (T-224): the inputs are gone,
  // and posting a default would be worse than posting nothing - `trips` was
  // seeded at "1", so every link sent a trip count nobody had entered.
  const [note, setNote] = useState("");
  const taskQuery = useQuery({ queryKey: ["external-disposal", token], queryFn: () => getExternalDisposalTask(token), retry: false });
  const current = task ?? taskQuery.data ?? null;
  const start = useMutation({ mutationFn: () => startExternalDisposalTask(token), onSuccess: setTask, onError: () => setError(t("error.action")) });
  const submit = useMutation({ mutationFn: () => submitExternalDisposalTask(token, { note }), onSuccess: setTask, onError: (reason) => setError(reason instanceof Error ? reason.message : t("error.action")) });
  const upload = async (kind: Exclude<DisposalEvidenceKind, "REQUEST" | "CONFIRMATION">, image?: File) => {
    if (!image || !current) return;
    setError("");
    setUploading(kind);
    try {
      const location = await getCoordinates();
      await addExternalDisposalEvidence(token, { kind, image, ...location, client_event_id: crypto.randomUUID() });
      setTask(await getExternalDisposalTask(token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.action"));
    } finally { setUploading(null); }
  };

  if (taskQuery.isLoading) return <main className="grid min-h-dvh place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></main>;
  if (taskQuery.isError || !current) return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="text-xl font-semibold">{t("invalid")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("invalidBody")}</p></main>;
  const editable = ["ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(current.status);
  const waiting = current.status === "AWAITING_CONFIRMATION";
  // The server's rule, restated here so the button can say no before the
  // request rather than after it. Same four kinds, same list.
  const evidenceComplete = EXECUTION_EVIDENCE.every((kind) =>
    current.evidence.some((item) => item.kind === kind),
  );

  return (
    <main className="mx-auto min-h-dvh max-w-xl bg-background px-4 py-5 pb-28">
      <header className="border-b pb-4">
        <p className="text-xs font-semibold text-primary">{current.company_name}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{current.reference_no}</p>
      </header>

      <section className="mt-4 rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-primary/10 text-primary"><Truck /></span>
          <div>
            <h2 className="font-semibold">{current.waste_description}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{current.project_name}</p>
            <p className="text-sm text-muted-foreground">{current.location_description}</p>
          </div>
        </div>
        <div className="mt-4"><StatusBadge label={t(`status.${current.status}`)} tone={statusTone(current.status)} /></div>
      </section>

      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {current.status === "ASSIGNED" && (
        <Button size="lg" className="mt-5 h-14 w-full text-base" disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
          {t("action.start")}
        </Button>
      )}

      {editable && current.status !== "ASSIGNED" && (
        <>
          <section className="mt-6">
            {/* All four are compulsory - the submit button waits on them - so
                the group wears the star. */}
            <FieldWrapper label={t("photosTitle")} required>
              <div className="mt-2 grid gap-3">
                {EXECUTION_EVIDENCE.map((kind) => (
                  <FieldCamera
                    key={kind}
                    label={t(`evidence.${kind}`)}
                    fileCount={current.evidence.filter((item) => item.kind === kind).length}
                    previewUrl={latestEvidencePhoto(current.evidence, kind)}
                    disabled={uploading !== null}
                    onCapture={(file) => void upload(kind, file)}
                  />
                ))}
              </div>
            </FieldWrapper>
          </section>
          <section className="mt-6 space-y-4 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{t("submitTitle")}</h2>
            {/*
              No weight, no trip count, no DO number here any more (T-224,
              D-116). 客户：「因为废料清运是属于外部公司，所以temporary link是
              不需要填写任何东西的，只是需要拍照就好了」, and then 「那两个数据
              从后台补吧」 - so the contractor types them on their own
              confirmation screen, reading them off these photographs.

              What replaced them is the gate that was missing: this button used
              to list three typed fields in `requires` and **nothing about the
              photographs**, while the server refused the submission without
              all four (F-301). So a collector could press submit, type
              everything, and be told no by an error from the API. The gate now
              matches the server's own rule exactly rather than approximating
              it.
            */}
            <FieldWrapper label={t("field.note")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper>
            <Button size="lg" className="h-14 w-full text-base" requires={[[evidenceComplete, t("photosTitle")]]} disabled={submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {t("action.submit")}
            </Button>
          </section>
        </>
      )}

      {waiting && (
        <section className="mt-8 rounded-lg border border-success/30 bg-success/5 p-6 text-center">
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
  const qc = useQueryClient();
  const [task, setTask] = useState<DisposalRequest | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<DisposalEvidenceKind | null>(null);
  const [weight, setWeight] = useState("");
  const [trips, setTrips] = useState("1");
  const [doNo, setDoNo] = useState("");
  const [note, setNote] = useState("");
  const taskQuery = useQuery({ queryKey: ["internal-disposal", disposalId], queryFn: () => getInternalDisposalTask(disposalId), retry: false });
  const current = task ?? taskQuery.data ?? null;
  const start = useMutation({
    mutationFn: async () => {
      const location = await getCoordinates();
      return startInternalDisposalTask(disposalId, {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
      });
    },
    onSuccess: setTask,
    onError: (reason) => setError(reason instanceof Error ? reason.message : t("error.action")),
  });
  const submit = useMutation({
    mutationFn: () => submitInternalDisposalTask(disposalId, { actual_weight_kg: weight, trip_count: Number(trips), disposal_do_no: doNo, note }),
    onSuccess: (saved) => {
      setTask(saved);
      void qc.invalidateQueries({ queryKey: ["field-staff", "tasks"] });
      onSubmitted();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : t("error.action")),
  });
  const upload = async (kind: Exclude<DisposalEvidenceKind, "REQUEST" | "CONFIRMATION">, image?: File) => {
    if (!image || !current) return;
    setError("");
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
      setTask(await getInternalDisposalTask(disposalId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.action"));
    } finally {
      setUploading(null);
    }
  };

  if (taskQuery.isLoading) return <div className="grid min-h-64 place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (taskQuery.isError || !current) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{t("invalid")}</div>;
  const editable = ["ASSIGNED", "IN_PROGRESS", "RETURNED"].includes(current.status);
  const evidenceComplete = EXECUTION_EVIDENCE.every((kind) => current.evidence.some((item) => item.kind === kind));

  return <div className="space-y-5">
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Truck /></span><div className="min-w-0"><p className="font-mono text-xs text-muted-foreground">{current.reference_no}</p><h2 className="mt-1 text-lg font-semibold">{current.waste_description}</h2><p className="mt-1 text-sm text-muted-foreground">{current.project_name} / {current.location_description}</p></div></div>
      <div className="mt-4"><StatusBadge label={t(`status.${current.status}`)} tone={statusTone(current.status)} /></div>
    </section>
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    {current.status === "ASSIGNED" && <Button size="lg" className="h-14 w-full text-base" disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}{t("action.start")}</Button>}
    {editable && current.status !== "ASSIGNED" && <>
      <section><h3 className="text-base font-semibold">{t("photosTitle")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("photosBody")}</p><div className="mt-3 grid gap-3">{EXECUTION_EVIDENCE.map((kind) => <FieldCamera key={kind} label={t(`evidence.${kind}`)} fileCount={current.evidence.filter((item) => item.kind === kind).length} previewUrl={latestEvidencePhoto(current.evidence, kind)} disabled={uploading !== null} onCapture={(file) => void upload(kind, file)} />)}</div></section>
      <section className="space-y-4 rounded-lg border bg-card p-4"><h3 className="font-semibold">{t("submitTitle")}</h3><FieldWrapper label={t("field.weight")} required><Input inputMode="decimal" type="number" min="0" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.trips")} required><Input inputMode="numeric" type="number" min="1" value={trips} onChange={(event) => setTrips(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.doNo")} required><Input value={doNo} onChange={(event) => setDoNo(event.target.value)} /></FieldWrapper><FieldWrapper label={t("field.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper><Button size="lg" className="h-14 w-full text-base" disabledReason={!evidenceComplete ? t("action.photosRequired") : undefined} requires={[[weight, t("field.weight")], [doNo, t("field.doNo")], [Number(trips) >= 1, t("field.trips")]]} disabled={!evidenceComplete || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}{evidenceComplete ? t("action.submit") : t("action.photosRequired")}</Button></section>
    </>}
    {current.status === "AWAITING_CONFIRMATION" && <section className="rounded-lg border border-success/30 bg-success/5 p-6 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h3 className="mt-3 text-lg font-semibold">{t("waitingTitle")}</h3><p className="mt-2 text-sm text-muted-foreground">{t("waitingBody")}</p></section>}
  </div>;
}
