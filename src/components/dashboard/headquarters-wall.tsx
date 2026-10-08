"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Camera, Maximize, UserRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { usePhotoOpener } from "@/components/dashboard/headquarters-photos";
import { projectTone } from "@/components/dashboard/headquarters-map";
import { useAuth } from "@/components/providers/auth-provider";
import { ThemeSegmented } from "@/components/layout/theme-choice";
import { KpiCard } from "@/components/shared/kpi-card";
import {
  LocationMap,
  type LocationMapMarker,
} from "@/components/shared/location-map";
import { LoadFailed } from "@/components/shared/page-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  HeadquartersCountField,
  HeadquartersOverview,
  HeadquartersPhoto,
  TodayRecordKind,
} from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import {
  cardHref,
  cardProject,
  photoTarget,
  projectDashboardHref,
} from "@/lib/headquarters-links";
import { TONES, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import {
  getHeadquarters,
  getHeadquartersPhotos,
} from "@/services/contractor-dashboard.service";

/** The big screen refreshes on the dashboard's live cadence (E1). */
const LIVE_MS = 30_000;
const STREAM_SIZE = 12;

/** The figures along the bottom of the map, each in its own data colour. */
const STRIP: Array<{ field: HeadquartersCountField; tone: Tone }> = [
  { field: "pending_approvals", tone: "amber" },
  { field: "overdue_rectifications", tone: "rose" },
  { field: "material_receipts_today", tone: "green" },
  { field: "on_site_now", tone: "blue" },
  { field: "open_tasks", tone: "purple" },
  { field: "today_records", tone: "cyan" },
];

/** Bars in the chart ramp's order, one colour per kind of record. */
const BAR_TONES: Tone[] = ["cyan", "blue", "purple", "green", "amber", "rose", "orange", "slate"];

/**
 * 总部大屏 (E1, the canvas's 「总部大屏」 artboard): the company's live
 * picture on a wall screen. It follows the app's 外观 like every page, and
 * carries that same switch in its top-right corner (Lucas 2026-10-08); in
 * light the colours stay and the glow goes, as the canvas says. Full
 * screen over the console, sized for 1920×1080 and scaled up on a 4K panel,
 * refreshed every 30 seconds. Esc or 【退出大屏】 goes back to the 公司总部
 * dashboard.
 *
 * Only real data: the same overview and photos the 公司总部 dashboard reads.
 * Blocks the canvas draws without a data source here (equipment presence
 * rings, hazard trend, the note box) are left out rather than faked; see the
 * UI-phase report.
 */
export function HeadquartersWall() {
  const t = useTranslations("headquarters");
  const format = useFormatter();
  const router = useRouter();
  const { user, can } = useAuth();
  const allowed = user?.portal === "MSE_TRACE" && can("dashboard.view");
  const overview = useQuery({
    queryKey: ["contractor-dashboard", "headquarters"],
    queryFn: getHeadquarters,
    refetchInterval: LIVE_MS,
    enabled: allowed,
  });
  const photos = useQuery({
    queryKey: ["contractor-dashboard", "headquarters-wall-photos"],
    queryFn: () => getHeadquartersPhotos({ page: 1, page_size: STREAM_SIZE }),
    refetchInterval: LIVE_MS,
    enabled: allowed,
  });
  const opener = usePhotoOpener();

  // Esc leaves, as a wall screen has no menu to reach for.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role=dialog]")) {
        router.push("/dashboard");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // One rem per 1/120 of the screen width, between 16 and 32 px: the same
  // layout reads from across the room at 1920 and at 3840 wide.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.fontSize;
    root.style.fontSize = "clamp(16px, 0.8333vw, 32px)";
    return () => {
      root.style.fontSize = before;
    };
  }, []);

  // Someone without the company view is sent to the dashboard they have.
  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [allowed, router, user]);
  if (!allowed) return null;

  const data = overview.data;
  return (
    <div
      data-headquarters-wall
      className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground"
      style={{ backgroundImage: "var(--canvas-glow)" }}
    >
      <div className="mx-auto flex min-h-dvh max-w-[240rem] flex-col gap-4 p-4 xl:h-dvh xl:min-h-0 xl:px-6 xl:pb-6">
        <WallHeader />
        {overview.isError ? (
          <LoadFailed onRetry={() => void overview.refetch()} />
        ) : !data ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)_minmax(0,29rem)]">
            <div className="flex min-h-0 flex-col gap-4">
              <ProjectStatus data={data} />
              <TodayByKind data={data} />
            </div>
            <div className="flex min-h-0 flex-col gap-4">
              <WallMap data={data} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
                {STRIP.map(({ field, tone }) => (
                  <KpiCard
                    key={field}
                    label={t(`figures.field.${field}`)}
                    value={format.number(data.totals[field])}
                    tone={tone}
                    href={cardHref(field, { project: cardProject(data, field), date: data.date })}
                    data-wall-figure={field}
                  />
                ))}
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-4">
              {photos.isError ? (
                <LoadFailed onRetry={() => void photos.refetch()} />
              ) : (
                <PhotoPanels
                  rows={photos.data?.results}
                  loading={photos.isLoading}
                  onOpen={opener.open}
                />
              )}
            </div>
          </div>
        )}
      </div>
      {opener.sheet}
    </div>
  );
}

function WallHeader() {
  const t = useTranslations("headquarters");
  const df = useDateFormat();
  const { user } = useAuth();
  // The clock is the viewer's own; drawn after mount so the server render
  // and the first client render agree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  const branding = user?.branding;
  const companyName = branding?.company_name || user?.company_name || "";
  const logo = branding?.company_logo_url;
  return (
    <header className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-panel-border bg-switch-thumb shadow-glow">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={companyName} className="h-full w-full object-contain" />
          ) : (
            <Building2 className="size-6 text-tone-slate" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{companyName}</p>
          <p className="text-xs text-muted-foreground">{t("banner.companyView")}</p>
        </div>
      </div>
      <h1 className="border-b-2 border-primary bg-gradient-to-b from-transparent to-primary/12 px-10 py-2 text-center text-2xl font-bold tracking-widest text-foreground dark:[text-shadow:0_0_18px_var(--primary)] lg:text-3xl">
        {t("wall.title")}
      </h1>
      <div className="flex flex-wrap items-center justify-start gap-4 lg:justify-end">
        <div className="text-left lg:text-right">
          <p className="kpi-figure text-2xl text-foreground" suppressHydrationWarning>
            {now ? df.precise(now.toISOString()) : " "}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("wall.refresh")} · {t("wall.escHint")}
          </p>
        </div>
        <ThemeSegmented className="shrink-0" />
        <Link
          href="/dashboard"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-primary/40 px-4 text-sm text-tone-cyan-fg hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Maximize className="size-4" aria-hidden />
          {t("wall.exit")}
        </Link>
      </div>
    </header>
  );
}

/** A big-screen panel: the canvas's panel with its cyan title bar. */
function WallPanel({
  title,
  aside,
  className,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn("surface-panel flex min-h-0 flex-col gap-3 rounded-xl p-4", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="panel-title tracking-wide text-tone-cyan-fg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ProjectStatus({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters");
  const format = useFormatter();
  const rows = useMemo(
    () => [...data.projects].sort((a, b) => b.today_records - a.today_records).slice(0, 8),
    [data.projects],
  );
  const most = Math.max(1, ...rows.map((row) => row.today_records));
  return (
    <WallPanel title={t("wall.projectStatus")}>
      <div className="grid grid-cols-3 gap-3">
        <Figure label={t("wall.activeProjects")} value={format.number(data.totals.active_projects)} tone="cyan" />
        <Figure label={t("figures.field.on_site_now")} value={format.number(data.totals.on_site_now)} tone="green" />
        <Figure
          label={t("figures.field.overdue_rectifications")}
          value={format.number(data.totals.overdue_rectifications)}
          tone={data.totals.overdue_rectifications > 0 ? "rose" : "slate"}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("wall.todayByProject")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("map.noProjects")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((project, index) => (
            <li key={project.id}>
              <Link
                href={projectDashboardHref(project.id)}
                className="grid grid-cols-[minmax(0,7rem)_1fr_3rem] items-center gap-3 rounded-md text-sm hover:text-tone-cyan-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`${project.code} · ${project.name}`}
              >
                <span className="truncate">{project.name}</span>
                <span className="h-2 rounded-full bg-muted">
                  <span
                    className={cn("block h-2 rounded-full", TONES[BAR_TONES[index % 4]].bar, TONES[BAR_TONES[index % 4]].glow)}
                    style={{ width: `${(project.today_records / most) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{format.number(project.today_records)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WallPanel>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="min-w-0">
      <p className={cn("kpi-figure text-4xl", TONES[tone].text)}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function TodayByKind({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters");
  const format = useFormatter();
  const kinds = (Object.entries(data.totals.today_records_by_kind) as Array<[TodayRecordKind, number]>)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  const most = Math.max(1, ...kinds.map(([, value]) => value));
  return (
    <WallPanel title={t("wall.todayByKind")} className="flex-1">
      {kinds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("figures.nothingToday")}</p>
      ) : (
        <div className="flex min-h-40 flex-1 items-end gap-3 border-b border-panel-border px-1">
          {kinds.map(([kind, value], index) => {
            const tone = TONES[BAR_TONES[index % BAR_TONES.length]];
            return (
              <div key={kind} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className={cn("kpi-figure text-sm", tone.text)}>{format.number(value)}</span>
                <span
                  className={cn("w-full rounded-t-md opacity-90", tone.bar, tone.glow)}
                  style={{ height: `${Math.max(6, (value / most) * 100)}%` }}
                />
                <span className="w-full truncate pb-1 text-center text-2xs text-muted-foreground" title={t(`recordKind.${kind}`)}>
                  {t(`recordKind.${kind}`)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WallPanel>
  );
}

function WallMap({ data }: { data: HeadquartersOverview }) {
  const t = useTranslations("headquarters.map");
  const format = useFormatter();
  const placed = data.projects.filter((row) => row.has_location);
  const markers = useMemo<LocationMapMarker[]>(
    () =>
      placed.map((project) => ({
        id: project.id,
        latitude: Number(project.latitude),
        longitude: Number(project.longitude),
        label: `${project.code} · ${project.name}`,
        detail: t("markerDetail", {
          onSite: format.number(project.on_site_now),
          pending: format.number(project.pending_approvals),
          overdue: format.number(project.overdue_tasks + project.overdue_rectifications),
        }),
        tone: projectTone(project),
        stale: project.status !== "ACTIVE",
        icon: "project" as const,
      })),
    [format, placed, t],
  );
  return (
    <WallPanel
      title={t("title")}
      className="flex-1"
      aside={
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend tone="rose" label={t("legendOverdue")} />
          <Legend tone="amber" label={t("legendWaiting")} />
          <Legend tone="green" label={t("legendClear")} />
        </ul>
      }
    >
      <div className="relative min-h-[22rem] flex-1 overflow-hidden rounded-lg">
        <LocationMap
          markers={markers}
          className="absolute inset-0 h-full w-full"
          ariaLabel={t("title")}
          preserveViewOnDataUpdate
          fitBoundsKey={placed.map((row) => row.id).join(",")}
          singlePointZoom={12}
        />
        {placed.length === 0 && (
          <p className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-lg bg-overlay p-3 text-center text-sm text-overlay-foreground">
            {t("nothingPlaced")}
          </p>
        )}
      </div>
    </WallPanel>
  );
}

function Legend({ tone, label }: { tone: Tone; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", TONES[tone].dot, TONES[tone].glow)} aria-hidden />
      {label}
    </li>
  );
}

function PhotoPanels({
  rows,
  loading,
  onOpen,
}: {
  rows: HeadquartersPhoto[] | undefined;
  loading: boolean;
  onOpen: (photo: HeadquartersPhoto) => void;
}) {
  const t = useTranslations("headquarters");
  const df = useDateFormat();
  const list = rows ?? [];
  const [latest, ...stream] = list;
  return (
    <>
      <WallPanel
        title={t("wall.latestPhoto")}
        aside={
          latest ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-tone-green shadow-[0_0_8px_var(--tone-green)]" aria-hidden />
              {df.time(latest.captured_at)}
            </span>
          ) : null
        }
      >
        {loading ? (
          <Skeleton className="aspect-video w-full rounded-lg" />
        ) : !latest ? (
          <p className="rounded-lg border border-dashed border-panel-border py-10 text-center text-sm text-muted-foreground">
            {t("photos.empty")}
          </p>
        ) : (
          <WallPhoto photo={latest} large onOpen={onOpen} />
        )}
      </WallPanel>
      <WallPanel title={t("wall.photoStream")} className="flex-1">
        {loading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : stream.length === 0 ? (
          latest ? null : <p className="text-sm text-muted-foreground">{t("photos.empty")}</p>
        ) : (
          <ul className="-mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {stream.map((photo) => (
              <li key={photo.id}>
                <WallPhoto photo={photo} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </WallPanel>
    </>
  );
}

function WallPhoto({
  photo,
  large = false,
  onOpen,
}: {
  photo: HeadquartersPhoto;
  large?: boolean;
  onOpen: (photo: HeadquartersPhoto) => void;
}) {
  const t = useTranslations("headquarters");
  const df = useDateFormat();
  const opens = photoTarget(photo) !== null;
  const kind = t(`recordKind.${photo.record_kind}`);
  const picture = (
    <span className={cn("photo-hatch relative block shrink-0 overflow-hidden rounded-lg", large ? "aspect-video w-full" : "h-18 w-24")}>
      {photo.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.image}
          alt={t("photos.alt", { kind, project: photo.project })}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <Camera className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
      )}
      {large ? (
        <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-overlay px-2 py-1 text-xs text-overlay-foreground">
          {photo.project} · {photo.photographer || t("photos.unknownPhotographer")} · {df.time(photo.captured_at)}
        </span>
      ) : null}
    </span>
  );
  const body = large ? (
    picture
  ) : (
    <span className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 rounded-lg border border-panel-border bg-muted/40 p-2.5">
      {picture}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{photo.project}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{df.time(photo.captured_at)}</span>
        </span>
        <span className="truncate text-sm text-tone-cyan-fg">{kind}</span>
        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <UserRound className="size-3 shrink-0" aria-hidden />
          {photo.photographer || t("photos.unknownPhotographer")}
        </span>
      </span>
    </span>
  );
  if (!opens) return <div className="block">{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(photo)}
      className="block w-full rounded-lg text-left transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </button>
  );
}

/** 【大屏模式】 on the 公司总部 dashboard. */
export function WallButton() {
  const t = useTranslations("headquarters.wall");
  return (
    <Link
      href="/dashboard/wall"
      data-wall-open
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary bg-(image:--primary-gradient) px-4 text-sm font-semibold text-primary-foreground shadow-glow hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11"
    >
      <Maximize className="size-4" aria-hidden />
      {t("open")}
    </Link>
  );
}
