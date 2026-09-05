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
  Plus,
  Recycle,
  ScanLine,
  ShieldAlert,
  Trash2,
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
  submitWasteOutgoingOfflineAware,
} from "@/services/offline-sync.service";
import {
  createMaterialColumn,
  getProjectCategories,
} from "@/services/contractor-ops.service";
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
  /**
   * The material column this delivery files under, or "" for unfiled.
   *
   * Empty is a real answer, not a missing one: a receipt with no column is
   * simply unfiled and can be filed later, which is why the picker below is
   * not a required field. Before T-161 it was the only answer this screen
   * could give - it never sent a column at all.
   */
  category: string;
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

/**
 * "No column chosen" as a Select value.
 *
 * A Radix `SelectItem` cannot carry an empty string, and unfiled is a real
 * choice here rather than the absence of one, so it needs a value of its own.
 */
const UNFILED_COLUMN = "__unfiled__";

const EMPTY_MATERIAL: MaterialDraft = {
  project: "",
  supplier: "",
  category: "",
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
  const [ocrLineItems, setOcrLineItems] = useState<DeliveryNoteOCRLineItem[]>([]);
  const [newColumnName, setNewColumnName] = useState("");
  const [columnError, setColumnError] = useState("");
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
  /**
   * Open a column for this delivery, and select it.
   *
   * Needs the network: the column is a row other people will file against, so
   * it cannot be minted offline and reconciled later without two workers
   * inventing the same column twice. Offline, the delivery is still taken -
   * unfiled - which is what the receipt model already allowed for.
   */
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
        return { kind: "DOCKET" as const, code: await scanQRCode(token) };
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

  const ocr = useMutation({
    mutationFn: ({ project, image }: { project: string; image: File }) =>
      readDeliveryNote(project, image),
    onSuccess: (result) => {
      setOcrProof(result.proof);
      const items = result.line_items ?? [];
      setOcrLineItems(items);
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
      const firstCategory = items[0]?.category_id ?? "";
      setDraft((old) => ({
        ...old,
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
    onError: (reason) => {
      setOcrProof("");
      setOcrLineItems([]);
      setOcrMessage(
        reason instanceof ApiError ? reason.message : t("material.ocrManual"),
      );
    },
  });

  function inspectDeliveryNote(image?: File) {
    setOcrProof("");
    setOcrMessage("");
    setOcrLineItems([]);
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
          // Null rather than "" when nothing is chosen: the serializer reads
          // an empty string as an invalid id, while null is the "unfiled"
          // the receipt model documents.
          category: draft.category || null,
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
            setScannedQr(undefined);
            setOcrProof("");
            setOcrLineItems([]);
            setMaterialEvidence(createEmptyFieldEvidence());
            setNewColumnName("");
            setColumnError("");
            // A column belongs to one site, so the one chosen for the old
            // project is not a valid answer for the new one.
            setDraft((old) => ({ ...old, project, category: "" }));
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
      {/* Which column this delivery files under, and a way to open one.
          Before T-161 this screen sent no column at all, so every delivery
          taken on site arrived unfiled however many columns the site had, and
          somebody in the office had to re-file each one by hand. */}
      <FieldWrapper label={t("material.column")}>
        <Select
          value={draft.category || UNFILED_COLUMN}
          onValueChange={(value) =>
            setDraft((old) => ({
              ...old,
              category: value === UNFILED_COLUMN ? "" : value,
            }))
          }
          disabled={!draft.project}
        >
          <SelectTrigger className="h-12 w-full">
            <SelectValue placeholder={t("material.chooseColumn")} />
          </SelectTrigger>
          <SelectContent>
            {/* Unfiled stays on offer. It is the honest answer when nobody at
                the gate knows where this belongs, and better than parking the
                delivery in an arbitrary column somebody later pays against. */}
            <SelectItem value={UNFILED_COLUMN}>
              {t("material.columnUnfiled")}
            </SelectItem>
            {columnRows.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.project && !columns.isLoading && !columnRows.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("material.noColumnsYet")}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <Input
            className="h-12"
            value={newColumnName}
            disabled={!draft.project}
            onChange={(event) => setNewColumnName(event.target.value)}
            placeholder={t("material.newColumnName")}
          />
          <Button
            className="h-12 shrink-0"
            variant="outline"
            requires={[
              [draft.project, t("material.project")],
              [newColumnName.trim(), t("material.newColumnName")],
            ]}
            disabled={columnCreation.isPending}
            onClick={() => openColumn(newColumnName.trim())}
          >
            {columnCreation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            {t("material.addColumn")}
          </Button>
        </div>
        {columnError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {columnError}
          </p>
        )}
      </FieldWrapper>
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
                  <Select
                    value={item.category_id || "none"}
                    onValueChange={(value) => {
                      const match = columnRows.find((row) => row.id === value);
                      updateLineItem(index, {
                        category_id: match?.id ?? null,
                        category_code: match?.code ?? "",
                        category_name: match?.name ?? "",
                        classified: Boolean(match),
                      });
                    }}
                  >
                    <SelectTrigger className="h-10 flex-1"><SelectValue placeholder={t("material.ocrItems.unclassified")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("material.ocrItems.unclassified")}</SelectItem>
                      {columnRows.map((column) => (
                        <SelectItem key={column.id} value={column.id}>
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSignaturePad label={t("material.receiverSignature")} clearLabel={t("action.clearSignature")} value={receiverSignature} onChange={setReceiverSignature} />
        <FieldSignaturePad label={t("material.supplierSignature")} clearLabel={t("action.clearSignature")} value={supplierSignature} onChange={setSupplierSignature} />
      </div>
      <FieldWrapper label={t("material.location")} required>
        <Button className="h-12 w-full" variant="outline" disabled={locating} onClick={() => void captureLocation()}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          {location ? t("attendance.locationReady") : t("attendance.getLocation")}
        </Button>
      </FieldWrapper>
      <Textarea value={draft.notes} onChange={(event) => setDraft((old) => ({ ...old, notes: event.target.value }))} placeholder={t("material.notes")} />
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="h-12 w-full text-sm" requires={[[draft.project, t("material.project")], [draft.supplier, t("material.supplier")], [draft.materialName, t("material.name")], [Number(draft.quantity) > 0, t("material.quantity")], [draft.movementType === "ENTRY" || draft.returnReason, t("material.returnReason")], [draft.movementType === "ENTRY" || draft.returnReason !== "OTHER" || draft.returnReasonOther, t("material.returnReasonOther")], [hasRequiredFieldEvidence(materialEvidence), t("materialEvidence.title")], [receiverSignature, t("material.receiverSignature")], [supplierSignature, t("material.supplierSignature")], [location, t("material.location")]]} disabled={save.isPending} onClick={() => save.mutate()}>
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
        className="h-12 w-full text-sm"
        requires={[
          [project, t("consultantCapture.project")],
          [category, t("consultantCapture.category")],
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
  const [project, setProject] = useState(initialProject);
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
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
        pickup_address: pickupAddress.trim() || undefined,
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
      <FieldWrapper
        label={t("field.pickupAddress")}
        optional={t("field.optional")}
        hint={t("field.pickupAddressHint")}
      >
        <Textarea
          rows={2}
          value={pickupAddress}
          onChange={(event) => setPickupAddress(event.target.value)}
        />
      </FieldWrapper>
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
      <FieldWrapper label={t("field.location")} required>
        <Button className="h-12 w-full" variant="outline" disabled={locating} onClick={() => void locate()}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          {location ? t("field.locationReady") : t("action.locate")}
        </Button>
      </FieldWrapper>
      {location && <p className="text-center text-xs tabular-nums text-muted-foreground">{location.latitude}, {location.longitude}</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button className="h-12 w-full text-sm" requires={[[project, t("field.project")], [category, t("field.category")], [!quantityIncomplete, t("field.unit")], [hasRequiredFieldEvidence(evidence), t("field.photos")], [location, t("field.location")]]} disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Recycle />}
        {t("action.submit")}
      </Button>
    </div>
  );
}
