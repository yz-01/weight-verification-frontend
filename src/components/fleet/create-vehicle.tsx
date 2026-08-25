"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Plus, Save } from "lucide-react";
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
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import {
  VEHICLE_TYPES,
  type Vehicle,
  type VehiclePayload,
  type VehicleType,
} from "@/interfaces/recycler";
import {
  createVehicle,
  getVehicle,
  updateVehicle,
} from "@/services/recycler.service";

/**
 * The lorry form, shared by create and edit.
 *
 * No tare field. It has its own action with its own permission and a mandatory
 * reason, because on a stored-tare yard it moves money on every future load —
 * it should not be changeable as a side effect of correcting a typo in the
 * make and model.
 */
export function CreateVehicle({ vehicle }: { vehicle?: Vehicle }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = vehicle !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: (values: VehiclePayload) =>
      isEdit ? updateVehicle(vehicle.id, values) : createVehicle(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      router.push("/vehicles");
    },
  });

  const form = useForm({
    defaultValues: {
      plate_no: vehicle?.plate_no ?? "",
      vehicle_type: (vehicle?.vehicle_type ?? "LORRY") as VehicleType,
      brand: vehicle?.brand ?? "",
      model: vehicle?.model ?? "",
      make_model: vehicle?.make_model ?? "",
      payload_capacity_kg: vehicle?.payload_capacity_kg ?? "",
      max_laden_kg: vehicle?.max_laden_kg ?? "",
      road_tax_expires_on: vehicle?.road_tax_expires_on ?? "",
      insurance_expires_on: vehicle?.insurance_expires_on ?? "",
      permit_expires_on: vehicle?.permit_expires_on ?? "",
      notes: vehicle?.notes ?? "",
      is_under_maintenance: vehicle?.is_under_maintenance ?? false,
      is_active: vehicle?.is_active ?? true,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          payload_capacity_kg: value.payload_capacity_kg || null,
          max_laden_kg: value.max_laden_kg || null,
          road_tax_expires_on: value.road_tax_expires_on || null,
          insurance_expires_on: value.insurance_expires_on || null,
          permit_expires_on: value.permit_expires_on || null,
          ...(photo ? { photo } : {}),
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
      backHref="/vehicles"
      backLabel={t("vehicles.title")}
      title={isEdit ? t("vehicles.editTitle") : t("vehicles.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("vehicles.section.identity")}>
        <form.Field
          name="plate_no"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.plateNo")}
              required
            />
          )}
        </form.Field>
        <form.Field name="vehicle_type">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("vehicles.field.vehicleType")}
              options={VEHICLE_TYPES.map((type) => ({
                value: type,
                label: t(`vehicles.type.${type}`),
              }))}
              required
            />
          )}
        </form.Field>
        <form.Field name="brand">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.brand")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="model">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.model")}
              optional
            />
          )}
        </form.Field>
        {vehicle?.make_model && !vehicle.brand && !vehicle.model && (
          <p className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground md:col-span-2">
            {t("vehicles.field.legacyMakeModel")}: {vehicle.make_model}
          </p>
        )}
      </FormSection>

      <FormSection title={t("vehicles.section.limits")}>
        <form.Field name="payload_capacity_kg">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.payloadCapacity")}
              type="number"
              min="0"
              step="0.01"
              optional
            />
          )}
        </form.Field>
        <form.Field name="max_laden_kg">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.maxLaden")}
              type="number"
              optional
            />
          )}
        </form.Field>
        <form.Field name="insurance_expires_on">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.insuranceExpires")}
              type="date"
              optional
            />
          )}
        </form.Field>
        <form.Field name="road_tax_expires_on">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.roadTaxExpires")}
              type="date"
              optional
            />
          )}
        </form.Field>
        <form.Field name="permit_expires_on">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.permitExpires")}
              type="date"
              optional
            />
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("vehicles.field.notes")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
        <FieldWrapper
          label={t("vehicles.field.photo")}
          optional={t("common.optional")}
          className="md:col-span-2"
        >
          <label className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm font-medium hover:border-primary/40 hover:bg-primary/5">
            <ImageUp className="h-5 w-5 text-primary" />
            <span className="truncate">{photo?.name ?? t("vehicles.field.choosePhoto")}</span>
            <Input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
          </label>
        </FieldWrapper>
      </FormSection>

      <FormSection title={t("vehicles.section.availability")}>
        <form.Field name="is_active">
          {(field) => (
            <ToggleField
              label={t("vehicles.field.isActive")}
              description={t("vehicles.field.isActiveHelp")}
              checked={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="is_under_maintenance">
          {(field) => (
            <ToggleField
              label={t("vehicles.field.maintenance")}
              description={t("vehicles.field.maintenanceHelp")}
              checked={field.state.value}
              onChange={field.handleChange}
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

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-20 items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function EditVehicle({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vehicles", "detail", id],
    queryFn: () => getVehicle(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/vehicles" backLabel={t("vehicles.title")} />;
  }
  return <CreateVehicle vehicle={data} />;
}
