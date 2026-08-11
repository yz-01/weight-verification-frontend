"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Loader2,
  LocateFixed,
  LogIn,
  Recycle,
  ScanLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { useAuth } from "@/components/providers/auth-provider";
import { StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import type { Portal } from "@/interfaces/auth";
import type { QRScanPayload } from "@/interfaces/qrcode";
import { PORTAL_LABELS, portalPaths, withReturnPath } from "@/lib/portal";
import { scanQRCode } from "@/services/qrcode.service";

const PORTALS: Array<{ portal: Portal; icon: typeof ShieldCheck }> = [
  { portal: "MSE_ADMIN", icon: ShieldCheck },
  { portal: "MSE_TRACE", icon: Building2 },
  { portal: "MSE_SCRAP", icon: Recycle },
];

interface Coordinates {
  latitude: string;
  longitude: string;
  accuracy: number;
}

export function QRMobileScan() {
  const t = useTranslations("qrScan");
  const qr = useTranslations("adminQr");
  const { user, isLoading } = useAuth();
  const returnPath = useSyncExternalStore(
    subscribeToLocation,
    getLocationSnapshot,
    getServerLocationSnapshot,
  );
  const hashStart = returnPath.indexOf("#");
  const queryStart = returnPath.indexOf("?");
  const hash = new URLSearchParams(
    hashStart >= 0 ? returnPath.slice(hashStart + 1) : "",
  );
  const query = new URLSearchParams(
    queryStart >= 0
      ? returnPath.slice(queryStart + 1, hashStart >= 0 ? hashStart : undefined)
      : "",
  );
  const token = hash.get("token") ?? query.get("token") ?? "";
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const scan = useMutation({
    mutationFn: () => {
      const payload: QRScanPayload = {
        token,
        device_id: "mobile-web",
        location_label: t("mobileLocation"),
      };
      if (coordinates) {
        payload.latitude = coordinates.latitude;
        payload.longitude = coordinates.longitude;
      }
      return scanQRCode(payload);
    },
  });

  function locate() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(t("locationUnavailable"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          accuracy: Math.round(position.coords.accuracy),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(t("locationError"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  const result = scan.data;
  const error = scan.error;

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      {isLoading ? (
        <div className="grid min-h-40 place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !token ? (
        <ResultState
          accepted={false}
          title={t("invalidLink")}
          description={t("invalidLinkDescription")}
        />
      ) : !user ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/25 p-4">
            <LogIn className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">{t("loginRequired")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("loginDescription")}
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            {PORTALS.map(({ portal, icon: Icon }) => (
              <Button key={portal} variant="outline" className="justify-start" asChild>
                <Link href={withReturnPath(portalPaths(portal).login, returnPath)}>
                  <Icon />
                  {PORTAL_LABELS[portal]}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <ResultState
            accepted={result.accepted}
            title={result.accepted ? t("accepted") : t("refused")}
            description={qr(`outcome.${result.outcome}`)}
          />
          {result.code && (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
              <ResultField label={qr("field.qrId")} value={result.code.serial} />
              <ResultField label={qr("field.subject")} value={result.code.subject_label} />
              <ResultField label={qr("field.company")} value={result.code.company_name ?? "-"} />
              <ResultField
                label={qr("field.projectSite")}
                value={result.code.project_name ?? result.code.site_name ?? "-"}
              />
            </div>
          )}
          <Button className="w-full" variant="outline" onClick={() => scan.reset()}>
            <ScanLine />
            {t("scanAgain")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">{t("signedInAs")}</p>
            <p className="mt-1 text-sm font-semibold">{user.full_name || user.email}</p>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{t("locationTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("locationDescription")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={locating}
                onClick={locate}
              >
                {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                {t("getLocation")}
              </Button>
            </div>
            {coordinates && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge label={t("locationReady")} tone="positive" />
                <span>{t("accuracy", { metres: coordinates.accuracy })}</span>
              </div>
            )}
            {locationError && (
              <p className="text-xs leading-5 text-destructive">{locationError}</p>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {error instanceof ApiError ? error.message : t("scanError")}
            </p>
          )}

          <Button
            className="w-full"
            disabled={scan.isPending}
            onClick={() => scan.mutate()}
          >
            {scan.isPending ? <Loader2 className="animate-spin" /> : <ScanLine />}
            {t("confirmScan")}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}

function subscribeToLocation(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

function getLocationSnapshot() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getServerLocationSnapshot() {
  return "/scan/qr";
}

function ResultState({
  accepted,
  title,
  description,
}: {
  accepted: boolean;
  title: string;
  description: string;
}) {
  const Icon = accepted ? CheckCircle2 : XCircle;
  return (
    <div
      className={`rounded-lg border p-5 text-center ${
        accepted
          ? "border-success/25 bg-success/5"
          : "border-destructive/25 bg-destructive/5"
      }`}
    >
      <Icon
        className={`mx-auto size-9 ${accepted ? "text-success" : "text-destructive"}`}
      />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ResultField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}
