"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bell, Building2, FolderKanban, UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { DASHBOARD_SCOPES } from "@/lib/dashboard-scopes";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getContractorDashboard } from "@/services/contractor-dashboard.service";

/**
 * The top of both dashboards (C11, C12): the company's own name, logo and
 * background as set in 公司资料 (Phase 6), who is signed in, the outstanding
 * notifications, and which level the reader is on - the whole company, or one
 * named project. Nothing here is sample data: a company with no logo or
 * background shows none, and the date is the server's.
 *
 * The report centre opens with it too (B12, X15), as 「报表中心」 and without
 * the dashboard's level switch; there a company with no background picture
 * gets a solid band rather than a blank one.
 */
export function CompanyBanner({
  scope,
  projectName,
  date,
}: {
  scope: "company" | "project" | "reports";
  /** The project being read; required on the project level. */
  projectName?: string;
  /** The server's date for the figures below, so a wrong PC clock cannot lie. */
  date?: string;
}) {
  const t = useTranslations("headquarters.banner");
  const levels = useTranslations("dashboard.scope");
  const format = useFormatter();
  const df = useDateFormat();
  const { user } = useAuth();
  // The reader's own outstanding notices - the same count the notification
  // centre leads with (今天新增 + 之前未完成).
  const notices = useQuery({
    queryKey: ["contractor-dashboard", "banner-notifications"],
    queryFn: () =>
      getContractorDashboard({ sections: ["notifications"], silent: true }),
    refetchInterval: 60_000,
  });
  // A failed count shows the plain link rather than a number it never read.
  const outstanding = notices.isError
    ? undefined
    : notices.data?.notifications?.total;
  if (!user) return null;
  const branding = user.branding;
  const companyName = branding?.company_name || user.company_name || "";
  const background = branding?.company_background_url;
  const logo = branding?.company_logo_url;
  // Light words on the picture, or on the report centre's solid band.
  const onColour = Boolean(background) || scope === "reports";

  return (
    <section
      aria-label={t("label")}
      data-company-banner={scope}
      className={cn(
        "relative overflow-hidden rounded-xl border shadow-sm",
        !background && scope === "reports" ? "bg-slate-800 text-white" : "bg-card",
      )}
    >
      {background && (
        // The company's own picture, dimmed so the words on it stay readable.
        <img
          src={background}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div
        className={cn(
          "relative flex flex-wrap items-center gap-4 p-4 sm:p-5",
          background &&
            "bg-gradient-to-r from-black/70 via-black/45 to-black/10 text-white",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
            {logo ? (
              <img src={logo} alt={companyName} className="h-full w-full object-contain" />
            ) : (
              <Building2 className="size-6 text-muted-foreground" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold sm:text-xl">{companyName}</h1>
            <p
              className={cn(
                "flex flex-wrap items-center gap-x-2 text-sm",
                onColour ? "text-white/85" : "text-muted-foreground",
              )}
            >
              {scope === "reports" ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  <BarChart3 className="size-3.5" aria-hidden />
                  {t("reportsView")}
                </span>
              ) : scope === "company" ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  <Building2 className="size-3.5" aria-hidden />
                  {t("companyView")}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 font-medium"
                  data-current-project
                >
                  <FolderKanban className="size-3.5" aria-hidden />
                  {projectName
                    ? t("projectView", { project: projectName })
                    : t("allProjectsView")}
                </span>
              )}
              {date && <span>· {df.date(date)}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4" aria-hidden />
            <span className="font-medium">{user.full_name}</span>
            {user.role_name && (
              <span className={onColour ? "text-white/75" : "text-muted-foreground"}>
                · {user.role_name}
              </span>
            )}
          </span>
          <Link
            href="/notifications"
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              onColour ? "border-white/40" : "bg-background",
            )}
          >
            <Bell className="size-3.5" aria-hidden />
            {outstanding === undefined
              ? t("notifications")
              : t("notificationsCount", { count: format.number(outstanding) })}
          </Link>
          {scope !== "reports" && (
          <nav
            aria-label={levels("label")}
            className="flex rounded-lg border bg-card p-0.5 text-foreground shadow-sm"
          >
            {DASHBOARD_SCOPES.map((level) => (
              <Link
                key={level.key}
                href={level.href}
                aria-current={level.key === scope ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  level.key === scope
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {levels(level.labelKey)}
              </Link>
            ))}
          </nav>
          )}
        </div>
      </div>
    </section>
  );
}
