"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Camera,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  HardHat,
  Maximize,
  Minimize,
  Snowflake,
  Sun,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { LocationMap, type LocationMapMarker } from "@/components/shared/location-map";
import type {
  WallEsg,
  WallPhoto,
  WallProject,
  WallScreenData,
  WallWeather,
} from "@/interfaces/wall-screen";
import { TONES, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import {
  IDLE_MS,
  PHOTO_MS,
  REFRESH_MS,
  SLIDE_MS,
  curvePath,
  keepSlide,
  nextSlideIndex,
  percent,
  share,
  wallSlides,
  weightReading,
  type WallSlide,
} from "@/lib/wall-rotation";
import { weatherWordKey, type WeatherWord } from "@/lib/weather-words";

/**
 * 总部大屏 (JB291, 客户 11-27e): 「企业形象及智慧工地展示平台」 for the office,
 * the meeting room and the reception area.
 *
 * - 一 It plays by itself: 公司总览, then each project head office left on the
 *   wall, 15 s each, round and round (`lib/wall-rotation`). A thin bar shows
 *   how long the slide has left, and where in the loop it is.
 * - 二 One screen, never scrolled: the company's logo and name, the live date,
 *   time and weather; the project map, each project's progress, people and
 *   machines today, ESG from the existing records, and the latest 施工进度
 *   photos turning over. The layout is in rem and the rem follows the screen
 *   (1/120 of its width or 1/67.5 of its height, whichever is smaller), so
 *   1920×1080, 1366×768 and 4K all show the same picture.
 * - 三 Rings, a drawn curve, coloured donuts, numbers counting up and the photo
 *   carousel, on the dark presentation theme, large type.
 * - 四 Its own loop and its own data: it never reads the top bar's project; it
 *   refreshes itself every 90 s in the background without touching the loop,
 *   and keeps the last good picture through a network failure (「更新于」 in
 *   the corner says how old it is).
 * - 五 It shows only what the server's wall answer holds - no amount,
 *   supplier, approval or anomaly - and a part whose module is off, or that
 *   head office did not allow, is simply not drawn.
 *
 * `source` is where the data comes from: the signed-in head office
 * (`/wall`) or a wall link (`/screen/<token>`). `controls` are the extra
 * buttons of the signed-in wall (settings, exit); they hide with the cursor.
 */
export interface WallSource {
  queryKey: readonly unknown[];
  load: () => Promise<WallScreenData>;
  weather: (project: string) => Promise<WallWeather | null>;
  /** What to say when the data cannot be had at all (a link that ended). */
  failure?: (error: unknown) => string | null;
}

const WEATHER_ICONS: Record<WeatherWord, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: Snowflake,
  storm: CloudLightning,
};

/** Colours of the three weights in the environment donut. */
const WEIGHT_TONES: Tone[] = ["green", "amber", "cyan"];
/** Bars of 各项目工程进度, at most this many (the rest are in the loop). */
const PROGRESS_ROWS = 7;

export function WallScreen({ source, controls }: { source: WallSource; controls?: React.ReactNode }) {
  const t = useTranslations("jb291");
  const data = useQuery({
    queryKey: source.queryKey,
    queryFn: source.load,
    refetchInterval: REFRESH_MS,
    // A wall is often the only window and may count as hidden behind a
    // screensaver or another window: it keeps itself current regardless.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: 2,
  });
  const slides = useMemo(() => wallSlides(data.data), [data.data]);
  const index = useRotation(slides);
  const slide = slides[index] ?? slides[0];
  const idle = useIdle();
  useWallScale();

  const failure = data.data ? null : data.isError ? (source.failure?.(data.error) ?? t("loadFailed")) : null;
  const project = slide.kind === "project" ? data.data?.projects.find((row) => row.id === slide.id) : undefined;

  return (
    <div
      data-wall-screen
      data-wall-idle={idle ? "true" : "false"}
      className={cn(
        "dark fixed inset-0 z-50 overflow-hidden bg-background text-foreground",
        idle && "cursor-none",
      )}
      style={{ backgroundImage: "var(--canvas-glow)" }}
    >
      <div className="flex h-dvh flex-col gap-[1rem] p-[1.5rem]">
        {data.data ? (
          <>
            <WallHeader data={data.data} project={project} source={source} updatedAt={data.dataUpdatedAt} stale={data.isError} />
            <SlideIndicator slides={slides} index={index} data={data.data} />
            <main key={slide.id} className="animate-in fade-in min-h-0 flex-1 duration-700" data-wall-slide={slide.kind}>
              {project ? (
                <ProjectSlide project={project} modules={data.data.modules} />
              ) : (
                <OverviewSlide data={data.data} />
              )}
            </main>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[2rem] text-muted-foreground" role={failure ? "alert" : "status"}>
              {failure ?? t("loading")}
            </p>
          </div>
        )}
      </div>
      <div
        className={cn(
          "fixed bottom-[1.5rem] right-[1.5rem] z-[600] flex items-center gap-[0.75rem] transition-opacity duration-500",
          idle ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        data-wall-controls
      >
        <FullscreenButton />
        {controls}
      </div>
    </div>
  );
}

// ---- hooks ------------------------------------------------------------------

/**
 * The slide on screen. One timer at a time, armed when the slide changes and
 * cleared with it; a refresh that leaves the slides as they were does not
 * touch it, so the loop never restarts under new data.
 */
function useRotation(slides: WallSlide[]): number {
  const [at, setAt] = useState({ id: "overview", index: 0 });
  const index = keepSlide(at.id, at.index, slides);
  const id = slides[index]?.id ?? "overview";
  const count = slides.length;
  const latest = useRef(slides);
  useEffect(() => {
    latest.current = slides;
  }, [slides]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = nextSlideIndex(index, latest.current.length);
      setAt({ id: latest.current[next]?.id ?? "overview", index: next });
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, id, count]);
  return index;
}

/** True after `IDLE_MS` without a move: the cursor and the buttons hide. */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);
  return idle;
}

/** One rem per 1/120 of the width or 1/67.5 of the height, whichever is less. */
function useWallScale() {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.fontSize;
    root.style.fontSize = "clamp(8px, min(0.8333vw, 1.4815vh), 48px)";
    return () => {
      root.style.fontSize = before;
    };
  }, []);
}

/** The time now, a tick a second, drawn after mount. */
function useNow(): Date | null {
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
  return now;
}

// ---- header and indicator ---------------------------------------------------

function WallHeader({
  data,
  project,
  source,
  updatedAt,
  stale,
}: {
  data: WallScreenData;
  project: WallProject | undefined;
  source: WallSource;
  updatedAt: number;
  stale: boolean;
}) {
  const t = useTranslations("jb291");
  const hq = useTranslations("headquarters");
  const format = useFormatter();
  const now = useNow();
  const updated = updatedAt ? format.dateTime(new Date(updatedAt), { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[1.5rem]">
      <div className="flex min-w-0 items-center gap-[1rem]" data-wall-brand>
        <span className="flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-[0.9rem] border border-panel-border bg-paper">
          {data.company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.company.logo_url} alt={data.company.name} className="h-full w-full object-contain" />
          ) : (
            <Building2 className="size-[2.25rem] text-tone-slate" aria-hidden />
          )}
        </span>
        <p className="truncate text-[2.25rem] font-bold leading-tight">{data.company.name}</p>
      </div>
      <div className="text-center">
        <h1 className="border-b-2 border-primary px-[2.5rem] pb-[0.25rem] text-[2.6rem] font-bold tracking-widest [text-shadow:0_0_18px_var(--primary)]">
          {hq("wall.title")}
        </h1>
        <p className="mt-[0.35rem] truncate text-[1.6rem] text-tone-cyan-fg" data-wall-slide-title>
          {project ? [project.name, project.place].filter(Boolean).join(" · ") : t("overview")}
        </p>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-[1.5rem] text-right">
        <WallWeatherReading project={project?.id ?? ""} source={source} />
        <div>
          <p className="kpi-figure text-[3rem] leading-none" suppressHydrationWarning data-wall-clock>
            {now ? format.dateTime(now, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : " "}
          </p>
          <p className="mt-[0.35rem] text-[1.35rem] text-muted-foreground" suppressHydrationWarning>
            {now ? format.dateTime(now, { year: "numeric", month: "long", day: "numeric", weekday: "long" }) : " "}
          </p>
          <p className={cn("text-[1.1rem]", stale ? "text-tone-amber-fg" : "text-muted-foreground")} data-wall-updated>
            {stale ? t("stale", { time: updated }) : t("updatedAt", { time: updated })}
          </p>
        </div>
      </div>
    </header>
  );
}

/** The weather on the slide: the project's place, else the company's. */
function WallWeatherReading({ project, source }: { project: string; source: WallSource }) {
  const t = useTranslations("headquarters.reference");
  // query-failure: no weather is the answer when it cannot be read (J32-1, 「天气取不到就不显示」)
  const weather = useQuery({
    queryKey: [...source.queryKey, "weather", project],
    queryFn: () => source.weather(project),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  // 「天气取不到就不显示」 (J32-1): no reading, no weather.
  if (!weather.data) return null;
  const key = weatherWordKey(weather.data.weather_code);
  const Icon = WEATHER_ICONS[key];
  return (
    <div className="flex items-center gap-[0.75rem]" data-wall-weather>
      <Icon className="size-[3.25rem] text-tone-amber" aria-hidden />
      <div>
        <p className="kpi-figure text-[2.4rem] leading-none">{t("temperature", { value: weather.data.temperature })}</p>
        <p className="mt-[0.3rem] text-[1.3rem] text-muted-foreground">
          {weather.data.place} · {t(`weather.${key}`)}
        </p>
      </div>
    </div>
  );
}

function SlideIndicator({ slides, index, data }: { slides: WallSlide[]; index: number; data: WallScreenData }) {
  const t = useTranslations("jb291");
  return (
    <div className="flex items-center gap-[1rem]" data-wall-indicator aria-label={t("slideOf", { current: index + 1, total: slides.length })}>
      <ol className="flex min-w-0 flex-1 gap-[0.4rem]">
        {slides.map((slide, position) => (
          <li
            key={slide.id}
            className="relative h-[0.45rem] min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
            title={slide.kind === "overview" ? t("overview") : data.projects.find((row) => row.id === slide.id)?.name}
          >
            {position < index && <span className="absolute inset-0 bg-primary/45" />}
            {position === index && (
              <span
                key={`${slide.id}-${index}`}
                data-wall-motion
                className="absolute inset-0 origin-left bg-primary"
                style={{ animation: `wall-timer ${SLIDE_MS}ms linear forwards` }}
              />
            )}
          </li>
        ))}
      </ol>
      <span className="shrink-0 text-[1.2rem] tabular-nums text-muted-foreground">
        {t("slideOf", { current: index + 1, total: slides.length })}
      </span>
    </div>
  );
}

// ---- slides -----------------------------------------------------------------

export function OverviewSlide({ data }: { data: WallScreenData }) {
  const t = useTranslations("jb291");
  const { overview, modules } = data;
  const located = overview.located > 0;
  const photos = overview.photos && overview.photos.length > 0 ? overview.photos : null;
  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-[1rem]">
      <div className={cn("grid min-h-0 gap-[1rem]", photos ? "grid-cols-[34rem_minmax(0,1fr)_38rem]" : "grid-cols-[34rem_minmax(0,1fr)]")}>
        <div className="flex min-h-0 flex-col gap-[1rem]">
          <div className="grid grid-cols-2 gap-[1rem]">
            <BigFigure label={t("projects")} value={overview.projects} tone="cyan" icon={Building2} />
            <BigFigure label={t("peopleOnSite")} value={overview.people_on_site ?? 0} tone="green" icon={HardHat} unit={t("people")} />
            {modules.equipment && (
              <>
                <BigFigure label={t("equipmentOnSite")} value={overview.equipment_on_site ?? 0} tone="blue" icon={Truck} unit={t("machines")} />
                <BigFigure label={t("equipmentWorking")} value={overview.equipment_working ?? 0} tone="amber" icon={Truck} unit={t("machines")} />
              </>
            )}
          </div>
          {located && modules.progress && overview.progress.length > 0 && <ProgressBars data={data} />}
        </div>
        {located ? (
          <Panel title={t("map")} className="min-h-0" data-wall-panel="map">
            <WallMap projects={data.projects} />
          </Panel>
        ) : modules.progress && overview.progress.length > 0 ? (
          <ProgressBars data={data} />
        ) : (
          <Panel title={t("projectsOnWall")} data-wall-panel="names">
            <ul className="grid grid-cols-2 gap-[0.75rem] text-[1.6rem]">
              {data.projects.map((project) => (
                <li key={project.id} className="truncate">{project.name}</li>
              ))}
            </ul>
          </Panel>
        )}
        {photos && (
          <Panel title={t("photos")} className="min-h-0" data-wall-panel="photos">
            <PhotoCarousel photos={photos} showProject />
          </Panel>
        )}
      </div>
      {overview.esg && <EsgBand esg={overview.esg} scope="company" />}
    </div>
  );
}

export function ProjectSlide({ project, modules }: { project: WallProject; modules: WallScreenData["modules"] }) {
  const t = useTranslations("jb291");
  const photos = project.photos && project.photos.length > 0 ? project.photos : null;
  const located = project.latitude !== null && project.longitude !== null;
  return (
    <div className={cn("grid h-full min-h-0 gap-[1rem]", project.esg ? "grid-rows-[minmax(0,1fr)_auto]" : "grid-rows-1")}>
      <div className={cn("grid min-h-0 gap-[1rem]", photos ? "grid-cols-[34rem_minmax(0,1fr)_38rem]" : "grid-cols-[34rem_minmax(0,1fr)]")}>
        <div className="flex min-h-0 flex-col gap-[1rem]">
          {project.progress && (
            <Panel title={t("progress")} data-wall-panel="gauge">
              <ProgressRing planned={percent(project.progress.planned)} actual={percent(project.progress.actual)} />
            </Panel>
          )}
          <div className="grid grid-cols-2 gap-[1rem]">
            <BigFigure label={t("peopleOnSite")} value={project.people_on_site} tone="green" icon={HardHat} unit={t("people")} />
            {modules.equipment && (
              <BigFigure label={t("equipmentWorking")} value={project.equipment_working ?? 0} tone="amber" icon={Truck} unit={t("machines")} />
            )}
          </div>
          {located && project.progress && (
            <Panel title={t("location")} className="min-h-[12rem] flex-1" data-wall-panel="pin">
              <WallMap projects={[project]} />
            </Panel>
          )}
        </div>
        {project.progress ? (
          <Panel title={t("curve")} className="min-h-0" data-wall-panel="curve" aside={<CurveLegend />}>
            <ProgressCurve progress={project.progress} />
          </Panel>
        ) : located ? (
          <Panel title={t("location")} className="min-h-0" data-wall-panel="pin">
            <WallMap projects={[project]} />
          </Panel>
        ) : (
          <Panel title={t("projectFacts")} data-wall-panel="facts">
            <p className="text-[3rem] font-bold">{project.name}</p>
            {project.place && <p className="text-[2rem] text-muted-foreground">{project.place}</p>}
          </Panel>
        )}
        {photos && (
          <Panel title={t("photos")} className="min-h-0" data-wall-panel="photos">
            <PhotoCarousel photos={photos} />
          </Panel>
        )}
      </div>
      {project.esg && <EsgBand esg={project.esg} scope="project" />}
    </div>
  );
}

// ---- building blocks ----------------------------------------------------------

function Panel({
  title,
  aside,
  className,
  children,
  ...rest
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & Record<`data-${string}`, string>) {
  return (
    <section {...rest} aria-label={title} className={cn("surface-panel flex min-h-0 flex-col gap-[0.75rem] rounded-[1rem] p-[1.25rem]", className)}>
      <div className="flex items-center justify-between gap-[1rem]">
        <h2 className="text-[1.6rem] font-semibold tracking-wide text-tone-cyan-fg">{title}</h2>
        {aside}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A number that counts up to its value when it appears or changes. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const format = useFormatter();
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    // Less motion asked for: straight to the value, in the first frame.
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 1200;
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (at: number) => {
      const progress = duration ? Math.min(1, (at - start) / duration) : 1;
      const eased = 1 - (1 - progress) ** 3;
      setShown(origin + (value - origin) * eased);
      if (progress < 1) frame = window.requestAnimationFrame(step);
      else from.current = value;
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {format.number(shown, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
    </span>
  );
}

function BigFigure({
  label,
  value,
  tone,
  icon: Icon,
  unit,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIcon;
  unit?: string;
}) {
  return (
    <div className={cn("surface-panel rounded-[1rem] p-[1.1rem]")} data-wall-figure>
      <div className="flex items-center gap-[0.5rem] text-[1.3rem] text-muted-foreground">
        <Icon className={cn("size-[1.5rem]", TONES[tone].text)} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("kpi-figure mt-[0.4rem] text-[3.6rem] leading-none", TONES[tone].text)}>
        <CountUp value={value} />
        {unit && <span className="ml-[0.4rem] text-[1.4rem] text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

/** 各项目工程进度: each project's 计划 and 实际 as two bars. */
function ProgressBars({ data }: { data: WallScreenData }) {
  const t = useTranslations("jb291");
  const format = useFormatter();
  const rows = data.overview.progress.slice(0, PROGRESS_ROWS);
  const more = data.overview.progress.length - rows.length;
  return (
    <Panel title={t("progressAll")} className="flex-1" data-wall-panel="progress" aside={<CurveLegend />}>
      <ul className="flex flex-1 flex-col justify-around gap-[0.6rem]">
        {rows.map((row) => (
          <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-[0.75rem]">
            <span className="col-span-2 truncate text-[1.35rem]">{row.name}</span>
            <span className="flex flex-col gap-[0.25rem]">
              <span className="h-[0.5rem] rounded-full bg-muted">
                <span className="block h-full rounded-full bg-tone-slate/70 transition-[width] duration-1000" style={{ width: `${percent(row.planned)}%` }} />
              </span>
              <span className="h-[0.8rem] rounded-full bg-muted">
                <span className={cn("block h-full rounded-full transition-[width] duration-1000", TONES.cyan.bar)} style={{ width: `${percent(row.actual)}%` }} />
              </span>
            </span>
            <span className="kpi-figure text-right text-[1.6rem] text-tone-cyan-fg">
              {format.number(percent(row.actual), { maximumFractionDigits: 0 })}%
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-[1.1rem] text-muted-foreground">{t("moreProjects", { count: more })}</p>}
    </Panel>
  );
}

function CurveLegend() {
  const t = useTranslations("jb291");
  return (
    <ul className="flex gap-[1rem] text-[1.15rem] text-muted-foreground">
      <li className="flex items-center gap-[0.4rem]">
        <span className="h-[0.3rem] w-[1.5rem] rounded-full bg-tone-slate" aria-hidden />
        {t("planned")}
      </li>
      <li className="flex items-center gap-[0.4rem]">
        <span className="h-[0.3rem] w-[1.5rem] rounded-full bg-tone-cyan" aria-hidden />
        {t("actual")}
      </li>
    </ul>
  );
}

/** 环形仪表: 实际 % inside, 计划 % on the outer ring. */
function ProgressRing({ planned, actual }: { planned: number; actual: number }) {
  const t = useTranslations("jb291");
  const outer = 2 * Math.PI * 46;
  const inner = 2 * Math.PI * 36;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const ahead = actual >= planned;
  return (
    <div className="flex items-center gap-[1.5rem]" data-wall-ring>
      <svg viewBox="0 0 100 100" className="size-[13rem] shrink-0 -rotate-90" role="img" aria-label={`${t("actual")} ${actual}% · ${t("planned")} ${planned}%`}>
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="50" cy="50" r="46" fill="none" strokeWidth="5" strokeLinecap="round"
          className="stroke-tone-slate transition-[stroke-dashoffset] duration-[1400ms]"
          strokeDasharray={outer}
          strokeDashoffset={drawn ? outer * (1 - planned / 100) : outer}
        />
        <circle cx="50" cy="50" r="36" fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="50" cy="50" r="36" fill="none" strokeWidth="10" strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-[1400ms]", ahead ? "stroke-tone-green" : "stroke-tone-cyan")}
          strokeDasharray={inner}
          strokeDashoffset={drawn ? inner * (1 - actual / 100) : inner}
        />
      </svg>
      <dl className="space-y-[0.75rem]">
        <div>
          <dt className="text-[1.3rem] text-muted-foreground">{t("actual")}</dt>
          <dd className={cn("kpi-figure text-[3.6rem] leading-none", ahead ? "text-tone-green-fg" : "text-tone-cyan-fg")}>
            <CountUp value={actual} decimals={1} />%
          </dd>
        </div>
        <div>
          <dt className="text-[1.3rem] text-muted-foreground">{t("planned")}</dt>
          <dd className="kpi-figure text-[2.2rem] leading-none text-muted-foreground">
            <CountUp value={planned} decimals={1} />%
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** 动态曲线: the schedule's 计划 and 实际 lines, drawn as the slide opens. */
function ProgressCurve({ progress }: { progress: NonNullable<WallProject["progress"]> }) {
  const format = useFormatter();
  const points = [...progress.curve.planned, ...progress.curve.actual];
  const dates = points.map((point) => point.date).sort();
  const start = progress.start && progress.start < (dates[0] ?? progress.start) ? progress.start : dates[0];
  const end = progress.end && progress.end > (dates.at(-1) ?? progress.end) ? progress.end : dates.at(-1);
  const width = 1000;
  const height = 420;
  if (!start || !end) return null;
  const planned = curvePath(progress.curve.planned, start, end, width, height);
  const actual = curvePath(progress.curve.actual, start, end, width, height);
  const label = (day: string) => format.dateTime(new Date(`${day}T12:00:00Z`), { year: "numeric", month: "short" });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[0.5rem]" data-wall-curve>
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`-60 -10 ${width + 80} ${height + 30}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-hidden>
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = height - (tick / 100) * height;
            return (
              <g key={tick}>
                <line x1="0" x2={width} y1={y} y2={y} className="stroke-panel-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <text x="-14" y={y + 8} textAnchor="end" className="fill-muted-foreground" fontSize="24">{tick}%</text>
              </g>
            );
          })}
          {planned && (
            <path d={planned} fill="none" className="stroke-tone-slate" strokeWidth="3" strokeDasharray="10 8" vectorEffect="non-scaling-stroke" />
          )}
          {actual && (
            <path
              d={actual}
              fill="none"
              pathLength={1}
              strokeDasharray="1"
              data-wall-motion
              className="stroke-tone-cyan [filter:drop-shadow(0_0_6px_var(--tone-cyan))]"
              strokeWidth="5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ animation: "wall-draw 2.4s ease-out forwards", strokeDashoffset: 1 }}
            />
          )}
        </svg>
      </div>
      <div className="flex justify-between pl-[3rem] text-[1.15rem] text-muted-foreground">
        <span>{label(start)}</span>
        <span>{label(end)}</span>
      </div>
    </div>
  );
}

function WallMap({ projects }: { projects: WallProject[] }) {
  // Keyed by the pins themselves: a refresh with the same places keeps the map.
  const pins = JSON.stringify(
    projects
      .filter((row) => row.latitude !== null && row.longitude !== null)
      .map((row) => [row.id, row.name, row.latitude, row.longitude]),
  );
  const placed = useMemo(
    () => (JSON.parse(pins) as Array<[string, string, string, string]>).map(([id, name, latitude, longitude]) => ({ id, name, latitude, longitude })),
    [pins],
  );
  const markers = useMemo<LocationMapMarker[]>(
    () =>
      placed.map((project) => ({
        id: project.id,
        latitude: Number(project.latitude),
        longitude: Number(project.longitude),
        label: project.name,
        caption: project.name,
        tone: "primary" as const,
        icon: "project" as const,
      })),
    [placed],
  );
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-[0.75rem]">
      <LocationMap
        markers={markers}
        className="absolute inset-0 h-full w-full"
        ariaLabel={placed.map((row) => row.name).join(", ")}
        preserveViewOnDataUpdate
        fitBoundsKey={placed.map((row) => row.id).join(",")}
        singlePointZoom={13}
        popups={false}
      />
    </div>
  );
}

/**
 * 照片自动轮播: one photo at a time, the next one loaded behind it; only the
 * one on screen is in the page, so hours of turning keep no pictures.
 */
function PhotoCarousel({ photos, showProject = false }: { photos: WallPhoto[]; showProject?: boolean }) {
  const t = useTranslations("jb291");
  const format = useFormatter();
  const [index, setIndex] = useState(0);
  const count = photos.length;
  const shown = photos[index % count];
  useEffect(() => {
    if (count <= 1) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), PHOTO_MS);
    return () => window.clearTimeout(timer);
  }, [index, count]);
  // Load the next picture before it is due; let it go after.
  useEffect(() => {
    if (count <= 1) return;
    const next = new window.Image();
    next.src = photos[(index + 1) % count].image;
    return () => {
      next.src = "";
    };
  }, [index, count, photos]);
  if (!shown) return null;
  return (
    <figure className="flex min-h-0 flex-1 flex-col gap-[0.6rem]" data-wall-carousel>
      <span className="photo-hatch relative block min-h-0 flex-1 overflow-hidden rounded-[0.75rem] bg-overlay">
        {shown.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shown.id}
            src={shown.image}
            alt={t("photoAlt", { project: shown.project })}
            className="animate-in fade-in absolute inset-0 h-full w-full object-contain duration-700"
          />
        ) : (
          <Camera className="absolute inset-0 m-auto size-[3rem] text-muted-foreground" aria-hidden />
        )}
      </span>
      <figcaption className="flex items-center justify-between gap-[1rem] text-[1.3rem]">
        <span className="min-w-0 truncate">
          {showProject ? <span className="font-semibold">{shown.project}</span> : null}
          {showProject && shown.title ? " · " : null}
          {shown.title}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {format.dateTime(new Date(shown.captured_at), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
        </span>
      </figcaption>
      {count > 1 && (
        <ol className="flex justify-center gap-[0.4rem]" aria-hidden>
          {photos.map((photo, position) => (
            <li key={photo.id} className={cn("size-[0.55rem] rounded-full", position === index % count ? "bg-primary" : "bg-muted")} />
          ))}
        </ol>
      )}
    </figure>
  );
}

// ---- ESG ----------------------------------------------------------------------

/** ESG 报告及成果: the existing records as donuts and numbers (二). */
function EsgBand({ esg, scope }: { esg: WallEsg; scope: "company" | "project" }) {
  const t = useTranslations("jb291");
  const environment = esg.garbage || esg.scrap || esg.recycling;
  return (
    <section
      aria-label={t("esg")}
      data-wall-panel="esg"
      data-wall-esg={scope}
      className="surface-panel grid min-h-[17rem] grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-[1.5rem] rounded-[1rem] p-[1.25rem]"
    >
      <div className="flex flex-col justify-center pr-[0.5rem]">
        <p className="text-[2rem] font-bold text-tone-green-fg">{t("colEsg")}</p>
        <p className="max-w-[11rem] text-[1.3rem] text-muted-foreground">{t("esgSubtitle")}</p>
      </div>
      {environment ? <EnvironmentCard esg={esg} /> : null}
      {esg.safety ? <SafetyCard safety={esg.safety} /> : null}
      <TransparencyCard transparency={esg.transparency} />
    </section>
  );
}

function EnvironmentCard({ esg }: { esg: WallEsg }) {
  const t = useTranslations("jb291");
  const rows = [
    { key: "garbage", label: t("garbage"), value: esg.garbage },
    { key: "scrap", label: t("scrap"), value: esg.scrap },
    { key: "recycling", label: t("recycling"), value: esg.recycling },
  ].filter((row) => row.value !== null) as Array<{ key: string; label: string; value: NonNullable<WallEsg["garbage"]> }>;
  const weights = rows.map((row) => Math.max(0, Number(row.value.weight_kg) || 0));
  return (
    <div className="flex min-w-0 items-center gap-[1.25rem]" data-wall-esg-part="environment">
      <Donut
        parts={rows.map((row, position) => ({ key: row.key, value: weights[position], tone: WEIGHT_TONES[position % WEIGHT_TONES.length] }))}
        label={t("environment")}
      />
      <div className="min-w-0 flex-1">
        <h3 className="mb-[0.4rem] text-[1.5rem] font-semibold text-tone-green-fg">{t("environment")}</h3>
        <ul className="space-y-[0.45rem]">
          {rows.map((row, position) => {
            const total = weightReading(row.value.weight_kg);
            const month = weightReading(row.value.month_weight_kg);
            return (
              <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[0.75rem]">
                <span className="flex items-center gap-[0.4rem] truncate text-[1.25rem]">
                  <span className={cn("size-[0.75rem] shrink-0 rounded-full", TONES[WEIGHT_TONES[position % WEIGHT_TONES.length]].dot)} aria-hidden />
                  {row.label}
                </span>
                <span className="text-right">
                  <span className="kpi-figure text-[1.9rem] text-foreground">
                    <CountUp value={total.value} decimals={total.decimals} />
                  </span>
                  <span className="ml-[0.25rem] text-[1.1rem] text-muted-foreground">{t(total.unit === "t" ? "tonnes" : "kg")}</span>
                  <span className="ml-[0.6rem] text-[1.1rem] text-muted-foreground">
                    {t("trips", { count: row.value.trips })}
                  </span>
                </span>
                <span className="col-span-2 text-[1.05rem] text-muted-foreground">
                  {t("monthLine", {
                    weight: `${month.value}${t(month.unit === "t" ? "tonnes" : "kg")}`,
                    trips: row.value.month_trips,
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SafetyCard({ safety }: { safety: NonNullable<WallEsg["safety"]> }) {
  const t = useTranslations("jb291");
  const rate = share(safety.closed, safety.reported);
  return (
    <div className="flex min-w-0 items-center gap-[1.25rem]" data-wall-esg-part="safety">
      <Donut
        parts={[
          { key: "closed", value: safety.closed, tone: "green" },
          { key: "rest", value: Math.max(0, safety.reported - safety.closed), tone: "slate" },
        ]}
        label={t("safety")}
        centre={`${rate}%`}
      />
      <div className="min-w-0 flex-1">
        <h3 className="mb-[0.4rem] text-[1.5rem] font-semibold text-tone-blue-fg">{t("safety")}</h3>
        <dl className="space-y-[0.4rem]">
          <EsgNumber label={t("closeRate")} value={rate} suffix="%" />
          <EsgNumber label={t("closed")} value={safety.closed} detail={t("monthCount", { count: safety.month_closed })} />
          <EsgNumber label={t("reported")} value={safety.reported} detail={t("monthCount", { count: safety.month_reported })} />
        </dl>
      </div>
    </div>
  );
}

function TransparencyCard({ transparency }: { transparency: WallEsg["transparency"] }) {
  const t = useTranslations("jb291");
  return (
    <div className="min-w-0" data-wall-esg-part="transparency">
      <h3 className="mb-[0.4rem] text-[1.5rem] font-semibold text-tone-purple-fg">{t("transparency")}</h3>
      <dl className="space-y-[0.4rem]">
        <EsgNumber label={t("photosKept")} value={transparency.photos} detail={t("monthCount", { count: transparency.month_photos })} />
        {transparency.consultant_approvals !== null && (
          <EsgNumber
            label={t("consultantApprovals")}
            value={transparency.consultant_approvals}
            detail={t("monthCount", { count: transparency.month_consultant_approvals ?? 0 })}
          />
        )}
        {transparency.progress_confirmations !== null && (
          <EsgNumber
            label={t("progressConfirmations")}
            value={transparency.progress_confirmations}
            detail={t("monthCount", { count: transparency.month_progress_confirmations ?? 0 })}
          />
        )}
      </dl>
    </div>
  );
}

function EsgNumber({ label, value, suffix, detail }: { label: string; value: number; suffix?: string; detail?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[0.75rem]">
      <dt className="truncate text-[1.25rem] text-muted-foreground">{label}</dt>
      <dd className="text-right">
        <span className="kpi-figure text-[1.9rem]">
          <CountUp value={value} />
          {suffix}
        </span>
        {detail && <span className="ml-[0.6rem] text-[1.05rem] text-muted-foreground">{detail}</span>}
      </dd>
    </div>
  );
}

/** 彩色圆饼图: parts of a whole as a ring, drawn as it appears. */
function Donut({
  parts,
  label,
  centre,
}: {
  parts: Array<{ key: string; value: number; tone: Tone }>;
  label: string;
  centre?: string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const circumference = 2 * Math.PI * 40;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="size-[9.5rem] shrink-0 -rotate-90" role="img" aria-label={label} data-wall-donut>
      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="14" className="stroke-muted" />
      {total > 0 &&
        parts.map((part) => {
          const length = (part.value / total) * circumference;
          const segment = (
            <circle
              key={part.key}
              cx="50" cy="50" r="40" fill="none" strokeWidth="14"
              className={cn("transition-[stroke-dasharray] duration-[1400ms]", toneStroke(part.tone))}
              strokeDasharray={drawn ? `${length} ${circumference - length}` : `0 ${circumference}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return segment;
        })}
      {centre && (
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" transform="rotate(90 50 50)" className="fill-foreground" fontSize="18" fontWeight="700">
          {centre}
        </text>
      )}
    </svg>
  );
}

function toneStroke(tone: Tone): string {
  switch (tone) {
    case "green":
      return "stroke-tone-green";
    case "amber":
      return "stroke-tone-amber";
    case "cyan":
      return "stroke-tone-cyan";
    case "blue":
      return "stroke-tone-blue";
    case "purple":
      return "stroke-tone-purple";
    case "rose":
      return "stroke-tone-rose";
    case "orange":
      return "stroke-tone-orange";
    default:
      return "stroke-tone-slate";
  }
}

// ---- controls -----------------------------------------------------------------

/** 全屏 (the browser's Fullscreen API). */
function FullscreenButton() {
  const t = useTranslations("jb291");
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.();
  };
  const Icon = full ? Minimize : Maximize;
  return (
    <WallControl onClick={toggle} data-wall-fullscreen>
      <Icon className="size-[1.4rem]" aria-hidden />
      {full ? t("exitFullscreen") : t("fullscreen")}
    </WallControl>
  );
}

/** One of the wall's corner buttons (hidden with the cursor). */
export function WallControl({
  children,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | boolean>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex h-[3.25rem] items-center gap-[0.5rem] rounded-[0.75rem] border border-primary/40 bg-background/85 px-[1.1rem] text-[1.3rem] text-tone-cyan-fg backdrop-blur hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}
