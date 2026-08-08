"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  ClipboardList,
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
import { useMemo, useState } from "react";

import {
  MaterialOutgoingWorkspace,
  SiteEquipmentWorkspace,
  SiteProgressWorkspace,
} from "@/components/contractor-ops/operations-workspaces";
import { SiteDisposalWorkspace } from "@/components/contractor-ops/site-disposal-workspaces";
import { useAuth } from "@/components/providers/auth-provider";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
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
} from "@/services/offline-sync.service";

type Coordinates = { latitude: string; longitude: string; accuracy: string };

type RecordMode =
  | "material"
  | "equipment"
  | "progress"
  | "disposal"
  | "outgoing"
  | "safety"
  | "consultant";

interface RecordOption {
  key: RecordMode | "consultant";
  permission: string;
  icon: typeof Camera;
  tone: string;
}

const RECORD_OPTIONS: RecordOption[] = [
  { key: "material", permission: "receipt.create", icon: ClipboardList, tone: "bg-info/10 text-info" },
  { key: "equipment", permission: "equipment.capture", icon: HardHat, tone: "bg-warning/15 text-warning" },
  { key: "progress", permission: "progress.manage", icon: ListChecks, tone: "bg-primary/10 text-primary" },
  { key: "disposal", permission: "disposal.submit", icon: Recycle, tone: "bg-success/10 text-success" },
  { key: "outgoing", permission: "material_outgoing.submit", icon: Truck, tone: "bg-destructive/10 text-destructive" },
  { key: "safety", permission: "safety.manage", icon: ShieldAlert, tone: "bg-warning/15 text-warning" },
  { key: "consultant", permission: "consultant.submit", icon: UserRoundCheck, tone: "bg-primary/10 text-primary" },
];

export function FieldRecordsPanel() {
  const t = useTranslations("fieldStaffPwa");
  const { can } = useAuth();
  const [mode, setMode] = useState<RecordMode | null>(null);
  const options = RECORD_OPTIONS.filter((option) => can(option.permission));

  if (mode === "material") {
    return <RecordFrame title={t("records.material")} onBack={() => setMode(null)}><MaterialCapturePanel onSaved={() => setMode(null)} /></RecordFrame>;
  }
  if (mode === "equipment") {
    return <RecordFrame title={t("records.equipment")} onBack={() => setMode(null)}><SiteEquipmentWorkspace /></RecordFrame>;
  }
  if (mode === "progress") {
    return <RecordFrame title={t("records.progress")} onBack={() => setMode(null)}><SiteProgressWorkspace /></RecordFrame>;
  }
  if (mode === "disposal") {
    return <RecordFrame title={t("records.disposal")} onBack={() => setMode(null)}><SiteDisposalWorkspace /></RecordFrame>;
  }
  if (mode === "outgoing") {
    return <RecordFrame title={t("records.outgoing")} onBack={() => setMode(null)}><MaterialOutgoingWorkspace /></RecordFrame>;
  }
  if (mode === "safety") {
    return <RecordFrame title={t("records.safety")} onBack={() => setMode(null)}><Safety /></RecordFrame>;
  }
  if (mode === "consultant") {
    return <RecordFrame title={t("records.consultant")} onBack={() => setMode(null)}><ConsultantCapturePanel onSaved={() => setMode(null)} /></RecordFrame>;
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
              onClick={() => setMode(option.key)}
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
  materialName: "",
  quantity: "",
  unit: "TONNE",
  vehiclePlate: "",
  deliveryNoteNo: "",
  notes: "",
};

function MaterialCapturePanel({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("fieldStaffPwa");
  const allT = useTranslations();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<MaterialDraft>(EMPTY_MATERIAL);
  const [deliveryNote, setDeliveryNote] = useState<File>();
  const [sitePhotos, setSitePhotos] = useState<File[]>([]);
  const [receiverSignature, setReceiverSignature] = useState<File>();
  const [supplierSignature, setSupplierSignature] = useState<File>();
  const [scannedQr, setScannedQr] = useState<SupplierQRCode>();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ocrProof, setOcrProof] = useState("");
  const [ocrMessage, setOcrMessage] = useState("");
  const [location, setLocation] = useState<{ latitude: string; longitude: string; accuracy: string }>();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

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

  const ocr = useMutation({
    mutationFn: ({ project, image }: { project: string; image: File }) =>
      readDeliveryNote(project, image),
    onSuccess: (result) => {
      setOcrProof(result.proof);
      setOcrMessage(t("material.ocrReady"));
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

  function selectDeliveryNote(files: File[]) {
    const image = files[0];
    setDeliveryNote(image);
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
          material_name: draft.materialName.trim(),
          quantity: draft.quantity,
          unit: draft.unit,
          vehicle_plate: draft.vehiclePlate.trim(),
          delivery_note_no: draft.deliveryNoteNo.trim(),
          notes: draft.notes.trim(),
          received_by_name: user.full_name,
          original_captured_at: new Date().toISOString(),
          client_event_id: eventId,
          latitude: location.latitude,
          longitude: location.longitude,
          location_accuracy_m: location.accuracy,
          ocr_proof: ocrProof || undefined,
        },
        signature: receiverSignature,
        supplierSignature,
        deliveryNotePhoto: deliveryNote,
        sitePhotos,
        deviceId: fieldDeviceId(),
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
      deliveryNote &&
      sitePhotos.length > 0 &&
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
            setDeliveryNote(undefined);
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
      <FieldWrapper label={t("material.name")} required><Input className="h-12" value={draft.materialName} onChange={(event) => setDraft((old) => ({ ...old, materialName: event.target.value }))} /></FieldWrapper>
      <FieldWrapper label={t("material.quantity")} required><Input className="h-12" type="number" min="0" step="0.001" inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft((old) => ({ ...old, quantity: event.target.value }))} /></FieldWrapper>
      <div className="grid grid-cols-2 gap-3">
        <FieldWrapper label={t("material.vehicle")}><Input value={draft.vehiclePlate} onChange={(event) => setDraft((old) => ({ ...old, vehiclePlate: event.target.value.toUpperCase() }))} /></FieldWrapper>
        <FieldWrapper label={t("material.doNo")}><Input value={draft.deliveryNoteNo} onChange={(event) => setDraft((old) => ({ ...old, deliveryNoteNo: event.target.value }))} /></FieldWrapper>
      </div>
      <CameraField label={t("material.doPhoto")} fileCount={deliveryNote ? 1 : 0} onChange={selectDeliveryNote} />
      {(ocr.isPending || ocrMessage) && (
        <p className={`rounded-lg px-3 py-2 text-sm ${ocrProof ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
          {ocr.isPending ? t("material.ocrReading") : ocrMessage}
        </p>
      )}
      <CameraField label={t("material.sitePhotos")} multiple fileCount={sitePhotos.length} onChange={setSitePhotos} />
      <div className="grid grid-cols-2 gap-3">
        <CameraField label={t("material.receiverSignature")} fileCount={receiverSignature ? 1 : 0} onChange={(files) => setReceiverSignature(files[0])} />
        <CameraField label={t("material.supplierSignature")} fileCount={supplierSignature ? 1 : 0} onChange={(files) => setSupplierSignature(files[0])} />
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

function ConsultantCapturePanel({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<Coordinates>();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

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
        captured_at: new Date().toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
        device_id: fieldDeviceId(),
        client_event_id: crypto.randomUUID(),
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
      <CameraField
        label={t("consultantCapture.photos")}
        multiple
        fileCount={photos.length}
        onChange={setPhotos}
      />
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
        disabled={!project || photos.length === 0 || !location || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="animate-spin" /> : <UserRoundCheck />}
        {t("consultantCapture.submit")}
      </Button>
    </div>
  );
}

function CameraField({
  label,
  multiple = false,
  fileCount,
  onChange,
}: {
  label: string;
  multiple?: boolean;
  fileCount: number;
  onChange: (files: File[]) => void;
}) {
  const t = useTranslations("fieldStaffPwa");
  return (
    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 p-3 text-center">
      <Camera className="size-7 text-primary" />
      <span className="mt-2 text-sm font-semibold">{label}</span>
      <span className="mt-1 text-xs text-muted-foreground">{fileCount ? t("material.photoReady", { count: fileCount }) : t("material.tapCamera")}</span>
      <input
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
      />
    </label>
  );
}

function fieldDeviceId(): string {
  const key = "mse-field-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}
