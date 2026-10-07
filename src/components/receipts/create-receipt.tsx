"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  SelectField,
  TextAreaField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import {
  FormSection,
  FormShell,
  FormSkeleton,
  LoadErrorCard,
  applyServerErrors,
  required,
} from "@/components/shared/form-shell";
import { FieldWrapper, ReadField } from "@/components/shared/page-primitives";
import { ProjectColumnPicker } from "@/components/site-operations/project-column-picker";
import { ApiError } from "@/interfaces/api";
import {
  type MaterialReceiptDetail,
  type MaterialReceiptPayload,
  type MaterialUnit,
} from "@/interfaces/contractor";
import { ManufacturerPicker } from "@/components/shared/manufacturer-picker";
import { useMaterialUnits, useUnitName } from "@/hooks/use-material-units";
import { correctReceipt, getReceipt } from "@/services/contractor.service";

/**
 * The delivery correction form.
 *
 * Correcting only (2026-10 A1, X9): 「后台不需要新增材料进场」. A delivery is
 * recorded on the phone at the gate; the office's own 「记录材料进场」 form and
 * its `/receipts/create` address are gone, and the backend refuses an office
 * account's `create_receipt`. What the office still does is put a filed
 * delivery right, here.
 *
 * On a correction the project, the supplier and the docket are shown but not
 * editable. The backend refuses to change them, and for the same reason: they
 * are what the receipt is evidence of. Only the figures a clerk can honestly
 * have got wrong stay open.
 *
 * A correction files a *new* receipt that points back at the original, so both
 * figures survive. This screen used to send the edit to `update_receipt`, an
 * endpoint that exists only to refuse - the form filled in, the button pressed,
 * and a 409 every single time (F-129).
 */
function CorrectReceiptForm({ receipt }: { receipt: MaterialReceiptDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  // One id for the whole attempt, so a retry after a dropped connection
  // returns the correction already filed instead of filing a second one.
  const correctionEvent = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: MaterialReceiptPayload & { reason?: string }) => {
      correctionEvent.current ??= crypto.randomUUID();
      return correctReceipt(receipt.id, {
        ...values,
        reason: values.reason ?? "",
        client_event_id: correctionEvent.current,
      });
    },
    // A correction is a new record with a new id. Landing on it is the point:
    // the clerk sees the figure that was actually filed, not the one they typed.
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
      router.push(`/receipts/${saved.id}`);
    },
  });

  // The company's unit list (2026-10 A4), plus the receipt's own unit when
  // it has since been switched off - a correction must not lose it.
  // query-failure: the receipt's own unit is always offered below, so the correction still saves
  const units = useMaterialUnits();
  const unitName = useUnitName();
  const unitOptions = [
    ...(units.data ?? []).map((row) => ({ value: row.code, label: unitName(row.code, row.label) })),
    ...((units.data ?? []).some((row) => row.code === receipt.unit) || !receipt.unit
      ? []
      : [{ value: receipt.unit, label: unitName(receipt.unit, receipt.unit_label) }]),
  ];
  const form = useForm({
    defaultValues: {
      project: receipt.project ?? "",
      category: receipt.category ?? "",
      material_name: receipt.material_name ?? "",
      material_specification: receipt.material_specification ?? "",
      quantity: receipt.quantity ?? "",
      unit: (receipt.unit ?? "TONNE") as MaterialUnit,
      // Whose make (2026-10 D1): a wrong factory is put right like the rest.
      manufacturer: receipt.manufacturer ?? "",
      total_weight_kg: receipt.total_weight_kg ?? "",
      unit_price: receipt.unit_price ?? "",
      // The DO's money, which the material budget counts (2026-10 A6): OCR
      // misreads it and a worker may mistype it, so a correction can fix it.
      document_amount: receipt.document_amount ?? "",
      vehicle_plate: receipt.vehicle_plate ?? "",
      delivery_note_no: receipt.delivery_note_no ?? "",
      notes: receipt.notes ?? "",
      received_by_name: receipt.received_by_name ?? "",
      // A delivery filed as the wrong type is put right here (B10): a new
      // linked record, never the original rewritten.
      movement_type: (receipt.movement_type ?? "ENTRY") as "ENTRY" | "RETURN",
      return_reason: receipt.return_reason ?? "",
      reason: "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);

      // A price left blank means "not recorded", which is a null rather than
      // an empty string the API would read as a malformed decimal.
      const common = {
        material_name: value.material_name,
        material_specification: value.material_specification,
        quantity: value.quantity,
        unit: value.unit,
        total_weight_kg: value.total_weight_kg || null,
        unit_price: value.unit_price || null,
        document_amount: value.document_amount || null,
        vehicle_plate: value.vehicle_plate,
        delivery_note_no: value.delivery_note_no,
        notes: value.notes,
        received_by_name: value.received_by_name,
        category: value.category,
        manufacturer: value.manufacturer || null,
      };

      try {
        await mutation.mutateAsync({
          ...common,
          movement_type: value.movement_type,
          return_reason: value.movement_type === "RETURN" ? value.return_reason.trim() : "",
          reason: value.reason,
        } as MaterialReceiptPayload & { reason: string });
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          const leftover = applyServerErrors(
            error.errors,
            form as unknown as Parameters<typeof applyServerErrors>[1],
          );
          if (leftover.length > 0) setFormError(leftover[0]);
        }
      }
    },
  });

  return (
    <FormShell
      backHref="/receipts"
      backLabel={t("receipts.title")}
      title={t("receipts.editTitle")}
      description={t("receipts.editNote")}
      isSubmitting={mutation.isPending}
      submitLabel={t("common.save")}
      submitIcon={Save}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("receipts.section.delivery")}>
        <ReadField
          label={t("receipts.field.project")}
          value={receipt.project_name}
        />
        <ReadField
          label={t("receipts.field.supplier")}
          value={receipt.supplier_name}
        />
        <form.Subscribe selector={(state) => state.values.project}>
          {(project) => (
            <form.Field name="category" validators={{ onSubmit: required(t("validation.required")) }}>
              {(field) => <ProjectColumnPicker project={project} kind="MATERIAL" value={field.state.value} onChange={field.handleChange} />}
            </form.Field>
          )}
        </form.Subscribe>
        <form.Field name="manufacturer">
          {(field) => (
            <FieldWrapper label={t("manufacturers.column")}>
              <ManufacturerPicker value={field.state.value} onChange={field.handleChange} />
            </FieldWrapper>
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("receipts.correction.title")}>
          <form.Field
            name="reason"
            validators={{ onSubmit: required(t("validation.required")) }}
          >
            {(field) => (
              <TextAreaField
                field={field as unknown as BoundField}
                label={t("receipts.correction.reason")}
                required
                className="md:col-span-2"
              />
            )}
          </form.Field>
          <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("receipts.correction.note")}
          </p>
        </FormSection>

      <FormSection title={t("receipts.section.material")}>
        <form.Field
          name="material_name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.materialName")}
              required
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field name="material_specification">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.materialSpecification")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field
          name="quantity"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.quantity")}
              type="number"
              required
            />
          )}
        </form.Field>

        <form.Field name="unit">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("receipts.field.unit")}
              options={unitOptions}
              required
            />
          )}
        </form.Field>

        <form.Field name="movement_type">
            {(field) => (
              <SelectField
                field={field as unknown as BoundField}
                label={t("receipts.field.movementType")}
                options={(["ENTRY", "RETURN"] as const).map((value) => ({
                  value,
                  label: t(`receipts.movement.${value}`),
                }))}
                required
              />
            )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.movement_type}>
            {(movementType) =>
              movementType === "RETURN" ? (
                <form.Field name="return_reason" validators={{ onSubmit: required(t("validation.required")) }}>
                  {(field) => (
                    <TextField
                      field={field as unknown as BoundField}
                      label={t("receipts.field.returnReason")}
                      required
                    />
                  )}
                </form.Field>
              ) : null
            }
        </form.Subscribe>

        <form.Field name="total_weight_kg">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.totalWeightKg")}
              type="number"
              optional
            />
          )}
        </form.Field>

        <form.Field name="unit_price">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.unitPrice")}
              type="number"
              optional
            />
          )}
        </form.Field>

        <form.Field name="document_amount">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.documentAmount")}
              type="number"
              optional
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("receipts.section.vehicle")}>
        <form.Field name="vehicle_plate">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.vehiclePlate")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="delivery_note_no">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.deliveryNoteNo")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("receipts.field.notes")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("receipts.section.received")}>
        <form.Field
          name="received_by_name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("receipts.field.receivedBy")}
              required
            />
          )}
        </form.Field>

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}

/** Fetches the record, then hands it to the correction form. */
export function EditReceipt({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["receipts", "detail", id],
    queryFn: () => getReceipt(id),
  });

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/receipts" backLabel={t("receipts.title")} />;
  }
  return <CorrectReceiptForm receipt={data} />;
}
