"use client";

import { Leaf } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * 「ESG 统计」 (JB249, 客户 11-23b 事项 2): 「在现有车次及重量统计栏的最右边，
 * 预留一个「ESG 统计」按钮位置…目前只需预留按钮位置，暂时不需要开发 ESG 页面、
 * 计算功能或点击操作。」
 *
 * Only the place: a button that is visibly greyed out and does nothing when
 * pressed. Hovering or tapping it says 「即将推出」, so nobody wonders whether
 * it is broken. No page, no figure, no request behind it.
 */
export function EsgStatsSlot() {
  const t = useTranslations("jb249");
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      disabledReason={t("soon")}
      data-esg-slot=""
    >
      <Leaf className="size-4" />
      {t("button")}
    </Button>
  );
}

/**
 * A page's statistics bar: its lines on the left, 「ESG 统计」 at the far right
 * (JB249). Used by 垃圾清运 and by 废料订单 in 环保材料管理; what the lines
 * say is each page's own and unchanged.
 */
export function ClearanceStatsBar({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-clearance-totals=""
      className="surface-panel flex flex-wrap items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm tabular sm:px-6"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div className="shrink-0 self-center">
        <EsgStatsSlot />
      </div>
    </section>
  );
}
