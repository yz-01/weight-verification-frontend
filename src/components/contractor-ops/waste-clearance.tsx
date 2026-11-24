"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { ClearanceStatsBar } from "@/components/contractor-ops/clearance-stats-bar";
import { SiteDisposalOffice } from "@/components/contractor-ops/site-disposal-workspaces";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ListHeader, QueryFailedNote } from "@/components/shared/page-primitives";
import { cn } from "@/lib/utils";
import {
  CLEARANCE_KIND_OF,
  clearanceFigureFilters,
  clearanceKindOf,
  clearanceTabHref,
  dispatchListHref,
  type ClearanceTab,
} from "@/lib/waste-clearance-figures";
import { getDisposalTotals } from "@/services/contractor-ops.service";

const TABS: readonly ClearanceTab[] = ["all", "garbage", "scrap", "abnormal"];

/**
 * 垃圾清运: a business menu of its own (JB248, 客户 11-23b 事项 1).
 *
 *   「垃圾清运」与「废料处理」名称为归属同一个业务菜单。
 *   菜单内分为：全部｜垃圾清运｜废料处理。
 *   两种业务共用现有操作页面及审批流程。
 *   两种业务的车次、重量及总数量分别累计，不混合统计。
 *
 * One list of clearance jobs, the existing one (`SiteDisposalOffice`) with
 * every step, filter and export it had; each tab narrows it to one kind, and
 * 全部 shows both, each row saying which it is. The statistics bar keeps a
 * line for each kind - never added together - and 「ESG 统计」 at its far
 * right (JB249). 「异常记录」 (JB149, the client's 11-10 request for
 * 垃圾清运) stays beside the tabs: every job in it is a clearance job.
 *
 * 废料订单 is back in 环保材料管理 (第三点); an old `kind=dispatch` link goes
 * there.
 */
export function WasteClearance() {
  const t = useTranslations("wasteClearance");
  const words = useTranslations("jb248");
  const { can } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const asked = searchParams.get("kind");
  const kind = clearanceKindOf(asked);
  const tab: ClearanceTab = kind === "all" && searchParams.get("abnormal") === "1" ? "abnormal" : kind;

  useEffect(() => {
    if (asked === "dispatch") router.replace(dispatchListHref(searchParams));
  }, [asked, router, searchParams]);

  // The page's project is the top bar's 「当前项目」 when it is in force (B13);
  // the header counts what the list under it shows (F8).
  const topBar = useCurrentProject();
  const figureParams = new URLSearchParams(searchParams.toString());
  if (topBar.active) {
    figureParams.delete("project");
    if (topBar.projectId) figureParams.set("project", topBar.projectId);
  }
  const figureFilters = clearanceFigureFilters(figureParams);
  const allowed = can("disposal.view");
  // Each kind's own 笔数 / 车次 / 重量, read apart and shown on its own line.
  const garbageTotals = useQuery({
    queryKey: ["site-disposals", "totals", "waste-clearance", figureFilters.GARBAGE],
    queryFn: () => getDisposalTotals(figureFilters.GARBAGE),
    enabled: allowed,
  });
  const scrapTotals = useQuery({
    queryKey: ["site-disposals", "totals", "waste-clearance", figureFilters.SCRAP],
    queryFn: () => getDisposalTotals(figureFilters.SCRAP),
    enabled: allowed,
  });
  const countText = (query: typeof garbageTotals) =>
    query.isError ? "—" : query.isLoading ? "…" : String(query.data?.records ?? 0);

  if (asked === "dispatch") return null;

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={[
          words("count.GARBAGE", { count: countText(garbageTotals) }),
          words("count.SCRAP", { count: countText(scrapTotals) }),
        ].join(" · ")}
      />
      <QueryFailedNote query={garbageTotals} what={words("kind.GARBAGE")} />
      <QueryFailedNote query={scrapTotals} what={words("kind.SCRAP")} />

      <ClearanceStatsBar>
        {garbageTotals.data && (
          <p>
            {words("totals.GARBAGE", {
              records: garbageTotals.data.records,
              trips: garbageTotals.data.trips,
              weight: garbageTotals.data.weight_kg,
            })}
          </p>
        )}
        {scrapTotals.data && (
          <p>
            {words("totals.SCRAP", {
              records: scrapTotals.data.records,
              trips: scrapTotals.data.trips,
              weight: scrapTotals.data.weight_kg,
            })}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">{words("totals.apart")}</p>
      </ClearanceStatsBar>

      <nav aria-label={t("title")} className="surface-panel flex w-fit max-w-full flex-wrap gap-1 rounded-xl p-1">
        {TABS.map((option) => (
          <Link
            key={option}
            href={clearanceTabHref(option, searchParams)}
            aria-current={option === tab ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:h-10",
              option === tab && "bg-primary/10 text-primary",
              option === "abnormal" && option !== tab && "text-destructive",
            )}
          >
            {words(`tab.${option}`)}
          </Link>
        ))}
      </nav>

      <SiteDisposalOffice clearanceKind={kind === "all" ? undefined : CLEARANCE_KIND_OF[kind]} />
    </div>
  );
}
