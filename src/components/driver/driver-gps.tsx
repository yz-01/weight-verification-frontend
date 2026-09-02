"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Timer,
  TriangleAlert,
  Truck,
  UserRound,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { LocationMap } from "@/components/shared/location-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  DriverTask,
  DriverTaskPosition,
  TaskState,
} from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import {
  getDriverLivePositions,
  getDriverLiveRoutes,
  getDriverRouteHistory,
} from "@/services/driver-gps.service";
import { getTask, getTasks } from "@/services/recycler.service";
import { trackPaths } from "@/lib/track-paths";

type TaskFilter = "ALL" | "RUNNING" | "FINISHED";

export function DriverGps() {
  const t = useTranslations();
  const df = useDateFormat();
  const formatter = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("RUNNING");
  const taskSearch = useDebounce(search, 300);

  const tasks = useInfiniteQuery({
    queryKey: ["tasks", "gps-monitor", taskSearch, taskFilter],
    queryFn: ({ pageParam }) =>
      getTasks({
        page: pageParam,
        page_size: 50,
        search: taskSearch || undefined,
        running: taskFilter === "RUNNING" ? true : undefined,
        sort_by: "scheduled_for",
        sort_order: "desc",
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    refetchInterval: 30_000,
  });

  const taskRows = useMemo(
    () => tasks.data?.pages.flatMap((page) => page.results) ?? [],
    [tasks.data],
  );

  const visibleTasks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return taskRows.filter((task) => {
      const matchesFilter =
        taskFilter === "ALL" ||
        (taskFilter === "RUNNING" ? task.is_running : !task.is_running);
      if (!matchesFilter) return false;
      if (!term) return true;
      return [
        task.task_no,
        task.dispatch_no,
        task.driver_name,
        task.vehicle_plate,
        task.site_name,
      ].some((value) => value?.toLocaleLowerCase().includes(term));
    });
  }, [search, taskFilter, taskRows]);
  const requestedTaskId = searchParams.get("task");
  const selectedTaskId = requestedTaskId || visibleTasks[0]?.id;

  const detail = useQuery({
    queryKey: ["tasks", selectedTaskId, "gps-detail"],
    queryFn: () => getTask(selectedTaskId!),
    enabled: Boolean(selectedTaskId),
    refetchInterval: 30_000,
  });

  const route = useInfiniteQuery({
    queryKey: ["driver-gps", selectedTaskId],
    queryFn: ({ pageParam }) =>
      getDriverRouteHistory(selectedTaskId!, {
        page: pageParam,
        page_size: 50,
        sort_by: "original_occurred_at",
        sort_order: "desc",
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    enabled: Boolean(selectedTaskId),
    refetchInterval: 30_000,
  });

  const live = useQuery({
    queryKey: ["driver-gps", "live"],
    queryFn: () =>
      getDriverLivePositions({
        page_size: 200,
        running: true,
      }),
    refetchInterval: 15_000,
  });
  const liveRoutes = useQuery({
    queryKey: ["driver-gps", "live-routes"],
    queryFn: () => getDriverLiveRoutes(50),
    refetchInterval: 15_000,
  });

  const positions = useMemo(
    () => route.data?.pages.flatMap((page) => page.results) ?? [],
    [route.data],
  );
  const current = positions[0];
  const livePositions = useMemo(
    () => live.data?.results ?? [],
    [live.data?.results],
  );
  const liveCenter = useMemo<[number, number] | undefined>(() => {
    const first = livePositions.find(
      (position) => position.project_latitude && position.project_longitude,
    );
    if (!first?.project_latitude || !first.project_longitude) return undefined;
    return [Number(first.project_latitude), Number(first.project_longitude)];
  }, [livePositions]);
  const liveMarkers = useMemo(
    () =>
      livePositions.map((position) => ({
        id: position.id,
        latitude: Number(position.latitude),
        longitude: Number(position.longitude),
        label: `${position.driver_name} · ${position.vehicle_plate}`,
        detail: `${position.project_name ?? ""} · ${t(
          `driverGps.geofence.${position.geofence_result}`,
        )}`,
        tone:
          position.geofence_result === "OUTSIDE"
            ? ("danger" as const)
            : position.is_stale
              ? ("warning" as const)
              : ("positive" as const),
        stale: position.is_stale,
        icon: "truck" as const,
      })),
    [livePositions, t],
  );
  const driverByTask = useMemo(
    () => new Map(livePositions.map((position) => [position.task, position])),
    [livePositions],
  );
  const livePaths = useMemo(
    () =>
      (liveRoutes.data?.routes ?? []).flatMap((route, index) => {
        const driver = driverByTask.get(route.task);
        return trackPaths({
          id: route.task,
          points: route.positions.map((position) => ({
            latitude: position.latitude,
            longitude: position.longitude,
            occurredAt: position.original_occurred_at,
          })),
          color: ROUTE_COLORS[index % ROUTE_COLORS.length],
          label: driver
            ? `${driver.driver_name} / ${driver.vehicle_plate}`
            : undefined,
          gapLabel: (minutes) => t("driver.track.gap", { minutes }),
        });
      }),
    [driverByTask, liveRoutes.data?.routes, t],
  );
  const liveZones = useMemo(() => {
    const byProject = new Map<string, {
      id: string;
      center: [number, number];
      radiusM: number;
      label: string;
    }>();
    livePositions.forEach((position) => {
      if (
        position.project_name &&
        position.project_latitude &&
        position.project_longitude &&
        position.project_geofence_radius_m
      ) {
        const key = `${position.project_latitude}:${position.project_longitude}`;
        byProject.set(key, {
          id: key,
          center: [
            Number(position.project_latitude),
            Number(position.project_longitude),
          ],
          radiusM: position.project_geofence_radius_m,
          label: position.project_name,
        });
      }
    });
    return Array.from(byProject.values());
  }, [livePositions]);

  function selectTask(taskId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("task", taskId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function refresh() {
    void tasks.refetch();
    void live.refetch();
    void liveRoutes.refetch();
    if (selectedTaskId) {
      void detail.refetch();
      void route.refetch();
    }
  }

  return (
    <div className="space-y-5">
      <ListHeader
        title={t("driverGps.title")}
        subtitle={
          tasks.isLoading
            ? t("common.loading")
            : t("driverGps.count", {
                count: tasks.data?.pages[0]?.count ?? 0,
              })
        }
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={
              tasks.isFetching || route.isFetching || live.isFetching || liveRoutes.isFetching
            }
            onClick={refresh}
          >
            <RefreshCw
              className={`h-4 w-4 ${tasks.isFetching || route.isFetching || live.isFetching || liveRoutes.isFetching ? "animate-spin" : ""}`}
            />
            {t("common.refresh")}
          </Button>
        }
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t("driverGps.liveMap.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("driverGps.liveMap.count", { count: live.data?.count ?? 0 })}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {t("driverGps.liveMap.refresh")}
          </span>
        </div>
        <LocationMap
          center={liveCenter}
          markers={liveMarkers}
          paths={livePaths}
          zones={liveZones}
        />
      </section>

      <div className="grid min-h-0 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3" aria-label={t("driverGps.tasks.title")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("driverGps.tasks.search")}
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-3 rounded-md border bg-muted/40 p-1">
            {(["ALL", "RUNNING", "FINISHED"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={`min-h-8 rounded-sm px-2 text-xs font-medium transition-colors ${
                  taskFilter === filter
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setTaskFilter(filter)}
              >
                {t(`driverGps.tasks.filter.${filter}`)}
              </button>
            ))}
          </div>

          <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-14rem)]">
            {tasks.isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-md" />
              ))
            ) : tasks.isError ? (
              <EmptyTaskList message={t("table.errorBody")} />
            ) : (
              <>
                {visibleTasks.length === 0 ? (
                  <EmptyTaskList
                    message={
                      search || taskFilter !== "ALL"
                        ? t("table.noResultsFiltered")
                        : t("driverGps.tasks.empty")
                    }
                  />
                ) : (
                  visibleTasks.map((task) => (
                    <TaskOption
                      key={task.id}
                      task={task}
                      active={task.id === selectedTaskId}
                      onSelect={() => selectTask(task.id)}
                    />
                  ))
                )}
                {tasks.hasNextPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={tasks.isFetchingNextPage}
                    onClick={() => void tasks.fetchNextPage()}
                  >
                    {tasks.isFetchingNextPage && (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    )}
                    {t("driverGps.tasks.loadMore")}
                  </Button>
                )}
              </>
            )}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {!selectedTaskId ? (
            <div className="flex min-h-80 items-center justify-center border-y text-sm text-muted-foreground">
              {t("driverGps.tasks.empty")}
            </div>
          ) : detail.isLoading ? (
            <GpsSkeleton />
          ) : detail.isError ? (
            <div className="flex min-h-80 items-center justify-center border-y text-sm text-muted-foreground">
              {t("table.errorBody")}
            </div>
          ) : (
            <>
              {detail.data && <TaskContext task={detail.data} />}

              {route.isLoading ? (
                <GpsSkeleton />
              ) : route.isError ? (
                <div className="border-y py-12 text-center text-sm text-muted-foreground">
                  {t("driverGps.route.error")}
                </div>
              ) : current ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryTile
                      icon={LocateFixed}
                      label={t("driverGps.summary.position")}
                    >
                      <p className="font-mono text-sm">
                        {current.latitude}, {current.longitude}
                      </p>
                      <a
                        href={openStreetMapUrl(current)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {t("driverGps.action.openMap")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </SummaryTile>
                    <SummaryTile
                      icon={Activity}
                      label={t("driverGps.summary.accuracy")}
                    >
                      <p className="text-lg font-semibold">
                        {formatMetres(current.accuracy_m, formatter.number, t("common.emptyValue"))}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {df.precise(current.original_occurred_at)}
                      </p>
                    </SummaryTile>
                    <SummaryTile
                      icon={eventIcon(current.event_type)}
                      label={t("driverGps.summary.event")}
                    >
                      <p className="text-lg font-semibold">
                        {t(`driverGps.event.${current.event_type}`)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("driverGps.summary.latest")}
                      </p>
                    </SummaryTile>
                    <SummaryTile
                      icon={geofenceIcon(current.geofence_result)}
                      label={t("driverGps.summary.geofence")}
                    >
                      <StatusBadge
                        label={t(`driverGps.geofence.${current.geofence_result}`)}
                        tone={geofenceTone(current.geofence_result)}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("driverGps.summary.distance", {
                          value: formatMetres(
                            current.distance_to_project_m,
                            formatter.number,
                            t("common.emptyValue"),
                          ),
                        })}
                      </p>
                    </SummaryTile>
                  </div>

                  <RouteTimeline
                    positions={positions}
                    total={route.data?.pages[0]?.count ?? positions.length}
                    hasMore={route.hasNextPage}
                    loadingMore={route.isFetchingNextPage}
                    onLoadMore={() => void route.fetchNextPage()}
                  />
                </>
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center border-y text-center">
                  <Route className="mb-3 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">{t("driverGps.route.empty")}</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    {t("driverGps.route.emptyDescription")}
                  </p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const ROUTE_COLORS = [
  "#087f8c",
  "#2563eb",
  "#7c3aed",
  "#c2410c",
  "#16825d",
  "#be123c",
];

function TaskOption({
  task,
  active,
  onSelect,
}: {
  task: DriverTask;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`w-full rounded-md border p-3 text-left transition-colors ${
        active
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/15"
          : "bg-card hover:border-foreground/25"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{task.task_no}</span>
        <StatusBadge
          label={t(`tasks.state.${task.state}`)}
          tone={taskStateTone(task.state)}
        />
      </div>
      <p className="mt-2 truncate text-sm">{task.driver_name}</p>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{task.vehicle_plate}</span>
        <span className="shrink-0 tabular-nums">
          {task.scheduled_for ? df.date(task.scheduled_for) : t("common.emptyValue")}
        </span>
      </div>
    </button>
  );
}

function EmptyTaskList({ message }: { message: string }) {
  return (
    <div className="border-y px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function TaskContext({ task }: { task: Awaited<ReturnType<typeof getTask>> }) {
  const t = useTranslations();
  return (
    <section className="border-y py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg font-semibold">{task.task_no}</h2>
            <StatusBadge
              label={t(`tasks.state.${task.state}`)}
              tone={taskStateTone(task.state)}
            />
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {[task.contractor_name, task.project_name].filter(Boolean).join(" / ") ||
              task.site_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TypeBadge label={task.vehicle_plate} />
          {task.dispatch_no && <TypeBadge label={task.dispatch_no} />}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <ContextItem
          icon={UserRound}
          label={t("tasks.field.driver")}
          value={task.driver_name}
        />
        <ContextItem
          icon={Truck}
          label={t("tasks.field.vehicle")}
          value={task.vehicle_plate}
        />
        <ContextItem
          icon={MapPin}
          label={t("tasks.field.project")}
          value={task.project_name ?? t("common.emptyValue")}
        />
      </dl>
    </section>
  );
}

function ContextItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <dt className="sr-only">{label}</dt>
      <dd className="truncate" title={`${label}: ${value}`}>
        {value}
      </dd>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-32 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function RouteTimeline({
  positions,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  positions: DriverTaskPosition[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const formatter = useFormatter();
  return (
    <section className="space-y-3" aria-labelledby="driver-route-timeline">
      <div className="flex items-center justify-between gap-3">
        <h2 id="driver-route-timeline" className="text-sm font-semibold">
          {t("driverGps.timeline.title")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("driverGps.timeline.count", { count: total })}
        </span>
      </div>
      <ol className="divide-y border-y">
        {positions.map((position) => {
          const Icon = eventIcon(position.event_type);
          return (
            <li
              key={position.id}
              className="grid gap-3 py-4 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:items-start"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border bg-card">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    {t(`driverGps.event.${position.event_type}`)}
                  </p>
                  <StatusBadge
                    label={t(`driverGps.geofence.${position.geofence_result}`)}
                    tone={geofenceTone(position.geofence_result)}
                  />
                </div>
                <p className="mt-1 break-all font-mono text-xs">
                  {position.latitude}, {position.longitude}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t("driverGps.field.accuracy")}: {formatMetres(
                      position.accuracy_m,
                      formatter.number,
                      t("common.emptyValue"),
                    )}
                  </span>
                  <span>
                    {t("driverGps.field.distance")}: {formatMetres(
                      position.distance_to_project_m,
                      formatter.number,
                      t("common.emptyValue"),
                    )}
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-left text-xs tabular-nums text-muted-foreground sm:text-right">
                <p title={t("driverGps.field.occurredAt")}>
                  <Timer className="mr-1 inline h-3 w-3" />
                  {df.precise(position.original_occurred_at)}
                </p>
                <p>
                  {t("driverGps.field.uploadedAt")}: {df.precise(position.uploaded_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore && <RefreshCw className="h-4 w-4 animate-spin" />}
            {t("driverGps.timeline.loadOlder")}
          </Button>
        </div>
      )}
    </section>
  );
}

function GpsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-md" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-md" />
    </div>
  );
}

function eventIcon(event: DriverTaskPosition["event_type"]): LucideIcon {
  if (event === "ARRIVAL") return MapPin;
  if (event === "GEOFENCE_ENTER") return ShieldCheck;
  if (event === "GEOFENCE_EXIT") return TriangleAlert;
  return Navigation;
}

function geofenceIcon(
  result: DriverTaskPosition["geofence_result"],
): LucideIcon {
  if (result === "INSIDE") return ShieldCheck;
  if (result === "OUTSIDE") return ShieldX;
  return ShieldQuestion;
}

function geofenceTone(result: DriverTaskPosition["geofence_result"]) {
  if (result === "INSIDE") return "positive" as const;
  if (result === "OUTSIDE") return "danger" as const;
  return "neutral" as const;
}

function taskStateTone(state: TaskState) {
  if (state === "COMPLETED") return "positive" as const;
  if (state === "DELIVERED") return "warning" as const;
  if (state === "FAILED") return "danger" as const;
  if (state === "ARRIVED" || state === "LOADED") return "warning" as const;
  if (state === "ACCEPTED" || state === "EN_ROUTE" || state === "RETURNING") {
    return "info" as const;
  }
  return "neutral" as const;
}

function openStreetMapUrl(position: DriverTaskPosition): string {
  const coordinates = `${position.latitude}/${position.longitude}`;
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(position.latitude)}&mlon=${encodeURIComponent(position.longitude)}#map=18/${coordinates}`;
}

function formatMetres(
  value: string | null,
  formatNumber: (value: number) => string,
  empty: string,
): string {
  if (value === null || Number.isNaN(Number(value))) return empty;
  return `${formatNumber(Number(value))} m`;
}
