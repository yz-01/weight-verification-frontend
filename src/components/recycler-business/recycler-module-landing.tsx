"use client";

import {
  ArrowUpRight,
  Box,
  ClipboardList,
  CreditCard,
  Gauge,
  Inbox,
  MapPinned,
  Recycle,
  Search,
  SlidersHorizontal,
  Truck,
  UsersRound,
  Warehouse,
  Weight,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { PORTAL_NAVIGATION, type PortalFeatureKey } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const TONES = [
  "bg-primary/10 text-primary",
  "bg-info/10 text-info",
  "bg-success/10 text-success",
  "bg-warning/15 text-warning",
  "bg-destructive/10 text-destructive",
] as const;

const ICON_BY_ROUTE: Array<{ pattern: RegExp; icon: LucideIcon }> = [
  { pattern: /customer|partnership/, icon: UsersRound },
  { pattern: /sites|yard/, icon: Warehouse },
  { pattern: /vehicles|drivers|gps/, icon: Truck },
  { pattern: /tasks/, icon: ClipboardList },
  { pattern: /waste-orders|incoming|dispatch/, icon: Inbox },
  { pattern: /weighing|scales/, icon: Weight },
  { pattern: /deductions/, icon: Gauge },
  { pattern: /settlements/, icon: CreditCard },
  { pattern: /inventory/, icon: Box },
  { pattern: /outbound/, icon: Recycle },
  { pattern: /map|location/, icon: MapPinned },
];

function childIcon(href: string): LucideIcon {
  return ICON_BY_ROUTE.find(({ pattern }) => pattern.test(href))?.icon ?? SlidersHorizontal;
}

export function RecyclerModuleLanding({ feature }: { feature: PortalFeatureKey }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const item = PORTAL_NAVIGATION.MSE_SCRAP.find((entry) => entry.feature === feature);
  const children = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (item?.children ?? []).filter((child) =>
      (!child.feature || user?.features.includes(child.feature)) &&
      (!term || t(child.labelKey).toLocaleLowerCase().includes(term)),
    );
  }, [item, query, t, user?.features]);
  if (!item) return null;
  const ModuleIcon = item.icon;

  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-6">
      <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <ModuleIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("contractorModuleLanding.chooseAction")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-foreground">
              {t(`nav.${item.labelKey}`)}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("contractorModuleLanding.subtitle", { module: t(`nav.${item.labelKey}`) })}
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-80 lg:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("contractorModuleLanding.searchPlaceholder")}
            placeholder={t("contractorModuleLanding.searchPlaceholder")}
            className="h-11 bg-card pl-9 shadow-sm"
          />
        </div>
      </header>

      {children.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {children.map((child, index) => {
            const Icon = childIcon(child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                className="group flex min-h-32 flex-col justify-between rounded-xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-start justify-between gap-4">
                  <span className={cn("grid size-10 place-items-center rounded-lg ring-1 ring-current/10", TONES[index % TONES.length])}>
                    <Icon className="size-4" />
                  </span>
                  <span className="grid size-8 place-items-center rounded-full border bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </span>
                <span className="mt-5 min-w-0">
                  <span className="block text-base font-semibold leading-6 text-foreground group-hover:text-primary">
                    {t(child.labelKey)}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {t("contractorModuleLanding.cardSubtitle", { action: t(child.labelKey) })}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
          {t("contractorModuleLanding.noActions")}
        </div>
      )}
    </div>
  );
}
