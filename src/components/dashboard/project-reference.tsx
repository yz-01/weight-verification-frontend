"use client";

/**
 * 项目仪表板 as the client's reference (J34-5, 10-20 图 5) - on real data only.
 *
 * Top to bottom as the picture: six figures (today's deliveries and waste in
 * tonnes with 较昨日, all of each with this month's, the machines on and off
 * site, what waits); the latest deliveries beside the project's map; this
 * month's materials and waste by category beside what waits; then
 * 「最新现场照片记录」 - the latest site photograph of each record, newest on
 * the left, refreshed every minute. Everything the project dashboard had
 * before stays below it. Tonnes are only what is weighed (tonnes, and
 * kilograms turned into tonnes): a delivery in cubic metres has no weight
 * to add, and the cards say so.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardCheck,
  Cpu,
  Images,
  MapPinned,
  PackageCheck,
  PieChart,
  Recycle,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

import { Delta } from "@/components/dashboard/headquarters-reference";
import { KpiCard } from "@/components/shared/kpi-card";
import { LocationMap, type LocationMapMarker } from "@/components/shared/location-map";
import { LoadFailed } from "@/components/shared/page-primitives";
import { useRecordOpener } from "@/components/shared/record-opener";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectOverview } from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { TONES, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { getProjectOverview } from "@/services/contractor-dashboard.service";

/** Where each waiting count's list is, and what the sidebar calls it. */
const PENDING_LINKS: Record<string, { labelKey: string; href: string }> = {
  material_receipts: { labelKey: "nav.material_receipts", href: "/receipts" },
  material_outgoing: { labelKey: "nav.material_outgoing", href: "/material-outgoing" },
  material_requests: { labelKey: "nav.material_requests", href: "/material-requests" },
  field_tasks: { labelKey: "nav.field_tasks", href: "/field-tasks" },
  equipment: { labelKey: "nav.equipment", href: "/site-equipment" },
  waste_outgoing: { labelKey: "nav.waste_outgoing", href: "/waste-outgoing" },
  site_disposals: { labelKey: "nav.site_disposals", href: "/waste-clearance?kind=disposal" },
  consultant_applications: { labelKey: "nav.consultant_applications", href: "/consultant-applications" },
  approvals: { labelKey: "nav.approvals", href: "/approvals" },
  sundry_claims: { labelKey: "nav.submodule.sundryClaims", href: "/sundry-claims" },
  site_access: { labelKey: "nav.site_access", href: "/gate-records" },
  safety: { labelKey: "nav.submodule.hazardRectifications", href: "/hazard-rectifications" },
};

const POINT_TONE: Record<string, LocationMapMarker["tone"]> = {
  RECEIPT: "positive",
  WASTE: "primary",
  EQUIPMENT: "warning",
};

export function ProjectReference({ project }: { project: string }) {
  const overview = useQuery({
    queryKey: ["contractor-dashboard", "project-overview", project],
    queryFn: () => getProjectOverview(project),
    enabled: Boolean(project),
    // The photo row follows the site: within a minute, or when the page is back.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  if (!project) return null;
  if (overview.isError) return <LoadFailed onRetry={() => void overview.refetch()} />;
  if (!overview.data) return <Skeleton className="h-64 w-full" />;
  const data = overview.data;
  return (
    <div className="space-y-4" data-project-reference>
      <ProjectKpis data={data} project={project} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <LatestReceipts data={data} project={project} />
        <ProjectMap data={data} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Mix titleKey="materialMix" icon={PieChart} rows={data.material_mix} />
        <Mix titleKey="wasteMix" icon={Recycle} rows={data.waste_mix} />
        <PendingList data={data} project={project} />
      </div>
      <LatestPhotos data={data} project={project} />
    </div>
  );
}

function ProjectKpis({ data, project }: { data: ProjectOverview; project: string }) {
  const t = useTranslations("projectReference");
  const format = useFormatter();
  const cards = data.cards;
  const tonnes = (value: string) => format.number(Number(value), { maximumFractionDigits: 2 });
  const tiles: { key: string; value: string; icon: LucideIcon; tone: Tone; detail: React.ReactNode; href?: string }[] = [
    {
      key: "receiptsToday",
      value: tonnes(cards.receipts_today_t),
      icon: Truck,
      tone: "green",
      detail: <Delta today={Number(cards.receipts_today_t)} yesterday={Number(cards.receipts_yesterday_t)} />,
      href: `/receipts?project=${project}&date_from=${data.date}&date_to=${data.date}`,
    },
    {
      key: "wasteToday",
      value: tonnes(cards.waste_today_t),
      icon: Trash2,
      tone: "blue",
      detail: <Delta today={Number(cards.waste_today_t)} yesterday={Number(cards.waste_yesterday_t)} />,
      href: `/waste-outgoing?project=${project}`,
    },
    {
      key: "receiptsTotal",
      value: tonnes(cards.receipts_total_t),
      icon: PackageCheck,
      tone: "purple",
      detail: t("thisMonth", { value: tonnes(cards.receipts_month_t) }),
    },
    {
      key: "wasteTotal",
      value: tonnes(cards.waste_total_t),
      icon: Recycle,
      tone: "orange",
      detail: t("thisMonth", { value: tonnes(cards.waste_month_t) }),
    },
    {
      key: "equipment",
      value: format.number(cards.equipment_total),
      icon: Cpu,
      tone: "cyan",
      detail: t("equipmentSplit", { on: cards.equipment_on_site, off: cards.equipment_off_site }),
      href: `/site-equipment?project=${project}&view=register`,
    },
    {
      key: "pending",
      value: format.number(cards.pending_total),
      icon: ClipboardCheck,
      tone: "amber",
      detail: t("seeBelow"),
    },
  ];
  return (
    <section className="space-y-1.5" data-dashboard-priority>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <KpiCard
            key={tile.key}
            label={t(`card.${tile.key}`)}
            value={tile.value}
            icon={tile.icon}
            tone={tile.tone}
            size="sm"
            href={tile.href ?? null}
            detail={tile.detail}
          />
        ))}
      </div>
      <p className="text-2xs text-muted-foreground">{t("tonnesNote")}</p>
    </section>
  );
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-panel space-y-3 rounded-2xl p-4", className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-5 text-primary" aria-hidden />
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function LatestReceipts({ data, project }: { data: ProjectOverview; project: string }) {
  const t = useTranslations("projectReference");
  const status = useTranslations("materialAcceptance");
  const units = useTranslations("receipts.unit");
  const df = useDateFormat();
  return (
    <Panel
      title={t("latestReceipts")}
      icon={Building2}
      action={
        <Link href={`/receipts?project=${project}`} className="text-xs font-medium text-primary hover:underline">
          {t("seeAll")}
        </Link>
      }
    >
      {data.latest_receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noReceipts")}</p>
      ) : (
        <ul className="divide-y" data-latest-receipts>
          {data.latest_receipts.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-2 text-sm">
              <Link href={`/receipts/${row.id}`} className="w-32 shrink-0 font-medium text-primary hover:underline">
                {row.receipt_no}
              </Link>
              <span className="w-32 shrink-0 text-xs text-muted-foreground tabular-nums">
                {row.business_at ? df.dateTime(row.business_at) : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate">{[row.supplier, row.material].filter(Boolean).join(" · ")}</span>
              <span className="shrink-0 tabular-nums">
                {Number(row.quantity)} {units.has(row.unit) ? units(row.unit) : row.unit}
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs", row.acceptance_status === "ACCEPTED" ? TONES.green.soft : TONES.amber.soft)}>
                {status.has(row.acceptance_status) ? status(row.acceptance_status) : row.acceptance_status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ProjectMap({ data }: { data: ProjectOverview }) {
  const t = useTranslations("projectReference");
  const markers: LocationMapMarker[] = [
    ...(data.project.latitude && data.project.longitude
      ? [
          {
            id: `project-${data.project.id}`,
            latitude: Number(data.project.latitude),
            longitude: Number(data.project.longitude),
            label: `${data.project.code} · ${data.project.name}`,
            icon: "project" as const,
          },
        ]
      : []),
    ...data.map_points.map((point) => ({
      id: `${point.kind}-${point.id}`,
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      label: point.label || t(`point.${point.kind}`),
      detail: t(`point.${point.kind}`),
      tone: POINT_TONE[point.kind],
      icon: point.kind === "EQUIPMENT" ? ("truck" as const) : ("building" as const),
    })),
  ];
  return (
    <Panel title={t("map")} icon={MapPinned}>
      <LocationMap
        markers={markers}
        sizeKey="project-dashboard-map"
        className="min-h-[18rem] rounded-lg"
        ariaLabel={t("map")}
        fitBoundsKey={data.project.id}
      />
      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(["RECEIPT", "WASTE", "EQUIPMENT"] as const).map((kind) => (
          <li key={kind} className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-full", kind === "RECEIPT" ? TONES.green.dot : kind === "WASTE" ? TONES.cyan.dot : TONES.amber.dot)} aria-hidden />
            {t(`point.${kind}`)}
          </li>
        ))}
      </ul>
      {markers.length === 0 ? <p className="text-xs text-muted-foreground">{t("noPoints")}</p> : null}
    </Panel>
  );
}

const MIX_TONES: Tone[] = ["blue", "orange", "green", "purple", "slate"];

function Mix({ titleKey, icon, rows }: { titleKey: "materialMix" | "wasteMix"; icon: LucideIcon; rows: ProjectOverview["material_mix"] }) {
  const t = useTranslations("projectReference");
  const format = useFormatter();
  const total = rows.reduce((sum, row) => sum + Number(row.tonnes), 0);
  const circumference = 2 * Math.PI * 40;
  // Each slice's length and where it starts, worked out before drawing.
  const segments = rows.map((row, index) => {
    const before = rows.slice(0, index).reduce((sum, earlier) => sum + Number(earlier.tonnes), 0);
    return {
      length: total ? (Number(row.tonnes) / total) * circumference : 0,
      start: total ? (before / total) * circumference : 0,
    };
  });
  return (
    <Panel title={t(titleKey)} icon={icon}>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMix")}</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="size-32 shrink-0 -rotate-90" role="img" aria-label={t("mixTotal", { value: format.number(total, { maximumFractionDigits: 2 }) })}>
            <circle cx="50" cy="50" r="40" fill="none" strokeWidth="14" className="stroke-muted" />
            {rows.map((row, index) => (
              <circle
                key={`${row.name}-${index}`}
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="14"
                strokeDasharray={`${segments[index].length} ${circumference - segments[index].length}`}
                strokeDashoffset={-segments[index].start}
                className={TONES[MIX_TONES[index % MIX_TONES.length]].text}
              />
            ))}
            <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-sm font-bold" transform="rotate(90 50 50)">
              {format.number(total, { maximumFractionDigits: 1 })}
            </text>
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
            {rows.map((row, index) => (
              <li key={`${row.name}-${index}`} className="flex items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", TONES[MIX_TONES[index % MIX_TONES.length]].dot)} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{row.other ? t("others") : row.name || "—"}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {format.number(Number(row.tonnes), { maximumFractionDigits: 2 })} · {Math.round((Number(row.tonnes) / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function PendingList({ data, project }: { data: ProjectOverview; project: string }) {
  const t = useTranslations("projectReference");
  const tRoot = useTranslations();
  return (
    <Panel title={t("pending")} icon={ClipboardCheck}>
      {data.pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPending")}</p>
      ) : (
        <ul className="divide-y" data-pending-list>
          {data.pending.map((row) => {
            const link = PENDING_LINKS[row.feature];
            if (!link) return null;
            const href = `${link.href}${link.href.includes("?") ? "&" : "?"}project=${project}&needs_action=1`;
            return (
              <li key={row.feature}>
                <Link href={href} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-primary">
                  <span className="truncate">{tRoot(link.labelKey)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", TONES.rose.soft)}>{row.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function LatestPhotos({ data, project }: { data: ProjectOverview; project: string }) {
  const t = useTranslations("projectReference");
  const kinds = useTranslations("headquarters.recordKind");
  const df = useDateFormat();
  const opener = useRecordOpener();
  return (
    <Panel
      title={t("photos")}
      icon={Images}
      action={
        <Link href={`/reports/contractor/photos?project=${project}`} className="text-xs font-medium text-primary hover:underline">
          {t("seeAll")}
        </Link>
      }
    >
      {data.photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>
      ) : (
        <ul className="flex snap-x gap-3 overflow-x-auto pb-1" data-latest-photos>
          {data.photos.map((row) => (
            <li key={`${row.kind}-${row.record_id}`} className="w-48 shrink-0 snap-start sm:w-56">
              <button
                type="button"
                onClick={() =>
                  opener.open(row.kind, row.record_id, {
                    reference: row.reference,
                    project_id: data.project.id,
                    project_name: data.project.name,
                    submitted_at: row.captured_at,
                    photo: row.url,
                  })
                }
                className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-panel-border transition hover:ring-primary/60"
              >
                {row.thumbnail_url ? (
                  <Image src={row.thumbnail_url} alt="" fill sizes="224px" className="object-cover" unoptimized />
                ) : null}
                <span className="absolute left-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-foreground">
                  {kinds.has(row.kind) ? kinds(row.kind) : row.kind}
                </span>
                <span className="absolute inset-x-0 bottom-0 bg-overlay/80 px-2 py-1 text-left text-xs text-overlay-foreground">
                  {[row.reference, row.captured_at ? df.time(row.captured_at) : ""].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {opener.sheet}
    </Panel>
  );
}
