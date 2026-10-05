"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import { LoadFailed } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { legacyDashboardTarget } from "@/lib/dashboard-scopes";
import { projectDashboardHref } from "@/lib/headquarters-links";
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
        <section
          aria-label={t("projects.title")}
          className="rounded-lg border bg-card p-3 shadow-sm"
        >
          <h2 className="border-b pb-1.5 text-sm font-semibold">
            {t("projects.title")}
          </h2>
          {data.projects.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              {t("projects.empty")}
            </p>
          ) : (
            <ul className="divide-y">
              {data.projects.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {project.code} · {project.name}
                  </span>
                  <Link
                    href={projectDashboardHref(project.id)}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t("projects.enter")}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
