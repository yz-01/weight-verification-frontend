"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import { HeadquartersFigures } from "@/components/dashboard/headquarters-figures";
import { HeadquartersMap } from "@/components/dashboard/headquarters-map";
import {
  HeadquartersPhotos,
  usePhotoOpener,
} from "@/components/dashboard/headquarters-photos";
import {
  HeadquartersPresence,
  HeadquartersWork,
  WORK_TABS,
  type WorkTab,
} from "@/components/dashboard/headquarters-work";
import { WallButton } from "@/components/dashboard/headquarters-wall";
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
  // From the router rather than `window.location`, so the server and the
  // first client render agree; the move itself happens after mount.
  const searchParams = useSearchParams();
  const target = legacyDashboardTarget(searchParams.toString());
  useEffect(() => {
    if (target) router.replace(`${target}${window.location.hash}`);
  }, [router, target]);
  if (target) return null;
  return <HeadquartersDashboard />;
}

/**
 * 公司总部 Dashboard (C11, C19), top to bottom: the company banner; the
 * company's figures (what is waiting comes first - each opens the list of
 * exactly what it counts, F8);
 * the 交互总览地图 with 项目总览 as the main overview; what waits on a decision
 * and what is overdue, beside 在场人数 by project; then today's site photos.
 * Every row and figure leads to the item, the list or the project.
 */
export function HeadquartersDashboard() {
  const t = useTranslations("headquarters");
  // 待审批 cards (here and on the project dashboard) open 总部集中审批 with
  // `?work=approvals&work_project=` (F8, B8). Keyed on them, so a second card
  // click on this page opens the tab and project it names.
  const searchParams = useSearchParams();
  const asked = searchParams.get("work") as WorkTab | null;
  const workTab = asked && WORK_TABS.includes(asked) ? asked : "approvals";
  const workProject = searchParams.get("work_project") ?? "";
  const overview = useQuery({
    queryKey: ["contractor-dashboard", "headquarters"],
    queryFn: getHeadquarters,
  });
  const data = overview.data;
  const photos = usePhotoOpener();

  return (
    <div className="space-y-4">
      <CompanyBanner scope="company" date={data?.date} action={<WallButton />} />
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
            date={data.date}
            onOpenPhoto={photos.open}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <HeadquartersWork
              key={`${workTab}:${workProject}`}
              initialTab={workTab}
              approvalsProject={workProject}
            />
          </div>
          <HeadquartersPresence data={data} />
        </div>
        <HeadquartersPhotos onOpen={photos.open} />
        </>
      )}
      {photos.sheet}
    </div>
  );
}
