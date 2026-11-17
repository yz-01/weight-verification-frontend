"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Cable,
  ChevronDown,
  Loader2,
  LogOut,
  RotateCcw,
  Save,
  Settings2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PlatformDefaultCommissionCard } from "@/components/billing/commission-rule-manager";
import { AnnouncementPanel } from "@/components/platform-settings/announcement-panel";
import { FeatureFlagPanel } from "@/components/platform-settings/feature-flag-panel";
import { VersionList } from "@/components/platform-settings/version-list";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ListHeader, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { DetectionSettings } from "@/components/weighing/detection-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  DeploymentCredentialStatus,
  PlatformConfigEntry,
  PlatformConfigGroup,
} from "@/interfaces/platform-settings";
import { useDateFormat } from "@/lib/dates";
import {
  DUPLICATE_WINDOW,
  NOTIFICATION_TYPE_CODES,
  REMINDER_DAYS,
  fromPickerValue,
  maintenanceWindowProblem,
  readDuplicateWindow,
  readEnabledTypes,
  readReminderDays,
  toPickerValue,
  toggleEnabledType,
  wholeNumberInRange,
  type NotificationTypeCode,
} from "@/lib/system-settings-editors";
import { getCompanies, getSubscriptionPlans } from "@/services/companies.service";
import {
  getCompanyPlatformConfigCatalogue,
  getPlatformConfigCatalogue,
  resetCompanyPlatformConfig,
  setCompanyPlatformConfig,
  setPlatformConfig,
  uploadPlatformBranding,
} from "@/services/platform-settings.service";

export type SystemSettingsSection =
  | "overview"
  | "basic"
  | "saas"
  | "commission"
  | "cwe"
  | "cctv"
  | "anpr"
  | "qr"
  | "api-gateway"
  | "versions"
  | "notifications"
  | "maintenance"
  | "field"
  | "feature-flags";

const SUBMODULES: Array<{
  section: Exclude<SystemSettingsSection, "overview">;
  number: string;
  group?: PlatformConfigGroup;
}> = [
  { section: "basic", number: "11.2.1", group: "basic" },
  { section: "saas", number: "11.2.2", group: "saas" },
  { section: "commission", number: "11.2.3", group: "commission" },
  { section: "cwe", number: "11.2.4", group: "cwe" },
  { section: "cctv", number: "11.2.5", group: "cctv" },
  { section: "anpr", number: "11.2.6", group: "anpr" },
  { section: "qr", number: "11.2.7", group: "qr" },
  { section: "api-gateway", number: "11.2.8", group: "api_gateway" },
  { section: "versions", number: "11.2.9" },
  { section: "notifications", number: "11.2.10", group: "notifications" },
  { section: "maintenance", number: "11.2.11", group: "maintenance" },
  // The phone's history window (D-197). Per-company like the hardware groups
  // below it, because a six-month site and a four-year one are both real.
  { section: "field", number: "11.2.12", group: "field" },
  { section: "feature-flags", number: "11.2.13" },
];

const CHOICES: Record<string, string[]> = {
  "saas.default_billing_cycle": [
    "MONTHLY",
    "QUARTERLY",
    "HALF_YEARLY",
    "YEARLY",
  ],
  "cctv.mode": ["SIMULATED", "LIVE"],
  "anpr.mode": ["SIMULATED", "LIVE"],
  "api_gateway.mode": ["SIMULATED", "LIVE"],
  "notification.email.mode": ["SIMULATED", "LIVE"],
  "notification.push.mode": ["SIMULATED", "LIVE"],
  "qr.duplicate_use_policy": ["REJECT", "WARN", "ALLOW"],
};

/**
 * JB212 (Lucas 11-16 「把它们真的做出来」): the rows that were a JSON box or
 * free text and are now read by the platform get an editor that offers only
 * what the server takes (`platform_settings/catalogue.py`).
 */
type Editor = "notificationTypes" | "reminderDays" | "duplicateWindow" | "defaultPlan";
const EDITORS: Record<string, Editor> = {
  "notification.enabled_types": "notificationTypes",
  "notification.automatic_rules": "reminderDays",
  "qr.anomaly_rules": "duplicateWindow",
  "saas.default_plan_code": "defaultPlan",
};

/** One plain sentence under a row's name: what it does once saved. */
const HELP: Record<string, string> = {
  "commission.enabled": "help.commission_enabled",
  "notification.enabled_types": "notificationTypes.hint",
  "notification.automatic_rules": "reminderDays.hint",
  "qr.anomaly_rules": "duplicateWindow.hint",
  "saas.default_plan_code": "defaultPlan.hint",
};

/** The 11.2.2 「默认配套」 list's query, shared with the screen test. */
export const DEFAULT_PLAN_OPTIONS_KEY = [
  "system-settings",
  "default-plan-options",
] as const;

/** What an editor shows for a stored value, so "unchanged" compares like with like. */
function editorValue(editor: Editor | undefined, stored: string): string {
  if (editor === "notificationTypes") return JSON.stringify(readEnabledTypes(stored));
  if (editor === "reminderDays") return String(readReminderDays(stored));
  if (editor === "duplicateWindow") return String(readDuplicateWindow(stored));
  return stored;
}

/** What is sent for an editor's value. */
function savedValue(editor: Editor | undefined, value: string): unknown {
  if (editor === "notificationTypes") return JSON.parse(value) as unknown;
  if (editor === "reminderDays") return { subscription_reminder_days: Number(value) };
  if (editor === "duplicateWindow") return { duplicate_window_seconds: Number(value) };
  return value;
}

export function SystemSettingsWorkspace({
  section = "overview",
}: {
  section?: SystemSettingsSection;
}) {
  const t = useTranslations("adminSystemSettings");
  const submodule = SUBMODULES.find((item) => item.section === section);

  if (section === "versions") return <VersionList />;
  if (section === "cwe") return <DetectionSettings />;
  if (section === "feature-flags") {
    return (
      <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
        <ListHeader
          title={t("section.feature-flags.title")}
          subtitle={t("section.feature-flags.subtitle")}
        />
        <FeatureFlagPanel />
      </div>
    );
  }
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader
        title={
          section === "overview" ? t("title") : t(`section.${section}.title`)
        }
        subtitle={
          section === "overview"
            ? t("subtitle")
            : t(`section.${section}.subtitle`)
        }
      />
      {section === "overview" ? (
        <div className="surface-panel min-h-0 flex-1 overflow-y-auto rounded-xl">
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            {SUBMODULES.map((module) => (
              <Link
                key={module.section}
                href={`/system-settings/${module.section}`}
                className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 font-medium">
                  {t(`section.${module.section}.title`)}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ) : submodule?.group ? (
        <ConfigGroupEditor group={submodule.group} />
      ) : null}
    </div>
  );
}

function ConfigGroupEditor({ group }: { group: PlatformConfigGroup }) {
  const t = useTranslations("adminSystemSettings");
  const common = useTranslations("common");
  const supportsCompanyOverrides = [
    "cctv",
    "anpr",
    "qr",
    "api_gateway",
    "field",
  ].includes(group);
  const [company, setCompany] = useState("");
  const catalogue = useQuery({
    queryKey: ["platform-config-catalogue"],
    queryFn: getPlatformConfigCatalogue,
  });
  const companies = useQuery({
    queryKey: ["companies", "system-setting-options"],
    queryFn: () => getCompanies({ page_size: 200, sort_by: "name" }),
    enabled: supportsCompanyOverrides,
  });
  const companyCatalogue = useQuery({
    queryKey: ["company-platform-config-catalogue", company],
    queryFn: () => getCompanyPlatformConfigCatalogue(company),
    enabled: supportsCompanyOverrides && Boolean(company),
  });
  const activeCatalogue = company ? companyCatalogue.data : catalogue.data;
  const rows = useMemo(
    () => (activeCatalogue?.configs ?? []).filter((row) => row.group === group),
    [activeCatalogue, group],
  );
  const advancedRows = rows.filter(isAdvancedConfig);
  const basicRows = rows.filter((row) => !isAdvancedConfig(row));
  // Global and company catalogues are independent scopes. A failed global
  // request must not hide a company catalogue that loaded successfully.
  const activeQuery = company ? companyCatalogue : catalogue;
  const isLoading = company ? companyCatalogue.isLoading : catalogue.isLoading;
  const isError = company ? companyCatalogue.isError : catalogue.isError;

  return (
    <div className="surface-panel min-h-0 flex-1 overflow-y-auto rounded-xl">
      <UnsavedLeaveGuard />
      {supportsCompanyOverrides && (
        <div className="border-b bg-muted/30 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="panel-title">{t("scope.title")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("scope.description")}
                </p>
              </div>
            </div>
            <div className="w-full space-y-1 lg:w-96">
              <select
                className="native-control"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                aria-label={t("scope.company")}
                disabled={companies.isLoading}
              >
                <option value="">{t("scope.platformDefault")}</option>
                {(companies.data?.results ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} - {row.name} ({t(`scope.type.${row.type}`)})
                  </option>
                ))}
              </select>
              <QueryFailedNote
                query={companies}
                what={t("scope.companyList")}
              />
            </div>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : isError ? (
        <div className="m-4 flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 sm:m-6">
          <div>
            <p className="text-sm font-semibold text-destructive">
              {company ? t("scope.companyLoadError") : t("loadError")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("scope.loadErrorHint")}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void activeQuery.refetch()}
          >
            <RotateCcw />
            {common("retry")}
          </Button>
        </div>
      ) : (
        <div>
          <GroupGuide group={group} />
          {group === "basic" && activeCatalogue?.branding && (
            <BrandingEditor branding={activeCatalogue.branding} />
          )}
          {(group === "api_gateway" || group === "notifications") && (
            <CredentialRows
              group={group}
              credentials={activeCatalogue?.credentials}
              company={company || undefined}
            />
          )}
          {/* 11.2.10 lists 系统公告 as one of the notification channels, and it
              is the platform's own, so it is edited here rather than per
              tenant. */}
          {group === "notifications" && !company && <AnnouncementPanel />}
          {/* JB212-4: 11.2.3's rate, basis, cycle and date are the platform
              default rule bills use; the card shows and edits that rule. */}
          {group === "commission" && !company && <PlatformDefaultCommissionCard />}
          {/* JB212-5 (Lucas Q4 = A): 「启用配套」 is gone; say where each
              plan is switched on or off instead. */}
          {group === "saas" && (
            <div className="flex flex-col gap-3 border-b bg-muted/15 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-muted-foreground">{t("saasPlansNote")}</p>
              <Button variant="outline" asChild>
                <Link href="/subscriptions/plans">
                  <ArrowRight />
                  {t("saasPlansLink")}
                </Link>
              </Button>
            </div>
          )}
          <div className="divide-y">
            {basicRows.map((row) =>
              row.key === "maintenance.ends_at" ? null : row.key ===
                "maintenance.starts_at" ? (
                <MaintenanceWindowRow
                  key={`${row.value}:${rows.find((other) => other.key === "maintenance.ends_at")?.value ?? ""}`}
                  start={row}
                  end={rows.find((other) => other.key === "maintenance.ends_at")}
                />
              ) : (
                <ConfigRow
                  key={`${company}:${row.key}:${row.value}`}
                  row={row}
                  company={company || undefined}
                />
              ),
            )}
          </div>
          {advancedRows.length > 0 && (
            <details className="group border-t bg-muted/10">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-muted/30 sm:px-6">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Settings2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {t("guide.advancedTitle")}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("guide.advancedDescription")}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="divide-y border-t bg-background/70">
                {advancedRows.map((row) => (
                  <ConfigRow
                    key={`${company}:${row.key}:${row.value}`}
                    row={row}
                    company={company || undefined}
                    advanced
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function BrandingEditor({
  branding,
}: {
  branding: import("@/interfaces/auth").Branding;
}) {
  const t = useTranslations("adminSystemSettings");
  const { can, refresh } = useAuth();
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: uploadPlatformBranding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["platform-config-catalogue"],
      });
      await refresh();
    },
  });

  return (
    <div className="border-b bg-muted/15 px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.icon_url ?? "/mse-icon-192.png"}
            alt=""
            className="size-full object-contain p-2"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="panel-title">{t("branding.title")}</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {t("branding.description")}
          </p>
          <p className="mt-1 text-xs font-medium text-primary">
            {t("branding.priority")}
          </p>
        </div>
        {can("platform_settings.manage") && (
          <Button asChild className="shrink-0">
            <label htmlFor="platform-branding-upload">
              {upload.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              {t("branding.upload")}
              <input
                id="platform-branding-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload.mutate(file);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>
        )}
      </div>
    </div>
  );
}

function GroupGuide({ group }: { group: PlatformConfigGroup }) {
  const t = useTranslations("adminSystemSettings");
  const guidedGroups = ["cctv", "anpr", "api_gateway", "notifications"];
  if (!guidedGroups.includes(group)) return null;

  const monitoringHref =
    group === "notifications"
      ? "/notifications"
      : `/monitoring/${group.replace("_", "-")}`;
  const basicHref = `/system-settings/${group.replace("_", "-")}`;
  const stepHrefs = {
    basic: basicHref,
    connection: "/integrations",
    monitoring: monitoringHref,
  } as const;

  return (
    <div className="border-b bg-primary/5 px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h3 className="panel-title">{t(`guide.${group}.title`)}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t(`guide.${group}.description`)}
            </p>
          </div>
        </div>
        <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-3 sm:divide-x">
          {["basic", "connection", "monitoring"].map((step, index) => (
            <Link key={step} href={stepHrefs[step as keyof typeof stepHrefs]} className="flex gap-3 border-b px-4 py-3 transition-colors hover:bg-primary/5 last:border-b-0 sm:border-b-0">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{t(`guide.step.${step}.title`)}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {t(`guide.step.${step}.description`)}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            {t("guide.liveNotice")}
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/integrations">
                <Cable />
                {t("guide.manageCredentials")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={monitoringHref}>
                <ArrowRight />
                {t("guide.viewStatus")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The rows on screen changed and not yet saved (JB205-10, Lucas 11-16 audit).
 * Each row has its own 保存, and leaving the page dropped an edit without a
 * word. Module state because it is only read when somebody tries to leave.
 */
const unsavedRows = new Set<string>();

function hasUnsavedRows(): boolean {
  return unsavedRows.size > 0;
}

/** A row says it has an edit not yet saved, for as long as it has. */
function useUnsavedRow(id: string, unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    unsavedRows.add(id);
    return () => {
      unsavedRows.delete(id);
    };
  }, [id, unsaved]);
}

type LeavingClick = Pick<
  MouseEvent,
  "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
> & { target: unknown };

/**
 * Where a click takes the person when it leaves this page for another one in
 * the app; null for anything else (a new tab, another site, this same page).
 */
export function leavingTo(
  event: LeavingClick,
  here: Pick<Location, "href" | "origin" | "pathname" | "search">,
): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  const anchor = target?.closest?.("a[href]") as
    | Pick<HTMLAnchorElement, "target" | "getAttribute" | "hasAttribute">
    | null
    | undefined;
  if (!anchor) return null;
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const next = new URL(anchor.getAttribute("href") ?? "", here.href);
  if (next.origin !== here.origin) return null;
  if (next.pathname === here.pathname && next.search === here.search) return null;
  return `${next.pathname}${next.search}${next.hash}`;
}

/**
 * Asks before the page is left with a row not saved: the browser asks on a
 * reload or a closed tab (as the field drafts do), and a link inside the
 * app - the menu, a card - opens 「还有设定没有保存」 first.
 */
function UnsavedLeaveGuard() {
  const t = useTranslations("adminSystemSettings.leave");
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedRows()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const intercept = (event: MouseEvent) => {
      const href = hasUnsavedRows() ? leavingTo(event, window.location) : null;
      if (!href) return;
      // Before the link's own handler: the app does not move until asked.
      event.preventDefault();
      event.stopPropagation();
      setPending(href);
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("click", intercept, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("click", intercept, true);
    };
  }, []);
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      confirmIcon={LogOut}
      onConfirm={() => {
        const href = pending;
        setPending(null);
        unsavedRows.clear();
        if (href) router.push(href);
      }}
    />
  );
}

function isAdvancedConfig(row: PlatformConfigEntry) {
  // A row with its own plain editor is for everybody, not the engineers.
  if (EDITORS[row.key]) return false;
  return (
    row.value_type === "JSON" ||
    /(timeout|retry|rate_limit|recognition_parameters|automatic_rules)/.test(
      row.key,
    )
  );
}

function CredentialRows({
  group,
  credentials,
  company,
}: {
  group: "api_gateway" | "notifications";
  company?: string;
  credentials?: {
    api_gateway: DeploymentCredentialStatus;
    email: DeploymentCredentialStatus;
    push: DeploymentCredentialStatus;
  };
}) {
  const t = useTranslations("adminSystemSettings");
  const rows =
    group === "api_gateway"
      ? [["apiGateway", credentials?.api_gateway] as const]
      : [
          ["email", credentials?.email] as const,
          ["push", credentials?.push] as const,
        ];

  return (
    <div className="border-b bg-muted/20">
      <div className="flex items-start gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="panel-title">{t("credential.title")}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("credential.description")}
          </p>
        </div>
      </div>
      <div
        className={
          rows.length > 1
            ? "grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0"
            : "divide-y"
        }
      >
        {rows.map(([name, status]) => (
          <div
            key={name}
            className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(`credential.${name}`)}</p>
              <p className="text-xs text-muted-foreground">
                {t(
                  status?.source === "COMPANY_INTEGRATION"
                    ? "credential.companyIntegration"
                    : "credential.deploymentEnv",
                )}
              </p>
            </div>
            <StatusBadge
              label={t(
                status?.configured
                  ? "credential.configured"
                  : "credential.missing",
              )}
              tone={status?.configured ? "positive" : "warning"}
            />
            {group === "api_gateway" && (
              <Button variant="outline" asChild>
                <Link
                  href={
                    company ? `/integrations?company=${company}` : "/integrations"
                  }
                >
                  <Cable />
                  {t("credential.manageConnection")}
                </Link>
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigRow({
  row,
  company,
  advanced = false,
}: {
  row: PlatformConfigEntry;
  company?: string;
  advanced?: boolean;
}) {
  const t = useTranslations("adminSystemSettings");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { can, refresh } = useAuth();
  const queryClient = useQueryClient();
  const editor = EDITORS[row.key];
  const initial = editorValue(editor, row.value);
  const [value, setValue] = useState(initial);
  useUnsavedRow(
    `${company ?? ""}:${row.key}`,
    !row.is_readonly && can("platform_settings.manage") && value !== initial,
  );
  const save = useMutation({
    mutationFn: () =>
      company
        ? setCompanyPlatformConfig({ company, key: row.key, value: savedValue(editor, value) })
        : setPlatformConfig({ key: row.key, value: savedValue(editor, value) }),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
      void queryClient.invalidateQueries({
        queryKey: ["platform-config-catalogue"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["monitoring", "overview"],
      });
      if (company) {
        void queryClient.invalidateQueries({
          queryKey: ["company-platform-config-catalogue", company],
        });
      }
      if (!company && row.key === "platform.name") await refresh();
    },
  });
  const reset = useMutation({
    mutationFn: () =>
      resetCompanyPlatformConfig({ company: company!, key: row.key }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["company-platform-config-catalogue", company],
      });
      await queryClient.invalidateQueries({
        queryKey: ["monitoring", "overview"],
      });
    },
  });
  const choices = CHOICES[row.key];
  const mode =
    row.key.endsWith(".mode") && (value === "LIVE" || value === "SIMULATED");
  const serviceStatus = row.key.endsWith(".service_status");
  const range =
    editor === "reminderDays"
      ? REMINDER_DAYS
      : editor === "duplicateWindow"
        ? DUPLICATE_WINDOW
        : null;
  const invalid = range !== null && !wholeNumberInRange(value, range);
  const help = HELP[row.key];

  return (
    <div className="grid gap-3 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(18rem,1.2fr)_10rem] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={row.key} className="text-sm font-medium">
            {t(`field.${row.key.replaceAll(".", "_")}`)}
          </label>
          {mode && (
            <StatusBadge
              label={t(`mode.${value}`)}
              tone={value === "LIVE" ? "positive" : "warning"}
            />
          )}
          {company && (
            <StatusBadge
              label={t(
                row.is_overridden ? "scope.companyOverride" : "scope.inherited",
              )}
              tone={row.is_overridden ? "info" : "neutral"}
            />
          )}
        </div>
        {help && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(help)}</p>
        )}
        {(advanced || row.updated_at) && (
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={advanced ? row.key : undefined}
          >
            {advanced ? row.key : ""}
            {advanced && row.updated_at ? " | " : ""}
            {row.updated_at
              ? t("updatedAt", { value: df.precise(row.updated_at) })
              : ""}
          </p>
        )}
      </div>

      {editor === "notificationTypes" ? (
        <NotificationTypesEditor
          id={row.key}
          ticked={JSON.parse(value) as NotificationTypeCode[]}
          disabled={row.is_readonly}
          onChange={(next) => setValue(JSON.stringify(next))}
        />
      ) : editor === "reminderDays" || editor === "duplicateWindow" ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t(`${editor}.before`)}</span>
            <Input
              id={row.key}
              type="number"
              inputMode="numeric"
              min={range?.min}
              max={range?.max}
              step={1}
              className="w-28"
              value={value}
              disabled={row.is_readonly}
              aria-invalid={invalid || undefined}
              onChange={(event) => setValue(event.target.value)}
            />
            <span>{t(`${editor}.after`)}</span>
          </div>
          {invalid && (
            <p role="alert" className="text-xs text-destructive">
              {t(`${editor}.invalid`)}
            </p>
          )}
        </div>
      ) : editor === "defaultPlan" ? (
        <DefaultPlanSelect
          id={row.key}
          value={value}
          disabled={row.is_readonly}
          onChange={setValue}
        />
      ) : serviceStatus ? (
        <div className="flex min-h-10 items-center">
          <StatusBadge
            label={t(`serviceStatus.${value}`)}
            tone={
              value === "READY"
                ? "positive"
                : value === "DEGRADED"
                  ? "warning"
                  : value === "ERROR"
                    ? "danger"
                    : "neutral"
            }
          />
        </div>
      ) : row.value_type === "BOOLEAN" ? (
        <div className="flex min-h-10 items-center">
          <Switch
            id={row.key}
            checked={value === "true"}
            disabled={row.is_readonly}
            onCheckedChange={(checked) => setValue(checked ? "true" : "false")}
          />
        </div>
      ) : row.value_type === "JSON" ? (
        <Textarea
          id={row.key}
          className="min-h-24 font-mono text-xs"
          value={value}
          disabled={row.is_readonly}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : choices ? (
        <select
          id={row.key}
          className="native-control"
          value={value}
          disabled={row.is_readonly}
          onChange={(event) => setValue(event.target.value)}
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {t(`option.${choice}`)}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={row.key}
          type={
            row.value_type === "INTEGER" || row.value_type === "DECIMAL"
              ? "number"
              : "text"
          }
          step={row.value_type === "DECIMAL" ? "0.001" : undefined}
          value={value}
          disabled={row.is_readonly}
          onChange={(event) => setValue(event.target.value)}
        />
      )}

      {/* A fixed last column (2026-10-17): a row with the reset button and
          one without keep their value boxes at the same x. */}
      <div className="flex w-full items-center gap-2 lg:w-auto lg:justify-end">
        {company && row.is_overridden && can("platform_settings.manage") && (
          <Button
            size="icon"
            variant="outline"
            title={t("scope.reset")}
            aria-label={t("scope.reset")}
            disabled={reset.isPending}
            onClick={() => reset.mutate()}
          >
            {reset.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RotateCcw />
            )}
          </Button>
        )}
        {can("platform_settings.manage") && (
          <Button
            className="flex-1 lg:flex-none"
            disabledReason={
              row.is_readonly
                ? common("readOnlySetting")
                : value === initial
                  ? common("noChanges")
                  : invalid && editor
                    ? t(`${editor}.invalid`)
                    : undefined
            }
            disabled={row.is_readonly || value === initial || invalid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** JB212-1: 「启用的通知类别」 as six ticks, each saying what it covers. */
function NotificationTypesEditor({
  id,
  ticked,
  disabled,
  onChange,
}: {
  id: string;
  ticked: NotificationTypeCode[];
  disabled: boolean;
  onChange: (next: NotificationTypeCode[]) => void;
}) {
  const t = useTranslations("adminSystemSettings");
  return (
    <fieldset id={id} className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">{t("field.notification_enabled_types")}</legend>
      {NOTIFICATION_TYPE_CODES.map((code) => (
        <label
          key={code}
          className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/30"
        >
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            data-notification-type={code}
            checked={ticked.includes(code)}
            disabled={disabled}
            onChange={(event) =>
              onChange(toggleEnabledType(ticked, code, event.target.checked))
            }
          />
          <span className="min-w-0">
            <span className="block font-medium">
              {t(`notificationTypes.${code}.label`)}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {t(`notificationTypes.${code}.help`)}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * JB212-5: 「默认配套」 chosen from the active builder plans instead of typing
 * a code. A saved code that is no longer one of them is still shown, named as
 * stopped, so opening the page never quietly changes it.
 */
function DefaultPlanSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("adminSystemSettings");
  const plans = useQuery({
    queryKey: DEFAULT_PLAN_OPTIONS_KEY,
    queryFn: () => getSubscriptionPlans("CONTRACTOR"),
  });
  const options = plans.data?.results ?? [];
  const listed = options.some((plan) => plan.code === value);
  return (
    <div className="space-y-1">
      <select
        id={id}
        className="native-control"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("defaultPlan.none")}</option>
        {value && !listed && (
          <option value={value}>
            {plans.isSuccess ? t("defaultPlan.stopped", { code: value }) : value}
          </option>
        )}
        {options.map((plan) => (
          <option key={plan.id} value={plan.code}>
            {plan.code} - {plan.name}
          </option>
        ))}
      </select>
      <QueryFailedNote query={plans} what={t("defaultPlan.what")} />
    </div>
  );
}

/**
 * JB212-6: 维护 开始 / 结束时间 as date-and-time pickers in office time,
 * saved together so an end before the start is caught before it is sent.
 * Either may stay blank: no start = from switch-on, no end = until switched
 * off. Whether the window blocks anybody is P1's (JB211) maintenance check;
 * this row only keeps what it reads sensible.
 */
function MaintenanceWindowRow({
  start,
  end,
}: {
  start: PlatformConfigEntry;
  end?: PlatformConfigEntry;
}) {
  const t = useTranslations("adminSystemSettings");
  const common = useTranslations("common");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const savedFrom = toPickerValue(start.value);
  const savedTo = toPickerValue(end?.value ?? "");
  const [from, setFrom] = useState(savedFrom);
  const [to, setTo] = useState(savedTo);
  const problem = maintenanceWindowProblem(from, to);
  const unchanged = from === savedFrom && to === savedTo;
  const readonly = start.is_readonly || Boolean(end?.is_readonly);
  // Leaving with a picked time not saved asks first, like every other row (JB205-10).
  useUnsavedRow(
    `:${start.key}`,
    !readonly && can("platform_settings.manage") && !unchanged,
  );
  const save = useMutation({
    mutationFn: async () => {
      if (from !== savedFrom) {
        await setPlatformConfig({ key: start.key, value: fromPickerValue(from) });
      }
      if (end && to !== savedTo) {
        await setPlatformConfig({ key: end.key, value: fromPickerValue(to) });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-config-catalogue"] });
    },
  });
  const pickers = [
    { key: start.key, label: t("maintenanceWindow.start"), hint: t("maintenanceWindow.startBlank"), value: from, set: setFrom },
    ...(end
      ? [{ key: end.key, label: t("maintenanceWindow.end"), hint: t("maintenanceWindow.endBlank"), value: to, set: setTo }]
      : []),
  ];

  return (
    <div className="grid gap-3 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(18rem,1.2fr)_10rem] lg:items-start">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t("maintenanceWindow.label")}</p>
      </div>
      <div className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {pickers.map((picker) => (
            <div key={picker.key} className="space-y-1">
              <label htmlFor={picker.key} className="text-xs font-medium">
                {picker.label}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={picker.key}
                  type="datetime-local"
                  value={picker.value}
                  disabled={readonly}
                  onChange={(event) => picker.set(event.target.value)}
                />
                {picker.value && !readonly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => picker.set("")}
                  >
                    {t("maintenanceWindow.clear")}
                  </Button>
                )}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{picker.hint}</p>
            </div>
          ))}
        </div>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {t("maintenanceWindow.endBeforeStart")}
          </p>
        )}
      </div>
      <div className="flex w-full items-center gap-2 lg:w-auto lg:justify-end">
        {can("platform_settings.manage") && (
          <Button
            className="flex-1 lg:flex-none"
            disabledReason={
              readonly
                ? common("readOnlySetting")
                : unchanged
                  ? common("noChanges")
                  : problem
                    ? t("maintenanceWindow.endBeforeStart")
                    : undefined
            }
            disabled={readonly || unchanged || Boolean(problem) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("save")}
          </Button>
        )}
      </div>
    </div>
  );
}
