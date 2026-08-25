"use client";

import { Building2, Recycle, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import type { Portal } from "@/interfaces/auth";
import { PORTAL_LABELS, portalPaths } from "@/lib/portal";

const PORTALS: Array<{ portal: Portal; icon: typeof ShieldCheck }> = [
  { portal: "MSE_ADMIN", icon: ShieldCheck },
  { portal: "MSE_TRACE", icon: Building2 },
  { portal: "MSE_SCRAP", icon: Recycle },
];

/** Compatibility entry point for old `/login` links. */
export function PortalEntry() {
  const t = useTranslations();

  return (
    <AuthCard title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      <nav className="grid gap-2" aria-label={t("auth.portalNavigation")}>
        {PORTALS.map(({ portal, icon: Icon }) => (
          <Link
            key={portal}
            href={portalPaths(portal).login}
            className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {PORTAL_LABELS[portal]}
          </Link>
        ))}
      </nav>
    </AuthCard>
  );
}
