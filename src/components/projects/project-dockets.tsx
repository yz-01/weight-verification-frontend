"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, Eye, Loader2, Plus, QrCode, XCircle } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, LoadFailed, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import type { DeliveryNote, MaterialUnit, Supplier } from "@/interfaces/contractor";
import type { ProjectCategory } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { getProjectCategories } from "@/services/contractor-ops.service";
import {
  cancelDeliveryNote,
  closeDeliveryNote,
  getDeliveryNotes,
  getSuppliers,
  issueDeliveryNote,
  voidDeliveryNote,
} from "@/services/contractor.service";

const UNITS: MaterialUnit[] = ["TONNE", "KG", "M3", "PIECE", "LOAD", "BAG"];

export function ProjectDockets({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [issuing, setIssuing] = useState(false);
  const [viewingQr, setViewingQr] = useState<DeliveryNote | null>(null);
  const [viewingResult, setViewingResult] = useState<DeliveryNote | null>(null);
  const [stopping, setStopping] = useState<{ note: DeliveryNote; action: "cancel" | "void" } | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["delivery-notes", projectId],
    queryFn: () => getDeliveryNotes({ project: projectId, page_size: 100 }),
  });
  const rows = data?.results ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["delivery-notes", projectId] });
  const close = useMutation({ mutationFn: closeDeliveryNote, onSuccess: refresh });
  const stop = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "cancel" | "void"; note: string }) =>
      action === "cancel" ? cancelDeliveryNote(id, note) : voidDeliveryNote(id, note),
    onSuccess: async () => {
      await refresh();
      setStopping(null);
      setReason("");
    },
  });

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{t("qrCodes.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("qrCodes.description")}</p>
        </div>
        {can("receipt.create") && (
          <Button size="sm" className="shrink-0" onClick={() => setIssuing(true)}>
            <Plus />
            {t("qrCodes.new")}
          </Button>
        )}
      </div>

      <div className="divide-y border-t">
        {isLoading ? (
          <div className="grid min-h-32 place-items-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError ? (
          <LoadFailed className="m-4" what={t("qrCodes.what.notes")} onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t("qrCodes.count", { count: 0 })}
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{row.note_no}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {row.supplier_name} / {row.material_name} / {row.vehicle_plate}
                </p>
                <p className="text-xs text-muted-foreground">
                  {df.date(row.expected_delivery_at)} / {row.expected_quantity} {row.unit}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={t(`deliveryNotePublic.status.${row.status}`)} tone={noteTone(row.status)} />
                {row.qr_url && (
                  <Button variant="outline" size="sm" onClick={() => setViewingQr(row)}>
                    <QrCode />
                    {t("qrCodes.viewQr")}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setViewingResult(row)}>
                  <Eye />
                  {t("qrCodes.viewResult")}
                </Button>
                {row.status === "COMPLETED" && can("receipt.update") && (
                  <Button size="sm" disabled={close.isPending} onClick={() => close.mutate(row.id)}>
                    {close.isPending ? <Loader2 className="animate-spin" /> : null}
                    {t("qrCodes.close")}
                  </Button>
                )}
                {row.status === "ISSUED" && can("receipt.update") && (
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setStopping({ note: row, action: "cancel" })}>
                    <XCircle />
                    {t("qrCodes.cancel")}
                  </Button>
                )}
                {row.status === "ARRIVED" && can("receipt.update") && (
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setStopping({ note: row, action: "void" })}>
                    <Ban />
                    {t("qrCodes.void")}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {issuing && (
        <IssueDeliveryNoteDialog
          projectId={projectId}
          onClose={() => setIssuing(false)}
          onSaved={(note) => {
            setIssuing(false);
            setViewingQr(note);
            void refresh();
          }}
        />
      )}
      {viewingQr && <DeliveryNoteQrDialog note={viewingQr} onClose={() => setViewingQr(null)} />}
      {viewingResult && <DeliveryNoteResultDialog note={viewingResult} onClose={() => setViewingResult(null)} />}
      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStopping(null);
            setReason("");
          }
        }}
        title={t(stopping?.action === "cancel" ? "qrCodes.cancelDialog.title" : "qrCodes.voidDialog.title")}
        description={t(stopping?.action === "cancel" ? "qrCodes.cancelDialog.description" : "qrCodes.voidDialog.description")}
        confirmLabel={t(stopping?.action === "cancel" ? "qrCodes.cancel" : "qrCodes.void")}
        confirmIcon={stopping?.action === "cancel" ? XCircle : Ban}
        variant="destructive"
        isPending={stop.isPending}
        reason={reason}
        onReasonChange={setReason}
        reasonRequired
        onConfirm={() => {
          if (!stopping) return;
          stop.mutate({ id: stopping.note.id, action: stopping.action, note: reason });
        }}
      />
    </div>
  );
}

function IssueDeliveryNoteDialog({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: (note: DeliveryNote) => void;
}) {
  const t = useTranslations();
  const [supplier, setSupplier] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<MaterialUnit>("TONNE");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  // Optional on purpose: a project that has not set up its columns yet
  // must still be able to raise a docket (the receipt files as unsorted).
  const [category, setCategory] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suppliers = useQuery({
    queryKey: ["suppliers", "delivery-note-options", projectId],
    queryFn: () => getSuppliers({ page_size: 200 }),
  });
  const categories = useQuery({
    queryKey: ["project-categories", "delivery-note-options", projectId],
    // A delivery note names the material column its receipt will file into
    // once the load is signed for, so it offers the columns a delivery can
    // actually be filed in. The backend now refuses a site-record column here
    // (T-161), which would have made those options a dropdown that always
    // errored.
    queryFn: () =>
      getProjectCategories({ project: projectId, page_size: 200, kind: "MATERIAL" }),
  });
  const creation = useMutation({
    mutationFn: () => issueDeliveryNote({
      project: projectId,
      supplier,
      vehicle_plate: vehiclePlate.trim(),
      driver_name: driverName.trim(),
      material_name: materialName.trim(),
      expected_quantity: quantity,
      unit,
      expected_delivery_at: new Date(expectedAt).toISOString(),
      notes: notes.trim(),
      ...(category ? { category } : {}),
    }),
    onSuccess: onSaved,
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors({ ...error.errors, form: error.message });
      } else {
        setErrors({ form: error instanceof Error ? error.message : t("errors.generic") });
      }
    },
  });
  const options: Supplier[] = suppliers.data?.results ?? [];

  function submit() {
    const nextErrors: Record<string, string> = {};
    if (!supplier) nextErrors.supplier = t("qrCodes.required.supplier");
    if (!vehiclePlate.trim()) nextErrors.vehicle_plate = t("qrCodes.required.vehicle");
    if (!driverName.trim()) nextErrors.driver_name = t("qrCodes.required.driver");
    if (!materialName.trim()) nextErrors.material_name = t("qrCodes.required.material");
    if (!quantity || Number(quantity) <= 0) nextErrors.expected_quantity = t("qrCodes.required.quantity");
    if (!expectedAt) nextErrors.expected_delivery_at = t("qrCodes.required.expectedAt");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) creation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("qrCodes.createTitle")}</DialogTitle>
          <DialogDescription>{t("qrCodes.formHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("qrCodes.field.supplier")} required error={errors.supplier}>
            <Select value={supplier} onValueChange={(value) => { setSupplier(value); setErrors((current) => ({ ...current, supplier: "", form: "" })); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("qrCodes.chooseSupplier")} /></SelectTrigger>
              <SelectContent>{options.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
            </Select>
            <QueryFailedNote query={suppliers} what={t("qrCodes.what.suppliers")} />
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.vehicle")} required error={errors.vehicle_plate}>
            <Input value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())} />
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.driver")} required error={errors.driver_name}>
            <Input value={driverName} onChange={(event) => setDriverName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.material")} required error={errors.material_name}>
            <Input value={materialName} onChange={(event) => setMaterialName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.quantity")} required error={errors.expected_quantity}>
            <Input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.unit")} required error={errors.unit}>
            <Select value={unit} onValueChange={(value) => setUnit(value as MaterialUnit)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.expectedAt")} required error={errors.expected_delivery_at} className="sm:col-span-2">
            <Input type="datetime-local" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.category")} optional={t("common.optional")} error={errors.category} className="sm:col-span-2" hint={t("qrCodes.categoryHelp")}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("qrCodes.chooseCategory")} /></SelectTrigger>
              <SelectContent>{(categories.data?.results ?? []).map((row: ProjectCategory) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
            </Select>
            <QueryFailedNote query={categories} what={t("qrCodes.what.categories")} />
          </FieldWrapper>
          <FieldWrapper label={t("qrCodes.field.notes")} optional={t("common.optional")} error={errors.notes} className="sm:col-span-2">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FieldWrapper>
        </div>
        {errors.form && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errors.form}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={creation.isPending || suppliers.isLoading} onClick={submit}>
            {creation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("qrCodes.new")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryNoteQrDialog({ note, onClose }: { note: DeliveryNote; onClose: () => void }) {
  const t = useTranslations();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const download = () => {
    if (!qrRef.current) return;
    const link = document.createElement("a");
    link.download = `${note.note_no}.png`;
    link.href = qrRef.current.toDataURL("image/png");
    link.click();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{note.note_no}</DialogTitle>
          <DialogDescription>{note.supplier_name} / {note.material_name}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto rounded-lg border bg-white p-4">
          <QRCodeCanvas ref={qrRef} value={note.qr_url ?? ""} size={240} level="H" marginSize={1} />
        </div>
        <p className="break-all text-center text-xs text-muted-foreground">{note.qr_url}</p>
        <DialogFooter>
          <Button variant="outline" onClick={download}><Download />{t("qrCodes.downloadPng")}</Button>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryNoteResultDialog({ note, onClose }: { note: DeliveryNote; onClose: () => void }) {
  const t = useTranslations();
  const resultReady = note.status === "COMPLETED" || note.status === "CLOSED";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{note.note_no}</DialogTitle>
          <DialogDescription>{note.project_name} / {note.supplier_name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <ResultField label={t("qrCodes.field.material")} value={note.material_name} />
          <ResultField label={t("qrCodes.field.vehicle")} value={note.vehicle_plate} />
          <ResultField label={t("qrCodes.field.driver")} value={note.driver_name} />
          <ResultField label={t("qrCodes.result.expectedQuantity")} value={`${note.expected_quantity} ${note.unit}`} />
          <ResultField label={t("qrCodes.result.actualQuantity")} value={note.actual_quantity ? `${note.actual_quantity} ${note.unit}` : "-"} />
          <ResultField label={t("qrCodes.result.receiptNo")} value={note.receipt_no ?? "-"} />
          <ResultField label={t("qrCodes.result.decision")} value={note.decision ? t(`deliveryNotePublic.decision.${note.decision}`) : "-"} />
          <ResultField label={t("qrCodes.result.receiver")} value={note.receiver_name || "-"} />
          <ResultField label={t("qrCodes.result.status")} value={t(`deliveryNotePublic.status.${note.status}`)} />
        </div>
        {!resultReady && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">{t("qrCodes.result.pending")}</p>}
        {note.rejection_reason && <ResultField label={t("deliveryNotePublic.field.rejectionReason")} value={note.rejection_reason} />}
        {note.evidence.length > 0 && (
          <div>
            <h3 className="mb-3 font-semibold">{t("qrCodes.result.evidence")}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {note.evidence.map((item) => (
                <a key={item.id} href={item.watermarked ?? item.image} target="_blank" rel="noreferrer" className="group block">
                  <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                    <Image src={item.watermarked ?? item.image} alt={t(`deliveryNotePublic.evidence.${item.kind}`)} fill unoptimized className="object-cover transition-transform group-hover:scale-105" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t(`deliveryNotePublic.evidence.${item.kind}`)}</p>
                </a>
              ))}
            </div>
          </div>
        )}
        {note.receiver_signature && (
          <Button variant="outline" asChild>
            <a href={note.receiver_signature} target="_blank" rel="noreferrer">{t("qrCodes.result.signature")}</a>
          </Button>
        )}
        <DialogFooter><Button onClick={onClose}>{t("common.close")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>;
}

function noteTone(status: DeliveryNote["status"]): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "COMPLETED" || status === "CLOSED") return "positive";
  if (status === "CANCELLED" || status === "VOIDED") return "danger";
  if (status === "ARRIVED") return "warning";
  return "info";
}
