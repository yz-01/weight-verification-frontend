"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

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
import { Switch } from "@/components/ui/switch";
import { LOCALE_LABELS, resolveLocale } from "@/i18n/config";
import type { UserDetail, UserStatus } from "@/interfaces/auth";
import { resetUserSignOffPin } from "@/services/sign-off.service";
import { getUser } from "@/services/users.service";
import { useDateFormat } from "@/lib/dates";
import { useRoleLabel } from "@/lib/role-labels";

const STATUS_TONE: Record<UserStatus, "positive" | "warning" | "danger"> = {
  ACTIVE: "positive",
  INVITED: "warning",
  SUSPENDED: "danger",
};

export function ViewUser({ id }: { id: string }) {
  const t = useTranslations();
  const roleOf = useRoleLabel();
  const df = useDateFormat();
  const { can } = useAuth();

  const { data, isLoading, isLoadingError } = useQuery({
    queryKey: ["users", "detail", id],
    queryFn: () => getUser(id),
  });

  if (isLoading) return <FormSkeleton sections={3} />;
  if (isLoadingError || !data) {
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

      <div className="surface-panel rounded-xl">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="text-base font-semibold text-foreground">
            {data.full_name}
          </h2>
          {data.role_name && <TypeBadge label={roleOf(data.role_code, data.role_name)} />}
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

          {data.sign_off_pin && !data.sign_off_pin.exempt && (
            <SignOffPinSection user={data} canReset={can("user.update")} />
          )}

          <FormSection title={t("users.section.activity")}>
            <ReadField
              label={t("users.field.lastLoginAt")}
              value={
                data.last_login_at
                  ? df.dateTime(data.last_login_at)
                  : null
              }
            />
            <ReadField
              label={t("users.field.lastLoginIp")}
              value={data.last_login_ip}
            />
            <ReadField
              label={t("users.field.createdAt")}
              value={df.date(data.created_at)}
            />
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/**
 * The person's six-digit sign-off PIN (I29): set or not, locked, and the
 * administrator's 「重设签核密码」 (IB17) - behind a switch, not a confirm.
 * The administrator never sees or chooses the PIN; the person sets a new one.
 */
function SignOffPinSection({ user, canReset }: { user: UserDetail; canReset: boolean }) {
  const t = useTranslations("signOff");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState(false);
  const pin = user.sign_off_pin!;
  const reset = useMutation({
    mutationFn: () => resetUserSignOffPin(user.id),
    onSuccess: (next) => {
      setArmed(false);
      queryClient.setQueryData(["users", "detail", user.id], next);
    },
  });
  const state = pin.locked_until ? "locked" : pin.was_reset ? "reset" : pin.has_pin ? "set" : "notSet";
  return (
    <FormSection title={t("profileTitle")}>
      <ReadField
        label={t("statusLabel")}
        value={
          state === "locked"
            ? t("status.locked", { time: df.dateTime(pin.locked_until as string) })
            : t(`status.${state}`)
        }
      />
      {canReset && (pin.has_pin || pin.locked_until) && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch tone="danger" checked={armed} onCheckedChange={setArmed} />
            {t("resetArm")}
          </label>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabledReason={!armed ? t("resetArmFirst") : undefined}
            disabled={!armed || reset.isPending}
            onClick={() => reset.mutate()}
          >
            {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {t("reset")}
          </Button>
          <p className="w-full text-xs text-muted-foreground">{t("resetHint")}</p>
        </div>
      )}
    </FormSection>
  );
}
