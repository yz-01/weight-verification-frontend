"use client";

/**
 * 项目现场地图 (JB222, 客户 11-19 事项 2).
 *
 * 「项目仪表板：地图必须根据该项目的电子围栏自动放大及居中，让整个工地占据地图约
 * 80%的空间，并显示：现场人员的位置、材料卸货的位置、机械设备的位置、各项现场
 * 记录的GPS位置。人员位置应显示最新定位时间，其他事项根据现有GPS记录显示。点击
 * 地图上的图标，可以查看对应的人员或完整事项记录。项目仪表板的地图是用来管理工地
 * 现场，而不是查看整个城市的道路分布。」
 *
 * - The map opens on the project's fences, filling about 80 % of it, and stays
 *   on the site (JB111's lock): nothing of the city around it.
 * - Four layers, each a labelled switch with its count: 人员 and 机械设备 are
 *   where they are now; 材料卸货 and 现场记录 are today's, or the last seven
 *   days' with one switch. A point outside the site is not drawn; one line
 *   says how many.
 * - A press on an icon shows its card inside the map (full screen too);
 *   「查看完整记录」 opens the record's own window over the dashboard.
 *
 * **The boundary JB226 mounts:** this component reads no role. Every layer
 * comes from the server's `allowed` flags (`get_project_map`, which cuts each
 * layer and kind to the reader's own list permissions), so the same component
 * shows a consultant only what head office opened to him. The one permission
 * read here is `geofence.manage`, for the 「去画电子围栏」 button. The
 * `consultant` prop changes words only (JB226 audit F2): his notes never speak
 * of people or machines, and send him to 建筑商总部.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Construction,
  MapPinned,
  MapPinOff,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  LocationMap,
  type LocationMapMarker,
  type LocationMapZone,
} from "@/components/shared/location-map";
import { useMapFrame } from "@/components/shared/map-frame";
import { LoadFailed } from "@/components/shared/page-primitives";
import { useRecordOpener } from "@/components/shared/record-opener";
import { WorkerDetailDialog } from "@/components/site-workers/worker-detail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ProjectMap,
  ProjectMapPerson,
  ProjectMapRow,
  ProjectMapWindow,
} from "@/interfaces/headquarters";
import { useDateFormat, type DateFormatter } from "@/lib/dates";
import { boxHolds, groupNearby, siteViewBox, type LatLng } from "@/lib/site-view";
import { TONES } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { getProjectMap } from "@/services/contractor-dashboard.service";

export type MapLayer = "people" | "receipts" | "machines" | "records";
export const MAP_LAYERS: readonly MapLayer[] = ["people", "receipts", "machines", "records"];

/** The share of the map the site fills when it opens (「约80%」). */
export const SITE_FILL = 0.8;
/** Icons of one layer closer than this many metres are one icon (D8). */
export const SAME_SPOT_M = 8;

const LAYER_LOOK: Record<MapLayer, { icon: LucideIcon; marker: LocationMapMarker["icon"]; tone: LocationMapMarker["tone"]; dot: string }> = {
  people: { icon: UserRound, marker: "person", tone: "positive", dot: TONES.green.dot },
  receipts: { icon: Truck, marker: "truck", tone: "primary", dot: TONES.cyan.dot },
  machines: { icon: Construction, marker: "machine", tone: "warning", dot: TONES.amber.dot },
  records: { icon: ClipboardList, marker: "record", tone: "info", dot: TONES.purple.dot },
};

export type MapItem =
  | { layer: "people"; person: ProjectMapPerson }
  | { layer: "receipts" | "machines" | "records"; row: ProjectMapRow };

function place(item: MapItem): LatLng {
  const source = item.layer === "people" ? item.person : item.row;
  return [Number(source.latitude), Number(source.longitude)];
}

function itemKey(item: MapItem): string {
  return item.layer === "people" ? `people:${item.person.kind}:${item.person.id}` : `${item.layer}:${item.row.kind}:${item.row.id}`;
}

/** The site's shapes as map zones: every fence, else the project's circle, else its place. */
export function siteZones(site: ProjectMap["site"]): LocationMapZone[] {
  const zones = site.fences.flatMap((fence): LocationMapZone[] => {
    if (fence.shape === "POLYGON" && fence.polygon.length >= 3) {
      return [{ id: fence.id, points: fence.polygon, label: fence.name, dashed: !fence.is_primary }];
    }
    if (fence.latitude && fence.longitude && fence.radius_m) {
      return [
        {
          id: fence.id,
          center: [Number(fence.latitude), Number(fence.longitude)],
          radiusM: fence.radius_m,
          label: fence.name,
          dashed: !fence.is_primary,
        },
      ];
    }
    return [];
  });
  if (zones.length > 0) return zones;
  if (site.radius_circle) {
    return [
      {
        id: "project-radius",
        center: [Number(site.radius_circle.latitude), Number(site.radius_circle.longitude)],
        radiusM: site.radius_circle.radius_m,
      },
    ];
  }
  // A place but no boundary yet: kept to a kilometre around it (JB111), nothing drawn.
  if (site.location) {
    return [{ id: "project-place", center: [Number(site.location.latitude), Number(site.location.longitude)] }];
  }
  return [];
}

/** Every item of the layers the reader may see, as the server sent them. */
export function mapItems(data: ProjectMap): Record<MapLayer, MapItem[]> {
  return {
    people: data.layers.people.rows.map((person) => ({ layer: "people" as const, person })),
    receipts: data.layers.receipts.rows.map((row) => ({ layer: "receipts" as const, row })),
    machines: data.layers.machines.rows.map((row) => ({ layer: "machines" as const, row })),
    records: data.layers.records.rows.map((row) => ({ layer: "records" as const, row })),
  };
}

/**
 * The icons drawn: each layer that is switched on, with what stands within
 * 8 m of each other as one icon carrying their number (D8). `byId` gives the
 * card its items when an icon is pressed.
 */
export function siteMarkers(
  kept: Record<MapLayer, MapItem[]>,
  hidden: ReadonlySet<MapLayer>,
  t: Translate,
): { byId: Map<string, MapItem[]>; markers: LocationMapMarker[] } {
  const byId = new Map<string, MapItem[]>();
  const markers: LocationMapMarker[] = [];
  for (const layer of MAP_LAYERS) {
    if (hidden.has(layer)) continue;
    const look = LAYER_LOOK[layer];
    for (const group of groupNearby(kept[layer], place, SAME_SPOT_M)) {
      // Each item is in one group only, so its first item names it - and an
      // open card stays open through the minute's refresh.
      const id = itemKey(group.items[0]);
      byId.set(id, group.items);
      const stale = group.items.every((item) => item.layer === "people" && item.person.stale);
      markers.push({
        id,
        latitude: group.at[0],
        longitude: group.at[1],
        label: group.items.length > 1 ? t("here", { count: group.items.length }) : itemTitle(group.items[0], t),
        tone: stale ? "warning" : look.tone,
        stale,
        icon: look.marker,
        count: group.items.length,
      });
    }
  }
  return { byId, markers };
}

export function ProjectSiteMap({
  project,
  consultant = false,
}: {
  project: string;
  /**
   * Read by a consultant (JB226 audit F2): people and machines are never his,
   * so the notes speak only of the records head office opened for him, and a
   * missing fence is 建筑商总部's to draw, not 「公司管理员」's.
   */
  consultant?: boolean;
}) {
  const t = useTranslations("projectSiteMap");
  const title = useTranslations("projectReference");
  const df = useDateFormat();
  const router = useRouter();
  const opener = useRecordOpener();
  const [range, setRange] = useState<ProjectMapWindow>("today");
  const [hidden, setHidden] = useState<Set<MapLayer>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [worker, setWorker] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["contractor-dashboard", "project-map", project, range],
    queryFn: () => getProjectMap(project, range),
    enabled: Boolean(project),
    // People move: within a minute, or when the page is back.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  const zones = useMemo(() => (data ? siteZones(data.site) : []), [data]);
  const box = useMemo(
    () => siteViewBox(zones.map((zone) => ({ points: zone.points, center: zone.center, radiusM: zone.radiusM }))),
    [zones],
  );
  const items = useMemo(() => (data ? mapItems(data) : null), [data]);
  // Only what lies on the site is drawn (「而不是查看整个城市」); the rest is counted.
  const onSite = useMemo(() => {
    const kept: Record<MapLayer, MapItem[]> = { people: [], receipts: [], machines: [], records: [] };
    let outside = 0;
    if (!items || !box) return { kept, outside };
    for (const layer of MAP_LAYERS) {
      for (const item of items[layer]) {
        if (boxHolds(box, place(item))) kept[layer].push(item);
        else outside += 1;
      }
    }
    return { kept, outside };
  }, [box, items]);
  const groups = useMemo(() => siteMarkers(onSite.kept, hidden, t), [hidden, onSite, t]);
  const placeMarker = useMemo<LocationMapMarker[]>(() => {
    if (!data || data.site.fences.length > 0 || data.site.radius_circle || !data.site.location) return [];
    return [
      {
        id: "project-place",
        latitude: Number(data.site.location.latitude),
        longitude: Number(data.site.location.longitude),
        label: `${data.project.code} · ${data.project.name}`,
        icon: "project",
      },
    ];
  }, [data]);
  const markers = useMemo(() => [...placeMarker, ...groups.markers], [groups.markers, placeMarker]);
  const chosen = selected ? groups.byId.get(selected) ?? null : null;

  if (!project) return null;

  const counts: Record<MapLayer, number> = {
    people: onSite.kept.people.length,
    receipts: onSite.kept.receipts.length,
    machines: onSite.kept.machines.length,
    records: onSite.kept.records.length,
  };
  const offered = data ? MAP_LAYERS.filter((layer) => data.layers[layer].allowed) : [];
  const fenced = data ? data.site.fences.length > 0 || Boolean(data.site.radius_circle) : false;
  const toggle = (layer: MapLayer) => {
    setSelected(null);
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };
  const openRecord = (kind: string, id: string, reference: string, at: string | null) =>
    opener.open(kind, id, {
      reference,
      project_id: data?.project.id ?? project,
      project_name: data?.project.name ?? "",
      submitted_at: at,
    });

  return (
    <section className="surface-panel space-y-3 rounded-2xl p-4" data-project-site-map>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MapPinned className="size-5 text-primary" aria-hidden />
          {title("map")}
        </h2>
        {/* 「今天 / 最近 7 天」 (D4): deliveries and records only. */}
        <div role="group" aria-label={t("windowLabel")} className="inline-flex rounded-lg border p-0.5" data-map-window>
          {(["today", "week"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={range === value ? "default" : "ghost"}
              aria-pressed={range === value}
              className="h-8"
              onClick={() => {
                setSelected(null);
                setRange(value);
              }}
            >
              {t(`window.${value}`)}
            </Button>
          ))}
        </div>
      </header>

      {query.isError && !data ? (
        <LoadFailed what={title("map")} onRetry={() => void query.refetch()} />
      ) : !data ? (
        <Skeleton className="h-72 w-full" />
      ) : !box ? (
        // No fence and no place: nothing to centre on.
        <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center" data-map-no-site>
          <div className="space-y-3">
            <MapPinOff className="mx-auto size-8 text-warning" aria-hidden />
            <p className="text-sm font-medium">{t("noPlace")}</p>
            <FenceAction project={project} consultant={consultant} />
          </div>
        </div>
      ) : (
        <>
          <LocationMap
            markers={markers}
            zones={zones}
            lockToSite
            siteFill={SITE_FILL}
            popups={false}
            preserveViewOnDataUpdate
            fitBoundsKey={`project-site-map:${project}`}
            fitLabel={t("backToSite")}
            sizeKey="project-dashboard-map"
            className="min-h-[18rem] rounded-lg sm:min-h-[22rem]"
            ariaLabel={title("map")}
            onMarkerClick={(id) => setSelected(groups.byId.has(id) ? id : null)}
            overlay={
              <MapOverlay
                offered={offered}
                hidden={hidden}
                counts={counts}
                onToggle={toggle}
                chosen={chosen}
                onClose={() => setSelected(null)}
                df={df}
                project={project}
                onOpenRecord={openRecord}
                onOpenWorker={setWorker}
              />
            }
          />
          <ul className="space-y-1 text-xs text-muted-foreground" data-map-notes>
            {!fenced ? (
              <li className="flex flex-wrap items-center gap-2 text-sm text-foreground" data-map-no-fence>
                <MapPinOff className="size-4 text-warning" aria-hidden />
                {t("noFence")}
                <FenceAction project={project} consultant={consultant} />
              </li>
            ) : null}
            {consultant && offered.length === 0 ? (
              // Nothing of the map opened to him: why it is bare, and whom to ask.
              <li className="text-sm text-foreground" data-map-consultant-none>
                {t("consultantNoLayers")}
              </li>
            ) : (
              <li>{t(consultant ? "consultantLegend" : "legendNote", { window: range })}</li>
            )}
            {onSite.outside > 0 ? <li data-map-outside>{t("outside", { count: onSite.outside })}</li> : null}
            {data.layers.machines.without_position > 0 ? (
              <li>{t("machinesWithout", { count: data.layers.machines.without_position })}</li>
            ) : null}
            {data.layers.receipts.capped ? <li>{t("capped", { layer: t("layer.receipts"), cap: data.cap })}</li> : null}
            {data.layers.records.capped ? <li>{t("capped", { layer: t("layer.records"), cap: data.cap })}</li> : null}
            {offered.length > 0 && MAP_LAYERS.every((layer) => counts[layer] === 0) ? (
              <li data-map-nothing>{t(consultant ? "consultantNothingYet" : "nothingYet", { window: range })}</li>
            ) : null}
          </ul>
        </>
      )}
      {opener.sheet}
      {worker ? (
        <WorkerDetailDialog
          workerId={worker}
          onClose={() => setWorker(null)}
          onAllVisits={(id) => {
            setWorker(null);
            router.push(`/site-workers?tab=visits&worker=${encodeURIComponent(id)}`);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * 「去画电子围栏」 for whoever may draw one; the others are told whom to ask
 * (D11) - a consultant the builder's head office, not his own firm's
 * administrator (JB226 audit F2).
 */
function FenceAction({ project, consultant = false }: { project: string; consultant?: boolean }) {
  const t = useTranslations("projectSiteMap");
  const { can } = useAuth();
  if (consultant) return <span className="text-sm text-muted-foreground">{t("askHeadOffice")}</span>;
  if (!can("geofence.manage")) return <span className="text-sm text-muted-foreground">{t("askAdmin")}</span>;
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/geofences?project=${encodeURIComponent(project)}`}>{t("drawFence")}</Link>
    </Button>
  );
}

type Translate = ReturnType<typeof useTranslations<"projectSiteMap">>;

function itemTitle(item: MapItem, t: Translate): string {
  if (item.layer === "people") return item.person.name;
  if (item.layer === "machines") return item.row.label;
  return [t(`kind.${item.row.kind}` as "kind.MATERIAL_RECEIPT"), item.row.reference].filter(Boolean).join(" · ");
}

/** A time on the card: the hour today, with the date otherwise - both in the company's clock. */
function when(df: DateFormatter, at: string | null): string {
  if (!at) return "—";
  return df.date(at) === df.date(new Date()) ? df.time(at) : df.dateTime(at);
}

/**
 * What lies over the map, inside its frame (D10): the layer switches, or the
 * card of what was pressed. Opening a record leaves full screen first, or its
 * window would open behind the map.
 */
export function MapOverlay({
  offered,
  hidden,
  counts,
  onToggle,
  chosen,
  onClose,
  df,
  project,
  onOpenRecord,
  onOpenWorker,
}: {
  offered: MapLayer[];
  hidden: Set<MapLayer>;
  counts: Record<MapLayer, number>;
  onToggle: (layer: MapLayer) => void;
  chosen: MapItem[] | null;
  onClose: () => void;
  df: DateFormatter;
  project: string;
  onOpenRecord: (kind: string, id: string, reference: string, at: string | null) => void;
  onOpenWorker: (id: string) => void;
}) {
  const t = useTranslations("projectSiteMap");
  const frame = useMapFrame();
  const outOfFullScreen = (then: () => void) => {
    if (frame?.full) frame.leave();
    then();
  };
  return (
    // From below the zoom buttons and 「全屏」 to just above the attribution: a
    // long card scrolls inside that space and never covers them (a phone too).
    <div className="pointer-events-none absolute inset-x-2 top-20 bottom-6 z-20 flex flex-col items-start justify-end gap-2" data-map-overlay>
      {chosen ? (
        <div
          className="pointer-events-auto max-h-full w-full max-w-md overflow-y-auto rounded-xl border bg-card p-3 text-sm shadow-lg"
          role="dialog"
          aria-label={chosen.length > 1 ? t("here", { count: chosen.length }) : itemTitle(chosen[0], t)}
          data-map-card
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-semibold">
              {chosen.length > 1 ? t("here", { count: chosen.length }) : itemTitle(chosen[0], t)}
            </p>
            <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={onClose}>
              {t("close")}
            </Button>
          </div>
          <ul className="divide-y">
            {chosen.map((item) => (
              <li key={itemKey(item)} className="space-y-1 py-2 first:pt-0 last:pb-0">
                <ItemDetail item={item} df={df} single={chosen.length === 1} />
                <ItemAction
                  item={item}
                  project={project}
                  onOpenRecord={(...args) => outOfFullScreen(() => onOpenRecord(...args))}
                  onOpenWorker={(id) => outOfFullScreen(() => onOpenWorker(id))}
                  onLeave={() => frame?.full && frame.leave()}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : offered.length > 0 ? (
        <div role="group" aria-label={t("layersLabel")} className="pointer-events-auto flex flex-wrap gap-1.5" data-map-layers>
          {offered.map((layer) => {
            const look = LAYER_LOOK[layer];
            const on = !hidden.has(layer);
            return (
              <button
                key={layer}
                type="button"
                aria-pressed={on}
                data-map-layer={layer}
                onClick={() => onToggle(layer)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-card/95 px-3 text-xs font-medium shadow-sm transition",
                  on ? "text-foreground" : "text-muted-foreground opacity-70",
                )}
              >
                <span className={cn("grid size-5 place-items-center rounded-full text-card", on ? look.dot : "bg-muted-foreground/40")}>
                  <look.icon className="size-3" aria-hidden />
                </span>
                {t(`layer.${layer}`)}
                <span className="tabular-nums">{counts[layer]}</span>
                <span className="sr-only">{on ? t("shown") : t("notShown")}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ItemDetail({ item, df, single }: { item: MapItem; df: DateFormatter; single: boolean }) {
  const t = useTranslations("projectSiteMap");
  if (item.layer === "people") {
    const person = item.person;
    return (
      <div className="space-y-0.5" data-map-person={person.kind}>
        {single ? null : <p className="font-medium">{person.name}</p>}
        <p className="text-xs text-muted-foreground">
          {[t(`personKind.${person.kind}`), person.trade, person.department].filter(Boolean).join(" · ")}
        </p>
        {person.since ? <p className="text-xs">{t("since", { at: when(df, person.since) })}</p> : null}
        <p className="text-xs font-medium">{t("lastSeen", { at: when(df, person.at) })}</p>
        {person.stale ? <p className="text-xs text-warning">{t("stale")}</p> : null}
      </div>
    );
  }
  const row = item.row;
  if (item.layer === "machines") {
    return (
      <div className="space-y-0.5" data-map-machine>
        {single ? null : <p className="font-medium">{row.label}</p>}
        <p className="text-xs text-muted-foreground">
          {[row.reference, row.registration_no, row.site_no, row.supplier].filter(Boolean).join(" · ")}
        </p>
        <p className="text-xs font-medium">
          {t("machineSeen", { at: when(df, row.at), source: row.source ?? "MOVEMENT" })}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5" data-map-record={row.kind}>
      {single ? null : <p className="font-medium">{itemTitle(item, t)}</p>}
      {row.label ? <p className="text-xs text-muted-foreground">{row.label}</p> : null}
      <p className="text-xs">{t("recordedAt", { at: when(df, row.at) })}</p>
    </div>
  );
}

function ItemAction({
  item,
  project,
  onOpenRecord,
  onOpenWorker,
  onLeave,
}: {
  item: MapItem;
  project: string;
  onOpenRecord: (kind: string, id: string, reference: string, at: string | null) => void;
  onOpenWorker: (id: string) => void;
  onLeave: () => void;
}) {
  const t = useTranslations("projectSiteMap");
  if (item.layer === "people") {
    const person = item.person;
    if (person.kind === "ROSTER") {
      return (
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onOpenWorker(person.id)}>
          {t("openWorker")}
        </Button>
      );
    }
    return (
      <Button asChild size="sm" variant="outline" className="h-8">
        <Link
          href={`/site-gps?project=${encodeURIComponent(project)}&user=${encodeURIComponent(person.id)}`}
          onClick={onLeave}
        >
          {t("openRoute")}
        </Link>
      </Button>
    );
  }
  const row = item.row;
  if (item.layer === "machines") {
    if (!row.movement_id) return null;
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => onOpenRecord("EQUIPMENT_MOVEMENT", row.movement_id as string, row.reference, row.at)}
      >
        {t("openEntry")}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      className="h-8"
      onClick={() => onOpenRecord(row.kind, row.id, row.reference, row.at)}
    >
      {t("openRecord")}
    </Button>
  );
}
