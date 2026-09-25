"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Camera,
  Cloud,
  Info,
  LocateFixed,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { APP_VERSION } from "@/lib/app-version";

import { useAuth } from "@/components/providers/auth-provider";
import { useOfflineSync } from "@/components/providers/offline-sync-provider";
import { DriverError, DriverLoading } from "@/components/driver/driver-shell";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { useDriverDeviceStatus } from "@/components/driver/use-driver-device-status";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { DriverNotificationSettings } from "@/interfaces/recycler";
import { networkStatus } from "@/lib/network-status";
import {
  getMyDriverProfile,
  updateMyDriverSettings,
} from "@/services/recycler.service";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushConfig,
  getPushSubscriptionStatus,
  isPushSupported,
} from "@/services/push-notification.service";

export function DriverSettings() {
  const t = useTranslations();
  const { user } = useAuth();
  const sync = useOfflineSync();
  const device = useDriverDeviceStatus();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["driver", "profile"],
    queryFn: getMyDriverProfile,
    staleTime: 60_000,
  });
  const update = useMutation({
    mutationFn: updateMyDriverSettings,
    onSuccess: (driver) => {
      queryClient.setQueryData(["driver", "profile"], driver);
    },
  });
  const pushQuery = useQuery({
    queryKey: ["driver", "push-subscription"],
    queryFn: async () => {
      const supported = isPushSupported();
      if (!supported) {
        return { configured: false, enabled: false, permission: "default" };
      }
      const config = await getPushConfig();
      return {
        configured: config.configured,
        enabled: config.configured
          ? await getPushSubscriptionStatus()
          : false,
        permission: Notification.permission,
      };
    },
    retry: false,
    staleTime: 30_000,
  });
  const updatePush = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) return enablePushNotifications();
      await disablePushNotifications();
      return false;
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(["driver", "push-subscription"], {
        configured: pushQuery.data?.configured ?? false,
        enabled,
        permission:
          typeof Notification === "undefined"
            ? "default"
            : Notification.permission,
      });
    },
  });

  if (query.isLoading) return <DriverLoading />;
  if (query.isError || !query.data) {
    return <DriverError onRetry={() => void query.refetch()} />;
  }

  const driver = query.data;
  const preferences: DriverNotificationSettings = {
    notify_new_tasks: driver.notify_new_tasks,
    notify_task_changes: driver.notify_task_changes,
    notify_system: driver.notify_system,
  };
  const setPreference = (
    key: keyof DriverNotificationSettings,
    checked: boolean,
  ) => update.mutate({ ...preferences, [key]: checked });
  const networkKey = networkStatus(sync);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t("driver.settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("driver.settings.subtitle")}
        </p>
      </div>

      <SettingsSection icon={Settings} title={t("driver.settings.language")}>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-medium">{t("users.field.language")}</span>
          <LanguageSwitcher className="border" />
        </div>
      </SettingsSection>

      <SettingsSection icon={LocateFixed} title={t("driver.settings.permissions")}>
        <PermissionRow
          icon={LocateFixed}
          label={t("driver.settings.gps")}
          status={t(`driver.device.permission.${device.gpsStatus}`)}
          granted={device.gpsStatus === "granted"}
          action={() => void device.requestGps()}
          actionLabel={t("driver.device.enable")}
        />
        <PermissionRow
          icon={Camera}
          label={t("driver.settings.camera")}
          status={t(`driver.device.permission.${device.cameraStatus}`)}
          granted={device.cameraStatus === "granted"}
          action={() => void device.testCamera()}
          actionLabel={t("driver.device.test")}
        />
      </SettingsSection>

      <SettingsSection icon={Bell} title={t("driver.settings.notifications")}>
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">
          <Bell className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t(
                pushQuery.data?.enabled
                  ? "notifications.push.enabled"
                  : "notifications.push.enable",
              )}
            </p>
            {pushQuery.data && !pushQuery.data.configured && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("notifications.push.notConfigured")}
              </p>
            )}
            {pushQuery.data?.permission === "denied" && (
              <p className="mt-1 text-xs text-destructive">
                {t("notifications.push.permissionDenied")}
              </p>
            )}
            <QueryFailedNote className="mt-1" query={pushQuery} what={t("driver.what.pushStatus")} />
          </div>
          <Switch
            checked={pushQuery.data?.enabled ?? false}
            disabled={
              !pushQuery.data?.configured ||
              pushQuery.isFetching ||
              updatePush.isPending
            }
            onCheckedChange={(checked) => updatePush.mutate(checked)}
          />
        </div>
        <ToggleRow
          label={t("driver.settings.newTasks")}
          checked={preferences.notify_new_tasks}
          disabled={update.isPending}
          onChange={(checked) => setPreference("notify_new_tasks", checked)}
        />
        <ToggleRow
          label={t("driver.settings.taskChanges")}
          checked={preferences.notify_task_changes}
          disabled={update.isPending}
          onChange={(checked) => setPreference("notify_task_changes", checked)}
        />
        <ToggleRow
          label={t("driver.settings.systemNotifications")}
          checked={preferences.notify_system}
          disabled={update.isPending}
          onChange={(checked) => setPreference("notify_system", checked)}
        />
        <AboutRow
          label={t("users.field.email")}
          value={driver.user_email || t("common.emptyValue")}
        />
      </SettingsSection>

      <SettingsSection icon={Cloud} title={t("driver.settings.network")}>
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">
          <Cloud
            className={`h-5 w-5 shrink-0 ${
              networkKey === "online" ? "text-success" : "text-warning"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t(`driver.device.network.${networkKey}`, {
                count: sync.pendingCount,
              })}
            </p>
            {sync.failedCount > 0 && (
              <p className="mt-1 text-xs text-destructive">
                {t("driver.settings.failedCount", { count: sync.failedCount })}
              </p>
            )}
          </div>
          {sync.isOnline && sync.pendingCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={sync.isSyncing}
              onClick={() => void sync.syncNow()}
            >
              <RefreshCw className={`h-4 w-4 ${sync.isSyncing ? "animate-spin" : ""}`} />
              {t("driver.settings.syncNow")}
            </Button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection icon={Info} title={t("driver.settings.about")}>
        <AboutRow label={t("driver.settings.driverApp")} value="MSE Trace Driver H5" />
        <AboutRow
          label={t("driver.settings.version")}
          value={APP_VERSION}
        />
        <AboutRow
          label={t("users.field.company")}
          value={driver.company_name || user?.company_name || t("common.emptyValue")}
        />
        <AboutRow
          label={t("tasks.field.driver")}
          value={driver.full_name || user?.full_name || t("common.emptyValue")}
        />
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Settings;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function PermissionRow({
  icon: Icon,
  label,
  status,
  granted,
  action,
  actionLabel,
}: {
  icon: typeof Settings;
  label: string;
  status: string;
  granted: boolean;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <Icon className={`h-5 w-5 shrink-0 ${granted ? "text-success" : "text-warning"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{status}</p>
      </div>
      {!granted && (
        <Button size="sm" variant="outline" onClick={action}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}
