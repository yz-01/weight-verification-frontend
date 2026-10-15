"use client";

/**
 * Where a machine's printed QR code lands when it is scanned with the phone's
 * own camera (2026-10 I24, ID16, ID59): `/scan/equipment?equipment=<id>`.
 *
 * Signed in, it opens 设备进退场 on the field app with that machine chosen -
 * 退场 for a machine on site, 进场 for one that is not - or, in the back
 * office, the machine on 设备清单. Not signed in, it sends the worker to sign
 * in first and comes back here, then on. A machine of another project is
 * named as such rather than opened on the wrong site.
 */

import { useQuery } from "@tanstack/react-query";
import { Building2, HardHat, Loader2, LogIn, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/interfaces/api";
import type { SiteEquipment } from "@/interfaces/contractor-ops";
import type { CurrentUser } from "@/interfaces/auth";
import { getFieldBootstrapToken } from "@/lib/auth-token";
import { EQUIPMENT_SCAN_PATH } from "@/lib/machine-scan";
import { redirectWithFallback, withReturnPath } from "@/lib/portal";
import { lookupEquipmentByScan } from "@/services/contractor-ops.service";

/** Where a signed-in reader goes for this machine, or why not. */
export function equipmentScanTarget(
  machine: Pick<SiteEquipment, "id" | "project" | "status">,
  user: Pick<CurrentUser, "is_field_staff" | "active_project">,
): { href: string } | { otherProject: true } {
  if (user.is_field_staff) {
    const bound = user.active_project?.project_id;
    if (bound && bound !== machine.project) return { otherProject: true };
    const direction = machine.status === "ON_SITE" ? "EXIT" : "ENTRY";
    const query = new URLSearchParams({ record: "equipment", direction, machine: machine.id });
    return { href: `/field-staff?${query.toString()}` };
  }
  const query = new URLSearchParams({ view: "register", machine: machine.id, project: machine.project });
  return { href: `/site-equipment?${query.toString()}` };
}

export function EquipmentScanLanding() {
  const t = useTranslations("contractorOps.equipmentScan");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const machineId = searchParams.get("equipment") ?? "";
  const returnPath = `${EQUIPMENT_SCAN_PATH}?equipment=${encodeURIComponent(machineId)}`;
  const machine = useQuery({
    queryKey: ["equipment-scan", machineId, user?.id ?? ""],
    queryFn: () => lookupEquipmentByScan(machineId, ""),
    enabled: Boolean(user && machineId),
    retry: false,
  });
  const target = machine.data && user ? equipmentScanTarget(machine.data, user) : null;
  const href = target && "href" in target ? target.href : null;
  const signIn = !isLoading && !user && Boolean(machineId);
  useEffect(() => {
    if (href) redirectWithFallback(router, href, 1_200);
  }, [href, router]);
  // The worker's own phone app keeps its sign-in: straight to it, and back
  // here. Anybody else chooses below.
  useEffect(() => {
    if (signIn && getFieldBootstrapToken()) {
      redirectWithFallback(router, withReturnPath("/trace/field-login", returnPath), 1_200);
    }
  }, [returnPath, router, signIn]);

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      {!machineId ? (
        <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t("invalidLink")}
        </p>
      ) : isLoading || (user && machine.isLoading) || href ? (
        <div className="grid min-h-40 place-items-center gap-3 text-center">
          <Loader2 className="size-7 animate-spin text-primary" />
          {href ? (
            <Button asChild variant="outline">
              <Link href={href}>
                <HardHat />
                {t("open")}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : !user ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
            <LogIn className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">{t("loginRequired")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("loginHelp")}</p>
            </div>
          </div>
          <div className="grid gap-2">
            <Button asChild className="justify-start">
              <Link href={withReturnPath("/trace/field-login", returnPath)}>
                <Smartphone />
                {t("fieldLogin")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={withReturnPath("/trace/login", returnPath)}>
                <Building2 />
                {t("officeLogin")}
              </Link>
            </Button>
          </div>
        </div>
      ) : target && "otherProject" in target ? (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {t("otherProject", { name: machine.data?.name ?? "", project: machine.data?.project_name ?? "" })}
        </p>
      ) : (
        <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {machine.error instanceof ApiError && !machine.error.isNetwork
            ? t("notFound")
            : t("loadFailed")}
        </p>
      )}
    </AuthCard>
  );
}
