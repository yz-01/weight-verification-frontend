"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Cable,
  ChevronDown,
  CircleHelp,
  Loader2,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AuditLogs } from "@/components/audit/audit-logs";
import { VersionList } from "@/components/platform-settings/version-list";
import { useAuth } from "@/components/providers/auth-provider";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
import { getCompanies } from "@/services/companies.service";
import {
  getCompanyPlatformConfigCatalogue,
  getPlatformConfigCatalogue,
  resetCompanyPlatformConfig,
  setCompanyPlatformConfig,
  setPlatformConfig,
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
  | "activity";

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
  { section: "activity", number: "11.2.12" },
];

const CHOICES: Record<string, string[]> = {
  "saas.default_billing_cycle": [
    "MONTHLY",
    "QUARTERLY",
    "HALF_YEARLY",
    "YEARLY",
  ],
  "commission.calculation_basis": ["SETTLED_AMOUNT", "WEIGHT", "FIXED"],
  "commission.settlement_cycle": ["MONTHLY", "QUARTERLY"],
  "cctv.mode": ["SIMULATED", "LIVE"],
  "anpr.mode": ["SIMULATED", "LIVE"],
  "api_gateway.mode": ["SIMULATED", "LIVE"],
  "notification.email.mode": ["SIMULATED", "LIVE"],
  "notification.push.mode": ["SIMULATED", "LIVE"],
  "qr.duplicate_use_policy": ["REJECT", "WARN", "ALLOW"],
};

export function SystemSettingsWorkspace({
  section = "overview",
}: {
  section?: SystemSettingsSection;
}) {
  const t = useTranslations("adminSystemSettings");
  const submodule = SUBMODULES.find((item) => item.section === section);

  if (section === "versions") return <VersionList />;
  if (section === "cwe") return <DetectionSettings />;
  if (section === "activity") {
    return (
      <AuditLogs
        fixedModule="SYSTEM_SETTINGS"
        title={t("section.activity.title")}
        subtitle={t("section.activity.subtitle")}
      />
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
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
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
  const isLoading = activeQuery.isLoading;
  const isError = activeQuery.isError;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card shadow-sm">
      {supportsCompanyOverrides && (
        <div className="border-b bg-muted/25 px-5 py-4">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("scope.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("scope.description")}
                </p>
              </div>
            </div>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm lg:w-96"
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
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : isError ? (
        <div className="m-5 flex flex-col items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 p-4">
          <div>
            <p className="text-sm font-semibold text-destructive">
              {company ? t("scope.companyLoadError") : t("loadError")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("scope.loadErrorHint")}
            </p>
          </div>
          <Button
            size="sm"
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
          {(group === "api_gateway" || group === "notifications") && (
            <CredentialRows
              group={group}
              credentials={activeCatalogue?.credentials}
              company={company || undefined}
            />
          )}
          <div className="divide-y">
            {basicRows.map((row) => (
              <ConfigRow
                key={`${company}:${row.key}:${row.value}`}
                row={row}
                company={company || undefined}
              />
            ))}
          </div>
          {advancedRows.length > 0 && (
            <details className="group border-t bg-muted/10">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-muted/30">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
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

function GroupGuide({ group }: { group: PlatformConfigGroup }) {
  const t = useTranslations("adminSystemSettings");
  const guidedGroups = ["cctv", "anpr", "api_gateway", "notifications"];
  if (!guidedGroups.includes(group)) return null;

  const monitoringHref =
    group === "notifications"
      ? "/notifications"
      : `/monitoring/${group.replace("_", "-")}`;

  return (
    <div className="border-b bg-primary/[0.035] px-5 py-5">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <CircleHelp className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{t(`guide.${group}.title`)}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t(`guide.${group}.description`)}
            </p>
          </div>
        </div>
        <div className="grid overflow-hidden rounded-md border bg-background sm:grid-cols-3 sm:divide-x">
          {["basic", "connection", "monitoring"].map((step, index) => (
            <div key={step} className="flex gap-3 border-b px-4 py-3 last:border-b-0 sm:border-b-0">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div>
                <p className="text-xs font-semibold">{t(`guide.step.${step}.title`)}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(`guide.step.${step}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            {t("guide.liveNotice")}
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/integrations">
                <Cable />
                {t("guide.manageCredentials")}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
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

function isAdvancedConfig(row: PlatformConfigEntry) {
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
      <div className="flex items-start gap-3 border-b px-5 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">{t("credential.title")}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
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
            className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3"
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
              <Button size="sm" variant="outline" asChild>
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
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(row.value);
  const save = useMutation({
    mutationFn: () =>
      company
        ? setCompanyPlatformConfig({ company, key: row.key, value })
        : setPlatformConfig({ key: row.key, value }),
    onSuccess: () => {
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

  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.2fr)_auto] lg:items-center">
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

      {serviceStatus ? (
        <div className="flex h-8 items-center">
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
        <div className="flex h-8 items-center">
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
          className="h-8 w-full rounded-md border bg-background px-2.5 text-sm"
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

      <div className="flex w-full gap-2 lg:w-auto">
        {company && row.is_overridden && can("platform_settings.manage") && (
          <Button
            size="icon-sm"
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
            size="sm"
            className="flex-1 lg:flex-none"
            disabled={row.is_readonly || value === row.value || save.isPending}
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
