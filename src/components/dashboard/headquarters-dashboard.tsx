"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { GateCard } from "@/components/dashboard/gate-card";
import { HeadquartersFigures } from "@/components/dashboard/headquarters-figures";
import { HeadquartersMap } from "@/components/dashboard/headquarters-map";
import { HeadquartersMaterialTargets } from "@/components/dashboard/headquarters-material-targets";
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
import {
  HeadquartersByState,
  HeadquartersHero,
  HeadquartersKpis,
  HeadquartersNotices,
  HeadquartersPresenceSplit,
  HeadquartersQuickLinks,
  HeadquartersSiteActivity,
} from "@/components/dashboard/headquarters-reference";
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
 * 公司总部 Dashboard as the client's reference (J32, 10-20 图 3), top to
 * bottom: the title, date and weather; six figures, each with 较昨日 where
 * yesterday is counted the same way; 今日现场动态 - each project's latest site
 * photo, or the map; 待处理事项 beside 通知中心; projects by state, 在场人数
 * and 快捷入口. Below, everything head office had before (J32-5): every
 * figure, the gate, 在场人数 by project, material targets and today's
 * photos. Refreshed every minute and when the page comes back (要做 3). Every
 * row and figure leads to the item, the list or the project.
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
    // A new site photo shows within a minute, or when the page is back.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = overview.data;
  const photos = usePhotoOpener();

  return (
    <div className="space-y-4">
      {overview.isError ? (
        <LoadFailed onRetry={() => void overview.refetch()} />
      ) : !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <HeadquartersHero date={data.date} action={<WallButton />} />
          <section aria-label={t("figures.title")} className="space-y-2" data-dashboard-priority>
            <HeadquartersKpis data={data} />
            {!data.all_projects && (
              <p className="text-xs text-muted-foreground">{t("figures.someProjects")}</p>
            )}
          </section>
          <div data-dashboard-overview>
            <HeadquartersSiteActivity
              data={data}
              onOpenPhoto={photos.open}
              map={
                <HeadquartersMap
                  projects={data.projects}
                  withoutLocation={data.without_location}
                  date={data.date}
                  onOpenPhoto={photos.open}
                />
              }
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
            <HeadquartersNotices />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <HeadquartersByState data={data} />
            <HeadquartersPresenceSplit data={data} />
            <HeadquartersQuickLinks />
          </div>
          {/* What head office had before, kept (J32-5). */}
          <HeadquartersFigures data={data} />
          {/* 门岗 (HD10): every project's gate photos today and open issues. */}
          <GateCard />
          <HeadquartersPresence data={data} />
          {/* 材料目标 (I18, ID42): each project's targets over, at and near. */}
          <HeadquartersMaterialTargets data={data} />
          <HeadquartersPhotos onOpen={photos.open} />
        </>
      )}
      {photos.sheet}
    </div>
  );
}
