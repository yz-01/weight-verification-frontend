"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AuditLogs } from "@/components/audit/audit-logs";
import { VersionList } from "@/components/platform-settings/version-list";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
  getPlatformConfigCatalogue,
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
  "saas.default_billing_cycle": ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"],
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
        title={section === "overview" ? t("title") : t(`section.${section}.title`)}
        subtitle={
          section === "overview"
            ? t("subtitle")
            : t(`section.${section}.subtitle`)
        }
      />
      {section === "overview" ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-y bg-card">
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
  const catalogue = useQuery({
    queryKey: ["platform-config-catalogue"],
    queryFn: getPlatformConfigCatalogue,
  });
  const rows = useMemo(
    () => (catalogue.data?.configs ?? []).filter((row) => row.group === group),
    [catalogue.data, group],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-y bg-card">
      {catalogue.isLoading ? (
        <div className="flex min-h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : catalogue.isError ? (
        <div className="p-5 text-sm text-destructive">{t("loadError")}</div>
      ) : (
        <div className="divide-y">
          {(group === "api_gateway" || group === "notifications") && (
            <CredentialRows
              group={group}
              credentials={catalogue.data?.credentials}
            />
          )}
          {rows.map((row) => (
            <ConfigRow key={`${row.key}:${row.value}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function CredentialRows({
  group,
  credentials,
}: {
  group: "api_gateway" | "notifications";
  credentials?: {
    api_gateway: DeploymentCredentialStatus;
    email: DeploymentCredentialStatus;
    push: DeploymentCredentialStatus;
  };
}) {
  const t = useTranslations("adminSystemSettings");
  const rows = group === "api_gateway"
    ? [["apiGateway", credentials?.api_gateway] as const]
    : [
        ["email", credentials?.email] as const,
        ["push", credentials?.push] as const,
      ];

  return (
    <div className="grid divide-y bg-muted/20 md:grid-cols-2 md:divide-x md:divide-y-0">
      {rows.map(([name, status]) => (
        <div key={name} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3">
          <div>
            <p className="text-sm font-medium">{t(`credential.${name}`)}</p>
            <p className="text-xs text-muted-foreground">{t("credential.deploymentEnv")}</p>
          </div>
          <StatusBadge
            label={t(status?.configured ? "credential.configured" : "credential.missing")}
            tone={status?.configured ? "positive" : "warning"}
          />
        </div>
      ))}
    </div>
  );
}

function ConfigRow({ row }: { row: PlatformConfigEntry }) {
  const t = useTranslations("adminSystemSettings");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(row.value);
  const save = useMutation({
    mutationFn: () => setPlatformConfig({ key: row.key, value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-config-catalogue"] }),
  });
  const choices = CHOICES[row.key];
  const mode = row.key.endsWith(".mode") && (value === "LIVE" || value === "SIMULATED");

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
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={row.key}>
          {row.key}
          {row.updated_at ? ` · ${df.precise(row.updated_at)}` : ""}
        </p>
      </div>

      {row.value_type === "BOOLEAN" ? (
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
            <option key={choice} value={choice}>{t(`option.${choice}`)}</option>
          ))}
        </select>
      ) : (
        <Input
          id={row.key}
          type={row.value_type === "INTEGER" || row.value_type === "DECIMAL" ? "number" : "text"}
          step={row.value_type === "DECIMAL" ? "0.001" : undefined}
          value={value}
          disabled={row.is_readonly}
          onChange={(event) => setValue(event.target.value)}
        />
      )}

      <Button
        size="sm"
        className="w-full lg:w-auto"
        disabled={row.is_readonly || value === row.value || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
        {t("save")}
      </Button>
    </div>
  );
}
