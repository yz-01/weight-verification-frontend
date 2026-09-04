"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { GatewayPanel } from "@/components/scales/gateway-panel";
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
import type { Scale, ScalePayload, ScaleProtocol } from "@/interfaces/weighing";
import {
  createScale,
  getScale,
  getSites,
  updateScale,
} from "@/services/weighing.service";

/**
 * Protocols offered when configuring a weighbridge.
 *
 * The unimplemented ones are listed but not selectable. Hiding them would
 * leave an installer wondering whether their indicator is supported at all;
 * showing them greyed says the platform knows the protocol and has not built
 * the parser yet, which is a different and more useful answer.
 */
const PROTOCOLS: Array<{ value: ScaleProtocol; implemented: boolean }> = [
  { value: "mt_continuous_short", implemented: true },
  { value: "generic_json", implemented: true },
  { value: "bdi_2001b", implemented: true },
  { value: "sma", implemented: false },
  { value: "mt_8142", implemented: false },
  { value: "mt_8530", implemented: false },
  { value: "pt6s3", implemented: false },
];

/** The weighbridge form, shared by create and edit. */
export function CreateScale({ scale }: { scale?: Scale }) {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEdit = scale !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const listHref =
    user?.portal === "MSE_ADMIN" ? "/weighing/admin/scales" : "/scales";

  const { data: sites } = useQuery({
    queryKey: ["sites", "options"],
    queryFn: () => getSites({ page_size: 100 }),
  });

  const mutation = useMutation({
    mutationFn: (values: ScalePayload) =>
      isEdit ? updateScale(scale.id, values) : createScale(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scales"] });
      router.push(listHref);
    },
  });

  const form = useForm({
    defaultValues: {
      site: scale?.site ?? "",
      code: scale?.code ?? "",
      name: scale?.name ?? "",
      protocol: (scale?.protocol ?? "mt_continuous_short") as string,
      manufacturer: scale?.manufacturer ?? "",
      model_number: scale?.model_number ?? "",
      serial_number: scale?.serial_number ?? "",
      capacity_kg: scale?.capacity_kg ?? "",
      division_kg: scale?.division_kg ?? "",
      calibration_certificate_no: scale?.calibration_certificate_no ?? "",
      calibration_expiry: scale?.calibration_expiry ?? "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync({
          ...value,
          protocol: value.protocol as ScaleProtocol,
          capacity_kg: value.capacity_kg || null,
          division_kg: value.division_kg || null,
          calibration_expiry: value.calibration_expiry || null,
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

  const siteOptions =
    sites?.results.map((site) => ({
      value: site.id,
      label: `${site.code} · ${site.name}`,
    })) ?? [];

  return (
    <div className="space-y-4">
      <FormShell
        backHref={listHref}
        backLabel={t("scales.title")}
        title={isEdit ? t("scales.editTitle") : t("scales.createTitle")}
        isSubmitting={mutation.isPending}
        submitLabel={isEdit ? t("common.save") : t("common.create")}
        submitIcon={isEdit ? Save : Plus}
        onSubmit={() => void form.handleSubmit()}
      >
        <FormSection title={t("scales.section.identity")}>
          <form.Field
            name="code"
            validators={{ onSubmit: required(t("validation.required")) }}
          >
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.code")}
                required
              />
            )}
          </form.Field>

          <form.Field
            name="name"
            validators={{ onSubmit: required(t("validation.required")) }}
          >
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.name")}
                required
              />
            )}
          </form.Field>

          <form.Field
            name="site"
            validators={{ onSubmit: required(t("validation.required")) }}
          >
            {(field) => (
              <SelectField
                field={field as unknown as BoundField}
                label={t("scales.field.site")}
                required
                options={siteOptions}
                className="md:col-span-2"
              />
            )}
          </form.Field>
        </FormSection>

        <FormSection title={t("scales.section.instrument")}>
          <form.Field name="protocol">
            {(field) => (
              <SelectField
                field={field as unknown as BoundField}
                label={t("scales.field.protocol")}
                required
                options={PROTOCOLS.map((entry) => ({
                  value: entry.value,
                  label: t(`scales.protocolLabel.${entry.value}`),
                  disabled: !entry.implemented,
                }))}
                className="md:col-span-2"
              />
            )}
          </form.Field>

          <form.Field name="manufacturer">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.manufacturer")}
                optional
              />
            )}
          </form.Field>
          <form.Field name="model_number">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.modelNumber")}
                optional
              />
            )}
          </form.Field>
          <form.Field name="serial_number">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.serialNumber")}
                optional
              />
            )}
          </form.Field>
          <form.Field name="capacity_kg">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.capacityKg")}
                optional
                type="number"
              />
            )}
          </form.Field>
          <form.Field name="division_kg">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.divisionKg")}
                optional
                type="number"
                // The stability tolerance is judged against this, so an
                // installer setting one needs to know about the other.
                hint={t("scales.divisionHint")}
              />
            )}
          </form.Field>
        </FormSection>

        <FormSection title={t("scales.section.calibration")}>
          <form.Field name="calibration_certificate_no">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.calibrationCertificateNo")}
                optional
              />
            )}
          </form.Field>
          <form.Field name="calibration_expiry">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("scales.field.calibrationExpiry")}
                optional
                type="date"
                hint={t("scales.calibrationHint")}
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

      {/* Only on edit: a gateway is registered against a scale that exists, and
          the secret it returns has to be shown immediately. */}
      {isEdit && (
        <div className="rounded-lg border bg-card shadow-sm">
          <GatewayPanel scaleId={scale.id} />
        </div>
      )}
    </div>
  );
}

/** Fetches the record, then hands it to the shared form. */
export function EditScale({ id }: { id: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["scales", "detail", id],
    queryFn: () => getScale(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/scales" backLabel={t("scales.title")} />;
  }
  return <CreateScale scale={data} />;
}
