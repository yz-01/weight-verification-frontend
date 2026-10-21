"use client";

/**
 * 建筑商总部 Dashboard as the client's reference (J32, 10-20 图 3): 「让老板从看
 * 报表变成看现场」 - every project's latest site photo, the main numbers and
 * what waits, on one page.
 *
 * Lucas 10-20: the same layout as the picture, and nothing made up. Every
 * number, photo and name is the system's; 「较昨日」 is shown only where
 * yesterday is counted the same way (today's records and deliveries); the
 * weather is Open-Meteo's or none; 在场人数 is split by what the system knows
 * - accounts clocked in, and passes by worker, visitor or vehicle - rather
 * than the reference's 管理 / 施工 / 分包, which nothing records.
 */

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Building2,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  FileArchive,
  FileWarning,
  ImageIcon,
  Map as MapIcon,
  MapPin,
  PackageCheck,
  Send,
  ShieldAlert,
  Snowflake,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { KpiCard } from "@/components/shared/kpi-card";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import type { HeadquartersOverview, HeadquartersPhoto } from "@/interfaces/headquarters";
import { useCurrentProject } from "@/components/providers/current-project-provider";
import { useDateFormat } from "@/lib/dates";
import { ALL_PROJECTS_CHOICE } from "@/lib/project-context";
import { cardHref, cardProject, type HeadquartersCard } from "@/lib/headquarters-links";
import { TONES, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { getContractorDashboard, getWeather } from "@/services/contractor-dashboard.service";

/** WMO weather codes (Open-Meteo) by the word and icon shown. */
function weatherLook(code: number): { key: string; icon: LucideIcon } {
  if (code === 0) return { key: "clear", icon: Sun };
  if (code <= 2) return { key: "partly", icon: CloudSun };
  if (code === 3) return { key: "cloudy", icon: Cloud };
  if (code === 45 || code === 48) return { key: "fog", icon: CloudFog };
  if (code >= 51 && code <= 57) return { key: "drizzle", icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { key: "rain", icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { key: "snow", icon: Snowflake };
  if (code >= 95) return { key: "storm", icon: CloudLightning };
  return { key: "cloudy", icon: Cloud };
}

/** 大标题、副标题、「总公司视图」、日期和星期、天气 (要做 1). */
export function HeadquartersHero({ date, action }: { date: string; action?: React.ReactNode }) {
  const t = useTranslations("headquarters.reference");
  const format = useFormatter();
  const { user } = useAuth();
  // query-failure: no weather is the answer when it cannot be read (J32-1, 「天气取不到就不显示」)
  const weather = useQuery({
    queryKey: ["contractor-dashboard", "weather"],
    queryFn: getWeather,
    staleTime: 30 * 60_000,
  });
  const preferences = user?.company_preferences;
  const title = preferences?.dashboard_title || t("title");
  const subtitle = preferences?.dashboard_subtitle || t("subtitle");
  const background = user?.branding?.company_background_url;
  const day = new Date(`${date}T00:00:00`);
  const now = weather.data;
  const look = now ? weatherLook(now.weather_code) : null;
  return (
    <section
      data-headquarters-hero
      className="surface-panel relative overflow-hidden rounded-2xl"
      aria-label={title}
    >
      {background ? (
        // The company's own picture (公司资料), faded under the words.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={background} alt="" aria-hidden className="absolute inset-y-0 right-0 h-full w-2/3 object-cover" />
      ) : null}
      <div className="relative flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-background via-background/90 to-background/30 p-5 sm:p-6">
        <div className="min-w-0 max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              {t("companyView")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end sm:text-right">
          <p className="text-sm font-medium tabular-nums">
            {format.dateTime(day, { year: "numeric", month: "long", day: "numeric" })}{" "}
            <span className="text-muted-foreground">{format.dateTime(day, { weekday: "long" })}</span>
          </p>
          {now && look ? (
            <p className="flex items-center gap-2 text-sm" data-weather>
              <look.icon className="size-6 text-tone-amber-fg" aria-hidden />
              <span className="font-medium">{now.place}</span>
              <span className="text-lg font-semibold tabular-nums">{t("temperature", { value: now.temperature })}</span>
              <span className="text-muted-foreground">{t(`weather.${look.key}`)}</span>
            </p>
          ) : null}
          {action}
        </div>
      </div>
    </section>
  );
}

function Delta({ today, yesterday }: { today: number; yesterday: number | undefined }) {
  const t = useTranslations("headquarters.reference");
  const format = useFormatter();
  if (yesterday === undefined) return null;
  const change = today - yesterday;
  const Icon = change >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1", change > 0 ? TONES.green.text : change < 0 ? TONES.rose.text : "")}>
      {change !== 0 ? <Icon className="size-3" aria-hidden /> : null}
      {change === 0 ? t("same") : `${change > 0 ? "+" : ""}${format.number(change)}`}
      <span className="text-muted-foreground">{t("vsYesterday")}</span>
    </span>
  );
}

const KPIS: { card: HeadquartersCard; field: keyof HeadquartersOverview["totals"]; icon: LucideIcon; tone: Tone }[] = [
  { card: "projects", field: "active_projects", icon: Building2, tone: "blue" },
  { card: "today_records", field: "today_records", icon: ClipboardList, tone: "cyan" },
  { card: "pending_approvals", field: "pending_approvals", icon: ClipboardCheck, tone: "amber" },
  { card: "overdue_rectifications", field: "overdue_rectifications", icon: ShieldAlert, tone: "rose" },
  { card: "material_receipts_today", field: "material_receipts_today", icon: PackageCheck, tone: "green" },
  { card: "on_site_now", field: "on_site_now", icon: Users, tone: "purple" },
];

/** 数字卡一排 (要做 2): each opens its list, already filtered. */
export function HeadquartersKpis({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.reference.kpi");
  const format = useFormatter();
  const topBar = useCurrentProject();
  const everyProject = topBar.active && topBar.projectId ? ALL_PROJECTS_CHOICE : undefined;
  const yesterday = data.totals.yesterday ?? {};
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-headquarters-kpis>
      {KPIS.map(({ card, field, icon, tone }) => {
        const value = Number(data.totals[field] ?? 0);
        const before = (yesterday as Record<string, number | undefined>)[field];
        return (
          <KpiCard
            key={card}
            label={t(card)}
            value={format.number(value)}
            icon={icon}
            tone={tone === "rose" && value === 0 ? "slate" : tone}
            size="sm"
            href={cardHref(card, { project: cardProject(data, card) ?? everyProject, date: data.date })}
            detail={<Delta today={value} yesterday={before} />}
          />
        );
      })}
    </div>
  );
}

/** 今日现场动态（各项目） with 照片 / 地图 (要做 3, 4): one card per project. */
export function HeadquartersSiteActivity({
  data,
  onOpenPhoto,
  map,
}: {
  data: HeadquartersOverview;
  onOpenPhoto: (photo: HeadquartersPhoto) => void;
  map: React.ReactNode;
}) {
  const t = useTranslations("headquarters.reference");
  const kinds = useTranslations("headquarters.recordKind");
  const units = useTranslations("receipts.unit");
  const df = useDateFormat();
  const [view, setView] = useState<"photos" | "map">("photos");
  const projects = [...data.projects].sort((a, b) =>
    (b.latest_photo?.captured_at ?? "").localeCompare(a.latest_photo?.captured_at ?? ""),
  );
  return (
    <section className="surface-panel space-y-3 rounded-2xl p-4 sm:p-5" data-site-activity>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera className="size-5 text-primary" aria-hidden />
          <h2 className="text-base font-semibold">{t("activity")}</h2>
          <span className="text-xs text-muted-foreground">{t("activityHint")}</span>
        </div>
        <div className="flex rounded-full border p-0.5" role="tablist" aria-label={t("activity")}>
          {(["photos", "map"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
                view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "photos" ? <ImageIcon className="size-3.5" aria-hidden /> : <MapIcon className="size-3.5" aria-hidden />}
              {t(`view.${key}`)}
            </button>
          ))}
        </div>
      </header>
      {view === "map" ? (
        map
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
      ) : (
        // A row that scrolls sideways when there are many (要做 3).
        <ul className="flex snap-x gap-3 overflow-x-auto pb-2" data-activity-cards>
          {projects.map((project) => {
            const photo = project.latest_photo;
            const headline = photo?.headline;
            const today = photo ? photo.captured_at.slice(0, 10) === data.date : false;
            return (
              <li key={project.id} className="w-60 shrink-0 snap-start sm:w-64">
                <button
                  type="button"
                  disabled={!photo}
                  onClick={() => photo && onOpenPhoto(photo)}
                  className="group block w-full overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/60 hover:shadow-glow-sm disabled:cursor-default"
                >
                  <span className="relative block aspect-[4/3] bg-muted">
                    {photo?.image ? (
                      <Image src={photo.image} alt="" fill sizes="256px" className="object-cover" unoptimized />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-8" aria-hidden />
                      </span>
                    )}
                    {photo ? (
                      <span className="absolute bottom-2 left-2 rounded-md bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-foreground">
                        {kinds(photo.record_kind)}
                      </span>
                    ) : null}
                  </span>
                  <span className="block space-y-0.5 p-3">
                    <span className="block truncate text-sm font-semibold">{project.name}</span>
                    <span className="block truncate text-sm">
                      {headline
                        ? [
                            headline.title,
                            headline.quantity
                              ? `${Number(headline.quantity)}${headline.unit === "%" ? "%" : headline.unit ? ` ${units.has(headline.unit) ? units(headline.unit) : headline.unit}` : ""}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : photo
                          ? kinds(photo.record_kind)
                          : t("noPhoto")}
                    </span>
                    {photo ? (
                      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{today ? df.time(photo.captured_at) : df.dateTime(photo.captured_at)}</span>
                        <span className="truncate">{photo.photographer}</span>
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** 通知中心 (要做 5): the reader's latest notices. */
export function HeadquartersNotices() {
  const t = useTranslations("headquarters.reference");
  const df = useDateFormat();
  // The banner's own query: one read for both.
  const notices = useQuery({
    queryKey: ["contractor-dashboard", "banner-notifications"],
    queryFn: () => getContractorDashboard({ sections: ["notifications"], silent: true, covers: false }),
    refetchInterval: 60_000,
  });
  const rows = notices.data?.notifications?.rows ?? [];
  return (
    <section className="surface-panel flex flex-col gap-3 rounded-2xl p-4 sm:p-5" data-headquarters-notices>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Bell className="size-5 text-primary" aria-hidden />
          {t("notices")}
        </h2>
        <Link href="/notifications" className="text-xs font-medium text-primary hover:underline">
          {t("seeAll")}
        </Link>
      </header>
      <QueryFailedNote query={notices} what={t("notices")} />
      {rows.length === 0 && !notices.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("noNotices")}</p>
      ) : (
        <ul className="divide-y">
          {rows.slice(0, 5).map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{row.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{row.message}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{df.relative(row.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 项目分布 (the reference's map card): projects by state, from their addresses. */
export function HeadquartersByState({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.reference");
  const counts = new Map<string, number>();
  for (const project of data.projects) {
    const state = project.state || t("noState");
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return (
    <section className="surface-panel space-y-3 rounded-2xl p-4 sm:p-5" data-projects-by-state>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MapPin className="size-5 text-primary" aria-hidden />
          {t("byState")}
        </h2>
        <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
          {t("allProjects")}
        </Link>
      </header>
      {counts.size === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {[...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([state, count]) => (
              <li key={state} className="rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{state}</span>{" "}
                <span className="text-muted-foreground">{t("projectCount", { count })}</span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

const SPLIT: { key: string; tone: Tone }[] = [
  { key: "APP", tone: "blue" },
  { key: "WORKER", tone: "green" },
  { key: "VISITOR", tone: "amber" },
  { key: "VEHICLE", tone: "purple" },
];

/** 在场人数 (要做 5): the whole company's, by who is there. */
export function HeadquartersPresenceSplit({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.reference");
  const format = useFormatter();
  const byType = data.totals.gate_by_type ?? {};
  const values: Record<string, number> = { APP: data.totals.app_on_site, ...byType };
  const total = SPLIT.reduce((sum, { key }) => sum + (values[key] ?? 0), 0);
  const circumference = 2 * Math.PI * 40;
  let offset = 0;
  return (
    <section className="surface-panel space-y-3 rounded-2xl p-4 sm:p-5" data-presence-split>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Users className="size-5 text-primary" aria-hidden />
        {t("presence")}
      </h2>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="size-32 shrink-0 -rotate-90" role="img" aria-label={t("presenceTotal", { count: data.totals.on_site_now })}>
          <circle cx="50" cy="50" r="40" fill="none" strokeWidth="12" className="stroke-muted" />
          {total > 0
            ? SPLIT.map(({ key, tone }) => {
                const length = ((values[key] ?? 0) / total) * circumference;
                const segment = (
                  <circle
                    key={key}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="12"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    className={TONES[tone].text}
                  />
                );
                offset += length;
                return segment;
              })
            : null}
          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-foreground text-lg font-bold" transform="rotate(90 50 50)">
            {format.number(data.totals.on_site_now)}
          </text>
        </svg>
        <ul className="space-y-1.5 text-sm">
          {SPLIT.map(({ key, tone }) => (
            <li key={key} className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", TONES[tone].dot)} aria-hidden />
              <span>{t(`split.${key}`)}</span>
              <span className="ml-auto font-semibold tabular-nums">{format.number(values[key] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const QUICK: { key: string; href: string; permission: string; icon: LucideIcon; tone: Tone }[] = [
  { key: "siteRecord", href: "/field-tasks", permission: "field_task.view", icon: Camera, tone: "blue" },
  { key: "request", href: "/material-requests", permission: "material_request.submit", icon: Send, tone: "green" },
  { key: "approvals", href: "/approvals", permission: "approval.view", icon: ClipboardCheck, tone: "orange" },
  { key: "rectification", href: "/hazard-rectifications", permission: "safety.view", icon: FileWarning, tone: "rose" },
  { key: "archive", href: "/documents", permission: "document.view", icon: FileArchive, tone: "cyan" },
  { key: "reports", href: "/reports", permission: "report.view", icon: ClipboardList, tone: "purple" },
];

/** 快捷入口 (要做 5): only what this reader may open. */
export function HeadquartersQuickLinks() {
  const t = useTranslations("headquarters.reference.quick");
  const { can } = useAuth();
  const shown = QUICK.filter((link) => can(link.permission));
  if (shown.length === 0) return null;
  return (
    <section className="surface-panel space-y-3 rounded-2xl p-4 sm:p-5" data-quick-links>
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <div className="grid grid-cols-2 gap-2">
        {shown.map(({ key, href, icon: Icon, tone }) => (
          <Link
            key={key}
            href={href}
            className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition hover:shadow-glow-sm", TONES[tone].surface)}
          >
            <Icon className={cn("size-4 shrink-0", TONES[tone].text)} aria-hidden />
            <span className="truncate">{t(key)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
