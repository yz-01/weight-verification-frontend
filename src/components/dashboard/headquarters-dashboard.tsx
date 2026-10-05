"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import { HeadquartersFigures } from "@/components/dashboard/headquarters-figures";
import { HeadquartersMap } from "@/components/dashboard/headquarters-map";
import { LoadFailed } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { legacyDashboardTarget } from "@/lib/dashboard-scopes";
import { getHeadquarters } from "@/services/contractor-dashboard.service";

/**
 * `/dashboard` for a contractor: the 公司总部 Dashboard, after forwarding an
 * old address of the project level (`?project=`) to where it lives now.
 */
export function HeadquartersHome() {
  const router = useRouter();
  const target =
    typeof window === "undefined"
      ? null
      : legacyDashboardTarget(window.location.search);
  useEffect(() => {
    if (target) router.replace(`${target}${window.location.hash}`);
  }, [router, target]);
  if (target) return null;
  return <HeadquartersDashboard />;
}

/** 公司总部 Dashboard (C11): every project the reader can see, and a way in. */
export function HeadquartersDashboard() {
  const t = useTranslations("headquarters");
  const overview = useQuery({
    queryKey: ["contractor-dashboard", "headquarters"],
    queryFn: getHeadquarters,
  });
  const data = overview.data;

  return (
    <div className="space-y-4">
      <CompanyBanner scope="company" date={data?.date} />
      {overview.isError ? (
        <LoadFailed onRetry={() => void overview.refetch()} />
      ) : !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
        <section
          aria-label={t("figures.title")}
          className="space-y-2"
          data-dashboard-priority
        >
          <HeadquartersFigures data={data} />
          {!data.all_projects && (
            <p className="text-xs text-muted-foreground">{t("figures.someProjects")}</p>
          )}
        </section>
        <div data-dashboard-overview>
          <HeadquartersMap
            projects={data.projects}
            withoutLocation={data.without_location}
          />
        </div>
        </>
      )}
    </div>
  );
}
