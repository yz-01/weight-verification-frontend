"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Camera,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  TriangleAlert,
  Waypoints,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  EmptyState,
  ListHeader,
  LoadFailed,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HealthStatus } from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import {
  captureSystemStatus,
  getSystemEvents,
  getSystemStatus,
} from "@/services/platform-ops.service";

interface MonitorTile {
  key: string;
  icon: LucideIcon;
  status: HealthStatus;
  value: string;
}

export function Monitoring() {
  const t = useTranslations();
  const df = useDateFormat();
  const format = useFormatter();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["monitoring", "status"],
    queryFn: getSystemStatus,
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ["monitoring", "events"],
    queryFn: () =>
      getSystemEvents({ page_size: 8, sort_by: "occurred_at", sort_order: "desc" }),
  });
  const capture = useMutation({
    mutationFn: captureSystemStatus,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoring"] });
    },
  });

  const data = status.data;
  const queueDepth = data
    ? Object.values(data.queue.by_state).reduce((sum, value) => sum + value, 0)
    : 0;
  const tiles: MonitorTile[] = data
    ? [
        {
          key: "server",
          icon: Server,
          status: data.server.status,
          value: t("monitoring.value.uptime", {
            value: Math.floor(data.server.process_uptime_seconds / 60),
          }),
        },
        {
          key: "api",
          icon: Activity,
          status: data.api.status,
          value: t(`monitoring.health.${data.api.status}`),
        },
        {
          key: "database",
          icon: Database,
          status: data.database.status,
          value:
            data.database.latency_ms === null
              ? t("common.emptyValue")
              : `${format.number(data.database.latency_ms)} ms`,
        },
        {
          key: "storage",
          icon: HardDrive,
          status: data.storage.status,
          value: t(`monitoring.health.${data.storage.status}`),
        },
        {
          key: "queue",
          icon: Waypoints,
          status: data.queue.workers.status,
          value: t("monitoring.value.jobs", { count: queueDepth }),
        },
        {
          key: "devices",
          icon: Camera,
          status: data.devices.offline > 0 ? "degraded" : "ok",
          value: t("monitoring.value.devices", {
            online: data.devices.online,
            total: data.devices.total,
          }),
        },
        {
          key: "errors",
          icon: TriangleAlert,
          status: data.errors_24h > 0 ? "degraded" : "ok",
          value: t("monitoring.value.errors", { count: data.errors_24h }),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("monitoring.title")}
        subtitle={
          data
            ? t("monitoring.checkedAt", { value: df.dateTime(data.checked_at) })
            : t("common.loading")
        }
        action={
          <Button
            variant="outline"
            disabled={capture.isPending}
            onClick={() => capture.mutate()}
          >
            <RefreshCw
              className={`size-4 ${capture.isPending ? "animate-spin" : ""}`}
            />
            {t("monitoring.capture")}
          </Button>
        }
      />

      {status.isError ? (
        <div className="surface-panel rounded-xl p-6 py-10 text-center text-sm text-muted-foreground">
          {t("table.errorBody")}
        </div>
      ) : status.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div key={tile.key} className="surface-panel min-h-32 rounded-xl p-4 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <p className="min-w-0 text-xs font-medium text-muted-foreground">
                    {t(`monitoring.tile.${tile.key}`)}
                  </p>
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="tabular mt-4 text-lg font-semibold">{tile.value}</p>
                <div className="mt-2">
                  <StatusBadge
                    label={t(`monitoring.health.${tile.status}`)}
                    tone={healthTone(tile.status)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="surface-panel space-y-3 rounded-xl p-4 sm:p-6" aria-labelledby="monitoring-events">
        <h2 id="monitoring-events" className="panel-title">
          {t("monitoring.events.title")}
        </h2>
        <div className="divide-y">
          {events.isError ? (
            <LoadFailed onRetry={() => void events.refetch()} />
          ) : events.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : (events.data?.results.length ?? 0) === 0 ? (
            <EmptyState icon={Activity} title={t("monitoring.events.empty")} />
          ) : (
            events.data?.results.map((event) => (
              <div key={event.id} className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
                <span className="tabular text-xs text-muted-foreground">
                  {df.dateTime(event.occurred_at)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{event.event_type}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {event.message}
                  </p>
                </div>
                <StatusBadge
                  label={t(`monitoring.severity.${event.severity}`)}
                  tone={severityTone(event.severity)}
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function healthTone(status: HealthStatus) {
  if (status === "ok" || status === "configured") return "positive" as const;
  if (status === "degraded") return "warning" as const;
  return "danger" as const;
}

function severityTone(severity: string) {
  if (severity === "CRITICAL" || severity === "ERROR") return "danger" as const;
  if (severity === "WARNING") return "warning" as const;
  return "info" as const;
}
