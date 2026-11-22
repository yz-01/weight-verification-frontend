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
 *
 * JB226 (客户 11-19 事项 6): 「不需要重新设计一套仪表板，直接沿用现有项目仪表板，根据
 * 顾问权限控制显示内容即可。」 A consultant's 仪表板 is this component. The server
 * leaves out every part he is not granted (`build_consultant_overview`), and
 * each part here is drawn only when the payload carries it - one card at a
 * time, 最新材料进场记录, the mixes, 待处理事项, the photos - so the project
 * manager's page, which always carries every part, is drawn exactly as before.
 * Three parts come to a consultant only: 工程进度 (施工进度 / 施工计划进度) and
 * 整改／EHS, the two parts of the project manager's 今日概览 that are his.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardCheck,
  Cpu,
  HardHat,
  Images,
  PackageCheck,
  PieChart,
  Recycle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ScheduleSummary } from "@/components/dashboard/contractor-dashboard";
import { Delta } from "@/components/dashboard/headquarters-reference";
import { ProjectSiteMap } from "@/components/dashboard/project-site-map";
import {
  ReceiptSignerWindow,
  SignerButton,
  type LatestReceiptRow,
} from "@/components/dashboard/receipt-signer-window";
import { useAuth } from "@/components/providers/auth-provider";
import { KpiCard } from "@/components/shared/kpi-card";
import { LoadFailed } from "@/components/shared/page-primitives";
import { useRecordOpener } from "@/components/shared/record-opener";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/interfaces/api";
import type { ProjectOverview } from "@/interfaces/headquarters";
import { consultantLacks } from "@/lib/consultant-modules";
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
  // A consultant's 资料包 waiting for his review (JB226).
  package_reviews: { labelKey: "nav.submodule.packageReviews", href: "/package-reviews" },
  approvals: { labelKey: "nav.approvals", href: "/approvals" },
  sundry_claims: { labelKey: "nav.submodule.sundryClaims", href: "/sundry-claims" },
  site_access: { labelKey: "nav.site_access", href: "/gate-records" },
  safety: { labelKey: "nav.submodule.hazardRectifications", href: "/hazard-rectifications" },
};

export function ProjectReference({
  project,
  consultant = false,
}: {
  project: string;
  /**
   * Read by a consultant (JB226): 「查看全部」 under the photos opens 工程照片墙
   * (the 报表中心 photo report is not his), and an empty 待处理事项 says it is
   * his own work that is empty.
   */
  consultant?: boolean;
}) {
  const overview = useQuery({
    queryKey: ["contractor-dashboard", "project-overview", project],
    queryFn: () => getProjectOverview(project),
    enabled: Boolean(project),
    // The photo row follows the site: within a minute, or when the page is back.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const { refresh } = useAuth();
  if (!project) return null;
  if (overview.isError) {
    // Head office changed or ended his access while the page was open: the
    // next minute's read is refused. He is told so, and how to go on (JB226).
    const refused = overview.error instanceof ApiError && [403, 404].includes(overview.error.status);
    if (consultant && refused) {
      return (
        <ConsultantRefused
          onReload={async () => {
            await refresh();
            void overview.refetch();
          }}
        />
      );
    }
    return <LoadFailed onRetry={() => void overview.refetch()} />;
  }
  if (!overview.data) return <Skeleton className="h-64 w-full" />;
  const data = overview.data;
  // Each part only when the server sent it (JB226); the project manager's
  // payload carries every one of the first six, so his rows are as before.
  const middle = [
    data.material_mix ? <Mix key="materialMix" titleKey="materialMix" icon={PieChart} rows={data.material_mix} /> : null,
    data.waste_mix ? <Mix key="wasteMix" titleKey="wasteMix" icon={Recycle} rows={data.waste_mix} /> : null,
    data.safety ? <SafetyPanel key="safety" safety={data.safety} project={project} /> : null,
    data.pending ? <PendingList key="pending" data={data} project={project} consultant={consultant} /> : null,
  ].filter(Boolean);
  return (
    <div className="space-y-4" data-project-reference>
      <ProjectKpis data={data} project={project} />
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          data.latest_receipts && "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        {data.latest_receipts ? <LatestReceipts data={data} project={project} /> : null}
        {/* 项目现场地图 (JB222): the site, its people, deliveries, machines and records;
            a consultant's notes speak of his layers and of 建筑商总部 (JB226 audit F2). */}
        <ProjectSiteMap project={project} consultant={consultant} />
      </div>
      {middle.length > 0 ? (
        <div className={cn("grid grid-cols-1 gap-4", MIDDLE_COLUMNS[middle.length] ?? "lg:grid-cols-3")}>{middle}</div>
      ) : null}
      {data.progress || data.schedule ? <ProgressPanel data={data} project={project} /> : null}
      {data.photos ? <LatestPhotos data={data} project={project} consultant={consultant} /> : null}
    </div>
  );
}

/** The middle row's columns by how many of its panels came (three: as before). */
const MIDDLE_COLUMNS: Record<number, string> = {
  1: "",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-2 xl:grid-cols-4",
};

/** The figures row's columns at the widest by how many cards came (six: as before). */
const KPI_COLUMNS: Record<number, string> = {
  1: "md:grid-cols-3 xl:grid-cols-4",
  2: "md:grid-cols-3 xl:grid-cols-4",
  3: "md:grid-cols-3 xl:grid-cols-3",
  4: "md:grid-cols-4 xl:grid-cols-4",
  5: "md:grid-cols-3 xl:grid-cols-5",
  6: "md:grid-cols-3 xl:grid-cols-6",
};

/** A card's figure is in the payload. */
const has = (value: string | number | undefined): value is string | number => value !== undefined;

function ProjectKpis({ data, project }: { data: ProjectOverview; project: string }) {
  const t = useTranslations("projectReference");
  const format = useFormatter();
  const cards = data.cards;
  const tonnes = (value: string | undefined) => format.number(Number(value), { maximumFractionDigits: 2 });
  const tiles: { key: string; value: string; icon: LucideIcon; tone: Tone; detail: React.ReactNode; href?: string }[] = [];
  if (has(cards.receipts_today_t)) {
    tiles.push({
      key: "receiptsToday",
      value: tonnes(cards.receipts_today_t),
      icon: Truck,
      tone: "green",
      detail: <Delta today={Number(cards.receipts_today_t)} yesterday={Number(cards.receipts_yesterday_t)} />,
      href: `/receipts?project=${project}&date_from=${data.date}&date_to=${data.date}`,
    });
  }
  if (has(cards.waste_today_t)) {
    tiles.push({
      key: "wasteToday",
      value: tonnes(cards.waste_today_t),
      icon: Trash2,
      tone: "blue",
      detail: <Delta today={Number(cards.waste_today_t)} yesterday={Number(cards.waste_yesterday_t)} />,
      href: `/waste-outgoing?project=${project}`,
    });
  }
  if (has(cards.receipts_total_t)) {
    tiles.push({
      key: "receiptsTotal",
      value: tonnes(cards.receipts_total_t),
      icon: PackageCheck,
      tone: "purple",
      detail: t("thisMonth", { value: tonnes(cards.receipts_month_t) }),
    });
  }
  if (has(cards.waste_total_t)) {
    tiles.push({
      key: "wasteTotal",
      value: tonnes(cards.waste_total_t),
      icon: Recycle,
      tone: "orange",
      detail: t("thisMonth", { value: tonnes(cards.waste_month_t) }),
    });
  }
  if (has(cards.equipment_total)) {
    tiles.push({
      key: "equipment",
      value: format.number(cards.equipment_total),
      icon: Cpu,
      tone: "cyan",
      detail: t("equipmentSplit", { on: cards.equipment_on_site ?? 0, off: cards.equipment_off_site ?? 0 }),
      href: `/site-equipment?project=${project}&view=register`,
    });
  }
  if (has(cards.pending_total)) {
    tiles.push({
      key: "pending",
      value: format.number(cards.pending_total),
      icon: ClipboardCheck,
      tone: "amber",
      detail: t("seeBelow"),
    });
  }
  if (tiles.length === 0) return null;
  // 「吨数只算称重的…」 under tonne figures only.
  const tonneCards = has(cards.receipts_today_t) || has(cards.waste_today_t);
  return (
    <section className="space-y-1.5" data-dashboard-priority>
      <div className={cn("grid grid-cols-2 gap-3", KPI_COLUMNS[tiles.length])}>
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
      {tonneCards ? <p className="text-2xs text-muted-foreground">{t("tonnesNote")}</p> : null}
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
  const rows = data.latest_receipts ?? [];
  // 签收人 (JB234): the row whose window is open, and the delivery's own
  // window behind 【打开这笔材料进场】.
  const [signing, setSigning] = useState<LatestReceiptRow | null>(null);
  const opener = useRecordOpener();
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
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noReceipts")}</p>
      ) : (
        <ul className="divide-y" data-latest-receipts>
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-2 text-sm">
              {/* A phone wraps the row (J34-5): number and time, then
                  supplier and material, then quantity, state and 签收人
                  (JB234), whose name wraps rather than being cut. */}
              <Link href={`/receipts/${row.id}`} className="shrink-0 font-medium text-primary hover:underline sm:w-32">
                {row.receipt_no}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums sm:w-32">
                {row.business_at ? df.dateTime(row.business_at) : "—"}
              </span>
              <span className="min-w-0 basis-full truncate sm:basis-0 sm:flex-1">{[row.supplier, row.material].filter(Boolean).join(" · ")}</span>
              <span className="shrink-0 tabular-nums">
                {Number(row.quantity)} {units.has(row.unit) ? units(row.unit) : row.unit}
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs", row.acceptance_status === "ACCEPTED" ? TONES.green.soft : TONES.amber.soft)}>
                {status.has(row.acceptance_status) ? status(row.acceptance_status) : row.acceptance_status}
              </span>
              <SignerButton signer={row.signer} onOpen={() => setSigning(row)} />
            </li>
          ))}
        </ul>
      )}
      {signing ? (
        <ReceiptSignerWindow
          row={signing}
          onClose={() => setSigning(null)}
          onOpenReceipt={() => {
            const row = signing;
            setSigning(null);
            opener.open("MATERIAL_RECEIPT", row.id, {
              reference: row.receipt_no,
              project_id: data.project.id,
              project_name: data.project.name,
              submitted_at: row.business_at,
            });
          }}
        />
      ) : null}
      {opener.sheet}
    </Panel>
  );
}

const MIX_TONES: Tone[] = ["blue", "orange", "green", "purple", "slate"];

function Mix({
  titleKey,
  icon,
  rows,
}: {
  titleKey: "materialMix" | "wasteMix";
  icon: LucideIcon;
  rows: NonNullable<ProjectOverview["material_mix"]>;
}) {
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

function PendingList({
  data,
  project,
  consultant,
}: {
  data: ProjectOverview;
  project: string;
  consultant: boolean;
}) {
  const t = useTranslations("projectReference");
  const tRoot = useTranslations();
  const rows = data.pending ?? [];
  return (
    <Panel title={t("pending")} icon={ClipboardCheck}>
      {rows.length === 0 ? (
        // A consultant's list is his own work only (JB226-4).
        <p className="text-sm text-muted-foreground">{t(consultant ? "noPendingMine" : "noPending")}</p>
      ) : (
        <ul className="divide-y" data-pending-list>
          {rows.map((row) => {
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

function LatestPhotos({
  data,
  project,
  consultant,
}: {
  data: ProjectOverview;
  project: string;
  consultant: boolean;
}) {
  const t = useTranslations("projectReference");
  const kinds = useTranslations("headquarters.recordKind");
  const df = useDateFormat();
  const opener = useRecordOpener();
  const rows = data.photos ?? [];
  // A consultant's 「查看全部」 is 工程照片墙 on his project (JB226-6); the
  // 报表中心 photo report is the office's.
  const all = consultant ? "/photo-timeline" : `/reports/contractor/photos?project=${project}`;
  return (
    <Panel
      title={t("photos")}
      icon={Images}
      action={
        <Link href={all} className="text-xs font-medium text-primary hover:underline">
          {t("seeAll")}
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>
      ) : (
        <ul className="flex snap-x gap-3 overflow-x-auto pb-1" data-latest-photos>
          {rows.map((row) => (
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

/** What a consultant reads when his access to this project changed while the page was open (JB226). */
function ConsultantRefused({ onReload }: { onReload: () => Promise<void> }) {
  const t = useTranslations("projectReference");
  return (
    <section className="surface-panel space-y-3 rounded-2xl p-4" data-consultant-refused role="status">
      <p className="text-sm">{t("consultantRefused")}</p>
      <Button variant="outline" onClick={() => void onReload()}>
        <RefreshCw />
        {t("reload")}
      </Button>
    </section>
  );
}

/**
 * 整改／EHS (JB226): the project manager's 安全巡检与整改 figures - 待安排整改,
 * 整改中, 已逾期 (red, opening the overdue list), 已完成 - in the slot his
 * page gives 废料分类统计. Sent only to a consultant with 整改／EHS ticked.
 */
function SafetyPanel({
  safety,
  project,
}: {
  safety: NonNullable<ProjectOverview["safety"]>;
  project: string;
}) {
  const t = useTranslations("projectReference");
  const labels = useTranslations("contractorDashboard.safetySummary");
  const format = useFormatter();
  return (
    <Panel
      title={t("safety")}
      icon={ShieldAlert}
      action={
        <Link href={`/hazard-rectifications?project=${project}`} className="text-xs font-medium text-primary hover:underline">
          {t("seeAll")}
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2" data-safety-panel>
        {(["pending_rectification", "in_progress", "overdue", "completed"] as const).map((key) => {
          const value = safety[key];
          const late = key === "overdue" && value > 0;
          const tile = (
            <div className={cn("rounded-lg p-3", late ? "bg-destructive/10 ring-1 ring-destructive/30" : "bg-muted/40")}>
              <p className="text-xs text-muted-foreground">{labels(key)}</p>
              <p className={cn("mt-1 text-xl font-semibold tabular-nums", late && "text-destructive")}>
                {format.number(value)}
              </p>
            </div>
          );
          return late ? (
            <Link key={key} href={`/hazard-rectifications?project=${project}&overdue=1`} className="block">
              {tile}
            </Link>
          ) : (
            <div key={key}>{tile}</div>
          );
        })}
      </div>
    </Panel>
  );
}

/**
 * 工程进度 (JB226, 「工程进度」 in the client's list): 施工进度's own counts (today,
 * this month, all; 整体进度 with 施工进度) and the project manager's 施工计划进度,
 * each half only when its item is ticked - the server sends `progress` with
 * 施工进度 or 雨天记录 and `schedule` with 施工计划.
 */
function ProgressPanel({ data, project }: { data: ProjectOverview; project: string }) {
  const t = useTranslations("projectReference");
  const format = useFormatter();
  const { user } = useAuth();
  const progress = data.progress;
  // With 雨天记录 and not 施工进度 the counts are rain records: named so.
  const rainOnly = consultantLacks(user?.features, "progress.records");
  return (
    <Panel
      title={t("progress")}
      icon={HardHat}
      action={
        <Link href={`/progress?project=${project}`} className="text-xs font-medium text-primary hover:underline">
          {t("seeAll")}
        </Link>
      }
    >
      <div className="space-y-4" data-progress-panel>
        {progress ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t(rainOnly ? "rainRecords" : "progressRecords")}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["progressToday", progress.today],
                  ["progressMonth", progress.month],
                  ["progressTotal", progress.total],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{t(key)}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{format.number(value)}</p>
                </div>
              ))}
              {progress.weighted_progress != null ? (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{t("overall")}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {t("percent", {
                      value: format.number(Number(progress.weighted_progress), { maximumFractionDigits: 1 }),
                    })}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {data.schedule ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{t("schedule")}</h3>
            <ScheduleSummary schedule={data.schedule} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
