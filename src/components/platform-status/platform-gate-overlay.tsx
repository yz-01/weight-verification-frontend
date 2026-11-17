"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ContactMse } from "@/components/platform-status/contact-mse";
import { useMaintenanceWindowText } from "@/components/platform-status/maintenance-banner";
import { Button } from "@/components/ui/button";
import { PLATFORM_STATUS_KEY, usePlatformStatus } from "@/hooks/use-platform-status";
import { APP_VERSION } from "@/lib/app-version";
import {
  getPlatformGate,
  reloadedForUpdateRecently,
  rememberUpdateReload,
  subscribePlatformGate,
  type PlatformGate,
} from "@/lib/platform-gate";
import type { PlatformContact, PlatformMaintenance } from "@/lib/platform-status";

/** How often the 系统维护 screen asks whether maintenance is over. */
export const MAINTENANCE_RECHECK_MS = 60_000;

/**
 * The one full-screen notice for 系统维护 and 强制更新 (JB211, Lucas 11-16
 * 「把它们真的做出来」, 「要站在老人家的角度去思考」).
 *
 * Raised by `api-client` when the server keeps this customer out. It says
 * what is happening, what to do, and who to call - and that nothing is lost:
 * the person stays signed in, and records waiting on a phone stay there.
 *
 * * 系统维护: asks every minute whether it is over, and when it is, loads the
 *   page again by itself - still signed in.
 * * 「系统已更新」: one big 【重新载入】. If the same old build comes back after
 *   reloading (the new one is still being put out), it says to wait a few
 *   minutes instead of sending the person round the same loop.
 */
export function PlatformGateOverlay() {
  const gate = useSyncExternalStore(subscribePlatformGate, getPlatformGate, () => null);
  if (gate === null) return null;
  return <GateScreen gate={gate} />;
}

/**
 * Whether the 系统维护 screen may load the page again by itself: an answer
 * that came after the screen went up says maintenance is no longer on. The
 * answer the page already held may be from before it started, so it never
 * counts.
 */
export function maintenanceIsOver({
  gate,
  maintenance,
  answeredAt,
  answerWhenRaised,
}: {
  gate: PlatformGate;
  maintenance: PlatformMaintenance | null;
  answeredAt: number;
  answerWhenRaised: number;
}): boolean {
  return (
    gate === "maintenance" &&
    answeredAt > answerWhenRaised &&
    maintenance !== null &&
    !maintenance.active
  );
}

function GateScreen({ gate }: { gate: PlatformGate }) {
  const queryClient = useQueryClient();
  // query-failure: without an answer the screen still says 系统维护 and offers 再试一次; only the notice text and contact are missing.
  const status = usePlatformStatus();
  // The answer the page already had when this screen went up: it may predate
  // the maintenance, so only a later one may say it is over.
  const [answerWhenRaised] = useState(status.dataUpdatedAt);

  // Maintenance: ask again every minute; once it is over, carry on.
  useEffect(() => {
    if (gate !== "maintenance") return;
    void queryClient.invalidateQueries({ queryKey: PLATFORM_STATUS_KEY });
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_STATUS_KEY });
    }, MAINTENANCE_RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [gate, queryClient]);

  const maintenance = status.data?.maintenance ?? null;
  const over = maintenanceIsOver({
    gate,
    maintenance,
    answeredAt: status.dataUpdatedAt,
    answerWhenRaised,
  });
  useEffect(() => {
    if (over) window.location.reload();
  }, [over]);

  return (
    <PlatformGateScreen
      gate={gate}
      maintenance={maintenance}
      contact={status.data?.contact ?? null}
      reloadedRecently={gate === "update" && reloadedForUpdateRecently(APP_VERSION)}
      onReload={() => {
        if (gate === "update") rememberUpdateReload(APP_VERSION);
        window.location.reload();
      }}
    />
  );
}

/** The screen itself, without the store - what the tests render. */
export function PlatformGateScreen({
  gate,
  maintenance,
  contact,
  reloadedRecently = false,
  onReload,
}: {
  gate: PlatformGate;
  maintenance: PlatformMaintenance | null;
  contact: PlatformContact | null;
  reloadedRecently?: boolean;
  onReload: () => void;
}) {
  const t = useTranslations("platformStatus.gate");
  const windowText = useMaintenanceWindowText();
  const isMaintenance = gate === "maintenance";
  const Icon = isMaintenance ? Wrench : Sparkles;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="platform-gate-title"
      data-testid="platform-gate"
      data-gate={gate}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm"
    >
      <div className="surface-panel w-full max-w-md space-y-4 rounded-xl p-6">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-warning/15">
          <Icon className="size-6 text-warning" />
        </span>
        <div className="space-y-2 text-center">
          <h1 id="platform-gate-title" className="text-xl font-semibold">
            {isMaintenance ? t("maintenanceTitle") : t("updateTitle")}
          </h1>
          {isMaintenance ? (
            <>
              {maintenance ? (
                <p className="text-base font-medium">{windowText(maintenance)}</p>
              ) : null}
              {maintenance?.notice ? (
                <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{maintenance.notice}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">{t("maintenanceBody")}</p>
            </>
          ) : (
            <>
              <p className="text-base">{t("updateBody")}</p>
              {reloadedRecently ? (
                <p data-testid="update-still-old" className="text-sm text-muted-foreground">
                  {t("updateStillOld")}
                </p>
              ) : null}
            </>
          )}
          <p className="text-sm text-muted-foreground">{t("nothingLost")}</p>
        </div>
        <Button size="lg" className="h-12 w-full text-base" onClick={onReload}>
          <RefreshCw className="size-5" />
          {isMaintenance ? t("tryAgain") : t("reload")}
        </Button>
        <ContactMse contact={contact} className="border-t pt-3" />
      </div>
    </div>
  );
}
