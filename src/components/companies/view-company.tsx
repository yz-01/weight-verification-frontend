"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { FormSection, FormSkeleton, LoadErrorCard } from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { LOCALE_LABELS, resolveLocale } from "@/i18n/config";
import type { CompanyStatus } from "@/interfaces/company";
import { getCompany } from "@/services/companies.service";
import { useDateFormat } from "@/lib/dates";

const STATUS_TONE: Record<
  CompanyStatus,
  "positive" | "info" | "warning" | "danger" | "neutral"
> = {
  ACTIVE: "positive",
  TRIAL: "info",
  OVERDUE: "warning",
  SUSPENDED: "danger",
  CLOSED: "neutral",
};

export function ViewCompany({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["companies", "detail", id],
    queryFn: () => getCompany(id),
  });

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/companies" backLabel={t("companies.title")} />;
  }

  const listHref =
    data.type === "CONTRACTOR" ? "/contractor-partners" : "/recycler-review";

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref={listHref}
        backLabel={
          data.type === "CONTRACTOR"
            ? t("contractorPartners.title")
            : t("recyclerReview.title")
        }
        action={
          <div className="flex items-center gap-2">
            {can("user.create") ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-full px-4"
              >
                <Link href={`/users/create?company=${data.id}`}>
                  <UserPlus className="h-4 w-4" />
                  {t("companies.addUser")}
                </Link>
              </Button>
            ) : null}
            {can("company.update") ? (
              <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
                <Link href={`/companies/${data.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="text-base font-semibold text-foreground">{data.name}</h2>
          <TypeBadge label={t(`companies.type.${data.type}`)} />
          <StatusBadge
            label={t(`companies.status.${data.status}`)}
            tone={STATUS_TONE[data.status]}
          />
          <span className="tabular ml-auto text-sm text-muted-foreground">
            {data.code}
          </span>
        </div>

        <div className="divide-y border-t">
          <FormSection title={t("companies.section.identity")}>
            <ReadField label={t("companies.field.code")} value={data.code} />
            <ReadField
              label={t("companies.field.registrationNo")}
              value={data.registration_no}
            />
            <ReadField label={t("companies.field.taxId")} value={data.tax_id} />
            <ReadField
              label={t("companies.field.createdAt")}
              value={df.date(data.created_at)}
            />
            {data.status === "SUSPENDED" && (
              <>
                <ReadField
                  label={t("companies.suspendedAt")}
                  value={
                    data.suspended_at
                      ? df.date(data.suspended_at)
                      : null
                  }
                />
                <ReadField
                  label={t("companies.suspendedReason")}
                  value={data.suspended_reason}
                />
              </>
            )}
          </FormSection>

          {data.type === "CONTRACTOR" && (
            <FormSection title={t("companies.section.subscription")}>
              <ReadField
                label={t("companies.field.plan")}
                value={data.plan_name}
              />
              <ReadField
                label={t("companies.field.projectLimit")}
                value={
                  data.project_limit === null
                    ? t("contractorPartners.unlimitedProjects")
                    : String(data.project_limit)
                }
              />
              <ReadField
                label={t("companies.field.projectLimitOverride")}
                value={
                  data.project_limit_override === null
                    ? null
                    : String(data.project_limit_override)
                }
              />
              <ReadField
                label={t("companies.field.subscriptionMonths")}
                value={
                  data.subscription_months
                    ? t("companies.subscriptionPeriod", {
                        months: data.subscription_months,
                      })
                    : null
                }
              />
              <ReadField
                label={t("companies.field.subscriptionStartedOn")}
                value={
                  data.subscription_started_on
                    ? df.date(data.subscription_started_on)
                    : null
                }
              />
              <ReadField
                label={t("companies.field.subscriptionExpiresOn")}
                value={
                  data.subscription_expires_on
                    ? df.date(data.subscription_expires_on)
                    : t("companies.noSubscriptionExpiry")
                }
              />
            </FormSection>
          )}

          <FormSection title={t("companies.section.contact")}>
            <ReadField
              label={t("companies.field.contactPerson")}
              value={data.contact_person}
            />
            <ReadField
              label={t("companies.field.contactPhone")}
              value={data.contact_phone}
            />
            <ReadField
              label={t("companies.field.contactEmail")}
              value={data.contact_email}
              className="md:col-span-2"
            />
          </FormSection>

          <FormSection title={t("companies.section.address")}>
            <ReadField
              label={t("companies.field.addressLine1")}
              value={data.address_line_1}
              className="md:col-span-2"
            />
            <ReadField
              label={t("companies.field.addressLine2")}
              value={data.address_line_2}
              className="md:col-span-2"
            />
            <ReadField label={t("companies.field.city")} value={data.city} />
            <ReadField label={t("companies.field.state")} value={data.state} />
            <ReadField
              label={t("companies.field.postcode")}
              value={data.postcode}
            />
            <ReadField label={t("companies.field.country")} value={data.country} />
          </FormSection>

          <FormSection title={t("companies.section.preferences")}>
            <ReadField
              label={t("companies.field.defaultLanguage")}
              value={LOCALE_LABELS[resolveLocale(data.default_language)]}
            />
            <ReadField
              label={t("companies.field.timezone")}
              value={data.timezone.replace("_", " ")}
            />
          </FormSection>
        </div>
      </div>
    </div>
  );
}
