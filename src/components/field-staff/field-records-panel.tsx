"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  ClipboardList,
  FolderOpen,
  HardHat,
  ListChecks,
  Loader2,
  LocateFixed,
  PackageOpen,
  Recycle,
  ScanLine,
  ShieldAlert,
  Truck,
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
import { useAuth } from "@/components/providers/auth-provider";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { CategoryEvidenceCapture } from "@/components/field-staff/category-evidence-capture";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
import type { FieldTask } from "@/interfaces/contractor-ops";
import {
  MATERIAL_UNITS,
  type MaterialUnit,
  type SupplierQRCode,
} from "@/interfaces/contractor";
import {
  getQRCodes,
  getSuppliers,
  readDeliveryNote,
  scanQRCode,
} from "@/services/contractor.service";
import {
  submitConsultantSubmissionOfflineAware,
  submitMaterialReceiptOfflineAware,
  submitWasteOutgoingOfflineAware,
} from "@/services/offline-sync.service";
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
  | "category";

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
  { key: "category", permission: ["category.view", "field_task.submit"], icon: FolderOpen, tone: "bg-info/10 text-info" },
];

export function FieldRecordsPanel({
  initialMode = null,
  initialSupplierToken = "",
  task = null,
  onModeChange,
}: {
  initialMode?: FieldRecordMode | null;
  initialSupplierToken?: string;
  task?: FieldTask | null;
  onModeChange?: (mode: FieldRecordMode | null) => void;
} = {}) {
  const t = useTranslations("fieldStaffPwa");
  const { can } = useAuth();
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
    return <RecordFrame title={t("records.material")} onBack={() => chooseMode(null)}><MaterialCapturePanel initialSupplierToken={initialSupplierToken} initialProject={task?.project} fieldTaskId={task?.id} onSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "equipment") {
    return <RecordFrame title={t("records.equipment")} onBack={() => chooseMode(null)}><SiteEquipmentWorkspace initialProject={task?.project} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "progress") {
    return <RecordFrame title={t("records.progress")} onBack={() => chooseMode(null)}><SiteProgressWorkspace initialProject={task?.project} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "disposal") {
    if (
      task?.linked_record_type === "DISPOSAL_EXECUTION" &&
      task.linked_record_id
    ) {
      return <RecordFrame title={t("records.disposal")} onBack={() => chooseMode(null)}><InternalDisposalWorkspace disposalId={task.linked_record_id} onSubmitted={() => chooseMode(null)} /></RecordFrame>;
    }
    return <RecordFrame title={t("records.disposal")} onBack={() => chooseMode(null)}><SiteDisposalWorkspace initialProject={task?.project} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "outgoing") {
    return <RecordFrame title={t("records.outgoing")} onBack={() => chooseMode(null)}><MaterialOutgoingWorkspace initialProject={task?.project} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "waste") {
    return <RecordFrame title={t("records.waste")} onBack={() => chooseMode(null)}><WasteOutgoingCapturePanel initialProject={task?.project} fieldTaskId={task?.id} onSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "safety") {
    return <RecordFrame title={t("records.safety")} onBack={() => chooseMode(null)}><Safety fieldMode initialProject={task?.project} fieldTaskId={task?.id} onRecordSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "consultant") {
    return <RecordFrame title={t("records.consultant")} onBack={() => chooseMode(null)}><ConsultantCapturePanel initialProject={task?.project} fieldTaskId={task?.id} onSaved={() => chooseMode(null)} /></RecordFrame>;
  }
  if (mode === "category") {
    return <RecordFrame title={t("records.category")} onBack={() => chooseMode(null)}><CategoryEvidenceCapture initialProject={task?.project} onSaved={() => chooseMode(null)} /></RecordFrame>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("records.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("records.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              type="button"
              className="flex min-h-32 flex-col items-start justify-between rounded-xl border bg-card p-4 text-left shadow-sm active:scale-[0.98]"
              onClick={() => chooseMode(option.key)}
            >
              <span className={`grid size-11 place-items-center rounded-xl ${option.tone}`}>
                <Icon className="size-6" />
              </span>
              <span className="mt-4 text-base font-semibold leading-5">
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
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

interface MaterialDraft {
  project: string;
  supplier: string;
  movementType: "ENTRY" | "RETURN";
  returnReason: string;
  returnReasonOther: string;
  materialName: string;
  quantity: string;
  unit: MaterialUnit;
  vehiclePlate: string;
  deliveryNoteNo: string;
  notes: string;
}

const EMPTY_MATERIAL: MaterialDraft = {
  project: "",
  supplier: "",
  movementType: "ENTRY",
  returnReason: "",
  returnReasonOther: "",
  materialName: "",
  quantity: "",
  unit: "TONNE",
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
  const [draft, setDraft] = useState<MaterialDraft>({
    ...EMPTY_MATERIAL,
    project: initialProject,
  });
  const [materialEvidence, setMaterialEvidence] = useState(
    createEmptyFieldEvidence,
  );
  const [receiverSignature, setReceiverSignature] = useState<File>();
  const [supplierSignature, setSupplierSignature] = useState<File>();
  const [scannedQr, setScannedQr] = useState<SupplierQRCode>();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ocrProof, setOcrProof] = useState("");
  const [ocrMessage, setOcrMessage] = useState("");
  const [location, setLocation] = useState<{ latitude: string; longitude: string; accuracy: string }>();
  const [locating, setLocating] = useState(false);
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
  const qrCode = useMemo(
    () => scannedQr && scannedQr.project === draft.project && scannedQr.supplier === draft.supplier
      ? scannedQr
      : (dockets.data?.results ?? []).find(
        (row) => row.is_active && row.project === draft.project && row.supplier === draft.supplier,
      ),
    [dockets.data, draft.project, draft.supplier, scannedQr],
  );

  const qrScan = useMutation({
    mutationFn: scanQRCode,
    onSuccess: (code) => {
      setScannedQr(code);
      setDraft((old) => ({
        ...old,
        project: code.project,
        supplier: code.supplier,
      }));
      setError("");
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

  const ocr = useMutation({
    mutationFn: ({ project, image }: { project: string; image: File }) =>
      readDeliveryNote(project, image),
    onSuccess: (result) => {
      setOcrProof(result.proof);
      const doubtful = result.low_confidence_fields ?? [];
      setOcrMessage(
        doubtful.length > 0
          ? t("material.ocrLowConfidence", {
              fields: doubtful
                .map((field) => t(`material.ocrField.${field}`))
                .join(", "),
            })
          : t("material.ocrReady"),
      );
      setDraft((old) => ({
        ...old,
        deliveryNoteNo: result.suggestions.delivery_note_no || old.deliveryNoteNo,
        vehiclePlate: result.suggestions.vehicle_plate || old.vehiclePlate,
        materialName: result.suggestions.material_name || old.materialName,
        quantity: numericSuggestion(result.suggestions.quantity) || old.quantity,
      }));
    },
    onError: (reason) => {
      setOcrProof("");
      setOcrMessage(
        reason instanceof ApiError ? reason.message : t("material.ocrManual"),
      );
    },
  });

  function inspectDeliveryNote(image?: File) {
    setOcrProof("");
    setOcrMessage("");
    if (!image) return;
    if (!draft.project) {
      setOcrMessage(t("material.ocrChooseProject"));
      return;
    }
    if (!navigator.onLine) {
      setOcrMessage(t("material.ocrOffline"));
      return;
    }
    ocr.mutate({ project: draft.project, image });
  }

  const captureLocation = async () => {
    setLocating(true);
    setError("");
    try {
      const fix = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        }),
      );
      setLocation({
        latitude: fix.coords.latitude.toFixed(7),
        longitude: fix.coords.longitude.toFixed(7),
        accuracy: fix.coords.accuracy.toFixed(2),
      });
    } catch {
      setError(t("error.location"));
    } finally {
      setLocating(false);
    }
  };

  const save = useMutation({
    mutationFn: () => {
      if (!user || !location || !receiverSignature || !supplierSignature) {
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
          quantity: draft.quantity,
          unit: draft.unit,
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
      onSaved();
    },
    onError: (reason) => setError(
      reason instanceof ApiError ? reason.message : t("error.action"),
    ),
  });

  const valid = Boolean(
    draft.project &&
      draft.supplier &&
      draft.materialName.trim() &&
      Number(draft.quantity) > 0 &&
      (draft.movementType === "ENTRY" ||
        (draft.returnReason &&
          (draft.returnReason !== "OTHER" || draft.returnReasonOther.trim()))) &&
      hasRequiredFieldEvidence(materialEvidence) &&
      receiverSignature &&
      supplierSignature &&
      location,
  );

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <Button
        className="h-14 w-full text-base"
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
            setScannedQr(undefined);
            setOcrProof("");
            setMaterialEvidence(createEmptyFieldEvidence());
            setDraft((old) => ({ ...old, project }));
          }}
          placeholder={t("material.chooseProject")}
          className="h-12 w-full"
        />
      </FieldWrapper>
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
        {draft.project && draft.supplier && (
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
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label={t("material.vehicle")}><Input value={draft.vehiclePlate} onChange={(event) => setDraft((old) => ({ ...old, vehiclePlate: event.target.value.toUpperCase() }))} /></FieldWrapper>
        <FieldWrapper label={t("material.doNo")}><Input value={draft.deliveryNoteNo} onChange={(event) => setDraft((old) => ({ ...old, deliveryNoteNo: event.target.value }))} /></FieldWrapper>
      </div>
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
              inspectDeliveryNote(nextDeliveryNote);
            }
          }}
        />
      </FieldWrapper>
      {(ocr.isPending || ocrMessage) && (
        <p className={`rounded-lg px-3 py-2 text-sm ${ocrProof ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
          {ocr.isPending ? t("material.ocrReading") : ocrMessage}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSignaturePad label={t("material.receiverSignature")} clearLabel={t("action.clearSignature")} value={receiverSignature} onChange={setReceiverSignature} />
        <FieldSignaturePad label={t("material.supplierSignature")} clearLabel={t("action.clearSignature")} value={supplierSignature} onChange={setSupplierSignature} />
      </div>
      <Button className="h-12 w-full" variant="outline" disabled={locating} onClick={() => void captureLocation()}>
        {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        {location ? t("attendance.locationReady") : t("attendance.getLocation")}
      </Button>
      <Textarea value={draft.notes} onChange={(event) => setDraft((old) => ({ ...old, notes: event.target.value }))} placeholder={t("material.notes")} />
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="h-14 w-full text-base" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
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
  const [project, setProject] = useState(initialProject);
  const [evidence, setEvidence] = useState(createEmptyFieldEvidence);
  const [category, setCategory] = useState("RFI");
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<Coordinates>();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const photos = completedFieldEvidence(evidence);
  const evidenceLabels = [
    t("consultantEvidence.overview"),
    t("consultantEvidence.detail"),
    t("consultantEvidence.location"),
    t("consultantEvidence.reference"),
  ];

  const locate = async () => {
    setLocating(true);
    setError("");
    try {
      const fix = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        }),
      );
      setLocation({
        latitude: fix.coords.latitude.toFixed(7),
        longitude: fix.coords.longitude.toFixed(7),
        accuracy: fix.coords.accuracy.toFixed(2),
      });
    } catch {
      setError(t("error.location"));
    } finally {
      setLocating(false);
    }
  };

  const save = useMutation({
    mutationFn: () => {
      if (!user || !location) throw new Error("missing_evidence");
      return submitConsultantSubmissionOfflineAware(user.id, {
        project,
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
          onValueChange={setProject}
          placeholder={t("consultantCapture.chooseProject")}
          className="h-12 w-full"
        />
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
      <Button
        className="h-12 w-full"
        variant="outline"
        disabled={locating}
        onClick={() => void locate()}
      >
        {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        {location ? t("attendance.locationReady") : t("attendance.getLocation")}
      </Button>
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
        className="h-14 w-full text-base"
        disabled={!project || !category || !hasRequiredFieldEvidence(evidence) || !location || save.isPending}
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
  const [project, setProject] = useState(initialProject);
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState(createEmptyFieldEvidence);
  const [location, setLocation] = useState<Coordinates>();
  const [locating, setLocating] = useState(false);
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

  const locate = async () => {
    setLocating(true);
    setError("");
    try {
      const fix = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        });
      });
      setLocation({
        latitude: fix.coords.latitude.toFixed(7),
        longitude: fix.coords.longitude.toFixed(7),
        accuracy: fix.coords.accuracy.toFixed(2),
      });
    } catch {
      setError(t("form.locationFailed"));
    } finally {
      setLocating(false);
    }
  };

  const quantityIncomplete = quantity.trim() !== "" && unit === "";
  const ready =
    Boolean(user && project && category && location) &&
    hasRequiredFieldEvidence(evidence) &&
    !quantityIncomplete;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{t("form.help")}</p>
      <FieldWrapper label={t("field.project")} required>
        <ProjectPicker
          value={project}
          onValueChange={setProject}
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
      </FieldWrapper>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label={t("field.quantity")} optional={t("field.optional")}>
          <Input className="h-12" type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("field.unit")} optional={t("field.optional")} error={quantityIncomplete ? t("field.unitRequired") : undefined}>
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
      <Button className="h-12 w-full" variant="outline" disabled={locating} onClick={() => void locate()}>
        {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        {location ? t("field.locationReady") : t("action.locate")}
      </Button>
      {location && <p className="text-center text-xs tabular-nums text-muted-foreground">{location.latitude}, {location.longitude}</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="h-14 w-full text-base" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Recycle />}
        {t("action.submit")}
      </Button>
    </div>
  );
}
