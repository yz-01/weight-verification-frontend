"use client";

/**
 * 外部设备接入 / Device Integration (JB69, client 10-29: 「把它写进菜单里 ——
 * 外部设备接入（Device Integration）」).
 *
 * One card per kind of device the platform can take in - 地磅, CCTV, 车牌识别,
 * 门禁, 无人机, 塔吊… - each saying plainly where the company is: 已接入 (its
 * devices and when each was last seen), 可以接入, or 等启用 (the drone, until
 * the company names a brand and platform). Read only: registering a device
 * or changing a setting stays on 系统集成, one click away - not a second copy.
 */

import { useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import type { DeviceKindState, DeviceOverviewKind } from "@/interfaces/integration";
import { useDateFormat } from "@/lib/dates";
import type { StatusTone } from "@/lib/tones";
import { getDeviceOverview } from "@/services/integration.service";

const STATE_TONE: Record<DeviceKindState, StatusTone> = {
  CONNECTED: "positive",
  AVAILABLE: "info",
  WAITING: "neutral",
};

/** The words under a kind with no device yet. */
export function kindNoteKey(row: DeviceOverviewKind): "droneWaiting" | "available" | null {
  if (row.devices.length) return null;
  return row.state === "WAITING" ? "droneWaiting" : "available";
}

export function DeviceIntegration() {
  const t = useTranslations("integrations.deviceOverview");
  const kinds = useTranslations("integrations.kind");
  const df = useDateFormat();
  const overview = useQuery({
    queryKey: ["device-overview"],
    queryFn: () => getDeviceOverview(),
  });
  const kindLabel = (kind: string) =>
    kind === "WEIGHBRIDGE" || kind === "OTHER"
      ? t(`kind.${kind}`)
      : kinds.has(kind as never)
        ? kinds(kind as never)
        : kind;

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button asChild variant="outline">
            <Link href="/integrations" data-testid="device-integration-settings">
              <Settings2 />
              {t("openSettings")}
            </Link>
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        {t("settingsHint")} {t("mediaNote")}
      </p>
      <QueryFailedNote query={overview} what={t("title")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="device-kinds">
        {(overview.data ?? []).map((row) => {
          const note = kindNoteKey(row);
          return (
            <section
              key={row.kind}
              data-kind={row.kind}
              className="surface-panel space-y-2 rounded-xl p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{kindLabel(row.kind)}</h2>
                <StatusBadge label={t(`state.${row.state}`)} tone={STATE_TONE[row.state]} />
              </div>
              {note ? (
                <p className="text-sm text-muted-foreground">{t(note)}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {row.devices.map((device) => (
                    <li key={device.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="min-w-0 truncate font-medium" title={device.device_id}>
                        {device.device_id}
                        {device.where ? (
                          <span className="font-normal text-muted-foreground"> · {device.where}</span>
                        ) : null}
                      </span>
                      <span className="tabular text-xs text-muted-foreground">
                        {device.last_seen_at
                          ? t("lastSeen", { value: df.dateTime(device.last_seen_at) })
                          : t("neverSeen")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
