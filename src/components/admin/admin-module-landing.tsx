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
  {
    pattern: /billing|commission|invoice|cost|pricing|payout|settlement/,
    icon: CircleDollarSign,
  },
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

const SECTION_NAMESPACES: Partial<Record<PortalFeatureKey, string>> = {
  subscription_management: "subscriptions",
  billing_commission: "billing",
  platform_monitoring: "monitoring",
  qr_code_management: "adminQr",
  cloud_weighing: "adminCwe",
  report_center: "adminReports",
  notification_center: "adminNotifications",
  platform_settings: "adminSystemSettings",
  audit_log_center: "adminAuditCenter",
  sales_commission: "adminSales",
  customer_service: "adminCustomerService",
  technical_support: "adminTechnicalSupport",
  partner_management: "adminPartnerManagement",
  asset_management: "adminAssetManagement",
  cloud_service_management: "adminCloudServiceManagement",
};

const SECTION_KEYS: Record<string, string> = {
  saasInvoices: "saas-invoices",
  apiGatewayMonitoring: "api-gateway",
  apiGatewaySettings: "api-gateway",
  customerAssignments: "assignments",
  salesPeople: "people",
  salesDetails: "details",
  salesTerritories: "territories",
  salesHierarchy: "hierarchy",
  commissionRuleTypes: "rules",
  commissionSchemes: "schemes",
  salesTerms: "terms",
  salesPayouts: "payouts",
  salesSettlements: "settlements",
  teamPerformance: "performance",
  salesReports: "reports",
  salesActivity: "activity",
  supportStates: "states",
  supportAPI: "api",
  supportInstallations: "installations",
  supportMaintenance: "maintenance",
  supportReports: "reports",
  supportActivity: "activity",
  partnerManagement: "management",
  partnerDetails: "details",
  partnerTypes: "types",
  partnerTerritories: "territories",
  partnerCustomers: "customers",
  partnerAgreements: "agreements",
  partnerSchemes: "schemes",
  partnerPerformance: "performance",
  partnerReports: "reports",
  partnerActivity: "activity",
  assetManagement: "management",
  assetDetails: "details",
  assetCategories: "categories",
  assetPurchases: "purchases",
  assetInventory: "inventory",
  assetAssignments: "assignments",
  assetInstallations: "installations",
  assetTransfers: "transfers",
  assetRepairs: "repairs",
  assetMaintenance: "maintenance",
  assetDisposals: "disposals",
  assetSearch: "search",
  assetReports: "reports",
  assetActivity: "activity",
  cloudServices: "services",
  cloudCatalog: "catalog",
  cloudVendors: "vendors",
  cloudPlans: "plans",
  cloudUsage: "usage",
  cloudCosts: "costs",
  cloudPricing: "pricing",
  cloudAlerts: "alerts",
  cloudAnalysis: "analysis",
  cloudReports: "reports",
  cloudActivity: "activity",
};

function tileIcon(href: string): LucideIcon {
  return (
    TILE_ICONS.find(({ pattern }) => pattern.test(href))?.icon ??
    SlidersHorizontal
  );
}

export function AdminModuleLanding({ feature }: { feature: PortalFeatureKey }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const navModule = PORTAL_NAVIGATION.MSE_ADMIN.find(
    (item) => item.feature === feature,
  );

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
    <div className="mx-auto w-full max-w-[90rem] space-y-6">
      <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
            <ModuleIcon className="size-5.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {navModule.children?.length ?? 0}{" "}
              {t("adminModuleLanding.sectionLabel")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-foreground">
              {t(`nav.${navModule.labelKey}`)}
            </h1>
          </div>
        </div>

        <div className="relative w-full sm:w-80 lg:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("adminModuleLanding.searchPlaceholder")}
            aria-label={t("adminModuleLanding.searchPlaceholder")}
            className="h-11 bg-card pl-9 shadow-sm"
          />
        </div>
      </header>

      <section aria-label={t("adminModuleLanding.sectionLabel")}>
        {children.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {children.map((child, index) => {
              const Icon = tileIcon(child.href);
              const tone = TILE_TONES[index % TILE_TONES.length];
              const namespace = SECTION_NAMESPACES[feature];
              const childKey = child.labelKey.split(".").pop() ?? "";
              const sectionKey = SECTION_KEYS[childKey] ?? childKey;
              const subtitleKey = namespace
                ? `${namespace}.section.${sectionKey}.subtitle`
                : "";
              const hasSubtitle = subtitleKey ? t.has(subtitleKey) : false;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className="group relative flex min-h-32 flex-col justify-between overflow-hidden rounded-lg border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex w-full items-start justify-between gap-4">
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-lg ring-1 ring-current/10",
                        tone,
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors group-hover:border-primary/25 group-hover:text-primary">
                      <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                  </span>
                  <span className="mt-5 min-w-0">
                    <span className="block text-base font-semibold leading-6 text-foreground group-hover:text-primary">
                      {t(child.labelKey)}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {hasSubtitle
                        ? t(subtitleKey)
                        : t("adminModuleLanding.cardSubtitle", {
                            module: t(child.labelKey),
                          })}
                    </span>
                  </span>
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
