"use client";

/**
 * 门岗 card (batch H, HD10; 事项13): 「门岗发过来的照片也是属于很重要的…必须给
 * 他一个独立卡片在主页面」.
 *
 * On both dashboards - the company's and the project's - beside the six small
 * cards (推翻 Q20 / B8's 「只有 6 张」): today's gate photos, the gate issues
 * still open, and today's photos as thumbnails, each opening its record in
 * 工地门禁 → 日常拍照记录 / 门岗事项. Shown to whoever may see site access.
 *
 * 「今日照片」 and 「门岗记录」 both open 日常拍照记录 (I25, ID61: 「点击后直接
 * 进入『日常拍照记录』」); 今日照片 with today's date and time range (I15) on
 * the company's clock, whatever the computer's own clock says.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { useCompanyTimeZone } from "@/components/shared/date-time-range-filter";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { useDateFormat } from "@/lib/dates";
import { todayRange } from "@/lib/gate-time-range";
import { cn } from "@/lib/utils";
import { getGateSummary } from "@/services/site-access.service";

/** How often the card looks again: a lorry at the gate is now, not tomorrow. */
const REFRESH_MS = 60_000;

export function GateCard({ project = "" }: { project?: string }) {
  const t = useTranslations("gateCard");
  const df = useDateFormat();
  const { can } = useAuth();
  const timeZone = useCompanyTimeZone();
  const allowed = can("site_access.view");
  const summary = useQuery({
    queryKey: ["gate-summary", project],
    queryFn: () => getGateSummary(project || undefined),
    enabled: allowed,
    refetchInterval: REFRESH_MS,
  });
  if (!allowed) return null;
  const data = summary.data;
  const scope = project ? `&project=${project}` : "";
  const today = todayRange(timeZone);

  return (
    <section
      aria-label={t("title")}
      className="surface-panel space-y-3 rounded-xl p-3 sm:p-4"
      data-gate-card
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-info/10 text-info">
            <DoorOpen className="size-4" />
          </span>
          {t("title")}
        </span>
        <Link
          href={`/gate-records?tab=photos&occurred_from=${today.occurred_from}&occurred_to=${today.occurred_to}${scope}`}
          className="flex items-baseline gap-1.5 text-sm hover:underline"
        >
          <span className="text-muted-foreground">{t("todayPhotos")}</span>
          <span className="tabular text-lg font-semibold">{data?.today_photos ?? "–"}</span>
        </Link>
        <Link
          href={`/gate-records?tab=issues&issue_status=OPEN${scope}`}
          className="flex items-baseline gap-1.5 text-sm hover:underline"
        >
          <span className="text-muted-foreground">{t("openIssues")}</span>
          <span
            className={cn(
              "tabular text-lg font-semibold",
              (data?.open_issues ?? 0) > 0 && "text-warning",
            )}
          >
            {data?.open_issues ?? "–"}
          </span>
        </Link>
        <Link
          href={`/gate-records?tab=photos${scope}`}
          className="ml-auto flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {t("open")}
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <QueryFailedNote query={summary} what={t("what")} />
      {data && data.thumbs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {data && data.thumbs.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {data.thumbs.map((thumb) => (
            <li key={thumb.id}>
              <Link
                href={`/gate-records?tab=${thumb.is_issue ? "issues" : "photos"}&gate_incident=${thumb.incident}&project=${thumb.project}`}
                className="group relative block overflow-hidden rounded-md border bg-muted"
                title={`${thumb.incident_no} · ${thumb.guard_name} · ${df.dateTime(thumb.captured_at)}`}
              >
                {thumb.watermarked_image ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={thumb.watermarked_image}
                    alt={t("photoAlt", { reference: thumb.incident_no })}
                    className="aspect-4/3 w-full object-cover object-bottom transition-transform group-hover:scale-105"
                  />
                ) : (
                  <span className="grid aspect-4/3 place-items-center text-muted-foreground">
                    <DoorOpen className="size-5" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-overlay px-1 py-0.5 text-2xs text-overlay-foreground">
                  {thumb.is_issue ? `${t("issue")} · ` : ""}
                  {df.time(thumb.captured_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
