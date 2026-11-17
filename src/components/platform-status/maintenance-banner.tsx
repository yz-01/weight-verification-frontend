"use client";

import { Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { usePlatformStatus } from "@/hooks/use-platform-status";
import { useDateFormat } from "@/lib/dates";
import {
  maintenanceWindowWording,
  showsMaintenanceBanner,
  type PlatformMaintenance,
} from "@/lib/platform-status";
import { cn } from "@/lib/utils";

/**
 * The 系统维护 window in words: 「11月20日 22:00 至 11月21日 02:00」, 「预计 …
 * 结束」, 「结束时间 MSE 会再通知」 (JB211).
 */
export function useMaintenanceWindowText() {
  const t = useTranslations("platformStatus.maintenance");
  const df = useDateFormat();
  return (maintenance: PlatformMaintenance) =>
    t(`window.${maintenanceWindowWording(maintenance)}`, {
      starts: df.dateTime(maintenance.starts_at),
      ends: df.dateTime(maintenance.ends_at),
    });
}

/**
 * The 系统维护 notice as one line under a page's header (JB211, Lucas 11-16
 * 「把它们真的做出来」; [SA p.15] 11.2.11, [SA p.2] 1.2.8 「系统维护通知」).
 *
 * Shown while maintenance is on or coming, on the sign-in pages and on every
 * signed-in page, so nobody is surprised by it: when, until when, and MSE's
 * own words. MSE staff read that customers are kept out and they are not.
 */
export function MaintenanceNotice({
  maintenance,
  staff = false,
  className,
}: {
  maintenance?: PlatformMaintenance | null;
  staff?: boolean;
  className?: string;
}) {
  const t = useTranslations("platformStatus.maintenance");
  const windowText = useMaintenanceWindowText();
  if (!maintenance || !showsMaintenanceBanner(maintenance)) return null;
  return (
    <div
      role="status"
      data-testid="maintenance-banner"
      data-state={maintenance.active ? "active" : "upcoming"}
      className={cn(
        "flex items-start gap-2 border border-warning/40 bg-warning/10 px-3 py-2 text-sm leading-6 text-foreground",
        className,
      )}
    >
      <Wrench className="mt-1 size-4 shrink-0 text-warning" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">
          {maintenance.active
            ? t("bannerActive", { window: windowText(maintenance) })
            : t("bannerUpcoming", { window: windowText(maintenance) })}
        </p>
        {maintenance.notice ? (
          <p className="[overflow-wrap:anywhere] whitespace-pre-line">{maintenance.notice}</p>
        ) : null}
        <p className="text-muted-foreground">{staff ? t("staffNote") : t("customerNote")}</p>
      </div>
    </div>
  );
}

/** The notice, read live; nothing at all while there is no maintenance. */
export function MaintenanceBanner({
  staff = false,
  className,
}: {
  staff?: boolean;
  className?: string;
}) {
  // query-failure: a failed ask shows no banner rather than a wrong one; the server still answers 系统维护 itself.
  const status = usePlatformStatus();
  return (
    <MaintenanceNotice
      maintenance={status.data?.maintenance}
      staff={staff}
      className={className}
    />
  );
}
