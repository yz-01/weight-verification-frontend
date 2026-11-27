"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { ClearanceStatsBar } from "@/components/contractor-ops/clearance-stats-bar";
import { Dispatches } from "@/components/dispatches/dispatches";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { getDispatchSummary } from "@/services/contractor.service";

/** The list's own filters, which the figures follow (F8: the header counts the list). */
const FIGURE_FILTERS = ["project", "counted", "state", "waste_type"] as const;

export function wasteOrderFigureFilters(params: URLSearchParams): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of FIGURE_FILTERS) {
    const value = params.get(key);
    if (value) picked[key] = value;
  }
  return picked;
}

/**
 * 废料订单 in 环保材料管理 (JB248, 客户 11-23b 事项 1 第三点: 「现有「废料订单」
 * 及相关异常记录归回环保材料管理。与工地清运及废料处理业务分开管理和统计。」).
 *
 * The contractor's order tracker as it was on 垃圾清运's 废料订单 tab, with
 * the statistics line it had there - its own 笔数 / 车次 / 过磅重量, never
 * added to 垃圾清运's - and 「ESG 统计」 at the bar's far right (JB249).
 * The recycler's own order book is a different page and is not touched.
 */
export function ContractorWasteOrders() {
  const t = useTranslations("wasteClearance");
  const { can } = useAuth();
  const searchParams = useSearchParams();
  const topBar = useCurrentProject();
  const params = new URLSearchParams(searchParams.toString());
  if (topBar.active) {
    params.delete("project");
    if (topBar.projectId) params.set("project", topBar.projectId);
  }
  const filters = wasteOrderFigureFilters(params);
  const summary = useQuery({
    queryKey: ["dispatches", "summary", "waste-orders", filters],
    queryFn: () => getDispatchSummary(filters),
    enabled: can("dispatch.view"),
  });
  const figures = summary.data?.clearance_totals;

  return (
    <div className="flex flex-col gap-4">
      <QueryFailedNote query={summary} what={t("kind.dispatch")} />
      <ClearanceStatsBar>
        {figures && (
          <p>
            {t("totals.dispatches", {
              records: figures.records,
              trips: figures.trips,
              weight: figures.weighed_kg,
            })}
          </p>
        )}
      </ClearanceStatsBar>
      <Dispatches />
    </div>
  );
}
