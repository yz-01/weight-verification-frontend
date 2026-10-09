"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy, Link2Off, Loader2, LogIn, RefreshCw, Smartphone, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DriverTask, type DriverTaskSource } from "@/components/driver/driver-task";
import { OfflineStatus } from "@/components/shared/offline-status";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import { driverLinkOutcome, driverLinkToken } from "@/lib/driver-link";
import { inAppBrowserName } from "@/lib/in-app-browser";
import {
  addLinkedTaskPhoto,
  advanceLinkedTask,
  getLinkedTask,
  recordLinkedTaskPosition,
} from "@/services/driver-task-link.service";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";

/**
 * A driver's whole access: one trip, from the link the office sent.
 *
 * 「只是用链接而已，不是账号了」 - no login, no PIN. The page is the driver's
 * usual trip screen (steps, photographs, GPS, directions) fed from the link
 * instead of an account. The order number heads it, because the link belongs
 * to that order (「链接会绑定那个订单编号」) and it is what the driver quotes
 * at the gate.
 *
 * The first phone to open it keeps it, by the same device id the field-staff
 * link uses. When the trip ends - weighed, cancelled - or the link idles out,
 * the page says so plainly instead of offering a sign-in the driver cannot use.
 */
export function DriverTaskLink({ token: rawToken }: { token: string }) {
  const t = useTranslations("driverTaskLink");
  const common = useTranslations("common");
  const token = driverLinkToken(rawToken);
  const chatApp = typeof window === "undefined" ? null : inAppBrowserName();
  // A chat app's own browser keeps its own storage, so the link would stay
  // with that view and the same phone in Chrome or Safari would count as
  // another phone. Said before anything is opened, not after.
  const [confirmed, setConfirmed] = useState(!chatApp);
  const [copied, setCopied] = useState(false);
  const device = useMemo(
    () => (typeof window === "undefined" ? "" : getOrCreateFieldDeviceId()),
    [],
  );

  const source = useMemo<DriverTaskSource>(
    () => ({
      queryKey: ["driver-task-link", token],
      invalidateKey: ["driver-task-link", token],
      enabled: Boolean(token && device && confirmed),
      load: () => getLinkedTask(token, device),
      advance: (input) => advanceLinkedTask(token, device, input),
      addPhoto: (file, kind, position) =>
        addLinkedTaskPhoto(token, device, file, kind, position),
      recordPosition: (sample) => recordLinkedTaskPosition(token, device, sample),
    }),
    [confirmed, device, token],
  );

  // The same query the trip screen reads, so a link that closes while the
  // page is open (the load was just weighed) turns into the closed screen on
  // the next refresh rather than an error card.
  const trip = useQuery({
    queryKey: source.queryKey,
    queryFn: source.load,
    enabled: source.enabled,
    refetchInterval: 15_000,
    retry: (count, error) =>
      count < 2 &&
      driverLinkOutcome(error instanceof ApiError ? error.code : "") === "failed",
  });

  if (!token) return <Ended outcome="invalid" />;

  if (!confirmed) {
    return (
      <Centered>
        <Smartphone className="size-12 text-warning" />
        <h1 className="text-center text-xl font-bold leading-tight">{t("chatTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {t("chatBody", { app: chatApp ?? "" })}
        </p>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy />
            {copied ? common("copied") : t("copyLink")}
          </Button>
          <Button size="lg" onClick={() => setConfirmed(true)}>
            <LogIn />
            {t("continueHere")}
          </Button>
        </div>
      </Centered>
    );
  }

  const outcome = trip.error
    ? driverLinkOutcome(trip.error instanceof ApiError ? trip.error.code : "")
    : null;
  if (outcome && outcome !== "failed") return <Ended outcome={outcome} />;
  if (!trip.data && outcome === "failed") {
    return (
      <Centered>
        <RefreshCw className="size-10 text-muted-foreground" />
        <h1 className="text-center text-xl font-bold leading-tight">{t("failedTitle")}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("failedBody")}</p>
        <Button size="lg" onClick={() => void trip.refetch()}>
          <RefreshCw />
          {common("retry")}
        </Button>
      </Centered>
    );
  }
  if (!trip.data) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
      </Centered>
    );
  }

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-background">
      <header className="sticky top-0 z-20 border-b border-sidebar-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-lg items-center gap-2 px-4 py-2.5">
          <Truck className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("order")}</p>
            <p className="tabular truncate text-base font-semibold text-foreground">
              {trip.data.dispatch_no ?? trip.data.task_no}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <OfflineStatus />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-24">
        <DriverTask id={trip.data.id} source={source} backHref={null} />
      </main>
    </div>
  );
}

function Ended({ outcome }: { outcome: "closed" | "expired" | "otherDevice" | "invalid" }) {
  const t = useTranslations("driverTaskLink");
  const Icon = outcome === "otherDevice" ? Smartphone : Link2Off;
  return (
    <Centered>
      <Icon className="size-12 text-muted-foreground" />
      <h1 className="text-center text-xl font-bold leading-tight">{t(`${outcome}Title`)}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">{t(`${outcome}Body`)}</p>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10">
      {children}
    </main>
  );
}
