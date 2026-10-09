"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Info, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useFinishForm } from "@/components/shared/dialog-navigation";
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
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/interfaces/api";
import type { Driver, DriverPayload } from "@/interfaces/recycler";
import { getDriver, getVehicles, updateDriver } from "@/services/recycler.service";

/**
 * Correcting a driver already in the address book.
 *
 * No 新增司机 and no login any more (「我觉得司机账号可以直接移除了」,
 * 「新增司机和新增车辆也是可以移除了」): a driver is typed in 接单与派车 and
 * works each trip from its link. This form fixes a name or phone, records the
 * licence, and takes a driver off the roster.
 */
export function DriverForm({ driver }: { driver: Driver }) {
  const t = useTranslations();
  const finish = useFinishForm();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [driverPhoto, setDriverPhoto] = useState<File | null>(null);
  const [licencePhoto, setLicencePhoto] = useState<File | null>(null);

  const vehicles = useQuery({
    queryKey: ["vehicles", "options"],
    queryFn: () => getVehicles({ page_size: 100, is_active: "true" }),
  });
  const mutation = useMutation({
    mutationFn: (values: DriverPayload) =>
      updateDriver(driver.id, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      finish("/drivers");
    },
  });

  const form = useForm({
    defaultValues: {
      driver_no: driver?.driver_no ?? "",
      full_name: driver?.full_name ?? "",
      phone: driver?.phone ?? "",
      ic_no: driver?.ic_no ?? "",
      licence_no: driver?.licence_no ?? "",
      licence_expires_on: driver?.licence_expires_on ?? "",
      emergency_contact: driver?.emergency_contact ?? "",
      notes: driver?.notes ?? "",
      default_vehicle: driver?.default_vehicle ?? "",
      is_on_leave: driver?.is_on_leave ?? false,
      is_active: driver?.is_active ?? true,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      // The server refuses a missing lorry, and the answer is already here,
      // so say it now rather than after a round trip.
      if (!value.default_vehicle) {
        setFormError(t("drivers.vehicleRequired"));
        toast.error(t("drivers.vehicleRequired"));
        return;
      }
      try {
        await mutation.mutateAsync({
          ...value,
          licence_expires_on: value.licence_expires_on || null,
          default_vehicle: value.default_vehicle,
          ...(licencePhoto ? { licence_photo: licencePhoto } : {}),
          ...(driverPhoto ? { photo: driverPhoto } : {}),
        });
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.isValidation) {
            const leftover = applyServerErrors(
              error.errors,
              form as unknown as Parameters<typeof applyServerErrors>[1],
            );
            if (leftover.length > 0) setFormError(leftover[0]);
            toast.error(
              leftover[0] ?? error.message,
            );
          } else {
            setFormError(error.message);
            toast.error(error.message);
          }
        }
      }
    },
  });

  return (
    <FormShell
      backHref="/drivers"
      backLabel={t("drivers.title")}
      title={t("drivers.editTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={t("common.save")}
      submitIcon={Save}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("drivers.section.identity")}>
        <form.Field name="driver_no">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.driverNo")}
              placeholder={t("drivers.field.driverNoAuto")}
              optional
            />
          )}
        </form.Field>
        <form.Field
          name="full_name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.fullName")}
              required
            />
          )}
        </form.Field>
        <form.Field
          name="phone"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.phone")}
              type="tel"
              required
            />
          )}
        </form.Field>
        <form.Field name="ic_no">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.icNo")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="emergency_contact">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.emergencyContact")}
              placeholder={t("drivers.field.emergencyContactExample")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="default_vehicle">
          {(field) => (
            <div className="space-y-1">
              <SelectField
                field={field as unknown as BoundField}
                label={t("drivers.field.defaultVehicle")}
                options={(vehicles.data?.results ?? []).map((vehicle) => ({
                  value: vehicle.id,
                  label: vehicle.plate_no,
                }))}
              />
              <QueryFailedNote query={vehicles} what={t("drivers.what.vehicles")} />
            </div>
          )}
        </form.Field>
        <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("drivers.vehicleRequiredHelp")}
        </p>
      </FormSection>

      <FormSection title={t("drivers.section.licence")}>
        <form.Field name="licence_no">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.licenceNo")}
              optional
            />
          )}
        </form.Field>
        <form.Field name="licence_expires_on">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.licenceExpires")}
              type="date"
              optional
            />
          )}
        </form.Field>
        <FieldWrapper label={t("drivers.field.licencePhoto")} optional={t("common.optional")}>
          <label className="flex min-h-20 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-sm font-medium hover:border-primary/40 hover:bg-primary/5">
            <ImageUp className="size-5 text-primary" />
            <span className="truncate">{licencePhoto?.name ?? t("drivers.field.choosePhoto")}</span>
            <Input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setLicencePhoto(event.target.files?.[0] ?? null)}
            />
          </label>
        </FieldWrapper>
        <FieldWrapper label={t("drivers.field.driverPhoto")} optional={t("common.optional")}>
          <label className="flex min-h-20 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-sm font-medium hover:border-primary/40 hover:bg-primary/5">
            <ImageUp className="size-5 text-primary" />
            <span className="truncate">{driverPhoto?.name ?? t("drivers.field.choosePhoto")}</span>
            <Input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setDriverPhoto(event.target.files?.[0] ?? null)}
            />
          </label>
        </FieldWrapper>
      </FormSection>

      <FormSection title={t("drivers.section.availability")}>
        <form.Field name="is_active">
          {(field) => (
            <ToggleField
              label={t("drivers.field.isActive")}
              description={t("drivers.field.isActiveHelp")}
              checked={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="is_on_leave">
          {(field) => (
            <ToggleField
              label={t("drivers.field.onLeave")}
              description={t("drivers.field.onLeaveHelp")}
              checked={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("drivers.field.notes")}
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
    <label className="flex min-h-20 items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function EditDriver({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["drivers", "detail", id],
    queryFn: () => getDriver(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isLoadingError || !data) {
    return <LoadErrorCard backHref="/drivers" backLabel={t("drivers.title")} />;
  }
  return <DriverForm driver={data} />;
}
