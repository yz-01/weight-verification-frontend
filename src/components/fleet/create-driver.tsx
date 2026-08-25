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
import type { Driver, DriverPayload } from "@/interfaces/recycler";
import {
  createDriver,
  getDriverAccounts,
  getDriver,
  getVehicles,
  updateDriver,
} from "@/services/recycler.service";

/** The driver form, shared by create and edit. */
export function CreateDriver({ driver }: { driver?: Driver }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = driver !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const [driverPhoto, setDriverPhoto] = useState<File | null>(null);
  const [licencePhoto, setLicencePhoto] = useState<File | null>(null);

  const { data: vehiclePage } = useQuery({
    queryKey: ["vehicles", "options"],
    queryFn: () => getVehicles({ page_size: 100, is_active: "true" }),
  });
  const { data: accountPage } = useQuery({
    queryKey: ["driver-accounts", "options"],
    queryFn: () => getDriverAccounts({ page_size: 100 }),
  });

  const mutation = useMutation({
    mutationFn: (values: DriverPayload) =>
      isEdit ? updateDriver(driver.id, values) : createDriver(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      router.push("/drivers");
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
      user: driver?.user ?? "",
      account_email: "",
      account_password: "",
      login_idle_expiry_days: String(driver?.login_idle_expiry_days ?? 90),
      is_on_leave: driver?.is_on_leave ?? false,
      is_active: driver?.is_active ?? true,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          licence_expires_on: value.licence_expires_on || null,
          default_vehicle: value.default_vehicle || null,
          user: value.user || null,
          account_email: value.account_email.trim() || undefined,
          account_password: value.account_password || undefined,
          login_idle_expiry_days: Number(value.login_idle_expiry_days),
          ...(licencePhoto ? { licence_photo: licencePhoto } : {}),
          ...(driverPhoto ? { photo: driverPhoto } : {}),
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
      backHref="/drivers"
      backLabel={t("drivers.title")}
      title={isEdit ? t("drivers.editTitle") : t("drivers.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
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
            <SelectField
              field={field as unknown as BoundField}
              label={t("drivers.field.defaultVehicle")}
              optional
              options={(vehiclePage?.results ?? []).map((vehicle) => ({
                value: vehicle.id,
                label: vehicle.plate_no,
              }))}
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("drivers.section.account")}>
        <form.Field name="user">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("drivers.field.account")}
              optional
              options={(accountPage?.results ?? []).map((account) => ({
                value: account.id,
                label: `${account.full_name} (${account.email})`,
              }))}
            />
          )}
        </form.Field>
        {!driver?.user && (
          <>
            <form.Field name="account_email">
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("drivers.field.newAccountEmail")}
                  type="email"
                  optional
                  placeholder={t("auth.login.emailPlaceholder")}
                />
              )}
            </form.Field>
            <form.Field name="account_password">
              {(field) => (
                <TextField
                  field={field as unknown as BoundField}
                  label={t("drivers.field.initialPassword")}
                  type="password"
                  optional
                />
              )}
            </form.Field>
          </>
        )}
        <form.Field name="login_idle_expiry_days">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("drivers.field.loginIdleExpiryDays")}
              type="number"
              required
              placeholder="90"
            />
          )}
        </form.Field>
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
          <label className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm font-medium hover:border-primary/40 hover:bg-primary/5">
            <ImageUp className="h-5 w-5 text-primary" />
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
          <label className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm font-medium hover:border-primary/40 hover:bg-primary/5">
            <ImageUp className="h-5 w-5 text-primary" />
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
    <label className="flex min-h-20 items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ["drivers", "detail", id],
    queryFn: () => getDriver(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/drivers" backLabel={t("drivers.title")} />;
  }
  return <CreateDriver driver={data} />;
}
