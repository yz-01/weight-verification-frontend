"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
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
      make_model: vehicle?.make_model ?? "",
      max_laden_kg: vehicle?.max_laden_kg ?? "",
      road_tax_expires_on: vehicle?.road_tax_expires_on ?? "",
      permit_expires_on: vehicle?.permit_expires_on ?? "",
      notes: vehicle?.notes ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          max_laden_kg: value.max_laden_kg || null,
          road_tax_expires_on: value.road_tax_expires_on || null,
          permit_expires_on: value.permit_expires_on || null,
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
        <form.Field name="make_model">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("vehicles.field.makeModel")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("vehicles.section.limits")}>
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

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}

export function EditVehicle({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vehicles", "detail", id],
    queryFn: () => getVehicle(id),
  });

  if (isLoading) return <FormSkeleton sections={2} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/vehicles" backLabel={t("vehicles.title")} />;
  }
  return <CreateVehicle vehicle={data} />;
}
