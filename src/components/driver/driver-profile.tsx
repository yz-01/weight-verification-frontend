"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Car, IdCard, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { DriverError, DriverLoading } from "@/components/driver/driver-shell";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import { useDateFormat } from "@/lib/dates";
import { getMyDriverProfile } from "@/services/recycler.service";

export function DriverProfile() {
  const t = useTranslations();
  const df = useDateFormat();
  const query = useQuery({
    queryKey: ["driver", "profile"],
    queryFn: getMyDriverProfile,
    staleTime: 60_000,
  });

  if (query.isLoading) return <DriverLoading />;
  if (query.isError || !query.data) {
    return <DriverError onRetry={() => void query.refetch()} />;
  }

  const driver = query.data;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("driver.profile.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("driver.profile.readOnly")}
        </p>
      </div>

      {/* The licence and vehicle rows below are the recycler's to manage,
          which is what "read only" refers to. A driver's own picture is not:
          it appears beside their deliveries, and this was the only portal
          with no way to set it. */}
      <section className="rounded-lg border bg-card p-5">
        <AvatarUpload />
        <div className="mt-4 border-t pt-4 text-center">
          <h2 className="text-lg font-semibold">{driver.full_name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {driver.company_name}
          </p>
        </div>
      </section>

      <section className="divide-y rounded-lg border bg-card">
        <ProfileRow icon={Phone} label={t("users.field.phone")} value={driver.phone} />
        <ProfileRow
          icon={IdCard}
          label={t("drivers.field.licenceNo")}
          value={driver.licence_no || t("common.emptyValue")}
        />
        <ProfileRow
          icon={CalendarDays}
          label={t("drivers.field.licenceExpires")}
          value={
            driver.licence_expires_on
              ? df.date(driver.licence_expires_on)
              : t("common.emptyValue")
          }
        />
        <ProfileRow
          icon={Building2}
          label={t("users.field.company")}
          value={driver.company_name}
        />
        <ProfileRow
          icon={Car}
          label={t("drivers.field.defaultVehicle")}
          value={driver.default_vehicle_plate || t("common.emptyValue")}
        />
      </section>
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
