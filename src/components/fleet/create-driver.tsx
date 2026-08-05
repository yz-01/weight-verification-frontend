"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  SelectField,
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
      full_name: driver?.full_name ?? "",
      phone: driver?.phone ?? "",
      ic_no: driver?.ic_no ?? "",
      licence_no: driver?.licence_no ?? "",
      licence_expires_on: driver?.licence_expires_on ?? "",
      default_vehicle: driver?.default_vehicle ?? "",
      user: driver?.user ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          licence_expires_on: value.licence_expires_on || null,
          default_vehicle: value.default_vehicle || null,
          user: value.user || null,
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

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}

export function EditDriver({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["drivers", "detail", id],
    queryFn: () => getDriver(id),
  });

  if (isLoading) return <FormSkeleton sections={2} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/drivers" backLabel={t("drivers.title")} />;
  }
  return <CreateDriver driver={data} />;
}
