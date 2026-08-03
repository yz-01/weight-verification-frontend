"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, Check, Plus, RefreshCw, TestTube2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompanyType } from "@/interfaces/company";
import type {
  IntegrationConfig,
  IntegrationDevicePayload,
  IntegrationKind,
} from "@/interfaces/integration";
import { getProjects } from "@/services/contractor.service";
import { getCompanies } from "@/services/companies.service";
import {
  createIntegration,
  createIntegrationDevice,
  getIntegrationDevices,
  getIntegrations,
  testIntegration,
  updateIntegration,
} from "@/services/integration.service";
import { getScales, getSites } from "@/services/weighing.service";

const KINDS: IntegrationKind[] = [
  "ERP",
  "ACCOUNTING",
  "MYINVOIS",
  "GOVERNMENT_API",
  "CCTV",
  "ANPR",
  "IOT",
  "AI",
  "DRONE",
  "TOWER_CRANE",
  "RF",
  "WEBHOOK",
];

const DEFAULT_DEVICE: IntegrationDevicePayload = {
  device_type: "EDGE_GATEWAY",
  device_id: "",
  integration: null,
  site: null,
  project: null,
  scale: null,
  firmware_version: "",
  secret: "",
};

export function Integrations() {
  const t = useTranslations();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [company, setCompany] = useState(user?.company ?? "");
  const [kind, setKind] = useState<IntegrationKind>("ERP");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState("NONE");
  const [secret, setSecret] = useState("");
  const [settings, setSettings] = useState("{}");
  const [device, setDevice] = useState<IntegrationDevicePayload>(DEFAULT_DEVICE);

  const companies = useQuery({
    queryKey: ["companies", "integration-options"],
    queryFn: () => getCompanies({ page_size: 100, sort_by: "name" }),
    enabled: Boolean(user?.is_platform_staff),
  });
  const selectedCompany = user?.is_platform_staff
    ? company
    : (user?.company ?? "");
  const selectedCompanyType = useMemo<CompanyType | null>(() => {
    if (!selectedCompany) return null;
    if (!user?.is_platform_staff) return user?.company_type ?? null;
    return (
      companies.data?.results.find((item) => item.id === selectedCompany)?.type ??
      null
    );
  }, [companies.data?.results, selectedCompany, user]);
  const companyQuery = user?.is_platform_staff ? { company: selectedCompany } : {};
  const integrations = useQuery({
    queryKey: ["integrations", selectedCompany],
    queryFn: () => getIntegrations(companyQuery),
    enabled: Boolean(selectedCompany),
  });
  const devices = useQuery({
    queryKey: ["integration-devices", selectedCompany],
    queryFn: () => getIntegrationDevices(companyQuery),
    enabled: Boolean(selectedCompany),
  });
  const projects = useQuery({
    queryKey: ["projects", "integration-options", selectedCompany],
    queryFn: () => getProjects({ ...companyQuery, page_size: 100, sort_by: "name" }),
    enabled: Boolean(selectedCompany && selectedCompanyType === "CONTRACTOR"),
  });
  const sites = useQuery({
    queryKey: ["sites", "integration-options", selectedCompany],
    queryFn: () => getSites({ ...companyQuery, page_size: 100, sort_by: "name" }),
    enabled: Boolean(selectedCompany && selectedCompanyType === "RECYCLER"),
  });
  const scales = useQuery({
    queryKey: ["scales", "integration-options", selectedCompany, device.site],
    queryFn: () =>
      getScales({
        ...companyQuery,
        ...(device.site ? { site: device.site } : {}),
        page_size: 100,
        sort_by: "name",
      }),
    enabled: Boolean(selectedCompany && selectedCompanyType === "RECYCLER"),
  });

  const create = useMutation({
    mutationFn: async () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(settings) as Record<string, unknown>;
      } catch {
        throw new Error(t("integrations.validation.settings"));
      }
      return createIntegration(
        {
          kind,
          name: name.trim(),
          base_url: baseUrl.trim(),
          auth_type: authType.trim() || "NONE",
          secret,
          settings: parsed,
          is_enabled: false,
        },
        user?.is_platform_staff ? selectedCompany : undefined,
      );
    },
    onSuccess: () => {
      setName("");
      setBaseUrl("");
      setSecret("");
      setSettings("{}");
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const createDevice = useMutation({
    mutationFn: () => {
      const payload: IntegrationDevicePayload = {
        ...device,
        device_id: device.device_id.trim(),
        device_type: device.device_type.trim(),
        integration: device.integration || null,
        project: selectedCompanyType === "CONTRACTOR" ? device.project || null : null,
        site: selectedCompanyType === "RECYCLER" ? device.site || null : null,
        scale: selectedCompanyType === "RECYCLER" ? device.scale || null : null,
        firmware_version: device.firmware_version?.trim() || "",
        secret: device.secret || "",
      };
      return createIntegrationDevice(
        payload,
        user?.is_platform_staff ? selectedCompany : undefined,
      );
    },
    onSuccess: () => {
      setDevice(DEFAULT_DEVICE);
      void queryClient.invalidateQueries({ queryKey: ["integration-devices"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (integration: IntegrationConfig) =>
      updateIntegration(integration.id, { is_enabled: !integration.is_enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const test = useMutation({
    mutationFn: testIntegration,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  const rows = useMemo(
    () => integrations.data?.results ?? [],
    [integrations.data?.results],
  );
  const integrationOptions = useMemo(
    () =>
      rows.map((row) => ({
        value: row.id,
        label: `${row.kind} / ${row.name}`,
      })),
    [rows],
  );
  const projectOptions = useMemo(
    () =>
      (projects.data?.results ?? []).map((project) => ({
        value: project.id,
        label: `${project.code} / ${project.name}`,
      })),
    [projects.data?.results],
  );
  const siteOptions = useMemo(
    () =>
      (sites.data?.results ?? []).map((site) => ({
        value: site.id,
        label: `${site.code} / ${site.name}`,
      })),
    [sites.data?.results],
  );
  const scaleOptions = useMemo(
    () =>
      (scales.data?.results ?? []).map((scale) => ({
        value: scale.id,
        label: `${scale.code} / ${scale.name}`,
      })),
    [scales.data?.results],
  );

  return (
    <div className="space-y-6">
      <ListHeader
        title={t("integrations.title")}
        subtitle={t("integrations.subtitle")}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={integrations.isFetching || devices.isFetching}
            onClick={() => {
              void integrations.refetch();
              void devices.refetch();
            }}
          >
            <RefreshCw
              className={
                integrations.isFetching
                  ? "h-4 w-4 animate-spin"
                  : "h-4 w-4"
              }
            />
            {t("common.refresh")}
          </Button>
        }
      />

      {user?.is_platform_staff && (
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="integration-company">
            {t("integrations.company")}
          </Label>
          <select
            id="integration-company"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={company}
            onChange={(event) => {
              setCompany(event.target.value);
              setDevice(DEFAULT_DEVICE);
            }}
          >
            <option value="">{t("integrations.chooseCompany")}</option>
            {(companies.data?.results ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} / {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedCompany && can("integration.manage") && (
        <section className="space-y-4 border-y py-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              {t("integrations.newTitle")}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label={t("integrations.field.kind")}>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as IntegrationKind)
                }
              >
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`integrations.kind.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("integrations.field.name")}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("integrations.field.namePlaceholder")}
              />
            </Field>
            <Field label={t("integrations.field.baseUrl")}>
              <Input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://..."
              />
            </Field>
            <Field label={t("integrations.field.authType")}>
              <Input
                value={authType}
                onChange={(event) => setAuthType(event.target.value)}
              />
            </Field>
            <Field label={t("integrations.field.secret")}>
              <Input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={t("integrations.field.secretPlaceholder")}
              />
            </Field>
            <Field
              label={t("integrations.field.settings")}
              className="md:col-span-2 xl:col-span-3"
            >
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                value={settings}
                onChange={(event) => setSettings(event.target.value)}
              />
            </Field>
          </div>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => void create.mutateAsync()}
          >
            <Check className="h-4 w-4" />
            {t("integrations.action.create")}
          </Button>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">
            {t("integrations.connections")}
          </h2>
        </div>
        <div className="divide-y border-y">
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("integrations.empty")}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 px-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`integrations.kind.${row.kind}`)}
                    {row.base_url ? ` / ${row.base_url}` : ""}
                  </p>
                </div>
                <StatusBadge
                  label={t(`integrations.status.${row.status}`)}
                  tone={
                    row.status === "ERROR"
                      ? "danger"
                      : row.status === "READY"
                        ? "positive"
                        : "neutral"
                  }
                />
                <div className="flex justify-end gap-2">
                  {can("integration.manage") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={test.isPending}
                        onClick={() => void test.mutateAsync(row.id)}
                      >
                        <TestTube2 className="h-4 w-4" />
                        {t("integrations.action.test")}
                      </Button>
                      <Button
                        variant={row.is_enabled ? "destructive" : "default"}
                        size="sm"
                        disabled={toggle.isPending}
                        onClick={() => void toggle.mutateAsync(row)}
                      >
                        {row.is_enabled
                          ? t("integrations.action.disable")
                          : t("integrations.action.enable")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedCompany && can("integration.manage") && (
        <section className="space-y-4 border-y py-4">
          <h2 className="text-sm font-semibold">{t("integrations.devices")}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label={t("integrations.device.type")}>
              <Input
                value={device.device_type}
                onChange={(event) =>
                  setDevice({ ...device, device_type: event.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.device.id")}>
              <Input
                value={device.device_id}
                onChange={(event) =>
                  setDevice({ ...device, device_id: event.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.device.integration")}>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={device.integration ?? ""}
                onChange={(event) =>
                  setDevice({
                    ...device,
                    integration: event.target.value || null,
                  })
                }
              >
                <option value="">
                  {t("integrations.device.unlinked")}
                </option>
                {integrationOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            {selectedCompanyType === "CONTRACTOR" && (
              <Field label={t("integrations.device.project")}>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={device.project ?? ""}
                  onChange={(event) =>
                    setDevice({
                      ...device,
                      project: event.target.value || null,
                      site: null,
                      scale: null,
                    })
                  }
                >
                  <option value="">{t("integrations.device.unlinked")}</option>
                  {projectOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {selectedCompanyType === "RECYCLER" && (
              <>
                <Field label={t("integrations.device.site")}>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={device.site ?? ""}
                    onChange={(event) =>
                      setDevice({
                        ...device,
                        site: event.target.value || null,
                        project: null,
                        scale: null,
                      })
                    }
                  >
                    <option value="">{t("integrations.device.unlinked")}</option>
                    {siteOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("integrations.device.scale")}>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={device.scale ?? ""}
                    onChange={(event) =>
                      setDevice({ ...device, scale: event.target.value || null })
                    }
                  >
                    <option value="">{t("integrations.device.unlinked")}</option>
                    {scaleOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field label={t("integrations.device.firmware")}>
              <Input
                value={device.firmware_version ?? ""}
                onChange={(event) =>
                  setDevice({ ...device, firmware_version: event.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.device.secret")}>
              <Input
                type="password"
                value={device.secret ?? ""}
                onChange={(event) =>
                  setDevice({ ...device, secret: event.target.value })
                }
                placeholder={t("integrations.device.secretPlaceholder")}
              />
            </Field>
            <div className="flex items-end xl:justify-end">
              <Button
                disabled={!device.device_id.trim() || createDevice.isPending}
                onClick={() => void createDevice.mutateAsync()}
              >
                <Plus className="h-4 w-4" />
                {t("integrations.action.registerDevice")}
              </Button>
            </div>
          </div>
          <div className="divide-y border-y">
            {(devices.data?.results ?? []).map((item) => (
              <div
                key={item.id}
                className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-mono">{item.device_id}</p>
                  <p className="truncate text-muted-foreground">
                    {item.device_type} /{" "}
                    {item.integration_name ?? t("integrations.device.unlinked")}
                    {item.gateway_device_id
                      ? ` / ${t("integrations.device.gatewayLinked")}`
                      : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      item.project_name
                        ? `${t("integrations.device.project")}: ${item.project_name}`
                        : null,
                      item.site_name
                        ? `${t("integrations.device.site")}: ${item.site_name}`
                        : null,
                      item.scale_name
                        ? `${t("integrations.device.scale")}: ${item.scale_name}`
                        : null,
                      item.firmware_version
                        ? `${t("integrations.device.firmware")}: ${item.firmware_version}`
                        : null,
                      item.has_secret ? t("integrations.device.secretStored") : null,
                    ]
                      .filter(Boolean)
                      .join(" / ") || t("integrations.device.noBinding")}
                  </p>
                </div>
                <div className="flex md:justify-end">
                  <StatusBadge
                    label={
                      item.is_online
                        ? t("integrations.device.online")
                        : t("integrations.device.offline")
                    }
                    tone={item.is_online ? "positive" : "neutral"}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
