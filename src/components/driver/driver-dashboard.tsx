"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  Camera,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Cloud,
  LocateFixed,
  MapPin,
  Navigation,
  PackageOpen,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { MySubmissions } from "@/components/field-staff/my-submissions";
import Link from "next/link";

import { useOfflineSync } from "@/components/providers/offline-sync-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { DriverError, DriverLoading } from "@/components/driver/driver-shell";
import { useDriverDeviceStatus } from "@/components/driver/use-driver-device-status";
import { StatusBadge } from "@/components/shared/page-primitives";
import { TASK_STATE_TONE } from "@/components/tasks/tasks";
import { Button } from "@/components/ui/button";
import type { DriverTaskDetail } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { getDriverDashboardOfflineAware } from "@/services/driver-offline.service";
import { networkStatus } from "@/lib/network-status";

export function DriverDashboard() {
  const t = useTranslations();
  const df = useDateFormat();
  const sync = useOfflineSync();
  const { user } = useAuth();
  const { gpsStatus, requestGps } = useDriverDeviceStatus();
  const query = useQuery({
    queryKey: ["driver", "dashboard"],
    queryFn: () => getDriverDashboardOfflineAware(user!.id),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  if (query.isLoading) return <DriverLoading />;
  if (query.isError || !query.data) {
    return <DriverError onRetry={() => void query.refetch()} />;
  }

  const { counts, current_task: current, latest_notifications: notifications } =
    query.data;
  const networkKey = networkStatus(sync);
  const workKey = !sync.isOnline
    ? "offline"
    : current && current.state !== "ASSIGNED"
      ? "working"
      : "online";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {t("driver.dashboard.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {df.date(query.data.date)}
        </p>
      </div>

      <section aria-labelledby="driver-today-counts">
        <h2 id="driver-today-counts" className="mb-3 text-sm font-semibold">
          {t("driver.dashboard.today")}
        </h2>
        <div className="grid grid-cols-3 divide-x rounded-lg border bg-card">
          <Count label={t("driver.dashboard.pending")} value={counts.pending} />
          <Count label={t("driver.dashboard.inProgress")} value={counts.in_progress} />
          <Count label={t("driver.dashboard.completed")} value={counts.completed} />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="driver-current-task">
        <div className="flex items-center justify-between gap-3">
          <h2 id="driver-current-task" className="text-sm font-semibold">
            {t("driver.dashboard.currentTask")}
          </h2>
          <Link href="/driver/jobs" className="text-sm font-medium text-primary">
            {t("driver.dashboard.allJobs")}
          </Link>
        </div>
        {current ? (
          <CurrentTask task={current} />
        ) : (
          <div className="rounded-lg border border-dashed px-5 py-10 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t("driver.nothingAssigned")}
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="driver-quick-actions">
        <h2 id="driver-quick-actions" className="text-sm font-semibold">
          {t("driver.dashboard.quickActions")}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <QuickAction href="/driver/jobs" icon={ClipboardList} label={t("driver.nav.jobs")} />
          <QuickAction
            href={current ? navigationHref(current) : "/driver/jobs"}
            external={Boolean(current && hasNavigationCoordinates(current))}
            icon={Navigation}
            label={t("driver.dashboard.navigation")}
          />
          <QuickAction
            href={current ? `/driver/${current.id}` : "/driver/jobs"}
            icon={CircleDot}
            label={t("driver.dashboard.jobStatus")}
          />
          <QuickAction
            href={current ? `/driver/${current.id}` : "/driver/jobs"}
            icon={Camera}
            label={t("driver.dashboard.photo")}
          />
          <QuickAction href="/driver/profile" icon={UserRound} label={t("driver.nav.profile")} />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="driver-device-status">
        <h2 id="driver-device-status" className="text-sm font-semibold">
          {t("driver.dashboard.status")}
        </h2>
        <div className="divide-y rounded-lg border bg-card">
          <StatusRow
            icon={CircleDot}
            label={t("driver.dashboard.workStatus")}
            value={t(`driver.device.work.${workKey}`)}
            positive={workKey !== "offline"}
          />
          <StatusRow
            icon={Cloud}
            label={t("driver.dashboard.network")}
            value={t(`driver.device.network.${networkKey}`, {
              count: sync.pendingCount,
            })}
            positive={networkKey === "online"}
          />
          <StatusRow
            icon={LocateFixed}
            label={t("driver.dashboard.gps")}
            value={t(`driver.device.permission.${gpsStatus}`)}
            positive={gpsStatus === "granted"}
            action={
              gpsStatus !== "granted" ? (
                <Button size="sm" variant="outline" onClick={() => void requestGps()}>
                  {t("driver.device.enable")}
                </Button>
              ) : undefined
            }
          />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="driver-latest-notices">
        <div className="flex items-center justify-between gap-3">
          <h2 id="driver-latest-notices" className="text-sm font-semibold">
            {t("driver.dashboard.notifications")}
          </h2>
          <Link
            href="/driver/notifications"
            className="text-sm font-medium text-primary"
          >
            {t("notifications.viewAll")}
          </Link>
        </div>
        {notifications.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">
            {t("notifications.noUnread")}
          </p>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {notifications.map((notification) => {
              const taskId =
                typeof notification.data.task_id === "string"
                  ? notification.data.task_id
                  : null;
              return (
                <Link
                  key={notification.id}
                  href={taskId ? `/driver/${taskId}` : "/driver/notifications"}
                  className="flex min-w-0 items-start gap-3 px-4 py-3 active:bg-muted"
                >
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {notification.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                      {notification.message}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 「现场工作人员**和司机**手机端上传资料的时候，手机上没有」 - the
          customer named both apps, so both get the same panel and it is the
          same component. A driver's evidence is the weighbridge ticket and the
          delivery photograph, and the consequence of an invisible upload is
          the same: they photograph it again, or stop sending (F-228). */}
      <MySubmissions />
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 px-2 py-4 text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CurrentTask({ task }: { task: DriverTaskDetail }) {
  const t = useTranslations();
  const projectAddress = [
    task.project_address_line_1,
    task.project_address_line_2,
    task.project_city,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Link
      href={`/driver/${task.id}`}
      className="block rounded-lg border bg-card p-4 shadow-sm active:bg-muted"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-base font-semibold">
          {task.dispatch_no ?? task.task_no}
        </p>
        <StatusBadge
          label={t(`tasks.state.${task.state}`)}
          tone={TASK_STATE_TONE[task.state]}
        />
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <TaskRow icon={Building2} value={task.contractor_name ?? "-"} />
        <TaskRow icon={Truck} value={task.vehicle_plate} />
        <TaskRow icon={UserRound} value={task.driver_name} />
        <TaskRow icon={MapPin} value={(task.project_name ?? projectAddress) || "-"} />
        <TaskRow
          icon={PackageOpen}
          value={
            task.waste_type
              ? t(`dispatches.wasteType.${task.waste_type}`)
              : "-"
          }
        />
        <TaskRow icon={Navigation} value={projectAddress || task.project_name || "-"} />
        <TaskRow icon={ClipboardList} value={task.site_name} />
      </dl>
      <span className="mt-4 flex items-center justify-end gap-1 text-sm font-medium text-primary">
        {t("driver.dashboard.openTask")}
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function TaskRow({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function QuickAction({
  href,
  external,
  icon: Icon,
  label,
}: {
  href: string;
  external?: boolean;
  icon: LucideIcon;
  label: string;
}) {
  const className =
    "flex min-h-16 items-center gap-3 rounded-lg border bg-card px-4 text-left text-sm font-medium active:bg-muted";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <span>{label}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span>{label}</span>
    </Link>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  positive,
  action,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  positive: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <Icon className={`h-4 w-4 shrink-0 ${positive ? "text-success" : "text-warning"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
      {action}
    </div>
  );
}

function navigationHref(task: DriverTaskDetail): string {
  const returning = task.state === "RETURNING" || task.state === "DELIVERED";
  const latitude = returning ? task.site_latitude : task.project_latitude;
  const longitude = returning ? task.site_longitude : task.project_longitude;
  if (!latitude || !longitude) return `/driver/${task.id}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function hasNavigationCoordinates(task: DriverTaskDetail): boolean {
  const returning = task.state === "RETURNING" || task.state === "DELIVERED";
  return returning
    ? Boolean(task.site_latitude && task.site_longitude)
    : Boolean(task.project_latitude && task.project_longitude);
}
