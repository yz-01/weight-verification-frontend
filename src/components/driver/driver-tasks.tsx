"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MapPin, PackageOpen, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  DriverError,
  DriverLoading,
} from "@/components/driver/driver-shell";
import { TASK_STATE_TONE } from "@/components/tasks/tasks";
import { StatusBadge } from "@/components/shared/page-primitives";
import type { DriverTask } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { getDriverTasksOfflineAware } from "@/services/driver-offline.service";
import { useOrderRealtime } from "@/hooks/use-order-realtime";

/**
 * The driver's day.
 *
 * Running trips first and finished ones after, because the question a driver
 * opens this to answer is always "what am I doing now". Cards rather than a
 * table: a table on a phone is a horizontal scroll nobody performs, and each
 * of these needs to be tappable across its whole width.
 *
 * The list is already narrowed to this driver by the API — a driver without
 * `task.view_all` sees only trips rostered to them — so there is no filtering
 * here to get wrong.
 */
export function DriverTasks() {
  const t = useTranslations();
  const { user } = useAuth();
  const realtimeKeys = useMemo(
    () => [["tasks", "mine"], ["tasks"], ["driver", "dashboard"]],
    [],
  );
  useOrderRealtime(realtimeKeys);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tasks", "mine"],
    queryFn: () => getDriverTasksOfflineAware(user!.id),
    enabled: Boolean(user),
    // A driver leaves this open in the cab; a dispatcher may add a job while
    // they are driving. Polling is cheaper than teaching them to pull down.
    refetchInterval: 30_000,
  });

  if (isLoading) return <DriverLoading />;
  if (isError) return <DriverError onRetry={() => void refetch()} />;

  const rows = data?.results ?? [];
  const running = rows.filter((task) => task.is_running);
  const done = rows.filter((task) => !task.is_running);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold text-foreground">
          {t("driver.today")}
        </h1>

        {running.length === 0 ? (
          <div className="rounded-xl border bg-card px-6 py-12 text-center shadow-sm">
            <Truck className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t("driver.nothingAssigned")}
            </p>
          </div>
        ) : (
          running.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("driver.finished")}
          </h2>
          {done.map((task) => (
            <TaskCard key={task.id} task={task} muted />
          ))}
        </section>
      )}
    </div>
  );
}

function TaskCard({ task, muted }: { task: DriverTask; muted?: boolean }) {
  const t = useTranslations();
  const df = useDateFormat();

  return (
    <Link
      href={`/driver/${task.id}`}
      className={
        muted
          ? "flex items-center gap-3 rounded-xl border bg-card px-4 py-4 opacity-70 shadow-sm transition-colors active:bg-muted"
          : "flex items-center gap-3 rounded-xl border bg-card px-4 py-4 shadow-sm transition-colors active:bg-muted"
      }
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={t(`tasks.state.${task.state}`)}
            tone={TASK_STATE_TONE[task.state]}
          />
          {task.scheduled_for && (
            <span className="tabular text-xs text-muted-foreground">
              {df.dateTime(task.scheduled_for)}
            </span>
          )}
        </div>

        <p className="truncate text-base font-semibold text-foreground">
          {task.dispatch_no ?? task.task_no}
        </p>

        <div className="space-y-1 text-sm text-muted-foreground">
          {task.waste_type && (
            <p className="flex items-center gap-1.5">
              <PackageOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {t(`dispatches.wasteType.${task.waste_type}`)}
              </span>
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{task.site_name}</span>
          </p>
          <p className="tabular flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{task.vehicle_plate}</span>
          </p>
        </div>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
