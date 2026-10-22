"use client";

/**
 * 设备退场 on the phone, the way material leaves site (2026-10 I13, ID30).
 *
 * 「手机端的设备退场流程是和材料出场是一样的流程，现有出场流程倒反了」 (the client,
 * 2026-10-13), and again 10-15: 「先拍照申请，批准了再安排球场拍照扫二维码双方
 * 签名提交」. So two steps on the phone, with the office between them:
 *
 * 1. `EquipmentExitApplyDialog` - the machine on site, why, a photo. The
 *    office fills the Return Note and approves it (or returns it).
 * 2. `EquipmentExitHandoverDialog` - once approved (已批准 / 等待退场): the
 *    photographs, the DO, **this machine's QR scanned** (it must be the one
 *    that was approved, ID60), the supplier's QR if there is one, both
 *    signatures and the GPS fix. The office then confirms it; only then is
 *    the machine off site.
 *
 * Both work with no signal, through the phone's queue. Neither shows a red
 * star (2026-10 I22, ID56: 「设备进场和出场那个红点不要」): what is needed is
 * said in a line under each field, and the submit button names what is still
 * missing.
 *
 * `MachineScanButton` is the 「扫描设备二维码」 beside the machine dropdown
 * (I24, ID60): it reads the system's own sticker or any sticker that names the
 * machine, and says why when the machine cannot be chosen.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Check, CheckCircle2, Keyboard, Loader2, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldDraft, useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import {
  completedFieldEvidence,
  createEmptyFieldEvidence,
  FIELD_EVIDENCE_PHOTO_COUNT,
  FieldEvidenceGrid,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { LocationField } from "@/components/field-staff/location-field";
import { SupplierQrScanner } from "@/components/field-staff/supplier-qr-scanner";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldCamera } from "@/components/shared/field-camera";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { SupplierPicker } from "@/components/shared/supplier-picker";
import {
  SupplierReturnBadge,
  type ReturnBadgeSupplier,
} from "@/components/suppliers/supplier-return-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { DeliveryNoteReadStatus, useDeliveryNoteReader } from "@/hooks/use-delivery-note-reader";
import { ApiError } from "@/interfaces/api";
import type { SiteEquipment } from "@/interfaces/contractor-ops";
import type { LocationFix } from "@/lib/field-location";
import { matchScanned, registerScanKeys } from "@/lib/machine-scan";
import { scanSupplierQr } from "@/services/contractor.service";
import { lookupEquipmentByScan, ocrEquipmentDeliveryNote } from "@/services/contractor-ops.service";
import {
  newClientEventId,
  queuedEquipmentExit,
  submitEquipmentMovementOfflineAware,
} from "@/services/offline-sync.service";

/** At least four photographs at the actual exit, the DO photo counted in. */
const HANDOVER_PHOTO_MIN = 4;

/** What a machine is shown and checked by on the phone. */
export interface ExitMachine {
  id: string;
  code: string;
  name: string;
  site_no?: string | null;
  registration_no?: string | null;
  serial_no?: string | null;
}

/** 「编号 · 名称 · 车牌」, as the phone names a machine. */
export function exitMachineLabel(machine: ExitMachine): string {
  return [machine.site_no || "", machine.name, machine.registration_no || ""]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What a failed submit says. A failure with a code says the translated
 * sentence for that code (P-phonefix): the server's field errors are its own
 * English and were shown first, so a Malay or Chinese phone read English.
 * Field errors only when there is no code to translate.
 */
export function errorText(failure: unknown, fallback: string): string {
  if (failure instanceof ApiError) {
    if (failure.code && failure.message) return failure.message;
    const fields = Object.values(failure.errors).filter(Boolean).join(" ");
    return fields || failure.message || fallback;
  }
  return fallback;
}

/**
 * 申请退场 (I13 step 1): the machine on site, why it is going, a photo. The
 * GPS fix goes with it when the phone has one; it is not asked for here - the
 * actual exit asks.
 */
export function EquipmentExitApplyDialog({
  project,
  machine,
  fieldTaskId,
  onClose,
  onSaved,
}: {
  project: string;
  machine: ExitMachine;
  fieldTaskId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const { user } = useAuth();
  // An application for this machine already on this phone, waiting for
  // signal: said so, not asked for a second time.
  // query-failure: a phone that cannot read its own queue shows the form, as before
  const queued = useQuery({
    queryKey: ["equipment-exit", "queued-apply", machine.id],
    queryFn: () => queuedEquipmentExit(user!.id, { equipment: machine.id }),
    enabled: Boolean(user?.id),
  });
  const key = (name: string) => `exitApply:${machine.id}:${name}`;
  const [reason, setReason] = useDraftState(key("reason"), "");
  const [photos, setPhotos] = useDraftState<File[]>(key("photos"), []);
  const [clientEventId, setClientEventId] = useDraftState(key("clientEventId"), "");
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      // One id for this application, kept with its draft: every try is the
      // same application to the server.
      const eventId = clientEventId || newClientEventId("equipment-exit-apply");
      if (!clientEventId) setClientEventId(eventId);
      return submitEquipmentMovementOfflineAware(user.id, {
        apply_exit: true,
        project,
        equipment: machine.id,
        direction: "EXIT",
        operator_name: user.full_name,
        notes: reason.trim(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy_m: location?.accuracy,
        field_task: fieldTaskId,
        original_occurred_at: new Date().toISOString(),
        client_event_id: eventId,
        photos,
      });
    },
    onMutate: () => setError(""),
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
    onError: (failure) => setError(errorText(failure, t("equipmentExit.applyFailed"))),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("equipmentExit.applyTitle", { name: exitMachineLabel(machine) })}</DialogTitle>
          <DialogDescription>{t("equipmentExit.applyHelp")}</DialogDescription>
        </DialogHeader>
        {queued.data ? (
          <p role="status" className="rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm">
            {t("equipmentExit.applyQueued")}
          </p>
        ) : (
        <>
        <div className="grid gap-4">
          <FieldWrapper
            label={t("equipmentExit.reason")}
            required="quiet"
            hint={t("equipmentExit.reasonHint")}
          >
            <Textarea
              rows={3}
              aria-label={t("equipmentExit.reason")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("equipmentExit.applyPhotos")}
            required="quiet"
            hint={t("equipmentExit.applyPhotosHint")}
          >
            <FieldCamera
              label={t("equipmentExit.applyPhotos")}
              fileCount={photos.length}
              onCapture={(file) => setPhotos((items) => [...items, file])}
              onClear={() => setPhotos([])}
            />
          </FieldWrapper>
          <LocationField
            label={t("field.location")}
            actionLabel={t("action.getLocation")}
            readyLabel={t("action.locationReady")}
            hint={t("equipmentExit.applyLocationHint")}
            value={location}
            onChange={setLocation}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [reason.trim(), t("equipmentExit.reason")],
              [photos.length > 0, t("equipmentExit.applyPhotos")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {t("equipmentExit.applySubmit")}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 实际退场 of an approved exit (I13 step 3), from 设备进退场 or from the
 * exit's row in 我提交过的 - the same draft either way, so a half-done exit is
 * where the worker left it.
 */
export function EquipmentExitHandoverDialog({
  movementId,
  project,
  machine,
  onClose,
  onSaved,
}: {
  movementId: string;
  project: string;
  machine: ExitMachine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const { user } = useAuth();
  // query-failure: a phone that cannot read its own queue shows the form, as before
  const queued = useQuery({
    queryKey: ["equipment-exit", "queued", movementId],
    queryFn: () => queuedEquipmentExit(user!.id, { movement: movementId }),
    enabled: Boolean(user?.id),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("equipmentExit.handoverTitle", { name: exitMachineLabel(machine) })}</DialogTitle>
          <DialogDescription>{t("equipmentExit.handoverHelp")}</DialogDescription>
        </DialogHeader>
        {queued.data ? (
          <p role="status" className="rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-sm">
            {t("equipmentExit.handoverQueued")}
          </p>
        ) : (
          <FieldDraft scope={`equipment-exit:${movementId}`}>
            <EquipmentExitHandoverForm
              movementId={movementId}
              project={project}
              machine={machine}
              onClose={onClose}
              onSaved={onSaved}
            />
          </FieldDraft>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The actual exit's form, inside its own draft (exported for its tests). */
export function EquipmentExitHandoverForm({
  movementId,
  project,
  machine,
  onClose,
  onSaved,
}: {
  movementId: string;
  project: string;
  machine: ExitMachine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps");
  const field = useTranslations("fieldStaffPwa");
  const { user } = useAuth();
  const isFieldStaff = Boolean(user?.is_field_staff);
  const key = (name: string) => `exitHandover:${movementId}:${name}`;
  const [fieldEvidence, setFieldEvidence] = useDraftState(key("evidence"), createEmptyFieldEvidence);
  const [photos, setPhotos] = useDraftState<File[]>(key("photos"), []);
  const [deliveryNotePhoto, setDeliveryNotePhoto] = useDraftState<File | undefined>(key("doPhoto"));
  const [deliveryNote, setDeliveryNote] = useDraftState(key("doNo"), "");
  // The lorry that takes it away, typed at the gate (J13-3, Q13-2): many big
  // machines have no plate of their own, so the register's is only a hint.
  const [vehiclePlate, setVehiclePlate] = useDraftState(key("vehiclePlate"), "");
  const [ocrProof, setOcrProof] = useDraftState(key("ocrProof"), "");
  const [scanned, setScanned] = useDraftState(key("scanned"), "");
  // 「二维码坏了 / 还没有贴？输入编号」 (P-phonefix), as on 设备工时 (I4).
  const [typedNumber, setTypedNumber] = useDraftState(key("typedNumber"), false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [supplier, setSupplier] = useDraftState<ReturnBadgeSupplier | null>(key("supplier"), null);
  const [receiverSignature, setReceiverSignature] = useDraftState<File | undefined>(key("siteSignature"));
  const [supplierSignature, setSupplierSignature] = useDraftState<File | undefined>(key("supplierSignature"));
  const [clientEventId, setClientEventId] = useDraftState(key("clientEventId"), "");
  const clearDraft = useClearDraft();
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [scanning, setScanning] = useState<"machine" | "supplier" | null>(null);
  const [scanNote, setScanNote] = useState("");
  const [error, setError] = useState("");
  const fieldPhotos = completedFieldEvidence(fieldEvidence);
  const submissionPhotos = isFieldStaff ? fieldPhotos : photos;
  const ocr = useDeliveryNoteReader({
    read: ocrEquipmentDeliveryNote,
    onRead: (result, typed) => {
      setOcrProof(result.proof ?? "");
      const suggestions = result.suggestions as Record<string, string | undefined>;
      // A DO number typed while the read ran is the worker's.
      if (suggestions.delivery_note_no && !typed.has("deliveryNote")) {
        setDeliveryNote(suggestions.delivery_note_no);
      }
    },
    onReset: () => setOcrProof(""),
  });
  const supplierScan = useMutation({
    mutationFn: (token: string) => scanSupplierQr(token),
    onMutate: () => setError(""),
    onSuccess: (row) =>
      setSupplier({ id: row.id, name: row.name, completed_return_count: row.completed_return_count }),
    onError: (failure) => setError(errorText(failure, t("equipment.scanFailed"))),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Authentication required.");
      const eventId = clientEventId || newClientEventId("equipment-exit");
      if (!clientEventId) setClientEventId(eventId);
      return submitEquipmentMovementOfflineAware(user.id, {
        exit_handover: true,
        movement: movementId,
        scanned_equipment: scanned,
        equipment_typed: typedNumber || undefined,
        project,
        equipment: machine.id,
        direction: "EXIT",
        operator_name: user.full_name,
        supplier: supplier?.id,
        delivery_note_no: deliveryNote.trim(),
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
        ocr_confirmed: Boolean(deliveryNotePhoto || deliveryNote.trim()),
        ocr_proof: deliveryNotePhoto && ocrProof ? ocrProof : undefined,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy_m: location?.accuracy,
        original_occurred_at: new Date().toISOString(),
        client_event_id: eventId,
        photos: submissionPhotos,
        delivery_note_photo: deliveryNotePhoto,
        receiver_signature: receiverSignature,
        supplier_signature: supplierSignature,
      });
    },
    onMutate: () => setError(""),
    onSuccess: () => {
      clearDraft();
      onSaved();
    },
    onError: (failure) => setError(errorText(failure, t("equipmentExit.handoverFailed"))),
  });
  /** A typed site no / code / plate, read like a scan: this machine or no. */
  const takeTyped = () => {
    const text = typed.trim();
    if (!text) return;
    if (matchScanned(text, [machine], registerScanKeys)) {
      setScanned(text);
      setTypedNumber(true);
      setTyping(false);
      setTyped("");
      setScanNote("");
    } else {
      setScanNote(t("equipmentExit.typedWrongMachine", { name: exitMachineLabel(machine) }));
    }
  };
  const photoCount = submissionPhotos.length + (deliveryNotePhoto ? 1 : 0);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* The machine's own QR first (ID60): the right machine is going. */}
        <FieldWrapper
          label={t("equipmentExit.scanMachine")}
          required="quiet"
          hint={t("equipmentExit.scanMachineHint")}
          className="sm:col-span-2"
        >
          {scanned ? (
            <p className="flex min-h-10 items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span className="min-w-0 flex-1 truncate">
                {t(typedNumber ? "equipmentExit.typedMatched" : "equipmentExit.scanMatched", {
                  name: exitMachineLabel(machine),
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setScanned("");
                  setTypedNumber(false);
                }}
              >
                {t("equipmentExit.scanAgain")}
              </Button>
            </p>
          ) : typing ? (
            <div className="flex items-center gap-2">
              <Input
                className="h-12 min-w-0 flex-1"
                value={typed}
                maxLength={40}
                aria-label={t("equipmentExit.typeNumber")}
                autoCapitalize="characters"
                autoComplete="off"
                enterKeyHint="go"
                placeholder={t("equipmentExit.typeNumber")}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setScanNote("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") takeTyped();
                }}
              />
              <Button type="button" className="h-12 shrink-0" onClick={takeTyped}>
                {t("equipmentExit.useNumber")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full"
              onClick={() => {
                setScanNote("");
                setScanning("machine");
              }}
            >
              <ScanLine />
              {t("equipmentExit.scanMachine")}
            </Button>
          )}
          {!scanned && !typing && (
            <button
              type="button"
              className="mt-1 flex w-full items-center justify-center gap-1.5 py-1 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => {
                setScanNote("");
                setTyping(true);
              }}
            >
              <Keyboard className="size-4" />
              {t("equipmentExit.brokenQr")}
            </button>
          )}
          {scanNote && (
            <p role="alert" className="mt-1 text-xs font-medium text-destructive">
              {scanNote}
            </p>
          )}
        </FieldWrapper>
        <FieldWrapper
          label={t("field.photos")}
          required="quiet"
          hint={t("equipmentExit.photosHint", { min: HANDOVER_PHOTO_MIN })}
          className="sm:col-span-2"
        >
          {isFieldStaff ? (
            <FieldEvidenceGrid
              labels={[
                t("equipmentEvidence.overview"),
                t("equipmentEvidence.identity"),
                t("equipmentEvidence.transport"),
                t("equipmentEvidence.condition"),
              ]}
              files={fieldEvidence}
              progressLabel={t("evidenceProgress", {
                current: fieldPhotos.length,
                required: FIELD_EVIDENCE_PHOTO_COUNT,
              })}
              onChange={setFieldEvidence}
            />
          ) : (
            <FieldCamera
              label={t("field.photos")}
              fileCount={photos.length}
              onCapture={(file) => setPhotos((items) => [...items, file])}
              onClear={() => setPhotos([])}
            />
          )}
        </FieldWrapper>
        <FieldWrapper label={t("equipment.deliveryNotePhoto")} className="sm:col-span-2">
          <FieldCamera
            label={deliveryNotePhoto ? t("equipment.deliveryNoteReady") : t("equipment.takeDeliveryNote")}
            file={deliveryNotePhoto}
            fileCount={deliveryNotePhoto ? 1 : 0}
            onCapture={(image) => {
              setDeliveryNotePhoto(image);
              ocr.inspect(project, image);
            }}
            onClear={() => {
              setDeliveryNotePhoto(undefined);
              ocr.cancel();
            }}
          />
          <DeliveryNoteReadStatus reader={ocr} className="mt-2" />
        </FieldWrapper>
        <FieldWrapper
          label={t("field.deliveryNoteNo")}
          required="quiet"
          hint={t("equipmentExit.deliveryNoteHint")}
        >
          <Input
            aria-label={t("field.deliveryNoteNo")}
            value={deliveryNote}
            onChange={(event) => {
              ocr.noteTyped("deliveryNote");
              setDeliveryNote(event.target.value);
            }}
          />
        </FieldWrapper>
        <FieldWrapper
          label={t("equipmentExit.vehiclePlate")}
          required="quiet"
          hint={t("equipmentExit.vehiclePlateHint")}
        >
          <Input
            aria-label={t("equipmentExit.vehiclePlate")}
            value={vehiclePlate}
            maxLength={50}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder={machine.registration_no || undefined}
            onChange={(event) => setVehiclePlate(event.target.value)}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.supplier")} hint={t("equipmentExit.supplierHint")}>
          {supplier ? (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{supplier.name}</span>
              <SupplierReturnBadge supplier={supplier} />
              <Button size="sm" variant="ghost" onClick={() => setSupplier(null)}>
                {t("action.remove")}
              </Button>
            </div>
          ) : (
            // Scan its QR card, or pick it from the list (J13-4, Q13-3):
            // both fill the same supplier.
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full"
                disabled={supplierScan.isPending}
                onClick={() => setScanning("supplier")}
              >
                {supplierScan.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
                {t("equipment.scanSupplier")}
              </Button>
              <SupplierPicker
                value=""
                placeholder={t("equipmentExit.supplierPick")}
                triggerClassName="h-10 w-full"
                onChange={(id, row) => {
                  if (id) setSupplier({ id, name: row?.name ?? "", completed_return_count: row?.completed_return_count });
                }}
              />
            </div>
          )}
        </FieldWrapper>
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <FieldSignaturePad
            label={t("equipment.siteSignature")}
            clearLabel={field("action.clearSignature")}
            required="quiet"
            hint={t("equipmentExit.signatureHint")}
            value={receiverSignature}
            onChange={setReceiverSignature}
          />
          <FieldSignaturePad
            label={t("equipment.supplierSignature")}
            clearLabel={field("action.clearSignature")}
            required="quiet"
            hint={t("equipmentExit.signatureHint")}
            value={supplierSignature}
            onChange={setSupplierSignature}
          />
        </div>
        <LocationField
          className="sm:col-span-2"
          label={t("field.location")}
          actionLabel={t("action.getLocation")}
          readyLabel={t("action.locationReady")}
          required="quiet"
          hint={t("equipmentExit.locationHint")}
          value={location}
          onChange={setLocation}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("action.cancel")}
        </Button>
        <Button
          requires={[
            [scanned, t("equipmentExit.scanMachine")],
            [
              isFieldStaff
                ? hasRequiredFieldEvidence(fieldEvidence)
                : photoCount >= HANDOVER_PHOTO_MIN,
              t("field.photos"),
            ],
            [deliveryNote.trim(), t("field.deliveryNoteNo")],
            [vehiclePlate.trim(), t("equipmentExit.vehiclePlate")],
            [receiverSignature, t("equipment.siteSignature")],
            [supplierSignature, t("equipment.supplierSignature")],
            [location, t("field.location")],
          ]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
          {t("equipmentExit.handoverSubmit")}
        </Button>
      </DialogFooter>
      <SupplierQrScanner
        open={scanning === "machine"}
        raw
        labels={{
          title: t("equipmentExit.scanMachine"),
          help: t("equipmentExit.scanMachineHelp"),
          image: t("equipmentExit.scanMachineImage"),
        }}
        onClose={() => setScanning(null)}
        onDetected={(text) => {
          setScanning(null);
          // The approved machine and no other (ID60). Read here, so it works
          // with no signal; the server reads it again.
          if (matchScanned(text, [machine], registerScanKeys)) {
            setScanned(text);
            setTypedNumber(false);
            setScanNote("");
          } else {
            setScanNote(t("equipmentExit.scanWrongMachine", { name: exitMachineLabel(machine) }));
          }
        }}
      />
      <SupplierQrScanner
        open={scanning === "supplier"}
        onClose={() => setScanning(null)}
        onDetected={(token) => {
          setScanning(null);
          supplierScan.mutate(token);
        }}
      />
    </>
  );
}

/**
 * 「扫描设备二维码」 beside the machine dropdown (I24, ID60).
 *
 * Read on the phone first - the list of this project's machines is already
 * there, so it works with no signal - then, when no machine here matches,
 * asked of the server, which says whether it is a machine of another project
 * or nothing it knows. A machine that cannot be chosen this way (on site for
 * an entry, not on site for an exit) is named with the reason.
 */
export function MachineScanButton({
  project,
  machines,
  offered,
  going,
  disabled,
  onChosen,
}: {
  project: string;
  /** Every working machine of this project. */
  machines: readonly SiteEquipment[];
  /** The ones the dropdown offers now. */
  offered: readonly SiteEquipment[];
  going: boolean;
  disabled?: boolean;
  onChosen: (machine: SiteEquipment) => void;
}) {
  const t = useTranslations("contractorOps");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const lookup = useMutation({
    mutationFn: (text: string) => lookupEquipmentByScan(text, project),
    onSuccess: (row) => {
      // Registered on this project since the list was read: read again.
      setNote(t("equipmentExit.scanNotOffered", { name: row.name }));
    },
    onError: (failure) =>
      setNote(
        failure instanceof ApiError && !failure.isNetwork
          ? failure.message
          : t("equipmentExit.scanUnknownOffline"),
      ),
  });
  const decide = (text: string) => {
    setNote("");
    const found = matchScanned(text, machines, registerScanKeys);
    if (!found) {
      lookup.mutate(text);
      return;
    }
    if (offered.some((row) => row.id === found.id)) {
      onChosen(found);
      return;
    }
    setNote(
      t(going ? "equipmentExit.scanNotOnSite" : "equipmentExit.scanAlreadyOnSite", {
        name: found.name,
      }),
    );
  };
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full"
        disabled={disabled || lookup.isPending}
        disabledReason={disabled ? t("field.chooseProjectFirst") : undefined}
        onClick={() => setOpen(true)}
        data-testid="field-equipment-scan"
      >
        {lookup.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
        {t("equipmentExit.scanToChoose")}
      </Button>
      {note && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {note}
        </p>
      )}
      <SupplierQrScanner
        open={open}
        raw
        labels={{
          title: t("equipmentExit.scanToChoose"),
          help: t("equipmentExit.scanToChooseHelp"),
          image: t("equipmentExit.scanMachineImage"),
        }}
        onClose={() => setOpen(false)}
        onDetected={(text) => {
          setOpen(false);
          decide(text);
        }}
      />
    </div>
  );
}
