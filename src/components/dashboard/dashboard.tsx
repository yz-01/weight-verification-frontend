"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Layers, Recycle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { useAuth } from "@/components/providers/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { getCompanySummary } from "@/services/companies.service";

export function Dashboard() {
  const t = useTranslations();
  const { user, can } = useAuth();

  const subtitleKey =
    user?.audience === "PLATFORM"
      ? "dashboard.platformSubtitle"
      : user?.audience === "CONTRACTOR"
        ? "dashboard.contractorSubtitle"
        : "dashboard.recyclerSubtitle";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t("dashboard.greeting", { name: user?.full_name ?? "" })}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(subtitleKey)}</p>
      </div>

      {can("company.view") ? (
        <PlatformTiles />
      ) : (
        <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            {t("dashboard.comingSoon")}
          </p>
        </div>
      )}
    </div>
  );
}

function PlatformTiles() {
  const t = useTranslations();
  const format = useFormatter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["companies", "summary"],
    queryFn: getCompanySummary,
  });

  if (isError) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">
          {t("table.errorTitle")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("table.errorBody")}
        </p>
      </div>
    );
  }

  const tiles = [
    {
      key: "contractors",
      icon: Building2,
      value: data?.by_type.CONTRACTOR ?? 0,
    },
    {
      key: "recyclers",
      icon: Recycle,
      value: data?.by_type.RECYCLER ?? 0,
    },
    {
      key: "companies",
      icon: Layers,
      value: data?.total ?? 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.key}
            className="rounded-xl border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`dashboard.tile.${tile.key}`)}
              </p>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-8 w-16" />
            ) : (
              <p className="tabular mt-2 text-3xl font-semibold tracking-tight text-foreground">
                {format.number(tile.value)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
