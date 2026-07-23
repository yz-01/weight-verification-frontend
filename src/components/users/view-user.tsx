"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { LOCALE_LABELS, resolveLocale } from "@/i18n/config";
import type { UserStatus } from "@/interfaces/auth";
import { getUser } from "@/services/users.service";

const STATUS_TONE: Record<UserStatus, "positive" | "warning" | "danger"> = {
  ACTIVE: "positive",
  INVITED: "warning",
  SUSPENDED: "danger",
};

export function ViewUser({ id }: { id: string }) {
  const t = useTranslations();
  const { can } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["users", "detail", id],
    queryFn: () => getUser(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isError || !data) {
    return <LoadErrorCard backHref="/users" backLabel={t("users.title")} />;
  }

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/users"
        backLabel={t("users.title")}
        action={
          can("user.update") ? (
            <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
              <Link href={`/users/${data.id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="text-base font-semibold text-foreground">
            {data.full_name}
          </h2>
          {data.role_name && <TypeBadge label={data.role_name} />}
          <StatusBadge
            label={t(`users.status.${data.status}`)}
            tone={STATUS_TONE[data.status]}
          />
        </div>

        <div className="divide-y border-t">
          <FormSection title={t("users.section.identity")}>
            <ReadField label={t("users.field.email")} value={data.email} />
            <ReadField label={t("users.field.phone")} value={data.phone} />
            {data.company_name && (
              <ReadField
                label={t("users.field.company")}
                value={data.company_name}
                className="md:col-span-2"
              />
            )}
          </FormSection>

          <FormSection title={t("users.section.preferences")}>
            <ReadField
              label={t("users.field.language")}
              value={LOCALE_LABELS[resolveLocale(data.language)]}
            />
            <ReadField
              label={t("users.field.timezone")}
              value={data.timezone.replace("_", " ")}
            />
          </FormSection>

          <FormSection title={t("users.section.activity")}>
            <ReadField
              label={t("users.field.lastLoginAt")}
              value={
                data.last_login_at
                  ? format(new Date(data.last_login_at), "dd MMM yyyy HH:mm")
                  : null
              }
            />
            <ReadField
              label={t("users.field.lastLoginIp")}
              value={data.last_login_ip}
            />
            <ReadField
              label={t("users.field.createdAt")}
              value={format(new Date(data.created_at), "dd MMM yyyy")}
            />
          </FormSection>
        </div>
      </div>
    </div>
  );
}
