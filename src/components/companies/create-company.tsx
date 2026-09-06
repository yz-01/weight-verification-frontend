"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  FileUp,
  Landmark,
  Plus,
  Save,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { OwnerAccountPanel } from "@/components/companies/owner-account-panel";
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
  requiredEmail,
} from "@/components/shared/form-shell";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { ApiError } from "@/interfaces/api";
import type { EmailCopy } from "@/interfaces/auth";
import type {
  CompanyBankAccountPayload,
  CompanyDetail,
  CompanyPayload,
  CompanyType,
} from "@/interfaces/company";
import { MALAYSIA_STATES } from "@/lib/malaysia";
import {
  createCompanyBankAccount,
  createCompany,
  getSubscriptionPlans,
  uploadCompanyDocument,
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEdit = company !== undefined;
  const fixedType = company?.type ?? defaultType;
  const [formError, setFormError] = useState<string | null>(null);
  // Non-empty only when the owner's activation email could not be sent, in
  // which case this link is the only way into the company that was just
  // created — so the form is replaced by it rather than navigating away.
  const [ownerLink, setOwnerLink] = useState("");
  const [ownerLinkCopied, setOwnerLinkCopied] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [ssmCertificate, setSsmCertificate] = useState<File | null>(null);
  const [companyProfile, setCompanyProfile] = useState<File | null>(null);
  const [bank, setBank] = useState<CompanyBankAccountPayload>({
    bank_name: "",
    account_name: "",
    account_number: "",
    account_type: "CURRENT",
    currency: "MYR",
    is_primary: true,
  });
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans", "active"],
    queryFn: () => getSubscriptionPlans(),
  });

  const mutation = useMutation({
    mutationFn: async (values: CompanyPayload) => {
      const saved = isEdit
        ? await updateCompany(company.id, values)
        : await createCompany(values);
      if (!isEdit) {
        try {
          await uploadCompanyDocument(
            saved.id,
            "SSM_CERTIFICATE",
            ssmCertificate!,
            { title: t("companies.onboarding.create.ssmTitle") },
          );
          if (companyProfile) {
            await uploadCompanyDocument(saved.id, "OTHER", companyProfile, {
              title: t("companies.onboarding.create.profileTitle"),
            });
          }
          await createCompanyBankAccount(saved.id, bank);
        } catch (error) {
          // The tenant itself already exists. Move to the resumable edit page
          // so retrying cannot create a duplicate company.
          router.replace(`/companies/${saved.id}/edit?onboarding=incomplete`);
          throw error;
        }
      }
      return saved;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      if (saved.owner_invitation_url) {
        setOwnerLink(saved.owner_invitation_url);
        return;
      }
      router.push(listHref);
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
      owner_name: "",
      owner_email: "",
      owner_phone: "",
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
      project_limit_override: company?.project_limit_override?.toString() ?? "",
      subscription_months: company?.subscription_months?.toString() ?? "1",
      subscription_expires_on: company?.subscription_expiry_is_custom
        ? (company.subscription_expires_on ?? "")
        : "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      if (!isEdit && !ssmCertificate) {
        setFormError(t("companies.onboarding.create.ssmRequired"));
        return;
      }
      if (
        !isEdit &&
        (!bank.bank_name.trim() ||
          !bank.account_name.trim() ||
          !bank.account_number.trim())
      ) {
        setFormError(t("companies.onboarding.create.bankRequired"));
        return;
      }
      try {
        const override = value.project_limit_override.trim();
        const type = (fixedType ?? value.type) as CompanyType;
        // The owner belongs to creation only. On edit the backend refuses
        // these fields outright rather than accepting them and doing nothing,
        // so they are stripped here instead of being sent and rejected.
        const { owner_name, owner_email, owner_phone, ...companyValues } = value;
        const ownerFields: Partial<CompanyPayload> = isEdit
          ? {}
          : {
              owner_name,
              owner_email,
              owner_phone,
              // Wording comes from the message catalogue so the owner is
              // written to in their own language; the backend only splices in
              // the token, which is the one thing the frontend cannot know.
              owner_email_copy: {
                subject: t("email.invite.subject"),
                body: t("email.invite.body"),
              } satisfies EmailCopy,
            };
        const basePayload = {
          ...companyValues,
          ...ownerFields,
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
          // Editing another field without choosing a new image must preserve
          // the existing company logo instead of sending an explicit null.
          logo: logo ?? undefined,
        };
        const subscriptionMonths = Number(value.subscription_months) as
          1 | 3 | 6 | 12;
        const customExpiry = value.subscription_expires_on || null;
        const subscriptionChanged =
          !isEdit ||
          value.plan !== company.plan ||
          subscriptionMonths !== (company.subscription_months ?? 1) ||
          customExpiry !==
            (company.subscription_expiry_is_custom
              ? company.subscription_expires_on
              : null);
        const subscriptionFields = {
          plan: value.plan || null,
          subscription_months: subscriptionChanged
            ? subscriptionMonths
            : undefined,
          subscription_expires_on: subscriptionChanged
            ? customExpiry
            : undefined,
          subscription_expiry_is_custom: subscriptionChanged
            ? Boolean(customExpiry)
            : undefined,
        };
        const payload: CompanyPayload =
          type === "CONTRACTOR"
            ? {
                ...basePayload,
                ...subscriptionFields,
                project_limit_override:
                  override === "" ? null : Number(override),
              }
            : {
                ...basePayload,
                ...subscriptionFields,
                project_limit_override: undefined,
              };
        await mutation.mutateAsync({
          ...payload,
        });
      } catch (error) {
        if (error instanceof ApiError && error.isValidation) {
          // Put the server's field messages beside the inputs they belong to.
          // A duplicate registration number is only detectable server-side, and
          // a toast leaves the user hunting for which field it meant.
          const leftover = applyServerErrors(
            error.errors,
            form as unknown as Parameters<typeof applyServerErrors>[1],
          );
          if (leftover.length > 0) setFormError(leftover[0]);
        }
      }
    },
  });

  const listHref =
    user?.portal === "MSE_ADMIN"
      ? "/companies/admin/directory"
      : "/companies";

  if (ownerLink) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">
              {t("companies.owner.notSentTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("companies.owner.notSentBody")}
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="break-all font-mono text-xs">{ownerLink}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(ownerLink);
              setOwnerLinkCopied(true);
            }}
          >
            <Copy />
            {t("common.copy")}
          </Button>
          <Button onClick={() => router.push(listHref)}>
            {t("common.close")}
          </Button>
        </div>
        {ownerLinkCopied && (
          <p className="text-xs text-success">
            {t("companies.owner.linkCopied")}
          </p>
        )}
      </div>
    );
  }

  return (
    <FormShell
      backHref={listHref}
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
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.ssmNewRegistrationNo")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="ssm_registered_name">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.ssmRegisteredName")}
              optional
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field name="ssm_incorporated_on">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.ssmIncorporatedOn")}
              optional
              type="date"
            />
          )}
        </form.Field>

        <form.Field name="ssm_expires_on">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.ssmExpiresOn")}
              optional
              type="date"
            />
          )}
        </form.Field>

        <form.Field name="business_type">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.businessType")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="industry_code">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.industryCode")}
              optional
            />
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
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.sstNo")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="paid_up_capital">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.paidUpCapital")}
              optional
              type="number"
              min={0}
              step="0.01"
            />
          )}
        </form.Field>

        <form.Field name="employee_count">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.employeeCount")}
              optional
              type="number"
              min={0}
              step={1}
            />
          )}
        </form.Field>

        <form.Field name="website">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.website")}
              optional
              type="url"
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <FieldWrapper
          label={t("companies.field.logo")}
          optional={t("common.optional")}
          className="md:col-span-2"
        >
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
          />
        </FieldWrapper>
      </FormSection>

      <form.Subscribe selector={(state) => state.values.type}>
        {(selectedType) => {
          const eligiblePlans = (plans?.results ?? []).filter(
            (plan) => plan.audience === selectedType,
          );
          return selectedType ? (
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
                    options={eligiblePlans.map((plan) => {
                      const terms =
                        plan.tier === "PARTNER"
                          ? t("companies.planTerms.partner", {
                              currency: plan.currency,
                              fee: plan.setup_fee,
                              rate: plan.effective_commission_rate ?? "0",
                            })
                          : plan.tier === "STANDARD"
                            ? t("companies.planTerms.standard", {
                                currency: plan.currency,
                                fee: plan.monthly_fee,
                              })
                            : plan.max_projects === null
                              ? t("contractorPartners.unlimitedProjects")
                              : t("contractorPartners.projectLimit", {
                                  count: plan.max_projects,
                                });
                      return {
                        value: plan.id,
                        label: `${plan.name} (${terms})`,
                      };
                    })}
                  />
                )}
              </form.Field>

              {selectedType === "CONTRACTOR" && (
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
              )}

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
          ) : null;
        }}
      </form.Subscribe>

      {!isEdit && (
        <FormSection title={t("companies.section.owner")}>
          <form.Field
            name="owner_name"
            validators={{ onSubmit: required(t("validation.required")) }}
          >
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("companies.field.ownerName")}
                required
              />
            )}
          </form.Field>

          <form.Field
            name="owner_email"
            validators={{
              onSubmit: requiredEmail(
                t("validation.required"),
                t("validation.email"),
              ),
            }}
          >
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("companies.field.ownerEmail")}
                required
                type="email"
                hint={t("companies.owner.emailHint")}
              />
            )}
          </form.Field>

          <form.Field name="owner_phone">
            {(field) => (
              <TextField
                field={field as unknown as BoundField}
                label={t("companies.field.ownerPhone")}
                optional
                type="tel"
              />
            )}
          </form.Field>
        </FormSection>
      )}

      {/* On edit the owner fields above are gone, because the backend refuses
          them - handing the account to a different person is not an edit. This
          shows where the activation key went, and lets a superadmin correct a
          typed character. */}
      {isEdit && company ? <OwnerAccountPanel companyId={company.id} /> : null}

      <FormSection title={t("companies.section.contact")}>
        <form.Field
          name="contact_person"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.contactPerson")}
              required
            />
          )}
        </form.Field>

        <form.Field
          name="contact_phone"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
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
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.contactDesignation")}
              optional
            />
          )}
        </form.Field>

        <form.Field
          name="billing_email"
          validators={{ onSubmit: optionalEmail(t("validation.email")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.billingEmail")}
              optional
              type="email"
            />
          )}
        </form.Field>

        <form.Field name="finance_contact_person">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.financeContactPerson")}
              optional
            />
          )}
        </form.Field>

        <form.Field name="finance_contact_phone">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.financeContactPhone")}
              optional
              type="tel"
            />
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
        <form.Field
          name="address_line_1"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
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

        <form.Field
          name="state"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("companies.field.state")}
              required
              options={MALAYSIA_STATES.map((state) => ({
                value: state,
                label: state,
              }))}
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
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.latitude")}
              optional
              type="number"
              min={-90}
              max={90}
              step="0.000001"
            />
          )}
        </form.Field>

        <form.Field name="longitude">
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("companies.field.longitude")}
              optional
              type="number"
              min={-180}
              max={180}
              step="0.000001"
            />
          )}
        </form.Field>
      </FormSection>

      {!isEdit && (
        <FormSection title={t("companies.onboarding.create.sectionTitle")}>
          <div className="flex items-center gap-2 md:col-span-2">
            <FileUp className="size-4 text-primary" />
            <p className="text-sm font-semibold">
              {t("companies.onboarding.documents.title")}
            </p>
          </div>
          <FieldWrapper
            label={t("companies.onboarding.create.ssmCertificate")}
            required
          >
            <Input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) =>
                setSsmCertificate(event.target.files?.[0] ?? null)
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("companies.onboarding.create.companyProfile")}
            optional={t("common.optional")}
          >
            <Input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) =>
                setCompanyProfile(event.target.files?.[0] ?? null)
              }
            />
          </FieldWrapper>

          <div className="mt-2 flex items-center gap-2 border-t pt-4 md:col-span-2">
            <Landmark className="size-4 text-primary" />
            <p className="text-sm font-semibold">
              {t("companies.onboarding.bank.title")}
            </p>
          </div>
          <FieldWrapper
            label={t("companies.onboarding.bank.bankName")}
            required
          >
            <Input
              value={bank.bank_name}
              onChange={(event) =>
                setBank((current) => ({
                  ...current,
                  bank_name: event.target.value,
                }))
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("companies.onboarding.bank.accountName")}
            required
          >
            <Input
              value={bank.account_name}
              onChange={(event) =>
                setBank((current) => ({
                  ...current,
                  account_name: event.target.value,
                }))
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("companies.onboarding.bank.accountNumber")}
            required
          >
            <Input
              inputMode="numeric"
              value={bank.account_number}
              onChange={(event) =>
                setBank((current) => ({
                  ...current,
                  account_number: event.target.value,
                }))
              }
            />
          </FieldWrapper>
          <FieldWrapper
            label={t("companies.onboarding.bank.accountType")}
            required
          >
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={bank.account_type}
              onChange={(event) =>
                setBank((current) => ({
                  ...current,
                  account_type: event.target.value as "CURRENT" | "SAVINGS",
                }))
              }
            >
              <option value="CURRENT">
                {t("companies.onboarding.bank.type.CURRENT")}
              </option>
              <option value="SAVINGS">
                {t("companies.onboarding.bank.type.SAVINGS")}
              </option>
            </select>
          </FieldWrapper>
          {formError && (
            <p className="text-sm font-medium text-destructive md:col-span-2">
              {formError}
            </p>
          )}
        </FormSection>
      )}

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

        {isEdit && formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}
