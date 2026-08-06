"use client";

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  CircleDollarSign,
  FileSearch,
  History,
  ListChecks,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { PortalFeatureKey } from "@/lib/navigation";
import { PORTAL_NAVIGATION } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const TILE_ICONS: Array<{ pattern: RegExp; icon: LucideIcon }> = [
  { pattern: /search|directory|details|records|register/, icon: FileSearch },
  { pattern: /settings|rules|parameters|catalog|types|categories/, icon: Settings2 },
  { pattern: /statistics|performance|analysis|trends/, icon: BarChart3 },
  { pattern: /billing|commission|invoice|cost|pricing|payout|settlement/, icon: CircleDollarSign },
  { pattern: /audit|activity|history|login/, icon: History },
  { pattern: /status|monitoring|live|runtime|service/, icon: Activity },
  { pattern: /review|approval|proof|anomal|exception/, icon: ShieldCheck },
  { pattern: /report|export/, icon: BookOpenCheck },
  { pattern: /manage|management|create|people|assignment/, icon: ListChecks },
];

const TILE_TONES = [
  "bg-primary/10 text-primary",
  "bg-info/10 text-info",
  "bg-success/10 text-success",
  "bg-warning/15 text-warning",
  "bg-destructive/10 text-destructive",
];

function tileIcon(href: string): LucideIcon {
  return TILE_ICONS.find(({ pattern }) => pattern.test(href))?.icon ?? SlidersHorizontal;
}

export function AdminModuleLanding({ feature }: { feature: PortalFeatureKey }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const navModule = PORTAL_NAVIGATION.MSE_ADMIN.find((item) => item.feature === feature);

  const children = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!navModule?.children || !normalized) return navModule?.children ?? [];
    return navModule.children.filter((child) =>
      t(child.labelKey).toLocaleLowerCase().includes(normalized),
    );
  }, [navModule, query, t]);

  if (!navModule) return null;
  const ModuleIcon = navModule.icon;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ModuleIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t("adminModuleLanding.sectionLabel")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              {t(`nav.${navModule.labelKey}`)}
            </h1>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("adminModuleLanding.searchPlaceholder")}
            aria-label={t("adminModuleLanding.searchPlaceholder")}
            className="h-10 bg-card pl-9"
          />
        </div>
      </header>

      <section aria-label={t("adminModuleLanding.sectionLabel")}>
        {children.length > 0 ? (
          <div className="grid overflow-hidden rounded-lg border bg-card shadow-sm sm:grid-cols-2 xl:grid-cols-3">
            {children.map((child, index) => {
              const Icon = tileIcon(child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className="group flex min-h-28 items-center gap-4 border-b border-r p-5 transition-colors hover:bg-muted/45 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-md",
                      TILE_TONES[index % TILE_TONES.length],
                    )}
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">
                    {t(child.labelKey)}
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            {t("adminModuleLanding.noResults")}
          </div>
        )}
      </section>
    </div>
  );
}
