"use client";

/**
 * The Return Note (2026-10 C9): what the office fills before an exit is
 * approved - the material, DO No., supplier, quantity, reason, and the
 * approver's name and drawn signature. The approve button stays off until it
 * is filled; the server refuses an approval without it too.
 *
 * Written for any record that leaves the site (X3): it reads only the note's
 * own fields, so an equipment exit can open the same dialog with its own
 * `save` - see `ReturnNoteSource`.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Loader2, Save } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { SupplierPicker } from "@/components/shared/supplier-picker";
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
import { useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import { useDateFormat } from "@/lib/dates";
import { fillReturnNote } from "@/services/contractor-ops.service";

/** What a record that can carry a Return Note brings to it (X3). */
export type ReturnNoteSource = Pick<
  MaterialOutgoing,
  | "id"
  | "reference_no"
  | "material_name"
  | "quantity"
  | "unit"
  | "reason"
  | "delivery_note_no"
  | "supplier"
  | "supplier_name"
  | "has_return_note"
  | "return_note_no"
  | "return_note_at"
  | "return_note_by_name"
  | "return_note_material"
  | "return_note_delivery_note_no"
  | "return_note_supplier"
  | "return_note_supplier_name"
  | "return_note_quantity"
  | "return_note_unit"
  | "return_note_reason"
  | "approver_name"
  | "approver_user_name"
  | "approver_signature"
> & { unit_label?: string | null };

export function ReturnNoteDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ReturnNoteSource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("contractorOps.returnNote");
  const field = useTranslations("fieldStaffPwa");
  const common = useTranslations("common");
  const unitName = useUnitName();
  const filled = Boolean(row.has_return_note);
  // Started from what the site applied for; once filled, from the note.
  const [form, setForm] = useState({
    material: filled ? row.return_note_material ?? "" : row.material_name ?? "",
    delivery_note_no: filled ? row.return_note_delivery_note_no ?? "" : row.delivery_note_no ?? "",
    supplier: (filled ? row.return_note_supplier : row.supplier) ?? "",
    quantity: filled ? String(Number(row.return_note_quantity ?? 0)) : String(Number(row.quantity ?? 0)),
    reason: filled ? row.return_note_reason ?? "" : row.reason ?? "",
    approver_name: row.approver_name ?? "",
  });
  const [signature, setSignature] = useState<File | undefined>();
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const set = (key: keyof typeof form, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  const unit = (filled ? row.return_note_unit : row.unit) || row.unit;
  const save = useMutation({
    mutationFn: () =>
      fillReturnNote(row.id, {
        material: form.material.trim(),
        delivery_note_no: form.delivery_note_no.trim(),
        supplier: form.supplier || undefined,
        quantity: form.quantity,
        unit,
        reason: form.reason.trim(),
        approver_name: form.approver_name.trim(),
        approver_signature: signature,
      }),
    onSuccess: onSaved,
    onError: (failure) => {
      if (failure instanceof ApiError && failure.code === "return_note_locked") {
        // Decided on another screen meanwhile (audit #16): say so in its own
        // words and bring this record up to date behind the dialog.
        setError(failure.message);
        void qc.invalidateQueries({ queryKey: ["material-outgoing"] });
        return;
      }
      setError(
        failure instanceof ApiError
          ? Object.values(failure.errors).join("; ") || failure.message
          : t("saveFailed"),
      );
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("title")} · {row.reference_no}
          </DialogTitle>
          <DialogDescription>{t("help")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("number")}>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
              {row.return_note_no || <span className="text-muted-foreground">{t("numberPending")}</span>}
            </div>
          </FieldWrapper>
          <FieldWrapper label={t("deliveryNoteNo")}>
            <Input
              value={form.delivery_note_no}
              onChange={(event) => set("delivery_note_no", event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("material")} required className="sm:col-span-2">
            <Input value={form.material} onChange={(event) => set("material", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("supplier")} className="sm:col-span-2">
            <SupplierPicker
              value={form.supplier}
              onChange={(supplier) => set("supplier", supplier)}
              knownName={filled ? row.return_note_supplier_name : row.supplier_name}
              placeholder={t("chooseSupplier")}
              allowNone
            />
          </FieldWrapper>
          <FieldWrapper label={`${t("quantity")} (${unitName(unit, row.unit_label)})`} required>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              inputMode="decimal"
              value={form.quantity}
              onChange={(event) => set("quantity", event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("approverName")}>
            <Input
              value={form.approver_name}
              placeholder={row.approver_user_name ?? undefined}
              onChange={(event) => set("approver_name", event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("reason")} required className="sm:col-span-2">
            <Textarea rows={2} value={form.reason} onChange={(event) => set("reason", event.target.value)} />
          </FieldWrapper>
          <div className="sm:col-span-2">
            <FieldSignaturePad
              label={t("approverSignature")}
              clearLabel={field("action.clearSignature")}
              required={!row.approver_signature}
              value={signature}
              onChange={setSignature}
            />
            {row.approver_signature && !signature ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("keepSignature")}</p>
            ) : null}
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            requires={[
              [form.material.trim(), t("material")],
              [Number(form.quantity) > 0, t("quantity")],
              [form.reason.trim(), t("reason")],
              [signature || row.approver_signature, t("approverSignature")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The note as it was filled, for the record's detail and the supplier's
 * returns list: one block, the approver's signature under it.
 */
export function ReturnNotePanel({ row }: { row: ReturnNoteSource }) {
  const t = useTranslations("contractorOps.returnNote");
  const df = useDateFormat();
  const unitName = useUnitName();
  return (
    <section className="rounded-lg border bg-card p-3" data-slot="return-note">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <FileSignature className="size-3.5" />
        {t("title")}
      </h3>
      {row.has_return_note ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">{t("number")}</dt>
            <dd className="font-medium">{row.return_note_no}</dd>
            <dt className="text-muted-foreground">{t("date")}</dt>
            <dd className="font-medium">{row.return_note_at ? df.dateTime(row.return_note_at) : "—"}</dd>
            <dt className="text-muted-foreground">{t("material")}</dt>
            <dd className="font-medium">{row.return_note_material || "—"}</dd>
            <dt className="text-muted-foreground">{t("deliveryNoteNo")}</dt>
            <dd className="font-medium">{row.return_note_delivery_note_no || "—"}</dd>
            <dt className="text-muted-foreground">{t("supplier")}</dt>
            <dd className="font-medium">{row.return_note_supplier_name || "—"}</dd>
            <dt className="text-muted-foreground">{t("quantity")}</dt>
            <dd className="font-medium">
              {row.return_note_quantity} {unitName(row.return_note_unit || row.unit, row.unit_label)}
            </dd>
            <dt className="text-muted-foreground">{t("reason")}</dt>
            <dd className="font-medium">{row.return_note_reason || "—"}</dd>
            <dt className="text-muted-foreground">{t("approverName")}</dt>
            <dd className="font-medium">{row.approver_name || row.approver_user_name || "—"}</dd>
            {row.return_note_by_name ? (
              <>
                <dt className="text-muted-foreground">{t("filledBy")}</dt>
                <dd className="font-medium">{row.return_note_by_name}</dd>
              </>
            ) : null}
          </dl>
          {row.approver_signature ? (
            <figure className="mt-2">
              <Image
                src={row.approver_signature}
                alt={t("approverSignature")}
                width={160}
                height={64}
                unoptimized
                className="h-16 w-40 rounded border bg-white object-contain"
              />
              <figcaption className="mt-0.5 text-[11px] text-muted-foreground">{t("approverSignature")}</figcaption>
            </figure>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("missing")}</p>
      )}
    </section>
  );
}
