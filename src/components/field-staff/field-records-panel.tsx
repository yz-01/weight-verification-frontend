"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  ClipboardList,
  HardHat,
  ListChecks,
  Loader2,
  PackageOpen,
  Plus,
  Recycle,
  ScanLine,
  ShieldAlert,
  Trash2,
  Truck,
  ReceiptText,
  UserRoundCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  MaterialOutgoingWorkspace,
  SiteEquipmentWorkspace,
  SiteProgressWorkspace,
} from "@/components/contractor-ops/operations-workspaces";
import {
  InternalDisposalWorkspace,
  SiteDisposalWorkspace,
} from "@/components/contractor-ops/site-disposal-workspaces";
import { DeliveryNoteReadStatus, useDeliveryNoteReader } from "@/hooks/use-delivery-note-reader";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { FieldSlots } from "@/components/field-staff/field-slots";
import { SundryClaimCapture } from "@/components/field-staff/sundry-claim-capture";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { FieldLoadNote } from "@/components/field-staff/field-load-note";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { ProjectColumnPicker } from "@/components/site-operations/project-column-picker";
import { Safety } from "@/components/site-operations/safety";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import { missingSiteEntry, siteEntryRequired } from "@/lib/material-site-entry";
import type { FieldTask, ProjectCategory } from "@/interfaces/contractor-ops";
import {
  MATERIAL_UNITS,
  type DeliveryNoteOCRLineItem,
  type MaterialUnit,
  type SupplierQRCode,
} from "@/interfaces/contractor";
import {
  getQRCodes,
  getSuppliers,
  readDeliveryNote,
  scanQRCode,
  scanSupplierQr,
} from "@/services/contractor.service";
import {
  submitConsultantSubmissionOfflineAware,
  submitMaterialReceiptOfflineAware,
  type SafetyIncidentSubmission,
  submitWasteOutgoingOfflineAware,
} from "@/services/offline-sync.service";
import {
  createMaterialColumn,
  getProjectCategories,
} from "@/services/contractor-ops.service";
import { LocationField } from "@/components/field-staff/location-field";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import { getWasteOutgoingOptions } from "@/services/waste-outgoing.service";
import { WASTE_UNITS } from "@/interfaces/waste-outgoing";

type Coordinates = { latitude: string; longitude: string; accuracy: string };

export type FieldRecordMode =
  | "material"
  | "equipment"
  | "progress"
  | "disposal"
  | "outgoing"
  | "waste"
  | "safety"
  | "consultant"
  | "sundry";

interface RecordOption {
  key: FieldRecordMode;
  permission: string | string[];
  icon: typeof Camera;
  tone: string;
}

const RECORD_OPTIONS: RecordOption[] = [
  { key: "material", permission: "receipt.create", icon: ClipboardList, tone: "bg-info/10 text-info" },
  { key: "equipment", permission: "equipment.capture", icon: HardHat, tone: "bg-warning/15 text-warning" },
  { key: "progress", permission: "progress.manage", icon: ListChecks, tone: "bg-primary/10 text-primary" },
  { key: "disposal", permission: "disposal.submit", icon: Recycle, tone: "bg-success/10 text-success" },
  { key: "outgoing", permission: "material_outgoing.submit", icon: Truck, tone: "bg-destructive/10 text-destructive" },
  { key: "waste", permission: "waste_outgoing.submit", icon: Recycle, tone: "bg-success/10 text-success" },
  { key: "safety", permission: "safety.manage", icon: ShieldAlert, tone: "bg-warning/15 text-warning" },
  { key: "consultant", permission: "consultant.submit", icon: UserRoundCheck, tone: "bg-primary/10 text-primary" },
  // No 「现场资料」 tile (D-285): it filed photographs under 现场资料分类, a
  // module the customer never defined. Every tile here is a business entry.
  // 杂费报销 (D-232): submitted here, followed on 「我提交过的」.
  { key: "sundry", permission: "sundry_claim.submit", icon: ReceiptText, tone: "bg-warning/15 text-warning" },
];

export function FieldRecordsPanel({
  initialMode = null,
  initialSupplierToken = "",
  task = null,
  onModeChange,
  onWorkflowSaved,
}: {
  initialMode?: FieldRecordMode | null;
  initialSupplierToken?: string;
  task?: FieldTask | null;
  onModeChange?: (mode: FieldRecordMode | null) => void;
  onWorkflowSaved?: (mode: FieldRecordMode, result?: SafetyIncidentSubmission) => void;
} = {}) {
  const t = useTranslations("fieldStaffPwa");
  const { can, user } = useAuth();
  const boundProject = user?.is_field_staff ? user.active_project?.project_id : undefined;
  const [localMode, setLocalMode] = useState<FieldRecordMode | null>(initialMode);
  const mode = onModeChange ? initialMode : localMode;
  const options = RECORD_OPTIONS.filter((option) =>
    Array.isArray(option.permission)
      ? option.permission.every((permission) => can(permission))
      : can(option.permission),
  );

  const chooseMode = (next: FieldRecordMode | null) => {
    if (!onModeChange) setLocalMode(next);
    onModeChange?.(next);
  };

  if (mode === "material") {
    return <RecordFrame title={t("records.material")} onBack={() => chooseMode(null)}><FieldSlots scope={`material:${task?.id ?? "new"}`} jobKinds={["MATERIAL_RECEIPT"]}><MaterialCapturePanel initialSupplierToken={initialSupplierToken} initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onSaved={() => chooseMode(null)} /></FieldSlots></RecordFrame>;
  }
  if (mode === "equipment") {
    return <RecordFrame title={t("records.equipment")} onBack={() => chooseMode(null)}><FieldSlots scope={`equipment:${task?.id ?? "new"}`} jobKinds={["EQUIPMENT_MOVEMENT"]}><SiteEquipmentWorkspace initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></FieldSlots></RecordFrame>;
  }
  if (mode === "progress") {
    return <RecordFrame title={t("records.progress")} onBack={() => chooseMode(null)}><FieldDraft scope={`progress:${task?.id ?? "new"}`}><SiteProgressWorkspace initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></FieldDraft></RecordFrame>;
  }
  if (mode === "disposal") {
    if (
      task?.linked_record_type === "DISPOSAL_EXECUTION" &&
      task.linked_record_id
    ) {
      return <RecordFrame title={t("records.disposal")} onBack={() => chooseMode(null)}><InternalDisposalWorkspace disposalId={task.linked_record_id} onSubmitted={() => chooseMode(null)} /></RecordFrame>;
    }
    return <RecordFrame title={t("records.disposal")} onBack={() => chooseMode(null)}><FieldSlots scope={`disposal:${task?.id ?? "new"}`} jobKinds={["DISPOSAL_REQUEST"]}><SiteDisposalWorkspace initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></FieldSlots></RecordFrame>;
  }
  if (mode === "outgoing") {
    return <RecordFrame title={t("records.outgoing")} onBack={() => chooseMode(null)}><FieldDraft scope={`outgoing:${task?.id ?? "new"}`}><MaterialOutgoingWorkspace initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></FieldDraft></RecordFrame>;
  }
  if (mode === "waste") {
    return <RecordFrame title={t("records.waste")} onBack={() => chooseMode(null)}><FieldSlots scope={`waste:${task?.id ?? "new"}`} jobKinds={["WASTE_OUTGOING"]}><WasteOutgoingCapturePanel initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onSaved={() => chooseMode(null)} /></FieldSlots></RecordFrame>;
  }
  if (mode === "safety") {
    return <RecordFrame title={t("records.safety")} onBack={() => chooseMode(null)}><FieldDraft scope={`safety:${task?.id ?? "new"}`}><Safety fieldMode initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onRecordSaved={(result) => { chooseMode(null); onWorkflowSaved?.("safety", result); }} /></FieldDraft></RecordFrame>;
  }
  if (mode === "consultant") {
    return <RecordFrame title={t("records.consultant")} onBack={() => chooseMode(null)}><FieldDraft scope={`consultant:${task?.id ?? "new"}`}><ConsultantCapturePanel initialProject={task?.project ?? boundProject} fieldTaskId={task?.id} onSaved={() => chooseMode(null)} /></FieldDraft></RecordFrame>;
  }
  if (mode === "sundry") {
    return <RecordFrame title={t("records.sundry")} onBack={() => chooseMode(null)}><FieldDraft scope={`sundry:${task?.id ?? "new"}`}><SundryClaimCapture initialProject={task?.project ?? boundProject} onSaved={() => chooseMode(null)} /></FieldDraft></RecordFrame>;
  }


  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t("records.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("records.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              type="button"
              className="flex min-h-28 flex-col items-start justify-between rounded-lg border bg-card p-3.5 text-left shadow-sm active:scale-[0.98]"
              onClick={() => chooseMode(option.key)}
            >
              <span className={`grid size-10 place-items-center rounded-lg ${option.tone}`}>
                <Icon className="size-5" />
              </span>
              <span className="mt-4 text-sm font-semibold leading-5">
                {t(`records.${option.key}`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecordFrame({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("fieldStaffPwa");
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 border-b pb-3">
        <Button size="icon" variant="outline" title={t("action.back")} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

interface MaterialDraft {
  project: string;
  supplier: string;
  /** Required destination column for this submission. */
  category: string;
  movementType: "ENTRY" | "RETURN";
  returnReason: string;
  returnReasonOther: string;
  materialName: string;
  materialSpecification: string;
  quantity: string;
  unit: MaterialUnit;
  totalWeightKg: string;
  vehiclePlate: string;
  deliveryNoteNo: string;
  notes: string;
}

const EMPTY_MATERIAL: MaterialDraft = {
  project: "",
  supplier: "",
  category: "",
  movementType: "ENTRY",
  returnReason: "",
  returnReasonOther: "",
  materialName: "",
  materialSpecification: "",
  quantity: "",
  unit: "TONNE",
  totalWeightKg: "",
  vehiclePlate: "",
  deliveryNoteNo: "",
  notes: "",
};

function MaterialCapturePanel({
  initialSupplierToken,
  initialProject = "",
  fieldTaskId,
  onSaved,
}: {
  initialSupplierToken?: string;
  initialProject?: string;
  fieldTaskId?: string;
  onSaved: () => void;
}) {
  const t = useTranslations("fieldStaffPwa");
  const allT = useTranslations();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useDraftState<MaterialDraft>("material", { ...EMPTY_MATERIAL, project: initialProject });
  const [materialEvidence, setMaterialEvidence] = useDraftState("materialEvidence", createEmptyFieldEvidence);
  const [receiverSignature, setReceiverSignature] = useDraftState<File | undefined>("receiverSignature");
  const [supplierSignature, setSupplierSignature] = useDraftState<File | undefined>("supplierSignature");
  const clearDraft = useClearDraft();
  const [scannedQr, setScannedQr] = useState<SupplierQRCode>();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ocrProof, setOcrProof] = useState("");
  const [ocrLineItems, setOcrLineItems] = useState<DeliveryNoteOCRLineItem[]>([]);
  const [newColumnName, setNewColumnName] = useState("");
  const [columnError, setColumnError] = useState("");
  const [location, setLocation] = useState<{ latitude: string; longitude: string; accuracy: string }>();
  const [error, setError] = useState("");
  const initialScanRef = useRef("");
  const completedMaterialEvidence = completedFieldEvidence(materialEvidence);
  const deliveryNote = materialEvidence[3];
  const sitePhotos = [
    ...materialEvidence.slice(0, 3),
    ...materialEvidence.slice(FIELD_EVIDENCE_PHOTO_COUNT),
  ].filter((file): file is File => Boolean(file));
  const materialEvidenceLabels = [
    t("materialEvidence.arrival"),
    t("materialEvidence.unloading"),
    t("materialEvidence.emptyVehicle"),
    t("materialEvidence.deliveryOrder"),
  ];

  const suppliers = useQuery({
    queryKey: ["suppliers", "field-material"],
    queryFn: () => getSuppliers({ page_size: 200, sort_by: "name" }),
  });
  const dockets = useQuery({
    queryKey: ["qr-codes", "field-material"],
    queryFn: () => getQRCodes({ page_size: 300 }),
  });
  const updateLineItem = (
    index: number,
    patch: Partial<DeliveryNoteOCRLineItem>,
  ) =>
    setOcrLineItems((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  const removeLineItem = (index: number) =>
    setOcrLineItems((rows) => rows.filter((_, i) => i !== index));
  const loadLineItem = (item: DeliveryNoteOCRLineItem) =>
    setDraft((old) => ({
      ...old,
      materialName: item.material_name,
      quantity: numericSuggestion(item.quantity) || old.quantity,
      unit: (item.unit as MaterialUnit) || old.unit,
      // The reader now hands back the column id, so the line does not have to
      // be matched back to one by its code.
      category: item.category_id || old.category,
    }));
  // The material columns of this site. Only the material ones: a site-record
  // column is not somewhere a delivery can be filed, and the server refuses
  // one here (T-161).
  const columns = useQuery({
    queryKey: ["project-categories", "field-material", draft.project],
    queryFn: () =>
      getProjectCategories({
        project: draft.project,
        kind: "MATERIAL",
        is_active: true,
        page_size: 200,
        sort_by: "sort_order",
        sort_order: "asc",
      }),
    enabled: Boolean(draft.project),
    staleTime: 30_000,
  });
  const columnRows: ProjectCategory[] = columns.data?.results ?? [];
  /** Open a column for this delivery, and select it. See `openColumn`. */
  const columnCreation = useMutation({
    mutationFn: ({ name }: { name: string; index?: number }) =>
      createMaterialColumn({ project: draft.project, name }),
    onSuccess: (row, { index }) => {
      setColumnError("");
      setNewColumnName("");
      setDraft((old) => ({ ...old, category: row.id }));
      // A column opened from a scanned line belongs to that line too.
      // Without this the row still reads "pick a category" straight after
      // somebody opened one for exactly that material.
      if (index !== undefined) {
        updateLineItem(index, {
          category_id: row.id,
          category_code: row.code,
          category_name: row.name,
          classified: true,
        });
      }
      void qc.invalidateQueries({ queryKey: ["project-categories"] });
    },
    onError: (reason) =>
      setColumnError(
        reason instanceof ApiError ? reason.message : t("error.action"),
      ),
  });
  /**
   * Open a column, or say plainly why it cannot be opened right now.
   *
   * A column is a row other people file against, so it cannot be minted
   * offline and reconciled later - two workers on the same site would invent
   * the same column twice, and the second would be a duplicate budget line.
   * Saying so beats a spinner that fails: the delivery can still be taken
   * unfiled and filed once there is a connection.
   */
  const openColumn = (name: string, index?: number) => {
    setColumnError("");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setColumnError(t("material.columnOffline"));
      return;
    }
    columnCreation.mutate({ name, index });
  };
  const qrCode = useMemo(
    () => scannedQr && scannedQr.project === draft.project && scannedQr.supplier === draft.supplier
      ? scannedQr
      : (dockets.data?.results ?? []).find(
        (row) => row.is_active && row.project === draft.project && row.supplier === draft.supplier,
      ),
    [dockets.data, draft.project, draft.supplier, scannedQr],
  );

  /*
    Two different codes get printed on a site and a clerk cannot tell them
    apart by looking. A *docket* names one delivery and brings the project and
    the supplier with it; a *supplier* code is the company's own card and names
    only the supplier. Only the first was ever resolved, so scanning the second
    said "this code is not valid" - which reads as a broken sticker rather than
    the wrong lookup, and there is no way for the person holding the phone to
    tell the difference (F-101).

    So: try the docket, and on a miss try the supplier before giving up. The
    supplier fills itself in and the project stays for the clerk to pick,
    because a supplier code genuinely does not know which site it is on.
  */
  const qrScan = useMutation({
    mutationFn: async (token: string) => {
      try {
        const code = await scanQRCode(token);
        if (initialProject && code.project !== initialProject) throw new ApiError(t("material.qrInvalid"), 400);
        return { kind: "DOCKET" as const, code };
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason;
        return { kind: "SUPPLIER" as const, supplier: await scanSupplierQr(token) };
      }
    },
    onSuccess: (result) => {
      setError("");
      if (result.kind === "DOCKET") {
        setScannedQr(result.code);
        setDraft((old) => ({
          ...old,
          project: result.code.project,
          supplier: result.code.supplier,
        }));
        return;
      }
      setScannedQr(undefined);
      setDraft((old) => ({ ...old, supplier: result.supplier.id }));
    },
    onError: (reason) => setError(
      reason instanceof ApiError ? reason.message : t("material.qrInvalid"),
    ),
  });

  useEffect(() => {
    if (
      !initialSupplierToken ||
      initialScanRef.current === initialSupplierToken
    ) {
      return;
    }
    initialScanRef.current = initialSupplierToken;
    qrScan.mutate(initialSupplierToken);
  }, [initialSupplierToken, qrScan]);

  // The delivery-note read every module shares (useDeliveryNoteReader).
  const ocr = useDeliveryNoteReader({
    read: readDeliveryNote,
    onRead: (result) => {
      setOcrProof(result.proof);
      const items = result.line_items ?? [];
      setOcrLineItems(items);
      const firstCategory = items[0]?.category_id ?? "";
      const supplierName = result.suggestions.supplier_name?.trim().toLocaleLowerCase();
      const matchedSupplier = (suppliers.data?.results ?? []).find((row) => row.is_active && row.name.trim().toLocaleLowerCase() === supplierName);
      setDraft((old) => ({
        ...old,
        supplier: matchedSupplier?.id || old.supplier,
        deliveryNoteNo: result.suggestions.delivery_note_no || old.deliveryNoteNo,
        vehiclePlate: result.suggestions.vehicle_plate || old.vehiclePlate,
        // With a line-item table, prefill from its first row; otherwise fall
        // back to the single-field suggestion.
        materialName:
          items[0]?.material_name ||
          result.suggestions.material_name ||
          old.materialName,
        quantity:
          numericSuggestion(items[0]?.quantity) ||
          numericSuggestion(result.suggestions.quantity) ||
          old.quantity,
        unit: (items[0]?.unit as MaterialUnit) || old.unit,
        category: firstCategory || old.category,
      }));
    },
    onReset: () => {
      setOcrProof("");
      setOcrLineItems([]);
    },
  });


  // A delivery (ENTRY) needs plate, DO number and both signatures (D-280).
  const siteEntry = siteEntryRequired(draft.movementType);
  const missingEntry = missingSiteEntry(draft.movementType, {
    vehiclePlate: draft.vehiclePlate,
    deliveryNoteNo: draft.deliveryNoteNo,
    receiverSignature,
    supplierSignature,
  });

  const save = useMutation({
    mutationFn: () => {
      if (!user || !location) {
        throw new Error("missing_evidence");
      }
      const eventId = crypto.randomUUID();
      return submitMaterialReceiptOfflineAware(user.id, {
        receipt: {
          project: draft.project,
          supplier: draft.supplier,
          qr_code: qrCode?.id ?? null,
          movement_type: draft.movementType,
          return_reason:
            draft.movementType === "RETURN"
              ? draft.returnReason === "OTHER"
                ? draft.returnReasonOther.trim()
                : draft.returnReason
              : "",
          material_name: draft.materialName.trim(),
          material_specification: draft.materialSpecification.trim(),
          quantity: draft.quantity,
          unit: draft.unit,
          total_weight_kg: draft.totalWeightKg || null,
          category: draft.category,
          vehicle_plate: draft.vehiclePlate.trim(),
          delivery_note_no: draft.deliveryNoteNo.trim(),
          notes: draft.notes.trim(),
          received_by_name: user.full_name,
          original_captured_at: new Date().toISOString(),
          client_event_id: eventId,
          field_task: fieldTaskId,
          latitude: location.latitude,
          longitude: location.longitude,
          location_accuracy_m: location.accuracy,
          ocr_proof: ocrProof || undefined,
        },
        signature: receiverSignature,
        supplierSignature,
        deliveryNotePhoto: deliveryNote,
        sitePhotos,
        deviceId: getOrCreateFieldDeviceId(),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["receipts"] });
      clearDraft();
      onSaved();
    },
    onError: (reason) => setError(
      reason instanceof ApiError ? Object.values(reason.errors).join("; ") || reason.message : t("error.action"),
    ),
  });

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <Button
        className="h-12 w-full text-sm"
        variant="outline"
        disabled={qrScan.isPending}
        onClick={() => setScannerOpen(true)}
      >
        {qrScan.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
        {t("material.scanSupplierQr")}
      </Button>
      <FieldWrapper label={t("material.project")} required>
        <ProjectPicker
          value={draft.project}
          onValueChange={(project) => {
            ocr.cancel();
            setScannedQr(undefined);
            setMaterialEvidence(createEmptyFieldEvidence());
            setNewColumnName("");
            setColumnError("");
            // A column belongs to one site, so the one chosen for the old
            // project is not a valid answer for the new one.
            setDraft((old) => ({ ...old, project, category: "" }));
          }}
          placeholder={t("material.chooseProject")}
          className="h-12 w-full"
          // The task already decided the site, so this only shows it. A
          // mis-tap here would file the delivery against the wrong project
          // with nothing downstream able to tell. Reached without a task
          // there is nothing to lock to, and the picker stays usable.
          disabled={Boolean(initialProject)}
        />
      </FieldWrapper>
      <FieldWrapper label={t("material.column")} required>
        <Select value={draft.category || undefined} onValueChange={(category) => setDraft((old) => ({ ...old, category }))} disabled={!draft.project || columns.isLoading}>
          <SelectTrigger className="w-full"><SelectValue placeholder={t("material.column")} /></SelectTrigger>
          <SelectContent>{columnRows.filter((row) => row.can_upload).map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
        </Select>
        <FieldLoadNote query={columns} what={t("what.columns")} />
        {draft.project && columns.isSuccess && !columnRows.length && <p className="text-sm text-muted-foreground">{t("material.noColumnsYet")}</p>}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">{t("material.addColumn")}</summary>
          <div className="mt-2 flex items-end gap-2">
            <FieldWrapper label={t("material.newColumnName")} required className="flex-1"><Input value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} /></FieldWrapper>
            <Button variant="outline" requires={[[draft.project, t("material.project")], [newColumnName.trim(), t("material.newColumnName")]]} disabled={columnCreation.isPending} onClick={() => openColumn(newColumnName.trim())}><Plus />{t("material.addColumn")}</Button>
          </div>
          {columnError && <p role="alert" className="text-sm text-destructive">{columnError}</p>}
        </details>
      </FieldWrapper>
      <FieldWrapper label={t("materialEvidence.title")} required>
        <FieldEvidenceGrid
          labels={materialEvidenceLabels}
          files={materialEvidence}
          progressLabel={t("evidenceProgress", {
            current: completedMaterialEvidence.length,
            required: FIELD_EVIDENCE_PHOTO_COUNT,
          })}
          onChange={(next) => {
            const nextDeliveryNote = next[3];
            setMaterialEvidence(next);
            if (nextDeliveryNote !== deliveryNote) {
              ocr.inspect(draft.project, nextDeliveryNote);
            }
          }}
        />
      </FieldWrapper>
      <DeliveryNoteReadStatus reader={ocr} />
      <FieldWrapper label={t("material.supplier")} required>
        <Select
          value={draft.supplier || undefined}
          onValueChange={(supplier) => {
            setScannedQr(undefined);
            setDraft((old) => ({ ...old, supplier }));
          }}
        >
          <SelectTrigger className="h-12 w-full"><SelectValue placeholder={t("material.chooseSupplier")} /></SelectTrigger>
          <SelectContent>
            {(suppliers.data?.results ?? []).filter((row) => row.is_active).map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldLoadNote query={suppliers} what={t("what.suppliers")} />
        <FieldLoadNote query={dockets} what={t("what.dockets")} />
        {draft.project && draft.supplier && !dockets.isError && (
          <p className="text-xs text-muted-foreground">
            {qrCode ? t("material.qrMatched") : t("material.qrNotIssued")}
          </p>
        )}
      </FieldWrapper>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label={t("material.direction")} required>
          <Select value={draft.movementType} onValueChange={(movementType) => setDraft((old) => ({ ...old, movementType: movementType as MaterialDraft["movementType"] }))}>
            <SelectTrigger className="h-12 w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ENTRY">{t("material.entry")}</SelectItem><SelectItem value="RETURN">{t("material.return")}</SelectItem></SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label={t("material.unit")} required>
          <Select value={draft.unit} onValueChange={(unit) => setDraft((old) => ({ ...old, unit: unit as MaterialUnit }))}>
            <SelectTrigger className="h-12 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{MATERIAL_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{allT(`receipts.unit.${unit}`)}</SelectItem>)}</SelectContent>
          </Select>
        </FieldWrapper>
      </div>
      {draft.movementType === "RETURN" ? (
        <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <FieldWrapper label={t("material.returnReason")} required>
            <Select
              value={draft.returnReason || undefined}
              onValueChange={(returnReason) =>
                setDraft((old) => ({
                  ...old,
                  returnReason,
                  returnReasonOther:
                    returnReason === "OTHER" ? old.returnReasonOther : "",
                }))
              }
            >
              <SelectTrigger className="h-12 w-full">
                <SelectValue placeholder={t("material.chooseReturnReason")} />
              </SelectTrigger>
              <SelectContent>
                {["QUALITY_REJECTED", "WRONG_DELIVERY", "DAMAGED", "EXCESS_MATERIAL", "OTHER"].map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {t(`material.returnReasonOption.${reason}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          {draft.returnReason === "OTHER" ? (
            <FieldWrapper label={t("material.returnReasonOther")} required>
              <Input
                className="h-12"
                value={draft.returnReasonOther}
                onChange={(event) =>
                  setDraft((old) => ({
                    ...old,
                    returnReasonOther: event.target.value,
                  }))
                }
              />
            </FieldWrapper>
          ) : null}
        </div>
      ) : null}
      <FieldWrapper label={t("material.name")} required><Input className="h-12" value={draft.materialName} onChange={(event) => setDraft((old) => ({ ...old, materialName: event.target.value }))} /></FieldWrapper>
      <FieldWrapper label={t("material.quantity")} required><Input className="h-12" type="number" min="0" step="0.001" inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft((old) => ({ ...old, quantity: event.target.value }))} /></FieldWrapper>
      {ocrLineItems.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b bg-muted/40 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("material.ocrItems.title")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("material.ocrItems.editHint")}
            </p>
          </div>
          <ul className="divide-y">
            {ocrLineItems.map((item, index) => (
              <li key={index} className="space-y-2 px-3 py-3">
                <div className="flex items-center gap-2">
                  <Input
                    className="h-10 flex-1"
                    value={item.material_name}
                    placeholder={t("material.name")}
                    onChange={(event) =>
                      updateLineItem(index, { material_name: event.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10"
                    title={t("material.ocrItems.remove")}
                    onClick={() => removeLineItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    className="h-10"
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    value={item.quantity}
                    placeholder={t("material.quantity")}
                    onChange={(event) =>
                      updateLineItem(index, { quantity: event.target.value })
                    }
                  />
                  <Select
                    value={item.unit || "none"}
                    onValueChange={(value) =>
                      updateLineItem(index, { unit: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger className="h-10 w-full"><SelectValue placeholder={t("material.unit")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("material.ocrItems.noUnit")}</SelectItem>
                      {MATERIAL_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {allT(`receipts.unit.${unit}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-muted-foreground">
                    {item.category_name || t("material.ocrItems.unclassified")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 shrink-0 rounded-full px-4"
                    onClick={() => loadLineItem(item)}
                  >
                    {t("material.ocrItems.use")}
                  </Button>
                </div>
                {/* A material nobody has a column for. Classifying could only
                    ever pick a column that already existed (F-200), so a line
                    the reader could not place used to be a dead label. */}
                {!item.category_id && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-10 w-full"
                    disabled={columnCreation.isPending}
                    onClick={() => openColumn(item.material_name.trim(), index)}
                  >
                    {columnCreation.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    {t("material.ocrItems.makeColumn")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* On the form, not under 补充资料: the server refuses a delivery
          without them (D-280), so hiding them behind 选填 sent workers to a
          refusal they could not explain. A return (退场) is not asked. */}
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label={t("material.vehicle")} required={siteEntry}><Input className="h-12" value={draft.vehiclePlate} onChange={(event) => setDraft((old) => ({ ...old, vehiclePlate: event.target.value.toUpperCase() }))} /></FieldWrapper>
        <FieldWrapper label={t("material.doNo")} required={siteEntry}><Input className="h-12" value={draft.deliveryNoteNo} onChange={(event) => setDraft((old) => ({ ...old, deliveryNoteNo: event.target.value }))} /></FieldWrapper>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSignaturePad label={t("material.receiverSignature")} clearLabel={t("action.clearSignature")} required={siteEntry} value={receiverSignature} onChange={setReceiverSignature} />
        <FieldSignaturePad label={t("material.supplierSignature")} clearLabel={t("action.clearSignature")} required={siteEntry} value={supplierSignature} onChange={setSupplierSignature} />
      </div>
      <details className="border-y py-3">
        <summary className="cursor-pointer text-sm font-medium">{t("material.additionalDetails")}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <FieldWrapper label={t("material.specification")}><Input className="h-12" value={draft.materialSpecification} onChange={(event) => setDraft((old) => ({ ...old, materialSpecification: event.target.value }))} /></FieldWrapper>
      <FieldWrapper label={t("material.totalWeightKg")}><Input className="h-12" type="number" min="0" step="0.001" inputMode="decimal" value={draft.totalWeightKg} onChange={(event) => setDraft((old) => ({ ...old, totalWeightKg: event.target.value }))} /></FieldWrapper>
        </div>
      </details>
      <LocationField
        label={t("material.location")}
        actionLabel={t("attendance.getLocation")}
        readyLabel={t("attendance.locationReady")}
        value={location ?? null}
        onChange={(fix) => setLocation(fix ?? undefined)}
        required
      />
      <Textarea value={draft.notes} onChange={(event) => setDraft((old) => ({ ...old, notes: event.target.value }))} placeholder={t("material.notes")} />
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="h-12 w-full text-sm" requires={[[draft.project, t("material.project")], [draft.category, t("material.column")], [draft.supplier, t("material.supplier")], [draft.materialName, t("material.name")], [Number(draft.quantity) > 0, t("material.quantity")], [draft.movementType === "ENTRY" || draft.returnReason, t("material.returnReason")], [draft.movementType === "ENTRY" || draft.returnReason !== "OTHER" || draft.returnReasonOther, t("material.returnReasonOther")], [!missingEntry.includes("vehiclePlate"), t("material.vehicle")], [!missingEntry.includes("deliveryNoteNo"), t("material.doNo")], [!missingEntry.includes("receiverSignature"), t("material.receiverSignature")], [!missingEntry.includes("supplierSignature"), t("material.supplierSignature")], [hasRequiredFieldEvidence(materialEvidence), t("materialEvidence.title")], [location, t("material.location")]]} disabled={save.isPending || ocr.reading} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <PackageOpen />}
        {t("material.submit")}
      </Button>
      <SupplierQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(token) => {
          setScannerOpen(false);
          qrScan.mutate(token);
        }}
      />
    </div>
  );
}

function numericSuggestion(value?: string): string {
  if (!value) return "";
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match?.[0] ?? "";
}

function ConsultantCapturePanel({ initialProject = "", fieldTaskId, onSaved }: { initialProject?: string; fieldTaskId?: string; onSaved: () => void }) {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const qc = useQueryClient();
  // F-282: these were plain `useState` inside a `<FieldDraft>` wrapper, so the
  // banner said "saved" while a mis-tap threw the whole form away.
  const [project, setProject] = useDraftState("project", initialProject);
  const [evidence, setEvidence] = useDraftState("evidence", createEmptyFieldEvidence);
  const [category, setCategory] = useDraftState("category", "RFI");
  const [column, setColumn] = useDraftState("column", "");
  const [note, setNote] = useDraftState("note", "");
  const clearDraft = useClearDraft();
  // Deliberately *not* saved. A restored draft submitted the next day would
  // send `captured_at: now` with yesterday's coordinates - a false evidence
  // record rather than a recovered one. Re-acquiring is one tap on
  // `LocationField`, and the material panel this pattern comes from keeps
  // location on plain state for the same reason.
  const [location, setLocation] = useState<Coordinates>();
  const [error, setError] = useState("");
  const photos = completedFieldEvidence(evidence);
  const evidenceLabels = [
    t("consultantEvidence.overview"),
    t("consultantEvidence.detail"),
    t("consultantEvidence.location"),
    t("consultantEvidence.reference"),
  ];


  const save = useMutation({
    mutationFn: () => {
      if (!user || !location) throw new Error("missing_evidence");
      return submitConsultantSubmissionOfflineAware(user.id, {
        project,
        category: column,
        note: note.trim(),
        application_category: category,
        description: note.trim(),
        captured_at: new Date().toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
        device_id: getOrCreateFieldDeviceId(),
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        photos,
      });
    },
    onSuccess: () => {
      // Only after the submission was accepted - or the offline queue took
      // ownership of it - is the typing safe to throw away.
      clearDraft();
      void qc.invalidateQueries({ queryKey: ["field-tasks"] });
      onSaved();
    },
    onError: (reason) => setError(
      reason instanceof ApiError ? reason.message : t("error.action"),
    ),
  });

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <FieldWrapper label={t("consultantCapture.project")} required>
        <ProjectPicker
          value={project}
          onValueChange={(next) => { setProject(next); setColumn(""); }}
          placeholder={t("consultantCapture.chooseProject")}
          className="h-12 w-full"
          disabled={Boolean(initialProject)}
        />
      </FieldWrapper>
      {/* The consultant's own columns, not the site-record ones (D-274): the
          server refuses a FIELD column here, and a draft that still holds one
          is cleared by the picker because it is not on the list. */}
      <FieldWrapper label={t("material.column")} required>
        <ProjectColumnPicker bare project={project} kind="CONSULTANT" value={column} onChange={setColumn} />
      </FieldWrapper>
      <FieldWrapper label={t("consultantCapture.category")} required>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-12 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["RFI", "WIR", "MATERIAL", "SAFETY", "OTHER"] as const).map((value) => (
              <SelectItem key={value} value={value}>{t(`consultantCapture.categoryOption.${value}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldWrapper>
      <FieldWrapper label={t("consultantEvidence.title")} required>
        <FieldEvidenceGrid
          labels={evidenceLabels}
          files={evidence}
          progressLabel={t("evidenceProgress", {
            current: photos.length,
            required: FIELD_EVIDENCE_PHOTO_COUNT,
          })}
          onChange={setEvidence}
        />
      </FieldWrapper>
      <LocationField
        label={t("consultantEvidence.location")}
        actionLabel={t("attendance.getLocation")}
        readyLabel={t("attendance.locationReady")}
        value={location ?? null}
        onChange={(fix) => setLocation(fix ?? undefined)}
        required
      />
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("consultantCapture.note")}
      />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="h-12 w-full text-sm"
        requires={[
          [project, t("consultantCapture.project")],
          [category, t("consultantCapture.category")],
          [column, t("material.column")],
          [hasRequiredFieldEvidence(evidence), t("consultantEvidence.title")],
          [location, t("consultantEvidence.location")],
        ]}
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="animate-spin" /> : <UserRoundCheck />}
        {t("consultantCapture.submit")}
      </Button>
    </div>
  );
}

function WasteOutgoingCapturePanel({
  initialProject = "",
  fieldTaskId,
  onSaved,
}: {
  initialProject?: string;
  fieldTaskId?: string;
  onSaved: () => void;
}) {
  const t = useTranslations("wasteOutgoing");
  const { user } = useAuth();
  const qc = useQueryClient();
  // F-282: same shell-without-wiring as the consultant panel above.
  const [project, setProject] = useDraftState("project", initialProject);
  const [category, setCategory] = useDraftState("category", "");
  const [quantity, setQuantity] = useDraftState("quantity", "");
  const [unit, setUnit] = useDraftState("unit", "");
  const [note, setNote] = useDraftState("note", "");
  const [evidence, setEvidence] = useDraftState("evidence", createEmptyFieldEvidence);
  const clearDraft = useClearDraft();
  // Not saved - see the note on the consultant panel.
  const [location, setLocation] = useState<Coordinates>();
  const [error, setError] = useState("");
  const photos = completedFieldEvidence(evidence);
  const evidenceLabels = [
    t("evidence.overview"),
    t("evidence.quantity"),
    t("evidence.vehicle"),
    t("evidence.loading"),
  ];

  const options = useQuery({
    queryKey: ["waste-outgoing", "options"],
    queryFn: getWasteOutgoingOptions,
  });
  const categories = (options.data?.categories ?? []).filter(
    (row) => row.is_active,
  );

  const save = useMutation({
    mutationFn: () => {
      if (!user || !location) throw new Error("invalid_waste_submission");
      return submitWasteOutgoingOfflineAware(user.id, {
        project,
        category,
        quantity: quantity.trim() || undefined,
        unit: quantity.trim() ? unit : undefined,
        note: note.trim() || undefined,
        latitude: location.latitude,
        longitude: location.longitude,
        device_id: getOrCreateFieldDeviceId(),
        client_event_id: crypto.randomUUID(),
        field_task: fieldTaskId,
        photos,
      });
    },
    onSuccess: () => {
      setError("");
      clearDraft();
      void qc.invalidateQueries({ queryKey: ["field-staff", "tasks"] });
      onSaved();
    },
    onError: (failure) => {
      if (failure instanceof ApiError) {
        setError(Object.values(failure.errors)[0] || failure.message);
        return;
      }
      setError(t("form.submitFailed"));
    },
  });


  const quantityIncomplete = quantity.trim() !== "" && unit === "";

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{t("form.help")}</p>
      <FieldWrapper label={t("field.project")} required>
        <ProjectPicker
          value={project}
          onValueChange={(next) => { setProject(next); setCategory(""); }}
          placeholder={t("filter.selectProject")}
          className="w-full"
          disabled={Boolean(initialProject)}
        />
      </FieldWrapper>
      <FieldWrapper label={t("field.category")} required>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-12 w-full">
            <SelectValue placeholder={t("field.selectCategory")} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldLoadNote query={options} what={t("what.categories")} />
      </FieldWrapper>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label={t("field.quantity")} optional={t("field.optional")}>
          <Input className="h-12" type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("field.unit")} required={quantity.trim() !== ""} error={quantityIncomplete ? t("field.unitRequired") : undefined}>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="h-12 w-full"><SelectValue placeholder={t("field.selectUnit")} /></SelectTrigger>
            <SelectContent>
              {WASTE_UNITS.map((value) => (
                <SelectItem key={value} value={value}>{t(`unit.${value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      </div>
      {/*
        No collection-address input here, and D-224 is the reason now.

        客户第 37 条：取货地址按**发起人角色**分流。「现场人员从手机端发起时
        **直接使用手机当前定位**并确认位置在项目范围内，**不需要再填具体门口或
        取货点**」. The office is the party that has to type an address,
        because they are the ones not standing on site.

        This is also what D-117 concluded from the other direction: two people
        typing the same address was the original problem, and the site's answer
        won silently. Blank is not a loss - `set_pickup_address` falls back to
        the project address and marks the source PROJECT, and the office names
        the gate when it raises the order.
      */}
      <FieldWrapper label={t("field.note")} optional={t("field.optional")}>
        <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </FieldWrapper>
      <FieldWrapper label={t("evidence.title")} required>
        <FieldEvidenceGrid
          labels={evidenceLabels}
          files={evidence}
          progressLabel={t("evidence.progress", {
            current: photos.length,
            required: FIELD_EVIDENCE_PHOTO_COUNT,
          })}
          onChange={setEvidence}
        />
      </FieldWrapper>
      <LocationField
        label={t("field.location")}
        actionLabel={t("action.locate")}
        readyLabel={t("field.locationReady")}
        value={location ?? null}
        onChange={(fix) => setLocation(fix ?? undefined)}
        required
      />
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="h-12 w-full text-sm" requires={[[project, t("field.project")], [category, t("field.category")], [!quantityIncomplete, t("field.unit")], [hasRequiredFieldEvidence(evidence), t("evidence.title")], [location, t("field.location")]]} disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Recycle />}
        {t("action.submit")}
      </Button>
    </div>
  );
}
