"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CloudCog,
  Download,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  Save,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { AdvancedTechnicalSettings } from "@/components/shared/advanced-technical-settings";
import {
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type {
  CloudBudget,
  CloudPricingRule,
  CloudService,
  CloudServicePlan,
  CloudServiceVendor,
  CostAlert,
  PricingModel,
  ServiceStatus,
  ServiceType,
} from "@/interfaces/cloudservice";
import { useDateFormat } from "@/lib/dates";
import {
  createCloudBudget,
  createCloudPlan,
  createCloudPricingRule,
  createCloudService,
  createCloudVendor,
  exportCloudReport,
  getCloudAlerts,
  getCloudAnalysis,
  getCloudBudgets,
  getCloudOptions,
  getCloudPlans,
  getCloudPricingRules,
  getCloudServices,
  getCloudStatistics,
  getCloudSummary,
  getCloudUsage,
  getCloudVendors,
  recordCloudUsage,
  resolveCloudAlert,
  setCloudServiceStatus,
  updateCloudBudget,
  updateCloudPlan,
  updateCloudPricingRule,
  updateCloudService,
  updateCloudVendor,
} from "@/services/cloudservice.service";

export type CloudSection =
  | "overview"
  | "services"
  | "catalog"
  | "vendors"
  | "plans"
  | "usage"
  | "costs"
  | "pricing"
  | "alerts"
  | "analysis"
  | "reports";
const SUBMODULES: Array<{
  section: Exclude<CloudSection, "overview">;
  number: string;
}> = [
  { section: "services", number: "A17.2.1" },
  { section: "catalog", number: "A17.2.2" },
  { section: "vendors", number: "A17.2.3" },
  { section: "plans", number: "A17.2.4" },
  { section: "usage", number: "A17.2.5" },
  { section: "costs", number: "A17.2.6" },
  { section: "pricing", number: "A17.2.7" },
  { section: "alerts", number: "A17.2.8" },
  { section: "analysis", number: "A17.2.9" },
  { section: "reports", number: "A17.2.10" },
];
const TYPES: ServiceType[] = [
  "CLOUD_STORAGE",
  "VIDEO_STORAGE",
  "DATABASE",
  "API_GATEWAY",
  "AI_SERVICE",
  "CWE",
  "MAP_SERVICE",
  "SMS_SERVICE",
  "EMAIL_SERVICE",
  "PUSH_NOTIFICATION",
  "DOMAIN",
  "SSL_CERTIFICATE",
  "CDN",
  "BACKUP",
  "MONITORING",
  "OTHER",
];
const PRICING: PricingModel[] = [
  "PAY_AS_YOU_GO",
  "FIXED_MONTHLY",
  "TIERED",
  "PER_UNIT",
];
const STATUSES: ServiceStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "MAINTENANCE",
  "SUSPENDED",
];
const statusTone = (
  status: string,
): "positive" | "info" | "warning" | "danger" | "neutral" =>
  status === "ACTIVE" || status === "COMPLETED"
    ? "positive"
    : status === "SUSPENDED"
      ? "danger"
      : status === "MAINTENANCE" || status === "OPEN"
        ? "warning"
        : "neutral";

export function CloudServiceManagementWorkspace({
  section = "overview",
}: {
  section?: CloudSection;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  if (section === "overview") return <Overview />;
  return (
    <div className="space-y-5">
      <ListHeader
        title={t(`section.${section}.title`)}
        subtitle={t(`section.${section}.subtitle`)}
      />
      {section === "services" && <ServicePanel />}
      {section === "catalog" && <CatalogPanel />}
      {section === "vendors" && <VendorPanel />}
      {section === "plans" && <PlanPanel />}
      {section === "usage" && <UsagePanel />}
      {section === "costs" && <CostPanel />}
      {section === "pricing" && <PricingPanel />}
      {section === "alerts" && <AlertPanel />}
      {section === "analysis" && <AnalysisPanel />}
      {section === "reports" && <ReportPanel />}
    </div>
  );
}

function Overview() {
  const t = useTranslations("adminCloudServiceManagement");
  const summary = useQuery({
    queryKey: ["cloud-summary"],
    queryFn: getCloudSummary,
  });
  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid border-y bg-card sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["services", summary.data?.total_services ?? 0],
          ["active", summary.data?.active_services ?? 0],
          ["cost", `RM ${summary.data?.current_month_usage_cost ?? "0.00"}`],
          ["profit", `RM ${summary.data?.current_month_profit ?? "0.00"}`],
        ].map(([key, value]) => (
          <div key={key} className="border-b border-r px-5 py-4">
            <p className="text-xs text-muted-foreground">
              {t(`metric.${key}`)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto border-y bg-card">
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {SUBMODULES.map((item) => (
            <Link
              key={item.section}
              href={`/cloud-services/${item.section}`}
              className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 hover:bg-muted/40"
            >
              <span className="flex-1 font-medium">
                {t(`section.${item.section}.title`)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
function Panel({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  if (loading)
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border bg-card shadow-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">
        {t("loadError")}
      </div>
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
      {children}
    </div>
  );
}
function SelectField({
  value,
  onChange,
  children,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {children}
    </select>
  );
}

function FormField({
  label,
  children,
  className = "",
  required = false,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DialogSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border bg-muted/15 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function SaveError({ error }: { error: Error | null }) {
  const t = useTranslations("adminCloudServiceManagement");
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {error.message || t("saveError")}
    </p>
  );
}

function EmptyTableRow({ columns }: { columns: number }) {
  const t = useTranslations("adminCloudServiceManagement");
  return (
    <TableRow>
      <TableCell colSpan={columns} className="h-40 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
          <span className="grid size-10 place-items-center rounded-full bg-muted">
            <Inbox className="size-4" />
          </span>
          <p className="text-sm font-medium text-foreground">
            {t("emptyTitle")}
          </p>
          <p className="text-xs">{t("emptyDescription")}</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ServicePanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const system = useTranslations("adminSystemSettings");
  const df = useDateFormat();
  const qc = useQueryClient();
  const { can } = useAuth();
  const rows = useQuery({
    queryKey: ["cloud-services"],
    queryFn: () => getCloudServices({ page_size: 200 }),
  });
  const [editing, setEditing] = useState<CloudService | null | undefined>(
    undefined,
  );
  const [statusRow, setStatusRow] = useState<CloudService | null>(null);
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      {can("cloud_service.manage") && (
        <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CloudCog className="size-4" />
            {t("recordsCount", { count: rows.data?.count ?? 0 })}
          </div>
          <Button onClick={() => setEditing(null)}>
            <Plus />
            {t("action.addService")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "name",
              "type",
              "vendor",
              "region",
              "plan",
              "contract",
              "cost",
              "mode",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.service_code}</TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>
                <TypeBadge
                  label={row.custom_type || t(`serviceType.${row.type}`)}
                />
              </TableCell>
              <TableCell>{row.vendor_name}</TableCell>
              <TableCell>{row.region || "-"}</TableCell>
              <TableCell>{row.service_plan_name || "-"}</TableCell>
              <TableCell>
                {df.date(row.subscription_start)}
                <p className="text-xs text-muted-foreground">
                  {df.date(row.subscription_end) || "-"}
                </p>
              </TableCell>
              <TableCell>RM {row.base_cost}</TableCell>
              <TableCell>
                <StatusBadge
                  label={system(`mode.${row.operation_mode}`)}
                  tone={
                    row.operation_mode === "LIVE"
                      ? "positive"
                      : row.operation_mode === "SIMULATED"
                        ? "warning"
                        : "neutral"
                  }
                />
              </TableCell>
              <TableCell>
                <StatusBadge
                  label={t(`serviceStatus.${row.status}`)}
                  tone={statusTone(row.status)}
                />
              </TableCell>
              <TableCell>
                {can("cloud_service.manage") && (
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditing(row)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatusRow(row)}
                    >
                      {t("action.status")}
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.data?.results.length && <EmptyTableRow columns={11} />}
        </TableBody>
      </Table>
      {editing !== undefined && (
        <ServiceDialog
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cloud-services"] })}
        />
      )}
      {statusRow && (
        <ServiceStatusDialog
          row={statusRow}
          onClose={() => setStatusRow(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cloud-services"] })}
        />
      )}
    </Panel>
  );
}
function ServiceDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CloudService | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  const system = useTranslations("adminSystemSettings");
  const vendors = useQuery({
    queryKey: ["cloud-vendors", "options"],
    queryFn: () => getCloudVendors({ page_size: 200, is_active: true }),
  });
  const [form, setForm] = useState({
    vendor: row?.vendor ?? "",
    type: row?.type ?? "CLOUD_STORAGE",
    custom_type: row?.custom_type ?? "",
    name: row?.name ?? "",
    description: row?.description ?? "",
    region: row?.region ?? "",
    service_plan_name: row?.service_plan_name ?? "",
    operation_mode: row?.operation_mode ?? "SIMULATED",
    subscription_start: row?.subscription_start ?? "",
    subscription_end: row?.subscription_end ?? "",
    pricing_model: row?.pricing_model ?? "PAY_AS_YOU_GO",
    base_cost: row?.base_cost ?? "0.00",
    usage_unit: row?.usage_unit ?? "",
    cost_per_unit: row?.cost_per_unit ?? "",
    monthly_quota: row?.monthly_quota ?? "",
    alert_threshold: row?.alert_threshold ?? "80",
    notes: row?.notes ?? "",
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      row
        ? updateCloudService(row.id, {
            ...form,
            subscription_end: form.subscription_end || null,
            cost_per_unit: form.cost_per_unit || null,
            monthly_quota: form.monthly_quota || null,
          })
        : createCloudService({
            ...form,
            subscription_end: form.subscription_end || null,
            cost_per_unit: form.cost_per_unit || null,
            monthly_quota: form.monthly_quota || null,
          }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t(row ? "action.editService" : "action.addService")}
          </DialogTitle>
          <DialogDescription>
            {row?.service_code || t("dialog.service")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[68dvh] space-y-4 overflow-y-auto pr-1">
          <DialogSection title={t("formSection.basic")}>
            <FormField label={t("field.vendor")} required>
              <SelectField
                value={form.vendor}
                onChange={(v) => set("vendor", v)}
                ariaLabel={t("field.vendor")}
              >
                <option value="">{t("field.chooseVendor")}</option>
                {(vendors.data?.results ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} / {x.name}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <FormField label={t("field.serviceType")} required>
              <SelectField
                value={form.type}
                onChange={(v) => set("type", v)}
                ariaLabel={t("field.serviceType")}
              >
                {TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(`serviceType.${x}`)}
                  </option>
                ))}
              </SelectField>
            </FormField>
            {form.type === "OTHER" && (
              <FormField label={t("field.customType")} required>
                <Input
                  value={form.custom_type}
                  onChange={(e) => set("custom_type", e.target.value)}
                />
              </FormField>
            )}
            <FormField label={t("field.name")} required>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </FormField>
            <FormField label={t("field.region")}>
              <Input
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
              />
            </FormField>
            <FormField label={t("field.planName")}>
              <Input
                value={form.service_plan_name}
                onChange={(e) => set("service_plan_name", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("field.description")}
              required
              className="sm:col-span-2"
            >
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </FormField>
          </DialogSection>
          <DialogSection title={t("formSection.contract")}>
            <FormField label={t("field.operationMode")} required>
              <SelectField
                value={form.operation_mode}
                onChange={(v) => set("operation_mode", v)}
                ariaLabel={t("field.operationMode")}
              >
                {["SIMULATED", "LIVE"].map((x) => (
                  <option key={x} value={x}>
                    {system(`mode.${x}`)}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <FormField label={t("field.pricingModel")} required>
              <SelectField
                value={form.pricing_model}
                onChange={(v) => set("pricing_model", v)}
                ariaLabel={t("field.pricingModel")}
              >
                {PRICING.map((x) => (
                  <option key={x} value={x}>
                    {t(`pricingModel.${x}`)}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <FormField label={t("field.subscriptionStart")} required>
              <Input
                type="date"
                value={form.subscription_start}
                onChange={(e) => set("subscription_start", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("field.subscriptionEnd")}
              hint={t("field.optionalHint")}
            >
              <Input
                type="date"
                value={form.subscription_end}
                onChange={(e) => set("subscription_end", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("field.baseCost")}
              hint={t("field.currencyHint")}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.base_cost}
                onChange={(e) => set("base_cost", e.target.value)}
              />
            </FormField>
            <FormField label={t("field.usageUnit")}>
              <Input
                value={form.usage_unit}
                onChange={(e) => set("usage_unit", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("field.unitCost")}
              hint={t("field.currencyHint")}
            >
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={form.cost_per_unit}
                onChange={(e) => set("cost_per_unit", e.target.value)}
              />
            </FormField>
            <FormField label={t("field.quota")}>
              <Input
                type="number"
                min="0"
                value={form.monthly_quota}
                onChange={(e) => set("monthly_quota", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("field.alertPercent")}
              hint={t("field.percentHint")}
            >
              <Input
                type="number"
                min="0"
                max="100"
                value={form.alert_threshold}
                onChange={(e) => set("alert_threshold", e.target.value)}
              />
            </FormField>
            <FormField label={t("field.notes")} className="sm:col-span-2">
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </FormField>
          </DialogSection>
          <SaveError error={save.error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.vendor, t("field.vendor")],
              [form.type, t("field.serviceType")],
              [form.name, t("field.name")],
              [form.description, t("field.description")],
              [form.subscription_start, t("field.subscriptionStart")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ServiceStatusDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CloudService;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  const [status, setStatus] = useState(row.status);
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => setCloudServiceStatus(row.id, status, reason),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.status")}</DialogTitle>
          <DialogDescription>{row.service_code}</DialogDescription>
        </DialogHeader>
        <FormField label={t("field.status")} required>
          <SelectField
            value={status}
            onChange={(v) => setStatus(v as ServiceStatus)}
            ariaLabel={t("field.status")}
          >
            {STATUSES.map((x) => (
              <option key={x} value={x}>
                {t(`serviceStatus.${x}`)}
              </option>
            ))}
          </SelectField>
        </FormField>
        <FormField label={t("field.reason")}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <SaveError error={save.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Check />
            {t("action.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const rows = useQuery({
    queryKey: ["cloud-services", "catalog"],
    queryFn: () => getCloudServices({ page_size: 500 }),
  });
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      <div className="grid md:grid-cols-2 xl:grid-cols-4">
        {TYPES.map((type) => {
          const matches = (rows.data?.results ?? []).filter(
            (x) => x.type === type,
          );
          return (
            <div key={type} className="border-b border-r p-5">
              <TypeBadge label={t(`serviceType.${type}`)} />
              <p className="mt-3 text-2xl font-semibold">{matches.length}</p>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {matches.slice(0, 4).map((x) => (
                  <p key={x.id}>
                    {x.service_code} / {x.custom_type || x.name}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function VendorPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const qc = useQueryClient();
  const { can } = useAuth();
  const rows = useQuery({
    queryKey: ["cloud-vendors"],
    queryFn: () => getCloudVendors({ page_size: 200 }),
  });
  const [editing, setEditing] = useState<CloudServiceVendor | null | undefined>(
    undefined,
  );
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      {can("cloud_service.manage") && (
        <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("recordsCount", { count: rows.data?.count ?? 0 })}
          </p>
          <Button onClick={() => setEditing(null)}>
            <Plus />
            {t("action.addVendor")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "name",
              "email",
              "account",
              "portal",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.code}</TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.contact_email || "-"}</TableCell>
              <TableCell>{row.account_id || "-"}</TableCell>
              <TableCell>{row.portal_url || "-"}</TableCell>
              <TableCell>
                <StatusBadge
                  label={t(row.is_active ? "status.active" : "status.inactive")}
                  tone={row.is_active ? "positive" : "neutral"}
                />
              </TableCell>
              <TableCell>
                {can("cloud_service.manage") && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.data?.results.length && <EmptyTableRow columns={7} />}
        </TableBody>
      </Table>
      {editing !== undefined && (
        <VendorDialog
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cloud-vendors"] })}
        />
      )}
    </Panel>
  );
}
function VendorDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CloudServiceVendor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  const [form, setForm] = useState({
    code: row?.code ?? "",
    name: row?.name ?? "",
    description: row?.description ?? "",
    contact_email: row?.contact_email ?? "",
    support_url: row?.support_url ?? "",
    portal_url: row?.portal_url ?? "",
    account_id: row?.account_id ?? "",
    api_key: "",
    is_active: row?.is_active ?? true,
    notes: row?.notes ?? "",
  });
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      row ? updateCloudVendor(row.id, form) : createCloudVendor(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(row ? "action.editVendor" : "action.addVendor")}
          </DialogTitle>
          <DialogDescription>{t("dialog.vendor")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("field.code")} required>
            <Input
              disabled={Boolean(row)}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.name")} required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.email")}>
            <Input
              type="email"
              value={form.contact_email}
              onChange={(e) => set("contact_email", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.account")}>
            <Input
              value={form.account_id}
              onChange={(e) => set("account_id", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.supportUrl")}>
            <Input
              type="url"
              value={form.support_url}
              onChange={(e) => set("support_url", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.portalUrl")}>
            <Input
              type="url"
              value={form.portal_url}
              onChange={(e) => set("portal_url", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("field.apiKey")}
            hint={row ? t("field.secretEditHint") : undefined}
          >
            <Input
              type="password"
              value={form.api_key}
              onChange={(e) => set("api_key", e.target.value)}
            />
          </FormField>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-md border bg-muted/15 px-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
            />
            {t("status.active")}
          </label>
          <FormField label={t("field.description")}>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.notes")}>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </FormField>
          <SaveError error={save.error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.code, t("field.code")],
              [form.name, t("field.name")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const qc = useQueryClient();
  const { can } = useAuth();
  const rows = useQuery({
    queryKey: ["cloud-plans"],
    queryFn: () => getCloudPlans({ page_size: 200 }),
  });
  const [editing, setEditing] = useState<CloudServicePlan | null | undefined>(
    undefined,
  );
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      {can("cloud_service.manage") && (
        <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("recordsCount", { count: rows.data?.count ?? 0 })}
          </p>
          <Button onClick={() => setEditing(null)}>
            <Plus />
            {t("action.addPlan")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "name",
              "storage",
              "video",
              "database",
              "api",
              "ai",
              "sms",
              "email",
              "push",
              "map",
              "fee",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.plan_code}</TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.storage_gb}</TableCell>
              <TableCell>{row.video_storage_gb}</TableCell>
              <TableCell>{row.database_gb}</TableCell>
              <TableCell>{row.api_requests}</TableCell>
              <TableCell>{row.ai_requests}</TableCell>
              <TableCell>{row.sms_count}</TableCell>
              <TableCell>{row.email_count}</TableCell>
              <TableCell>{row.push_notification_count}</TableCell>
              <TableCell>{row.map_api_calls}</TableCell>
              <TableCell>RM {row.monthly_fee}</TableCell>
              <TableCell>
                <StatusBadge
                  label={t(row.is_active ? "status.active" : "status.inactive")}
                  tone={row.is_active ? "positive" : "neutral"}
                />
              </TableCell>
              <TableCell>
                {can("cloud_service.manage") && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.data?.results.length && <EmptyTableRow columns={14} />}
        </TableBody>
      </Table>
      {editing !== undefined && (
        <PlanDialog
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cloud-plans"] })}
        />
      )}
    </Panel>
  );
}
function PlanDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CloudServicePlan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  const [form, setForm] = useState({
    plan_code: row?.plan_code ?? "",
    name: row?.name ?? "",
    description: row?.description ?? "",
    storage_gb: String(row?.storage_gb ?? 0),
    video_storage_gb: String(row?.video_storage_gb ?? 0),
    database_gb: String(row?.database_gb ?? 0),
    api_requests: String(row?.api_requests ?? 0),
    ai_requests: String(row?.ai_requests ?? 0),
    sms_count: String(row?.sms_count ?? 0),
    email_count: String(row?.email_count ?? 0),
    push_notification_count: String(row?.push_notification_count ?? 0),
    map_api_calls: String(row?.map_api_calls ?? 0),
    monthly_fee: row?.monthly_fee ?? "0.00",
    is_active: row?.is_active ?? true,
  });
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((x) => ({ ...x, [k]: v }));
  const payload = () =>
    Object.fromEntries(
      Object.entries(form).map(([k, v]) => [
        k,
        [
          "storage_gb",
          "video_storage_gb",
          "database_gb",
          "api_requests",
          "ai_requests",
          "sms_count",
          "email_count",
          "push_notification_count",
          "map_api_calls",
        ].includes(k)
          ? Number(v)
          : v,
      ]),
    );
  const save = useMutation({
    mutationFn: () =>
      row ? updateCloudPlan(row.id, payload()) : createCloudPlan(payload()),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t(row ? "action.editPlan" : "action.addPlan")}
          </DialogTitle>
          <DialogDescription>{t("dialog.plan")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[68dvh] space-y-4 overflow-y-auto pr-1">
          <DialogSection title={t("formSection.basic")}>
            <FormField label={t("field.code")} required>
              <Input
                disabled={Boolean(row)}
                value={form.plan_code}
                onChange={(e) => set("plan_code", e.target.value)}
              />
            </FormField>
            <FormField label={t("field.name")} required>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </FormField>
            <FormField
              label={t("field.monthlyFee")}
              hint={t("field.currencyHint")}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_fee}
                onChange={(e) => set("monthly_fee", e.target.value)}
              />
            </FormField>
            <label className="flex min-h-10 items-center gap-2 self-end rounded-md border bg-background px-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => set("is_active", v)}
              />
              {t("status.active")}
            </label>
            <FormField label={t("field.description")} className="sm:col-span-2">
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </FormField>
          </DialogSection>
          <DialogSection title={t("formSection.storageQuota")}>
            {["storage_gb", "video_storage_gb", "database_gb"].map((k) => (
              <FormField
                key={k}
                label={t(`field.${k}`)}
                hint={t("field.gbHint")}
              >
                <Input
                  type="number"
                  min="0"
                  value={form[k as keyof typeof form] as string}
                  onChange={(e) => set(k as keyof typeof form, e.target.value)}
                />
              </FormField>
            ))}
          </DialogSection>
          <DialogSection title={t("formSection.serviceQuota")}>
            {[
              "api_requests",
              "ai_requests",
              "sms_count",
              "email_count",
              "push_notification_count",
              "map_api_calls",
            ].map((k) => (
              <FormField
                key={k}
                label={t(`field.${k}`)}
                hint={t("field.monthlyQuotaHint")}
              >
                <Input
                  type="number"
                  min="0"
                  value={form[k as keyof typeof form] as string}
                  onChange={(e) => set(k as keyof typeof form, e.target.value)}
                />
              </FormField>
            ))}
          </DialogSection>
          <SaveError error={save.error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.plan_code, t("field.code")],
              [form.name, t("field.planName")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsagePanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const system = useTranslations("adminSystemSettings");
  const df = useDateFormat();
  const qc = useQueryClient();
  const { can } = useAuth();
  const rows = useQuery({
    queryKey: ["cloud-usage"],
    queryFn: () => getCloudUsage({ page_size: 200 }),
  });
  const [creating, setCreating] = useState(false);
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      {can("cloud_service.manage") && (
        <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("recordsCount", { count: rows.data?.count ?? 0 })}
          </p>
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("action.recordUsage")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "date",
              "service",
              "type",
              "company",
              "project",
              "usage",
              "unit",
              "cost",
              "charge",
              "profit",
              "mode",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{df.date(row.usage_date)}</TableCell>
              <TableCell>
                {row.service_code}
                <p className="text-xs text-muted-foreground">
                  {row.service_name}
                </p>
              </TableCell>
              <TableCell>{t(`serviceType.${row.service_type}`)}</TableCell>
              <TableCell>{row.company_name || t("status.platform")}</TableCell>
              <TableCell>{row.project_name || "-"}</TableCell>
              <TableCell>{row.usage_amount}</TableCell>
              <TableCell>{row.usage_unit}</TableCell>
              <TableCell>RM {row.total_cost}</TableCell>
              <TableCell>RM {row.charge_amount}</TableCell>
              <TableCell>RM {row.profit}</TableCell>
              <TableCell>
                <StatusBadge
                  label={row.source_mode === "MANUAL" ? t("mode.MANUAL") : system(`mode.${row.source_mode}`)}
                  tone={
                    row.source_mode === "LIVE"
                      ? "positive"
                      : row.source_mode === "SIMULATED"
                        ? "warning"
                        : "neutral"
                  }
                />
              </TableCell>
            </TableRow>
          ))}
          {!rows.data?.results.length && <EmptyTableRow columns={11} />}
        </TableBody>
      </Table>
      {creating && (
        <UsageDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["cloud-usage"] });
            qc.invalidateQueries({ queryKey: ["cloud-alerts"] });
          }}
        />
      )}
    </Panel>
  );
}
function UsageDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  const services = useQuery({
    queryKey: ["cloud-services", "usage-options"],
    queryFn: () => getCloudServices({ page_size: 200, status: "ACTIVE" }),
  });
  const options = useQuery({
    queryKey: ["cloud-options"],
    queryFn: getCloudOptions,
  });
  const [form, setForm] = useState({
    service_id: "",
    company_id: "",
    project_id: "",
    usage_date: new Date().toISOString().slice(0, 10),
    usage_amount: "",
    usage_unit: "GB",
    source_mode: "MANUAL",
    notes: "",
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((x) => ({
      ...x,
      [k]: v,
      ...(k === "company_id" ? { project_id: "" } : {}),
    }));
  const save = useMutation({
    mutationFn: () =>
      recordCloudUsage({
        ...form,
        company_id: form.company_id || null,
        project_id: form.project_id || null,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("action.recordUsage")}</DialogTitle>
          <DialogDescription>{t("dialog.usage")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("field.service")}
            required
            className="sm:col-span-2"
          >
            <SelectField
              value={form.service_id}
              onChange={(v) => set("service_id", v)}
              ariaLabel={t("field.service")}
            >
              <option value="">{t("field.chooseService")}</option>
              {(services.data?.results ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.service_code} / {x.name}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.company")}>
            <SelectField
              value={form.company_id}
              onChange={(v) => set("company_id", v)}
              ariaLabel={t("field.company")}
            >
              <option value="">{t("status.platform")}</option>
              {(options.data?.companies ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} / {x.name}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.project")}>
            <SelectField
              value={form.project_id}
              onChange={(v) => set("project_id", v)}
              ariaLabel={t("field.project")}
              disabled={!form.company_id}
            >
              <option value="">{t("field.noProject")}</option>
              {(options.data?.projects ?? [])
                .filter((x) => x.company_id === form.company_id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} / {x.name}
                  </option>
                ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.usageDate")} required>
            <Input
              type="date"
              value={form.usage_date}
              onChange={(e) => set("usage_date", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.sourceMode")} required>
            <SelectField
              value={form.source_mode}
              onChange={(v) => set("source_mode", v)}
              ariaLabel={t("field.sourceMode")}
            >
              {["MANUAL", "SIMULATED", "LIVE"].map((x) => (
                <option key={x} value={x}>
                  {t(`mode.${x}`)}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.usageAmount")} required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.usage_amount}
              onChange={(e) => set("usage_amount", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.usageUnit")} required>
            <Input
              value={form.usage_unit}
              onChange={(e) => set("usage_unit", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.notes")} className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </FormField>
          <SaveError error={save.error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.service_id, t("field.service")],
              [form.usage_date, t("field.usageDate")],
              [form.usage_amount, t("field.usageAmount")],
              [form.usage_unit, t("field.usageUnit")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CostPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const qc = useQueryClient();
  const { can } = useAuth();
  const stats = useQuery({
    queryKey: ["cloud-statistics"],
    queryFn: () => getCloudStatistics(),
  });
  const rows = useQuery({
    queryKey: ["cloud-budgets"],
    queryFn: () => getCloudBudgets({ page_size: 200 }),
  });
  const [editing, setEditing] = useState<CloudBudget | null | undefined>(
    undefined,
  );
  return (
    <Panel
      loading={rows.isLoading || stats.isLoading}
      error={rows.isError || stats.isError}
    >
      <div className="grid border-b sm:grid-cols-4">
        {[
          ["usage", stats.data?.usage ?? "0"],
          ["cost", `RM ${stats.data?.cost ?? "0.00"}`],
          ["revenue", `RM ${stats.data?.revenue ?? "0.00"}`],
          ["profit", `RM ${stats.data?.profit ?? "0.00"}`],
        ].map(([k, v]) => (
          <div key={k} className="border-r p-4">
            <p className="text-xs text-muted-foreground">{t(`metric.${k}`)}</p>
            <p className="text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      {can("cloud_service.manage") && (
        <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("recordsCount", { count: rows.data?.count ?? 0 })}
          </p>
          <Button onClick={() => setEditing(null)}>
            <Plus />
            {t("action.addBudget")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "company",
              "project",
              "period",
              "budget",
              "actual",
              "variance",
              "usagePercent",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.code}</TableCell>
              <TableCell>{row.company_name || t("status.platform")}</TableCell>
              <TableCell>{row.project_name || "-"}</TableCell>
              <TableCell>
                {row.year}/{String(row.month).padStart(2, "0")}
              </TableCell>
              <TableCell>RM {row.amount}</TableCell>
              <TableCell>RM {row.actual_cost}</TableCell>
              <TableCell
                className={Number(row.variance) < 0 ? "text-destructive" : ""}
              >
                RM {row.variance}
              </TableCell>
              <TableCell>{Number(row.usage_percent).toFixed(1)}%</TableCell>
              <TableCell>
                <StatusBadge
                  label={t(row.is_active ? "status.active" : "status.inactive")}
                  tone={row.is_active ? "positive" : "neutral"}
                />
              </TableCell>
              <TableCell>
                {can("cloud_service.manage") && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.data?.results.length && <EmptyTableRow columns={10} />}
        </TableBody>
      </Table>
      {editing !== undefined && (
        <BudgetDialog
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cloud-budgets"] })}
        />
      )}
    </Panel>
  );
}
function BudgetDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CloudBudget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  const options = useQuery({
    queryKey: ["cloud-options"],
    queryFn: getCloudOptions,
  });
  const today = new Date();
  const [form, setForm] = useState({
    company: row?.company ?? "",
    project: row?.project ?? "",
    year: String(row?.year ?? today.getFullYear()),
    month: String(row?.month ?? today.getMonth() + 1),
    amount: row?.amount ?? "",
    alert_threshold_percent: row?.alert_threshold_percent ?? "80",
    is_active: row?.is_active ?? true,
    notes: row?.notes ?? "",
  });
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((x) => ({
      ...x,
      [k]: v,
      ...(k === "company" ? { project: "" } : {}),
    }));
  const payload = {
    ...form,
    company: form.company || null,
    project: form.project || null,
    year: Number(form.year),
    month: Number(form.month),
  };
  const save = useMutation({
    mutationFn: () =>
      row ? updateCloudBudget(row.id, payload) : createCloudBudget(payload),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(row ? "action.editBudget" : "action.addBudget")}
          </DialogTitle>
          <DialogDescription>{t("dialog.budget")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("field.company")}>
            <SelectField
              value={form.company}
              onChange={(v) => set("company", v)}
              ariaLabel={t("field.company")}
            >
              <option value="">{t("status.platform")}</option>
              {(options.data?.companies ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} / {x.name}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.project")}>
            <SelectField
              value={form.project}
              onChange={(v) => set("project", v)}
              ariaLabel={t("field.project")}
              disabled={!form.company}
            >
              <option value="">{t("field.noProject")}</option>
              {(options.data?.projects ?? [])
                .filter((x) => x.company_id === form.company)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} / {x.name}
                  </option>
                ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.year")} required>
            <Input
              type="number"
              min="2020"
              value={form.year}
              onChange={(e) => set("year", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.month")} required>
            <Input
              type="number"
              min="1"
              max="12"
              value={form.month}
              onChange={(e) => set("month", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("field.budget")}
            required
            hint={t("field.currencyHint")}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("field.alertPercent")}
            hint={t("field.percentHint")}
          >
            <Input
              type="number"
              min="0"
              max="100"
              value={form.alert_threshold_percent}
              onChange={(e) => set("alert_threshold_percent", e.target.value)}
            />
          </FormField>
          <label className="flex min-h-10 items-center gap-2 rounded-md border bg-muted/15 px-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
            />
            {t("status.active")}
          </label>
          <FormField label={t("field.notes")} className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </FormField>
          <SaveError error={save.error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.year, t("field.year")],
              [form.month, t("field.month")],
              [form.amount, t("field.budget")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PricingPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const df = useDateFormat();
  const qc = useQueryClient();
  const { can } = useAuth();
  const rows = useQuery({
    queryKey: ["cloud-pricing-rules"],
    queryFn: () => getCloudPricingRules({ page_size: 200 }),
  });
  const [editing, setEditing] = useState<CloudPricingRule | null | undefined>(
    undefined,
  );
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      {can("cloud_service.manage") && (
        <div className="flex items-center justify-between gap-4 border-b bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("recordsCount", { count: rows.data?.count ?? 0 })}
          </p>
          <Button onClick={() => setEditing(null)}>
            <Plus />
            {t("action.addRule")}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "code",
              "name",
              "type",
              "pricing",
              "baseFee",
              "unitPrice",
              "unit",
              "effective",
              "expiry",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.rule_code}</TableCell>
              <TableCell>{row.name}</TableCell>
              <TableCell>{t(`serviceType.${row.service_type}`)}</TableCell>
              <TableCell>{t(`pricingModel.${row.pricing_model}`)}</TableCell>
              <TableCell>RM {row.base_fee}</TableCell>
              <TableCell>{row.unit_price || "-"}</TableCell>
              <TableCell>{row.usage_unit || "-"}</TableCell>
              <TableCell>{df.date(row.effective_from)}</TableCell>
              <TableCell>{df.date(row.effective_to) || "-"}</TableCell>
              <TableCell>
                <StatusBadge
                  label={t(row.is_active ? "status.active" : "status.inactive")}
                  tone={row.is_active ? "positive" : "neutral"}
                />
              </TableCell>
              <TableCell>
                {can("cloud_service.manage") && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.data?.results.length && <EmptyTableRow columns={11} />}
        </TableBody>
      </Table>
      {editing !== undefined && (
        <PricingDialog
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["cloud-pricing-rules"] })
          }
        />
      )}
    </Panel>
  );
}
function PricingDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CloudPricingRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("adminCloudServiceManagement");
  const technical = useTranslations("adminTechnicalSupport");
  const [jsonError, setJsonError] = useState("");
  const [form, setForm] = useState({
    rule_code: row?.rule_code ?? "",
    service_type: row?.service_type ?? "CLOUD_STORAGE",
    name: row?.name ?? "",
    description: row?.description ?? "",
    pricing_model: row?.pricing_model ?? "PER_UNIT",
    base_fee: row?.base_fee ?? "0.00",
    unit_price: row?.unit_price ?? "",
    usage_unit: row?.usage_unit ?? "",
    tiers: JSON.stringify(row?.tiers ?? []),
    calculation_config: JSON.stringify(row?.calculation_config ?? {}),
    effective_from: row?.effective_from ?? "",
    effective_to: row?.effective_to ?? "",
    is_active: row?.is_active ?? true,
  });
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((x) => ({ ...x, [k]: v }));
  const payload = () => {
    try {
      const result = {
        ...form,
        unit_price: form.unit_price || null,
        effective_to: form.effective_to || null,
        tiers: JSON.parse(form.tiers || "[]"),
        calculation_config: JSON.parse(form.calculation_config || "{}"),
      };
      setJsonError("");
      return result;
    } catch {
      setJsonError(technical("field.invalidJson"));
      throw new Error("invalid_json");
    }
  };
  const save = useMutation({
    mutationFn: () =>
      row
        ? updateCloudPricingRule(row.id, payload())
        : createCloudPricingRule(payload()),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(row ? "action.editRule" : "action.addRule")}
          </DialogTitle>
          <DialogDescription>{t("dialog.rule")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("field.code")} required>
            <Input
              disabled={Boolean(row)}
              value={form.rule_code}
              onChange={(e) => set("rule_code", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.name")} required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.serviceType")} required>
            <SelectField
              value={form.service_type}
              onChange={(v) => set("service_type", v)}
              ariaLabel={t("field.serviceType")}
            >
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`serviceType.${x}`)}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.pricingModel")} required>
            <SelectField
              value={form.pricing_model}
              onChange={(v) => set("pricing_model", v)}
              ariaLabel={t("field.pricingModel")}
            >
              {PRICING.map((x) => (
                <option key={x} value={x}>
                  {t(`pricingModel.${x}`)}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label={t("field.baseFee")} hint={t("field.currencyHint")}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.base_fee}
              onChange={(e) => set("base_fee", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("field.unitPrice")}
            hint={t("field.currencyHint")}
          >
            <Input
              type="number"
              min="0"
              step="0.0001"
              value={form.unit_price}
              onChange={(e) => set("unit_price", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.usageUnit")}>
            <Input
              value={form.usage_unit}
              onChange={(e) => set("usage_unit", e.target.value)}
            />
          </FormField>
          <FormField label={t("field.effectiveFrom")} required>
            <Input
              type="date"
              value={form.effective_from}
              onChange={(e) => set("effective_from", e.target.value)}
            />
          </FormField>
          <FormField
            label={t("field.effectiveTo")}
            hint={t("field.optionalHint")}
          >
            <Input
              type="date"
              value={form.effective_to}
              onChange={(e) => set("effective_to", e.target.value)}
            />
          </FormField>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-md border bg-muted/15 px-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
            />
            {t("status.active")}
          </label>
          <FormField label={t("field.description")}>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FormField>
          <AdvancedTechnicalSettings>
            <FormField label={t("field.tiersJson")} hint={t("field.jsonHint")}>
              <Textarea
                className="font-mono text-xs"
                value={form.tiers}
                onChange={(e) => {
                  set("tiers", e.target.value);
                  setJsonError("");
                }}
              />
            </FormField>
            <FormField label={t("field.calculationConfig")} hint={t("field.jsonHint")}>
              <Textarea
                className="font-mono text-xs"
                value={form.calculation_config}
                onChange={(e) => {
                  set("calculation_config", e.target.value);
                  setJsonError("");
                }}
              />
            </FormField>
            {jsonError && <p className="text-xs text-destructive sm:col-span-2">{jsonError}</p>}
          </AdvancedTechnicalSettings>
          <SaveError error={save.error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [form.rule_code, t("field.code")],
              [form.name, t("field.name")],
              [form.effective_from, t("field.effectiveFrom")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const df = useDateFormat();
  const qc = useQueryClient();
  const { can } = useAuth();
  const rows = useQuery({
    queryKey: ["cloud-alerts"],
    queryFn: () => getCloudAlerts({ page_size: 200 }),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => resolveCloudAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cloud-alerts"] }),
  });
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "date",
              "service",
              "company",
              "project",
              "alertType",
              "threshold",
              "current",
              "message",
              "status",
              "actions",
            ].map((x) => (
              <TableHead key={x}>{t(`column.${x}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows.data?.results ?? []).map((row: CostAlert) => (
            <TableRow key={row.id}>
              <TableCell>{df.dateTime(row.created_at)}</TableCell>
              <TableCell>
                {row.service_code}
                <p className="text-xs text-muted-foreground">
                  {row.service_name}
                </p>
              </TableCell>
              <TableCell>{row.company_name || t("status.platform")}</TableCell>
              <TableCell>{row.project_name || "-"}</TableCell>
              <TableCell>{t(`alertType.${row.alert_type}`)}</TableCell>
              <TableCell>{row.threshold}</TableCell>
              <TableCell>{row.current_value}</TableCell>
              <TableCell>{row.message}</TableCell>
              <TableCell>
                <StatusBadge
                  label={t(row.is_resolved ? "status.resolved" : "status.open")}
                  tone={row.is_resolved ? "positive" : "warning"}
                />
              </TableCell>
              <TableCell>
                {can("cloud_service.manage") && !row.is_resolved && (
                  <Button size="sm" onClick={() => resolve.mutate(row.id)}>
                    <Check />
                    {t("action.resolve")}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!rows.data?.results.length && <EmptyTableRow columns={10} />}
        </TableBody>
      </Table>
    </Panel>
  );
}

function Ranking({
  title,
  rows,
  nameKey,
  valueKey = "value",
}: {
  title: string;
  rows: Array<Record<string, string>>;
  nameKey: string;
  valueKey?: string;
}) {
  return (
    <div className="border-b border-r">
      <h3 className="border-b px-4 py-3 text-sm font-semibold">{title}</h3>
      <Table>
        <TableBody>
          {rows.slice(0, 10).map((row, i) => (
            <TableRow key={`${row[nameKey]}-${i}`}>
              <TableCell className="w-10 text-muted-foreground">
                {i + 1}
              </TableCell>
              <TableCell>{row[nameKey] || "-"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row[valueKey] ?? row.cost ?? "0"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
function AnalysisPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useQuery({
    queryKey: ["cloud-analysis", from, to],
    queryFn: () =>
      getCloudAnalysis({
        date_from: from || undefined,
        date_to: to || undefined,
      }),
  });
  return (
    <Panel loading={rows.isLoading} error={rows.isError}>
      <div className="flex flex-wrap gap-3 border-b bg-muted/20 px-4 py-3">
        <FormField label={t("field.dateFrom")}>
          <Input
            className="w-44 bg-background"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </FormField>
        <FormField label={t("field.dateTo")}>
          <Input
            className="w-44 bg-background"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </FormField>
      </div>
      <div className="grid border-b sm:grid-cols-4">
        {[
          ["usage", rows.data?.total_usage],
          ["cost", `RM ${rows.data?.total_cost ?? "0"}`],
          ["revenue", `RM ${rows.data?.total_revenue ?? "0"}`],
          ["profit", `RM ${rows.data?.profit ?? "0"}`],
        ].map(([k, v]) => (
          <div key={k} className="border-r p-4">
            <p className="text-xs text-muted-foreground">{t(`metric.${k}`)}</p>
            <p className="text-xl font-semibold">{v ?? "0"}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2">
        <Ranking
          title={t("ranking.resource")}
          rows={rows.data?.resource_ranking ?? []}
          nameKey="service__type"
        />
        <Ranking
          title={t("ranking.customer")}
          rows={rows.data?.top_customers ?? []}
          nameKey="company__name"
          valueKey="cost"
        />
        <Ranking
          title={t("ranking.project")}
          rows={rows.data?.top_projects ?? []}
          nameKey="project__name"
          valueKey="cost"
        />
        <Ranking
          title={t("ranking.storage")}
          rows={rows.data?.storage_ranking ?? []}
          nameKey="company__name"
        />
        <Ranking
          title={t("ranking.api")}
          rows={rows.data?.api_ranking ?? []}
          nameKey="company__name"
        />
        <Ranking
          title={t("ranking.ai")}
          rows={rows.data?.ai_ranking ?? []}
          nameKey="company__name"
        />
      </div>
    </Panel>
  );
}

const REPORTS: Record<string, string[]> = {
  usage: [
    "usage_date",
    "service_code",
    "service_name",
    "service_type",
    "company_name",
    "project_name",
    "usage_amount",
    "usage_unit",
    "source_mode",
  ],
  costs: [
    "usage_date",
    "service_code",
    "company_name",
    "project_name",
    "base_cost",
    "usage_cost",
    "total_cost",
  ],
  customers: [
    "company_id",
    "company__name",
    "project_id",
    "project__name",
    "usage",
    "cost",
    "revenue",
  ],
  revenue: [
    "usage_date",
    "service_code",
    "company_name",
    "project_name",
    "total_cost",
    "charge_amount",
    "profit",
  ],
  trends: ["period", "usage", "cost", "revenue", "profit"],
  analysis: ["service__type", "usage", "cost", "revenue", "profit"],
};
function ReportPanel() {
  const t = useTranslations("adminCloudServiceManagement");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  async function run(dataset: string, format: "xlsx" | "pdf") {
    setBusy(`${dataset}-${format}`);
    try {
      await exportCloudReport(
        dataset,
        format,
        REPORTS[dataset].map((key) => ({
          key,
          label: t(`exportColumn.${key}`),
        })),
        t(`report.${dataset}`),
        { date_from: from, date_to: to },
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <Panel loading={false} error={false}>
      <div className="flex flex-wrap gap-3 border-b bg-muted/20 px-4 py-3">
        <FormField label={t("field.dateFrom")}>
          <Input
            className="w-44 bg-background"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </FormField>
        <FormField label={t("field.dateTo")}>
          <Input
            className="w-44 bg-background"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </FormField>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3">
        {Object.keys(REPORTS).map((dataset) => (
          <div
            key={dataset}
            className="border-b border-r p-5 transition-colors hover:bg-muted/20"
          >
            <p className="font-medium">{t(`report.${dataset}`)}</p>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() => void run(dataset, "xlsx")}
              >
                {busy === `${dataset}-xlsx` ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                XLSX
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() => void run(dataset, "pdf")}
              >
                {busy === `${dataset}-pdf` ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )}
                PDF
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
