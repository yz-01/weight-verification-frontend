"use client";

import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/shared/page-primitives";
import type { SiteWorkerVisit } from "@/interfaces/site-workers";
import { useDateFormat } from "@/lib/dates";

/** 离场时间: the time, 在场, or 「定位未更新（最后 hh:mm）」 - never a guess. */
export function VisitExit({ visit }: { visit: SiteWorkerVisit }) {
  const t = useTranslations("siteWorkers");
  const df = useDateFormat();
  if (visit.exit_state === "EXITED" && visit.exited_at) {
    return <span className="tabular text-muted-foreground">{df.dateTime(visit.exited_at)}</span>;
  }
  if (visit.exit_state === "SIGNAL_LOST") {
    return (
      <StatusBadge
        tone="warning"
        label={
          visit.last_seen_at
            ? t("visit.signalLostAt", { at: df.dateTime(visit.last_seen_at) })
            : t("status.STALE")
        }
      />
    );
  }
  return <StatusBadge tone="positive" label={t("status.ON_SITE")} />;
}
