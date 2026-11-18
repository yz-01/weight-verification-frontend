"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock, Pencil, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { PermissionMatrix, roleKindOf } from "@/components/roles/permission-matrix";
import { rolePermissionSummary, roleTypeLabel } from "@/components/roles/role-summary";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  ReadField,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { roleDescription, roleName } from "@/lib/role-labels";
import { getRole } from "@/services/users.service";

export function ViewRole({ id }: { id: string }) {
  const t = useTranslations();
  const { can } = useAuth();

  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["roles", "detail", id],
    queryFn: () => getRole(id),
  });

  if (isLoading) return <FormSkeleton sections={2} />;
  if (isLoadingError || !data) {
    return <LoadErrorCard backHref="/roles" backLabel={t("roles.title")} />;
  }

  const name = roleName(data, t);
  const kind = roleKindOf(data);
  const phone = kind === "phone";
  const officeRole = kind === "head_office" || kind === "project";
  const typeLabel = roleTypeLabel(data, t);

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/roles"
        backLabel={t("roles.title")}
        action={
          // A phone role is managed in 现场人员管理 (JB219), not here.
          can("role.update") && !phone ? (
            <Button asChild size="sm">
              <Link href={`/roles/${data.id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("common.edit")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="surface-panel rounded-xl">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="text-base font-semibold text-foreground">{name}</h2>
          {data.is_system && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground ring-1 ring-inset ring-border">
              <Lock className="h-2.5 w-2.5" />
              {t("roles.system")}
            </span>
          )}
          <TypeBadge label={rolePermissionSummary(data, t)} className="ml-auto" />
        </div>
        {phone && (
          <p
            role="note"
            data-phone-role
            className="mx-6 mb-5 flex gap-2 rounded-lg border border-info/25 bg-info/8 p-3 text-sm leading-6 text-foreground"
          >
            <Smartphone className="mt-1 size-4 shrink-0 text-info" />
            <span>
              {t("roles.phoneRole")}{" "}
              <Link href="/field-staff-management" className="font-medium text-primary underline-offset-4 hover:underline">
                {t("roles.phoneRoleLink")}
              </Link>
            </span>
          </p>
        )}

        <div className="divide-y border-t">
          <FormSection title={t("roles.section.identity")}>
            <ReadField label={t("roles.field.code")} value={data.code} />
            {typeLabel ? <ReadField label={t("roles.kind.label")} value={typeLabel} /> : null}
            <ReadField
              label={t("roles.field.userCount")}
              value={String(data.user_count ?? 0)}
            />
            <ReadField
              label={t("roles.field.description")}
              value={roleDescription(data, t)}
              className="md:col-span-2"
            />
          </FormSection>

          <section className="px-6 py-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("roles.section.permissions")}
            </h3>
            {data.permissions.length === 0 && !officeRole ? (
              <p className="text-sm italic text-muted-foreground">
                {t("roles.permissionCount", { count: 0 })}
              </p>
            ) : (
              <PermissionMatrix selected={data.permissions} readOnly kind={kind} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
