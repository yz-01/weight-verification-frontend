"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { ReadField } from "@/components/shared/page-primitives";
import { ApiError } from "@/interfaces/api";
import {
  MATERIAL_UNITS,
  type MaterialReceiptDetail,
  type MaterialReceiptPayload,
  type MaterialUnit,
} from "@/interfaces/contractor";
import {
  createReceipt,
  getProjects,
  getQRCodes,
  getReceipt,
  getSuppliers,
  updateReceipt,
} from "@/services/contractor.service";

/**
 * The delivery form, shared by recording and correcting.
 *
 * On a correction the project, the supplier and the docket are shown but not
 * editable. The backend refuses to change them, and for the same reason: they
 * are what the receipt is evidence of. Only the figures a clerk can honestly
 * have got wrong stay open.
 */
export function CreateReceipt({ receipt }: { receipt?: MaterialReceiptDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = receipt !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const { data: projectPage } = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100 }),
    enabled: !isEdit,
  });
  const { data: supplierPage } = useQuery({
    queryKey: ["suppliers", "options"],
    queryFn: () => getSuppliers({ page_size: 100 }),
    enabled: !isEdit,
  });
  const { data: docketPage } = useQuery({
    queryKey: ["qr-codes", "all"],
    queryFn: () => getQRCodes({ page_size: 200 }),
    enabled: !isEdit,
  });

  const mutation = useMutation({
    mutationFn: (values: MaterialReceiptPayload) =>
      isEdit ? updateReceipt(receipt.id, values) : createReceipt(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
      router.push("/receipts");
    },
  });

  const form = useForm({
    defaultValues: {
      project: receipt?.project ?? "",
      supplier: receipt?.supplier ?? "",
      material_name: receipt?.material_name ?? "",
      quantity: receipt?.quantity ?? "",
      unit: (receipt?.unit ?? "TONNE") as MaterialUnit,
      unit_price: receipt?.unit_price ?? "",
      vehicle_plate: receipt?.vehicle_plate ?? "",
      delivery_note_no: receipt?.delivery_note_no ?? "",
      notes: receipt?.notes ?? "",
      received_by_name: receipt?.received_by_name ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);

      // A price left blank means "not recorded", which is a null rather than
      // an empty string the API would read as a malformed decimal.
      const common = {
        material_name: value.material_name,
        quantity: value.quantity,
        unit: value.unit,
        unit_price: value.unit_price || null,
        vehicle_plate: value.vehicle_plate,
        delivery_note_no: value.delivery_note_no,
        notes: value.notes,
        received_by_name: value.received_by_name,
      };

      try {
        if (isEdit) {
          await mutation.mutateAsync(common as MaterialReceiptPayload);
          return;
        }

        // The docket for this exact pair, when one has been issued. Sending it
        // is what ties the receipt back to the printed slip; the backend
        // refuses any docket that names a different project or supplier.
        const docket = (docketPage?.results ?? []).find(
          (row) =>
            row.is_active &&
            row.project === value.project &&
            row.supplier === value.supplier,
        );

        await mutation.mutateAsync({
          ...common,
          project: value.project,
          supplier: value.supplier,
          qr_code: docket?.id ?? null,
        });
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
      title={isEdit ? t("receipts.editTitle") : t("receipts.createTitle")}
      description={isEdit ? t("receipts.editNote") : t("receipts.stampNote")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("receipts.section.delivery")}>
        {isEdit ? (
          <>
            <ReadField
              label={t("receipts.field.project")}
              value={receipt.project_name}
            />
            <ReadField
              label={t("receipts.field.supplier")}
              value={receipt.supplier_name}
            />
          </>
        ) : (
          <>
            <form.Field
              name="project"
              validators={{ onSubmit: required(t("validation.required")) }}
            >
              {(field) => (
                <SelectField
                  field={field as unknown as BoundField}
                  label={t("receipts.field.project")}
                  options={(projectPage?.results ?? []).map((project) => ({
                    value: project.id,
                    label: `${project.code} — ${project.name}`,
                  }))}
                  required
                />
              )}
            </form.Field>

            <form.Field
              name="supplier"
              validators={{ onSubmit: required(t("validation.required")) }}
            >
              {(field) => (
                <SelectField
                  field={field as unknown as BoundField}
                  label={t("receipts.field.supplier")}
                  options={(supplierPage?.results ?? []).map((supplier) => ({
                    value: supplier.id,
                    label: supplier.name,
                  }))}
                  required
                />
              )}
            </form.Field>
          </>
        )}
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
              options={MATERIAL_UNITS.map((unit) => ({
                value: unit,
                label: t(`receipts.unit.${unit}`),
              }))}
              required
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

        {!isEdit && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("receipts.stampNote")}
          </p>
        )}

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}

/** Fetches the record, then hands it to the shared form. */
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
  return <CreateReceipt receipt={data} />;
}
