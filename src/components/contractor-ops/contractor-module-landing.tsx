"use client";

import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Files,
  FolderKanban,
  HardHat,
  ListTree,
  MapPinned,
  PackageCheck,
  PackageOpen,
  Recycle,
  ScanLine,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  UsersRound,
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

const ICON_BY_WORD: Array<{ pattern: RegExp; icon: LucideIcon }> = [
  { pattern: /material-outgoing/, icon: PackageOpen },
  { pattern: /site-equipment/, icon: HardHat },
  { pattern: /site-progress/, icon: BarChart3 },
  { pattern: /schedule/, icon: CalendarDays },
  { pattern: /site-disposal|recycl|waste/, icon: Recycle },
  { pattern: /safety|hazard/, icon: ShieldAlert },
  { pattern: /consultant|approval/, icon: ClipboardCheck },
  { pattern: /document|archive|evidence/, icon: Files },
  { pattern: /report/, icon: BarChart3 },
  { pattern: /notification/, icon: Bell },
  { pattern: /geofence|workforce|location|map|gps/, icon: MapPinned },
  { pattern: /site-access|gate|permit/, icon: ScanLine },
  { pattern: /supplier/, icon: Building2 },
  { pattern: /project-categor|categor/, icon: ListTree },
  { pattern: /material/, icon: PackageCheck },
  { pattern: /project/, icon: FolderKanban },
  { pattern: /user|role|team/, icon: UsersRound },
  { pattern: /setting|integration/, icon: Settings2 },
];

function childIcon(label: string): LucideIcon {
  return ICON_BY_WORD.find(({ pattern }) => pattern.test(label))?.icon ?? SlidersHorizontal;
}

/** The entry page for a contractor module; existing workspaces remain the actions. */
export function ContractorModuleLanding({ feature }: { feature: PortalFeatureKey }) {
  const t = useTranslations();
  const { user, can } = useAuth();
  const [query, setQuery] = useState("");
  const navModule = PORTAL_NAVIGATION.MSE_TRACE.find((item) => item.feature === feature);
  const children = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    // The same three tests as the sidebar. This page read the list on its
    // own and skipped `menuHidden`, so 「证据归档」 left the menu (T-345) and
    // stayed here as a card (T-388).
    return (navModule?.children ?? []).filter((child) =>
      !child.menuHidden &&
      (!child.requiredPermission || can(child.requiredPermission)) &&
      (!child.feature || user?.features.includes(child.feature)) &&
      (!term || t(child.labelKey).toLocaleLowerCase().includes(term)),
    );
  }, [navModule?.children, query, t, user?.features, can]);

  if (!navModule) return null;
  const ModuleIcon = navModule.icon;

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
              {t(`nav.${navModule.labelKey}`)}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("contractorModuleLanding.subtitle", { module: t(`nav.${navModule.labelKey}`) })}
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-80 lg:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("contractorModuleLanding.searchPlaceholder")}
            aria-label={t("contractorModuleLanding.searchPlaceholder")}
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
