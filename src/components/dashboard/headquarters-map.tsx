"use client";

import { ArrowRight, Camera, MapPinOff, MapPinned } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  LocationMap,
  type LocationMapMarker,
} from "@/components/shared/location-map";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  HeadquartersCountField,
  HeadquartersPhoto,
  HeadquartersProject,
} from "@/interfaces/headquarters";
import { useDateFormat } from "@/lib/dates";
import { cardHref, projectDashboardHref } from "@/lib/headquarters-links";
import { cn } from "@/lib/utils";

/**
 * A project's basic state, as the map colours it: red with anything overdue,
 * amber with anything waiting, green otherwise. A project that is not active
 * is drawn faded.
 */
export function projectTone(project: HeadquartersProject): LocationMapMarker["tone"] {
  if (project.overdue_tasks + project.overdue_rectifications > 0) return "danger";
  if (project.pending_approvals + project.open_tasks > 0) return "warning";
  return "positive";
}

/**
 * 交互总览地图 (C15): every project of the company on the existing Leaflet map
 * and base layer, coloured by its state; a click selects it and offers the
 * way in. A project without coordinates is listed, never placed somewhere
 * made up. The 设备 layer has its place but no data - device positions wait
 * for the 9b plan.
 */
export function HeadquartersMap({
  projects,
  withoutLocation,
  date,
  onOpenPhoto,
}: {
  projects: HeadquartersProject[];
  withoutLocation: Array<{ id: string; code: string; name: string }>;
  /** The page's day: 今日材料进场 opens that day's deliveries. */
  date: string;
  onOpenPhoto?: (photo: HeadquartersPhoto) => void;
}) {
  const t = useTranslations("headquarters.map");
  const figures = useTranslations("headquarters.figures");
  const format = useFormatter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(true);
  const placed = useMemo(() => projects.filter((row) => row.has_location), [projects]);
  const markers = useMemo<LocationMapMarker[]>(
    () =>
      showProjects
        ? placed.map((project) => ({
            id: project.id,
            latitude: Number(project.latitude),
            longitude: Number(project.longitude),
            label: `${project.code} · ${project.name}`,
            detail: t("markerDetail", {
              onSite: format.number(project.on_site_now),
              pending: format.number(project.pending_approvals),
              overdue: format.number(
                project.overdue_tasks + project.overdue_rectifications,
              ),
            }),
            tone: projectTone(project),
            stale: project.status !== "ACTIVE",
            icon: "project" as const,
          }))
        : [],
    [format, placed, showProjects, t],
  );
  const selected = projects.find((row) => row.id === selectedId) ?? null;

  return (
    <section
      aria-label={t("title")}
      className="space-y-2 surface-panel rounded-xl p-4"
      data-headquarters-map
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-panel-border pb-2">
        <div className="flex items-center gap-2">
          <MapPinned className="size-4 text-primary" aria-hidden />
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <span className="text-xs text-muted-foreground">
            {t("placed", {
              placed: format.number(placed.length),
              total: format.number(projects.length),
            })}
          </span>
        </div>
        <fieldset className="flex flex-wrap items-center gap-3 text-xs">
          <legend className="sr-only">{t("layers")}</legend>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showProjects}
              onChange={(event) => setShowProjects(event.target.checked)}
            />
            {t("layerProjects")}
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-muted-foreground"
            title={t("layerDevicesHelp")}
          >
            <input type="checkbox" checked={false} disabled readOnly />
            {t("layerDevices")}
          </label>
        </fieldset>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative">
          <LocationMap
            markers={markers}
            className="min-h-[24rem] rounded-lg xl:min-h-[30rem]"
            ariaLabel={t("title")}
            preserveViewOnDataUpdate
            fitBoundsKey={placed.map((row) => row.id).join(",")}
            onMarkerClick={setSelectedId}
            singlePointZoom={12}
          />
          {placed.length === 0 && (
            <p className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-md bg-card/95 p-3 text-center text-sm text-muted-foreground shadow">
              {t("nothingPlaced")}
            </p>
          )}
        </div>
        <div className="space-y-2">
          {selected ? (
            <ProjectCard project={selected} date={date} onOpenPhoto={onOpenPhoto} />
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {t("pickHelp")}
            </p>
          )}
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-destructive" aria-hidden />
              {t("legendOverdue")}
            </li>
            <li className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-warning" aria-hidden />
              {t("legendWaiting")}
            </li>
            <li className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              {t("legendClear")}
            </li>
            <li>{t("legendInactive")}</li>
          </ul>
          {withoutLocation.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <MapPinOff className="size-4 text-warning" aria-hidden />
                {t("withoutLocation", { count: withoutLocation.length })}
              </p>
              <ul className="mt-1 space-y-0.5">
                {withoutLocation.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {row.code} · {row.name}
                    </span>
                    <Link
                      href={`/projects/${row.id}/edit`}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      {t("setLocation")}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <ProjectOverview
        projects={projects}
        date={date}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpenPhoto={onOpenPhoto}
        statusLabel={(status) => figures(`projectStatus.${status}`)}
      />
    </section>
  );
}

/**
 * One project's figure on the head-office page, opening the list it counts
 * for that project (F8, Q22) - the same target as the company card, narrowed
 * to the project. 今日现场记录 has no single list and stays a plain number.
 */
function FigureLink({
  field,
  project,
  date,
  value,
}: {
  field: HeadquartersCountField;
  project: HeadquartersProject;
  date: string;
  value: number;
}) {
  const figures = useTranslations("headquarters.figures");
  const format = useFormatter();
  const text = format.number(value);
  const href = cardHref(field, { project: project.id, date });
  if (!href) return <>{text}</>;
  return (
    <Link
      href={href}
      // The row itself selects the project on the map.
      onClick={(event) => event.stopPropagation()}
      aria-label={`${project.name} · ${figures(`field.${field}`)}: ${text}`}
      className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-figure-link={field}
    >
      {text}
    </Link>
  );
}

export function ProjectCard({
  project,
  date,
  onOpenPhoto,
}: {
  project: HeadquartersProject;
  date: string;
  onOpenPhoto?: (photo: HeadquartersPhoto) => void;
}) {
  const t = useTranslations("headquarters.map");
  const figures = useTranslations("headquarters.figures");
  return (
    <div className="space-y-2 rounded-lg border p-3" data-selected-project={project.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[project.code, project.address].filter(Boolean).join(" · ")}
          </p>
        </div>
        <StatusBadge
          label={figures(`projectStatus.${project.status}`)}
          tone={project.status === "ACTIVE" ? "positive" : "neutral"}
        />
      </div>
      <LatestPhoto photo={project.latest_photo} onOpen={onOpenPhoto} large />
      <dl className="grid grid-cols-3 gap-1.5 text-center text-xs">
        {(
          [
            ["on_site_now", project.on_site_now],
            ["today_records", project.today_records],
            ["pending_approvals", project.pending_approvals],
            ["open_tasks", project.open_tasks],
            ["overdue_tasks", project.overdue_tasks],
            ["overdue_rectifications", project.overdue_rectifications],
          ] as const
        ).map(([field, value]) => (
          <div
            key={field}
            className={cn(
              "rounded-md bg-muted/40 px-1 py-1.5",
              field.startsWith("overdue") && value > 0 && "bg-destructive/10 text-destructive",
            )}
          >
            <dt className="truncate text-2xs text-muted-foreground">
              {figures(`field.${field}`)}
            </dt>
            <dd className="text-base font-semibold tabular-nums">
              <FigureLink field={field} project={project} date={date} value={value} />
            </dd>
          </div>
        ))}
      </dl>
      <Button asChild className="w-full" size="sm">
        <Link href={projectDashboardHref(project.id)}>
          {t("enter")}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

function LatestPhoto({
  photo,
  onOpen,
  large = false,
}: {
  photo: HeadquartersPhoto | null;
  onOpen?: (photo: HeadquartersPhoto) => void;
  large?: boolean;
}) {
  const t = useTranslations("headquarters.map");
  const df = useDateFormat();
  const box = large ? "h-28 w-full" : "h-10 w-14";
  if (!photo?.image) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed text-2xs text-muted-foreground",
          box,
        )}
      >
        {large ? t("noPhoto") : <Camera className="size-3.5" aria-label={t("noPhoto")} />}
      </span>
    );
  }
  const image = (
    // A watermarked evidence photo, served as is.
    <img loading="lazy" decoding="async"
      src={photo.image}
      alt={t("latestPhotoAlt", { time: df.dateTime(photo.captured_at) })}
      className={cn("rounded-md object-cover", box)}
    />
  );
  return onOpen ? (
    <button
      type="button"
      onClick={() => onOpen(photo)}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={df.dateTime(photo.captured_at)}
    >
      {image}
    </button>
  ) : (
    image
  );
}

/** 项目总览 (C15): every project's 名称、地点、最新照片 and its open work. */
function ProjectOverview({
  projects,
  date,
  selectedId,
  onSelect,
  onOpenPhoto,
  statusLabel,
}: {
  projects: HeadquartersProject[];
  date: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenPhoto?: (photo: HeadquartersPhoto) => void;
  statusLabel: (status: HeadquartersProject["status"]) => string;
}) {
  const t = useTranslations("headquarters.map");
  const figures = useTranslations("headquarters.figures");
  return (
    <div className="space-y-1.5" data-project-overview>
      <h3 className="text-base font-semibold">{t("overview")}</h3>
      {projects.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{t("noProjects")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{figures("project")}</TableHead>
              <TableHead>{t("location")}</TableHead>
              <TableHead>{t("latestPhoto")}</TableHead>
              <TableHead className="text-right">{figures("field.today_records")}</TableHead>
              <TableHead className="text-right">{figures("field.pending_approvals")}</TableHead>
              <TableHead className="text-right">{figures("field.open_tasks")}</TableHead>
              <TableHead className="text-right">{figures("field.overdue_tasks")}</TableHead>
              <TableHead className="text-right">{figures("field.overdue_rectifications")}</TableHead>
              <TableHead className="text-right">{figures("field.on_site_now")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{t("enter")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
              const figure = (field: HeadquartersCountField) => (
                <FigureLink field={field} project={project} date={date} value={project[field]} />
              );
              return (
                <TableRow
                  key={project.id}
                  data-state={project.id === selectedId ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => onSelect(project.id)}
                >
                  <TableCell>
                    <span className="block font-medium">{project.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {project.code} · {statusLabel(project.status)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 text-xs">
                    {project.address || [project.city, project.state].filter(Boolean).join(", ") || "—"}
                    {!project.has_location && (
                      <span className="block text-warning">{t("noCoordinates")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <LatestPhoto photo={project.latest_photo} onOpen={onOpenPhoto} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{figure("today_records")}</TableCell>
                  <TableCell className="text-right tabular-nums">{figure("pending_approvals")}</TableCell>
                  <TableCell className="text-right tabular-nums">{figure("open_tasks")}</TableCell>
                  {/* Two lists, so two numbers: tasks and rectifications are
                      opened apart (F8), never as one sum. */}
                  {(["overdue_tasks", "overdue_rectifications"] as const).map((field) => (
                    <TableCell
                      key={field}
                      className={cn(
                        "text-right tabular-nums",
                        project[field] > 0 && "font-semibold text-destructive",
                      )}
                    >
                      {figure(field)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{figure("on_site_now")}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={projectDashboardHref(project.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {t("enter")}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
