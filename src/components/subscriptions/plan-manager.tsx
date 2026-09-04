"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
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
  BillingCycle,
  CompanyType,
  PlanTier,
  SubscriptionPlan,
  SubscriptionPlanPayload,
} from "@/interfaces/subscription";
import {
  createSubscriptionPlan,
  getSubscriptionPlans,
  updateSubscriptionPlan,
} from "@/services/subscription.service";

const EMPTY_PLAN: SubscriptionPlanPayload = {
  code: "",
  name: "",
  description: "",
  audience: "CONTRACTOR",
  tier: "SUBSCRIPTION",
  billing_cycle: "MONTHLY",
  currency: "MYR",
  monthly_fee: "0.00",
  yearly_fee: "0.00",
  setup_fee: "0.00",
  trial_days: 0,
  max_projects: null,
  max_users: null,
  max_sites: null,
  max_scales: null,
  earns_platform_commission: false,
  commission_rate_override: null,
  allows_external_integration: false,
  allows_cloud_weighing: true,
  feature_flags: [],
  is_public: true,
  is_active: true,
  sort_order: 0,
};

export function PlanManager() {
  const t = useTranslations("subscriptions");
  const common = useTranslations("common");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SubscriptionPlan | null | undefined>();
  const [form, setForm] = useState<SubscriptionPlanPayload>(EMPTY_PLAN);
  const [features, setFeatures] = useState("");

  const plans = useQuery({
    queryKey: ["subscription-plans", "all"],
    queryFn: () => getSubscriptionPlans({ page_size: 100, sort_by: "sort_order" }),
  });

  function openEditor(plan: SubscriptionPlan | null) {
    setEditing(plan);
    if (plan === null) {
      setForm({ ...EMPTY_PLAN });
      setFeatures("");
      return;
    }
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      audience: plan.audience,
      tier: plan.tier,
      billing_cycle: plan.billing_cycle,
      currency: plan.currency,
      monthly_fee: plan.monthly_fee,
      yearly_fee: plan.yearly_fee,
      setup_fee: plan.setup_fee,
      trial_days: plan.trial_days,
      max_projects: plan.max_projects,
      max_users: plan.max_users,
      max_sites: plan.max_sites,
      max_scales: plan.max_scales,
      earns_platform_commission: plan.earns_platform_commission,
      commission_rate_override: plan.commission_rate_override,
      allows_external_integration: plan.allows_external_integration,
      allows_cloud_weighing: plan.allows_cloud_weighing,
      feature_flags: plan.feature_flags,
      is_public: plan.is_public,
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    });
    setFeatures(plan.feature_flags.join(", "));
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        feature_flags: features
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };
      return editing
        ? updateSubscriptionPlan(editing.id, payload)
        : createSubscriptionPlan(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      setEditing(undefined);
    },
  });

  function setAudience(audience: CompanyType) {
    if (audience === "CONTRACTOR") {
      setForm((current) => ({
        ...current,
        audience,
        tier: "SUBSCRIPTION",
        earns_platform_commission: false,
        commission_rate_override: null,
        allows_external_integration: false,
        allows_cloud_weighing: true,
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      audience,
      tier: "PARTNER",
      monthly_fee: "0.00",
      yearly_fee: "0.00",
      earns_platform_commission: true,
      allows_external_integration: false,
      allows_cloud_weighing: true,
    }));
  }

  function setTier(tier: PlanTier) {
    setForm((current) => ({
      ...current,
      tier,
      monthly_fee: tier === "PARTNER" ? "0.00" : current.monthly_fee,
      yearly_fee: tier === "PARTNER" ? "0.00" : current.yearly_fee,
      earns_platform_commission: tier === "PARTNER",
      commission_rate_override:
        tier === "PARTNER" ? current.commission_rate_override : null,
      allows_external_integration: tier === "STANDARD",
      allows_cloud_weighing: tier !== "STANDARD",
    }));
  }

  const rows = plans.data?.results ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("plans.count", { count: rows.length })}
        </p>
        {can("subscription.manage") && (
          <Button size="sm" onClick={() => openEditor(null)}>
            <Plus className="h-4 w-4" />
            {t("plans.create")}
          </Button>
        )}
      </div>

      <div className="min-h-0 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>{t("field.plan")}</TableHead>
              <TableHead>{t("field.audience")}</TableHead>
              <TableHead>{t("field.billingCycle")}</TableHead>
              <TableHead>{t("field.fees")}</TableHead>
              <TableHead>{t("field.allowances")}</TableHead>
              <TableHead>{t("field.entitlements")}</TableHead>
              <TableHead>{t("field.companies")}</TableHead>
              <TableHead>{t("field.state")}</TableHead>
              <TableHead className="w-12"><span className="sr-only">{common("actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.isLoading ? (
              <TableRow><TableCell colSpan={9}>{common("loading")}</TableCell></TableRow>
            ) : plans.isError ? (
              <TableRow><TableCell colSpan={9} className="text-destructive">{t("error.load")}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-muted-foreground">{t("plans.empty")}</TableCell></TableRow>
            ) : rows.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{plan.code}</p>
                </TableCell>
                <TableCell><TypeBadge label={t(`audience.${plan.audience}`)} /></TableCell>
                <TableCell>{t(`billingCycle.${plan.billing_cycle}`)}</TableCell>
                <TableCell className="tabular-nums">
                  {plan.tier === "PARTNER" ? (
                    <span>{plan.currency} {plan.setup_fee} {t("fee.once")}</span>
                  ) : (
                    <span>{plan.currency} {plan.monthly_fee} {t("fee.monthly")}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {t("plans.allowanceSummary", {
                    users: plan.max_users ?? t("value.unlimited"),
                    projects: plan.max_projects ?? t("value.unlimited"),
                  })}
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {plan.earns_platform_commission && <span>{t("entitlement.commission")}</span>}
                    {plan.allows_external_integration && <span>{t("entitlement.integration")}</span>}
                    {plan.allows_cloud_weighing && <span>{t("entitlement.cwe")}</span>}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{plan.company_count}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={t(plan.is_active ? "planState.active" : "planState.inactive")}
                    tone={plan.is_active ? "positive" : "neutral"}
                  />
                </TableCell>
                <TableCell>
                  {can("subscription.manage") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title={common("edit")}
                      onClick={() => openEditor(plan)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t(editing ? "plans.edit" : "plans.create")}</DialogTitle>
            <DialogDescription>{t("plans.formDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <TextField label={t("field.code")} value={form.code} disabled={Boolean(editing)} onChange={(code) => setForm((current) => ({ ...current, code }))} />
            <TextField label={t("field.name")} value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
            <FieldWrapper label={t("field.description")} optional={common("optional")} className="md:col-span-2">
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </FieldWrapper>
            <SelectField label={t("field.audience")} value={form.audience} disabled={Boolean(editing)} options={["CONTRACTOR", "RECYCLER"]} labelFor={(value) => t(`audience.${value}`)} onChange={(value) => setAudience(value as CompanyType)} />
            <SelectField label={t("field.tier")} value={form.tier} options={form.audience === "CONTRACTOR" ? ["SUBSCRIPTION"] : ["PARTNER", "STANDARD"]} labelFor={(value) => t(`tier.${value}`)} onChange={(value) => setTier(value as PlanTier)} />
            <SelectField label={t("field.billingCycle")} value={form.billing_cycle} options={["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]} labelFor={(value) => t(`billingCycle.${value}`)} onChange={(value) => setForm((current) => ({ ...current, billing_cycle: value as BillingCycle }))} />
            <TextField label={t("field.currency")} value={form.currency} onChange={(currency) => setForm((current) => ({ ...current, currency: currency.toUpperCase() }))} />
            <NumberField label={t("field.monthlyFee")} value={form.monthly_fee} disabled={form.tier === "PARTNER"} decimal onChange={(monthly_fee) => setForm((current) => ({ ...current, monthly_fee }))} />
            <NumberField label={t("field.yearlyFee")} value={form.yearly_fee} disabled={form.tier === "PARTNER"} decimal onChange={(yearly_fee) => setForm((current) => ({ ...current, yearly_fee }))} />
            <NumberField label={t("field.setupFee")} value={form.setup_fee} decimal hint={form.tier === "PARTNER" ? t("hint.partnerServiceFee") : undefined} onChange={(setup_fee) => setForm((current) => ({ ...current, setup_fee }))} />
            <NumberField label={t("field.trialDays")} value={form.trial_days} onChange={(trial_days) => setForm((current) => ({ ...current, trial_days }))} />
            <NumberField label={t("field.maxUsers")} value={form.max_users} optional onChange={(max_users) => setForm((current) => ({ ...current, max_users }))} />
            <NumberField label={t("field.maxProjects")} value={form.max_projects} optional onChange={(max_projects) => setForm((current) => ({ ...current, max_projects }))} />
            <NumberField label={t("field.maxSites")} value={form.max_sites} optional onChange={(max_sites) => setForm((current) => ({ ...current, max_sites }))} />
            <NumberField label={t("field.maxScales")} value={form.max_scales} optional onChange={(max_scales) => setForm((current) => ({ ...current, max_scales }))} />
            <NumberField label={t("field.commissionRate")} value={form.commission_rate_override} optional decimal disabled={form.tier !== "PARTNER"} onChange={(commission_rate_override) => setForm((current) => ({ ...current, commission_rate_override }))} />
            <NumberField label={t("field.sortOrder")} value={form.sort_order} onChange={(sort_order) => setForm((current) => ({ ...current, sort_order }))} />
            <FieldWrapper label={t("field.features")} optional={common("optional")} className="md:col-span-2" hint={t("hint.features")}>
              <Input value={features} onChange={(event) => setFeatures(event.target.value)} />
            </FieldWrapper>
            <ToggleField label={t("field.commissionEnabled")} checked={form.earns_platform_commission} disabled={form.tier !== "PARTNER"} onChange={(earns_platform_commission) => setForm((current) => ({ ...current, earns_platform_commission }))} />
            <ToggleField label={t("field.externalIntegration")} checked={form.allows_external_integration} disabled={form.audience !== "RECYCLER"} onChange={(allows_external_integration) => setForm((current) => ({ ...current, allows_external_integration }))} />
            <ToggleField label={t("field.cloudWeighing")} checked={form.allows_cloud_weighing} disabled={form.audience === "RECYCLER"} onChange={(allows_cloud_weighing) => setForm((current) => ({ ...current, allows_cloud_weighing }))} />
            <ToggleField label={t("field.publicPlan")} checked={form.is_public} onChange={(is_public) => setForm((current) => ({ ...current, is_public }))} />
            <ToggleField label={t("field.activePlan")} checked={form.is_active} onChange={(is_active) => setForm((current) => ({ ...current, is_active }))} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(undefined)}>{common("cancel")}</Button>
            <Button requires={[[form.code, t("field.code")], [form.name, t("field.name")]]}
                    disabled={save.isPending} onClick={() => save.mutate()}>{common("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TextField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <FieldWrapper label={label} required><Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></FieldWrapper>;
}

function NumberField<T extends number | string | null>({ label, value, onChange, optional, decimal, disabled, hint }: { label: string; value: T; onChange: (value: T) => void; optional?: boolean; decimal?: boolean; disabled?: boolean; hint?: string }) {
  const common = useTranslations("common");
  return (
    <FieldWrapper label={label} required={!optional} optional={optional ? common("optional") : undefined} hint={hint}>
      <Input
        type="number"
        min={0}
        step={decimal ? "0.01" : "1"}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          onChange((typeof value === "string" || decimal ? raw : raw === "" ? null : Number(raw)) as T);
        }}
      />
    </FieldWrapper>
  );
}

function SelectField({ label, value, options, labelFor, onChange, disabled }: { label: string; value: string; options: string[]; labelFor: (value: string) => string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <FieldWrapper label={label} required>
      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{labelFor(option)}</option>)}
      </select>
    </FieldWrapper>
  );
}

function ToggleField({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-md border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
