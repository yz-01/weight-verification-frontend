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
  applyServerErrors,
  optionalEmail,
  optionalPositiveInteger,
  required,
} from "@/components/shared/form-shell";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { ApiError } from "@/interfaces/api";
import type {
  CompanyDetail,
  CompanyPayload,
  CompanyType,
} from "@/interfaces/company";
import {
  createCompany,
  getSubscriptionPlans,
  updateCompany,
} from "@/services/companies.service";

const TIMEZONES = [
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Bangkok",
  "UTC",
];

/**
 * The company form, shared by create and edit.
 *
 * Edit passes the existing record; create passes nothing. Keeping one
 * component means a field added for one is present in the other, which is the
 * failure this arrangement exists to prevent.
 */
export function CreateCompany({
  company,
  defaultType,
}: {
  company?: CompanyDetail;
  defaultType?: CompanyType;
}) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = company !== undefined;
  const fixedType = company?.type ?? defaultType;
  const [formError, setFormError] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans", "active"],
    queryFn: getSubscriptionPlans,
    enabled: fixedType !== "RECYCLER",
  });

  const mutation = useMutation({
    mutationFn: (values: CompanyPayload) =>
      isEdit ? updateCompany(company.id, values) : createCompany(values),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      router.push(`/companies/${saved.id}`);
    },
  });

  const form = useForm({
    defaultValues: {
      name: company?.name ?? "",
      type: company?.type ?? defaultType ?? "",
      registration_no: company?.registration_no ?? "",
      ssm_new_registration_no: company?.ssm_new_registration_no ?? "",
      ssm_registered_name: company?.ssm_registered_name ?? "",
      ssm_incorporated_on: company?.ssm_incorporated_on ?? "",
      ssm_expires_on: company?.ssm_expires_on ?? "",
      business_type: company?.business_type ?? "",
      industry_code: company?.industry_code ?? "",
      tax_id: company?.tax_id ?? "",
      sst_no: company?.sst_no ?? "",
      paid_up_capital: company?.paid_up_capital ?? "",
      employee_count: company?.employee_count?.toString() ?? "",
      website: company?.website ?? "",
      address_line_1: company?.address_line_1 ?? "",
      address_line_2: company?.address_line_2 ?? "",
      city: company?.city ?? "",
      state: company?.state ?? "",
      postcode: company?.postcode ?? "",
      country: company?.country ?? "Malaysia",
      latitude: company?.latitude ?? "",
      longitude: company?.longitude ?? "",
      contact_person: company?.contact_person ?? "",
      contact_designation: company?.contact_designation ?? "",
      contact_phone: company?.contact_phone ?? "",
      contact_email: company?.contact_email ?? "",
      billing_email: company?.billing_email ?? "",
      finance_contact_person: company?.finance_contact_person ?? "",
      finance_contact_phone: company?.finance_contact_phone ?? "",
      default_language: company?.default_language ?? "en",
      timezone: company?.timezone ?? "Asia/Kuala_Lumpur",
      plan: company?.plan ?? "",
      project_limit_override:
        company?.project_limit_override?.toString() ?? "",
      subscription_months: company?.subscription_months?.toString() ?? "1",
      subscription_expires_on: company?.subscription_expiry_is_custom
        ? (company.subscription_expires_on ?? "")
        : "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const override = value.project_limit_override.trim();
        const type = (fixedType ?? value.type) as CompanyType;
        const basePayload = {
          ...value,
          type,
          ssm_incorporated_on: value.ssm_incorporated_on || null,
          ssm_expires_on: value.ssm_expires_on || null,
          paid_up_capital: value.paid_up_capital
            ? Number(value.paid_up_capital)
            : null,
          employee_count: value.employee_count
            ? Number(value.employee_count)
            : null,
          latitude: value.latitude ? Number(value.latitude) : null,
          longitude: value.longitude ? Number(value.longitude) : null,
          logo,
        };
        const subscriptionMonths = Number(
          value.subscription_months,
        ) as 1 | 3 | 6 | 12;
        const customExpiry = value.subscription_expires_on || null;
        const subscriptionChanged =
          !isEdit ||
          value.plan !== company.plan ||
          subscriptionMonths !== (company.subscription_months ?? 1) ||
          customExpiry !==
            (company.subscription_expiry_is_custom
              ? company.subscription_expires_on
              : null);
        const payload: CompanyPayload =
          type === "CONTRACTOR"
            ? {
                ...basePayload,
                plan: value.plan || null,
                project_limit_override:
                  override === "" ? null : Number(override),
                subscription_months: subscriptionChanged
                  ? subscriptionMonths
                  : undefined,
                subscription_expires_on: subscriptionChanged
                  ? customExpiry
                  : undefined,
                subscription_expiry_is_custom: subscriptionChanged
                  ? Boolean(customExpiry)
                  : undefined,
              }
            : {
                ...basePayload,
                plan: undefined,
                project_limit_override: undefined,
                subscription_months: undefined,
                subscription_expires_on: undefined,
                subscription_expiry_is_custom: undefined,
              };
        await mutation.mutateAsync({
          ...payload,
        });
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          // Put the server's field messages beside the inputs they belong to.
          // A duplicate registration number is only detectable server-side, and
          // a toast leaves the user hunting for which field it meant.
          const leftover = applyServerErrors(error.errors, form as unknown as Parameters<typeof applyServerErrors>[1]);
          if (leftover.length > 0) setFormError(leftover[0]);
        }
      }
    },
  });

  const listHref =
    fixedType === "CONTRACTOR"
      ? "/contractor-partners"
      : fixedType === "RECYCLER"
        ? "/recycler-review"
        : "/companies";

  return (
    <FormShell
      backHref={isEdit ? `/companies/${company.id}` : listHref}
      backLabel={t("companies.title")}
      title={isEdit ? t("companies.editTitle") : t("companies.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={isEdit ? t("common.save") : t("common.create")}
      submitIcon={isEdit ? Save : Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("companies.section.identity")}>
        <form.Field
          name="name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.name")}
              required
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field
          name="type"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("companies.field.type")}
              required
              // A contractor's projects and a recycler's weigh sessions do not
              // interchange, so the backend refuses to change this after
              // creation. Locking it here says so before the request fails.
              disabled={isEdit || defaultType !== undefined}
              hint={
                isEdit || defaultType !== undefined
                  ? t("companies.typeLocked")
                  : undefined
              }
              options={
                fixedType
                  ? [
                      {
                        value: fixedType,
                        label: t(`companies.type.${fixedType}`),
                      },
                    ]
                  : [
                      {
                        value: "CONTRACTOR",
                        label: t("companies.type.CONTRACTOR"),
                      },
                      {
                        value: "RECYCLER",
                        label: t("companies.type.RECYCLER"),
                      },
                    ]
              }
            />
          )}
        </form.Field>

        <form.Field
          name="registration_no"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.registrationNo")}
              required
            />
          )}
        </form.Field>

        <form.Field name="ssm_new_registration_no">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.ssmNewRegistrationNo")} optional />
          )}
        </form.Field>

        <form.Field name="ssm_registered_name">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.ssmRegisteredName")} optional className="md:col-span-2" />
          )}
        </form.Field>

        <form.Field name="ssm_incorporated_on">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.ssmIncorporatedOn")} optional type="date" />
          )}
        </form.Field>

        <form.Field name="ssm_expires_on">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.ssmExpiresOn")} optional type="date" />
          )}
        </form.Field>

        <form.Field name="business_type">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.businessType")} optional />
          )}
        </form.Field>

        <form.Field name="industry_code">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.industryCode")} optional />
          )}
        </form.Field>

        <form.Field name="tax_id">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.taxId")}
              optional
              hint={t("companies.taxIdHint")}
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field name="sst_no">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.sstNo")} optional />
          )}
        </form.Field>

        <form.Field name="paid_up_capital">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.paidUpCapital")} optional type="number" min={0} step="0.01" />
          )}
        </form.Field>

        <form.Field name="employee_count">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.employeeCount")} optional type="number" min={0} step={1} />
          )}
        </form.Field>

        <form.Field name="website">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.website")} optional type="url" className="md:col-span-2" />
          )}
        </form.Field>

        <FieldWrapper label={t("companies.field.logo")} optional={t("common.optional")} className="md:col-span-2">
          <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} />
        </FieldWrapper>
      </FormSection>

      <form.Subscribe selector={(state) => state.values.type}>
        {(selectedType) =>
          selectedType === "RECYCLER" ? null : (
            <FormSection title={t("companies.section.subscription")}>
              <form.Field
                name="plan"
                validators={{ onSubmit: required(t("validation.required")) }}
              >
                {(field) => (
                  <SelectField
                    field={field as unknown as BoundField}
                    label={t("companies.field.plan")}
                    required
                    hint={plansLoading ? t("common.loading") : undefined}
                    options={(plans?.results ?? []).map((plan) => {
                      const allowance =
                        plan.max_projects === null
                          ? t("contractorPartners.unlimitedProjects")
                          : t("contractorPartners.projectLimit", {
                              count: plan.max_projects,
                            });
                      return {
                        value: plan.id,
                        label: `${plan.name} (${allowance})`,
                      };
                    })}
                  />
                )}
              </form.Field>

              <form.Field
                name="project_limit_override"
                validators={{
                  onSubmit: optionalPositiveInteger(
                    t("validation.positiveInteger"),
                  ),
                }}
              >
                {(field) => (
                  <TextField
                    field={field as unknown as BoundField}
                    label={t("companies.field.projectLimitOverride")}
                    optional
                    type="number"
                    min={1}
                    step={1}
                    hint={t("companies.projectLimitOverrideHint")}
                  />
                )}
              </form.Field>

              <form.Field name="subscription_months">
                {(field) => (
                  <SelectField
                    field={field as unknown as BoundField}
                    label={t("companies.field.subscriptionMonths")}
                    required
                    hint={t("companies.subscriptionMonthsHint")}
                    options={[1, 3, 6, 12].map((months) => ({
                      value: String(months),
                      label: t("companies.subscriptionPeriod", { months }),
                    }))}
                  />
                )}
              </form.Field>

              <form.Field name="subscription_expires_on">
                {(field) => (
                  <TextField
                    field={field as unknown as BoundField}
                    label={t("companies.field.subscriptionExpiresOn")}
                    optional
                    type="date"
                    hint={t("companies.subscriptionExpiryHint")}
                  />
                )}
              </form.Field>
            </FormSection>
          )
        }
      </form.Subscribe>

      <FormSection title={t("companies.section.contact")}>
        <form.Field name="contact_person" validators={{ onSubmit: required(t("validation.required")) }}>
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.contactPerson")}
              required
            />
          )}
        </form.Field>

        <form.Field name="contact_phone" validators={{ onSubmit: required(t("validation.required")) }}>
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.contactPhone")}
              required
              type="tel"
            />
          )}
        </form.Field>

        <form.Field name="contact_designation">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.contactDesignation")} optional />
          )}
        </form.Field>

        <form.Field name="billing_email" validators={{ onSubmit: optionalEmail(t("validation.email")) }}>
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.billingEmail")} optional type="email" />
          )}
        </form.Field>

        <form.Field name="finance_contact_person">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.financeContactPerson")} optional />
          )}
        </form.Field>

        <form.Field name="finance_contact_phone">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.financeContactPhone")} optional type="tel" />
          )}
        </form.Field>

        <form.Field
          name="contact_email"
          validators={{ onSubmit: optionalEmail(t("validation.email")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.contactEmail")}
              optional
              type="email"
              className="md:col-span-2"
            />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("companies.section.address")}>
        <form.Field name="address_line_1" validators={{ onSubmit: required(t("validation.required")) }}>
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.addressLine1")}
              required
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field name="address_line_2">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.addressLine2")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field name="city">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.city")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="state" validators={{ onSubmit: required(t("validation.required")) }}>
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.state")}
              required
            />
          )}
        </form.Field>

        <form.Field name="postcode">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.postcode")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="country">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.country")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="latitude">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.latitude")} optional type="number" min={-90} max={90} step="0.000001" />
          )}
        </form.Field>

        <form.Field name="longitude">
          {(field) => (
            <TextField field={field as unknown as BoundField} label={t("companies.field.longitude")} optional type="number" min={-180} max={180} step="0.000001" />
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("companies.section.preferences")}>
        <form.Field name="default_language">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("companies.field.defaultLanguage")}
              hint={t("companies.languageHint")}
              options={LOCALES.map((locale) => ({
                value: locale,
                label: LOCALE_LABELS[locale],
              }))}
            />
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("companies.field.timezone")}
              options={TIMEZONES.map((zone) => ({
                value: zone,
                label: zone.replace("_", " "),
              }))}
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
