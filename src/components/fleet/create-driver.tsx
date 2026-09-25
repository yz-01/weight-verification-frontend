"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Info, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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

  const vehicles = useQuery({
    queryKey: ["vehicles", "options"],
    queryFn: () => getVehicles({ page_size: 100, is_active: "true" }),
  });
  // `driver` keeps this driver's own login in the list. The endpoint hides
  // accounts that are already somebody's login — offering a taken one is a
  // choice that can only be refused — and without this the edit form's account
  // field would empty itself the moment it loaded.
  const accounts = useQuery({
    queryKey: ["driver-accounts", "options", driver?.id ?? ""],
    queryFn: () =>
      getDriverAccounts(
        driver ? { page_size: 100, driver: driver.id } : { page_size: 100 },
      ),
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
      // A driver without a login is a driver whose task list is empty forever,
      // with nothing on either screen to say why. Caught here as well as on
      // the server so the answer arrives before the round trip.
      if (!value.user && !(value.account_email.trim() && value.account_password)) {
        setFormError(t("drivers.accountRequired"));
        toast.error(t("drivers.accountRequired"));
        return;
      }
      // Same reason as the account above: the server refuses this, and the
      // answer is already here, so say it now rather than after a round trip.
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
          user: value.user || null,
          account_email: value.account_email.trim() || undefined,
          account_password: value.account_password || undefined,
          login_idle_expiry_days: Number(value.login_idle_expiry_days),
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
              leftover[0] ??
                error.errors.user ??
                error.errors.account_email ??
                error.errors.account_password ??
                error.message,
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
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("drivers.vehicleRequiredHelp")}
        </p>
      </FormSection>

      <FormSection title={t("drivers.section.account")}>
        <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("drivers.accountRequiredHelp")}
        </p>

        <form.Field name="user">
          {(field) => (
            <div className="space-y-1">
              <SelectField
                field={field as unknown as BoundField}
                label={t("drivers.field.account")}
                required
                hint={t("drivers.field.accountHint")}
                options={(accounts.data?.results ?? []).map((account) => ({
                  value: account.id,
                  label: `${account.full_name} (${account.email})`,
                }))}
              />
              <QueryFailedNote query={accounts} what={t("drivers.what.accounts")} />
            </div>
          )}
        </form.Field>

        {/*
          The two ways to bind an account are exclusive, and the server says so:
          sending both is refused. So the "make a new one" half appears only
          while nothing is picked — which is also the path for moving a driver
          onto a brand-new login, since clearing the picker brings it back.
        */}
        <form.Subscribe selector={(state) => state.values.user}>
          {(selected) =>
            selected ? null : (
              <>
                <form.Field name="account_email">
                  {(field) => (
                    <TextField
                      field={field as unknown as BoundField}
                      label={t("drivers.field.newAccountEmail")}
                      type="email"
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
                    />
                  )}
                </form.Field>
              </>
            )
          }
        </form.Subscribe>

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
