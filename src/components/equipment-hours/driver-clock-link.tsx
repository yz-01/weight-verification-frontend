"use client";

/**
 * The page a driver opens from the office's WhatsApp (J26, item 125, Q26).
 *
 * No account. The first time, the driver types their phone number - only the
 * number the office registered binds the link to this phone (26-1). Then it
 * is only 开工 / 收工: scan the machine's QR code (or type its 设备号码), a
 * photo of the machine or of themselves, the signature, the location, send.
 * The driver's name, CIDB and company come from the link (27-3).
 *
 * Offline: a clock-in waits on the phone with the moment and the location of
 * its photo, and goes when the signal is back (26-2's interim rule); the
 * server judges the fence where the photo was taken. The page sends what is
 * waiting when it opens and whenever the phone comes back online.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2Off, Loader2, RefreshCw, Smartphone, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { EquipmentHoursCapture, driverQueueOwner } from "@/components/equipment-hours/equipment-hours-capture";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import { workerLinkToken } from "@/lib/site-workers";
import { bindDriverPhone, getDriverLink, type DriverLinkState } from "@/services/driver-clock.service";
import { getOrCreateFieldDeviceId } from "@/services/field-access.service";
import { flushOfflineJobs } from "@/services/offline-sync.service";

type Ending = "invalid" | "closed" | "otherDevice";

/** What a refusal of the link means for the page. */
export function driverLinkEnding(code: string): Ending | null {
  if (code === "driver_link_invalid") return "invalid";
  if (code === "driver_link_closed") return "closed";
  if (code === "driver_link_other_device") return "otherDevice";
  return null;
}

export function DriverClockLink({ token: rawToken }: { token: string }) {
  const t = useTranslations("driverClock");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const token = workerLinkToken(rawToken);
  const device = useMemo(() => (typeof window === "undefined" ? "" : getOrCreateFieldDeviceId()), []);
  const key = useMemo(() => ["driver-clock-link", token] as const, [token]);
  const link = useQuery({
    queryKey: key,
    queryFn: () => getDriverLink(token, device),
    enabled: Boolean(token && device),
    retry: (count, error) => count < 2 && !(error instanceof ApiError && driverLinkEnding(error.code)),
  });
  const bound = Boolean(link.data?.bound);

  // What waited on this phone goes now, and whenever the signal is back.
  useEffect(() => {
    if (!bound || !token) return;
    const owner = driverQueueOwner(token);
    const flush = () => {
      void flushOfflineJobs(owner).catch(() => undefined);
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [bound, token]);

  if (!token) return <Ended outcome="invalid" />;
  const ending = link.error instanceof ApiError ? driverLinkEnding(link.error.code) : null;
  if (ending) return <Ended outcome={ending} />;
  if (!link.data) {
    return (
      <Centered>
        {link.error ? (
          <>
            <RefreshCw className="size-10 text-muted-foreground" />
            <h1 className="text-center text-xl font-bold leading-tight">{t("failedTitle")}</h1>
            <Button size="lg" onClick={() => void link.refetch()}>
              <RefreshCw />
              {common("retry")}
            </Button>
          </>
        ) : (
          <Loader2 className="size-8 animate-spin text-primary" />
        )}
      </Centered>
    );
  }

  const state = link.data;
  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-background">
      <header className="sticky top-0 z-20 border-b border-sidebar-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-lg items-center gap-2 px-4 py-2">
          <Truck className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{t("title")}</p>
            <p className="truncate text-base font-semibold text-foreground">{state.project_name}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-6">
        {!state.bound ? (
          <PhoneStep token={token} device={device} onBound={(next) => queryClient.setQueryData(key, next)} />
        ) : (
          <>
            {/* Who is clocking in (27-3): from the link, never typed. */}
            <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm" data-testid="driver-line">
              {t("driverLine", {
                name: state.driver_name,
                cidb: state.cidb_no || "-",
                company: state.company_name || "-",
              })}
            </p>
            <p className="text-xs text-muted-foreground">{t("photoHint")}</p>
            <EquipmentHoursCapture driver={{ token, device }} />
          </>
        )}
      </main>
    </div>
  );
}

function PhoneStep({
  token,
  device,
  onBound,
}: {
  token: string;
  device: string;
  onBound: (state: DriverLinkState) => void;
}) {
  const t = useTranslations("driverClock");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const bind = useMutation({
    mutationFn: () => bindDriverPhone(token, device, phone),
    onSuccess: onBound,
    onError: (failure) =>
      setError(
        failure instanceof ApiError && failure.code === "driver_link_phone_mismatch"
          ? t("phoneMismatch")
          : t("failedTitle"),
      ),
  });
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold leading-tight">{t("phoneTitle")}</h1>
      <FieldWrapper label={t("phoneLabel")} required="quiet" hint={t("phoneBody")} error={error}>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="h-12 text-lg"
          value={phone}
          onChange={(event) => {
            setError("");
            setPhone(event.target.value);
          }}
        />
      </FieldWrapper>
      <Button
        size="lg"
        className="w-full"
        onClick={() => bind.mutate()}
        disabled={bind.isPending}
        requires={[[phone.trim(), t("phoneLabel")]]}
      >
        {bind.isPending && <Loader2 className="animate-spin" />}
        {t("phoneConfirm")}
      </Button>
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 py-10">
      {children}
    </div>
  );
}

function Ended({ outcome }: { outcome: Ending }) {
  const t = useTranslations("driverClock");
  return (
    <Centered>
      {outcome === "otherDevice" ? (
        <Smartphone className="size-12 text-warning" />
      ) : (
        <Link2Off className="size-12 text-muted-foreground" />
      )}
      <h1 className="text-center text-xl font-bold leading-tight">{t(`ended.${outcome}.title`)}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">{t(`ended.${outcome}.body`)}</p>
    </Centered>
  );
}
