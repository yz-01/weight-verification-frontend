"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, QueryFailedNote, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  PlanDefaults,
  PlanTier,
  SubscriptionPlan,
  SubscriptionPlanPayload,
} from "@/interfaces/subscription";
import { cycleBill, featureListIsOpen, featureListParts, toggleFeature } from "@/lib/plan-terms";
import {
  createSubscriptionPlan,
  getPlanDefaults,
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

  const plans = useQuery({
    queryKey: ["subscription-plans", "all"],
    queryFn: () => getSubscriptionPlans({ page_size: 100, sort_by: "sort_order" }),
  });
  // 11.2.2 SaaS 默认值 and the 功能 checklist (JB213, Lucas 11-16
  // 「把它们真的做出来」): a new package starts from them.
  const defaults = useQuery<PlanDefaults>({
    queryKey: ["subscription-plans", "defaults"],
    queryFn: getPlanDefaults,
  });

  function openEditor(plan: SubscriptionPlan | null) {
    setEditing(plan);
    if (plan === null) {
      const start = defaults.data;
      setForm({
        ...EMPTY_PLAN,
        billing_cycle: start?.billing_cycle ?? EMPTY_PLAN.billing_cycle,
        trial_days: start?.trial_days ?? EMPTY_PLAN.trial_days,
        max_users: start ? start.max_users : EMPTY_PLAN.max_users,
      });
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
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim(),
      };
      return editing
        ? updateSubscriptionPlan(editing.id, payload)
        : createSubscriptionPlan(payload);
    },
    onSuccess: () => {
      // Close first; the list refreshes behind it rather than holding the dialog open.
      setEditing(undefined);
      void queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
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
        // A contractor has no yards or weighbridges to cap (JB213).
        max_sites: null,
        max_scales: null,
        // The menus differ per portal, so a list picked for the other
        // audience means nothing here.
        feature_flags: [],
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
      feature_flags: [],
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("plans.count", { count: rows.length })}
        </p>
        {can("subscription.manage") && (
          <Button onClick={() => openEditor(null)}>
            <Plus className="size-4" />
            {t("plans.create")}
          </Button>
        )}
      </div>

      <div className="surface-panel min-h-0 overflow-auto rounded-xl">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>{t("field.plan")}</TableHead>
              <TableHead>{t("field.audience")}</TableHead>
              <TableHead>{t("field.billingCycle")}</TableHead>
              <TableHead className="text-right tabular">{t("field.fees")}</TableHead>
              <TableHead>{t("field.allowances")}</TableHead>
              <TableHead>{t("field.entitlements")}</TableHead>
              <TableHead className="text-right tabular">{t("field.companies")}</TableHead>
              <TableHead>{t("field.state")}</TableHead>
              <TableHead className="w-12"><span className="sr-only">{common("actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.isLoading ? (
              <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">{common("loading")}</TableCell></TableRow>
            ) : plans.isError ? (
              <TableRow><TableCell colSpan={9} className="h-24 text-center text-destructive">{t("error.load")}</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">{t("plans.empty")}</TableCell></TableRow>
            ) : rows.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{plan.code}</p>
                  <PlanBadges plan={plan} />
                </TableCell>
                <TableCell><TypeBadge label={t(`audience.${plan.audience}`)} /></TableCell>
                <TableCell>{t(`billingCycle.${plan.billing_cycle}`)}</TableCell>
                <TableCell className="text-right tabular">
                  {plan.tier === "PARTNER" ? (
                    <span>{plan.currency} {plan.setup_fee} {t("fee.once")}</span>
                  ) : (
                    <PlanFee plan={plan} />
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {plan.audience === "RECYCLER"
                    ? t("plans.allowanceSummaryRecycler", {
                        users: plan.max_users ?? t("value.unlimited"),
                        sites: plan.max_sites ?? t("value.unlimited"),
                        scales: plan.max_scales ?? t("value.unlimited"),
                      })
                    : t("plans.allowanceSummary", {
                        users: plan.max_users ?? t("value.unlimited"),
                        projects: plan.max_projects ?? t("value.unlimited"),
                      })}
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {plan.earns_platform_commission && <span>{t("entitlement.commission")}</span>}
                    {plan.allows_external_integration && <span>{t("entitlement.integration")}</span>}
                    {plan.allows_cloud_weighing && <span>{t("entitlement.cwe")}</span>}
                    {/* 功能 (JB213): whether this package limits the menus. */}
                    {defaults.data && (
                      <span>
                        {featureListIsOpen(plan.feature_flags, defaults.data.feature_choices[plan.audience])
                          ? t("plans.featuresAll")
                          : t("plans.featuresCount", {
                              count: featureListParts(plan.feature_flags, defaults.data.feature_choices[plan.audience]).checked.length,
                            })}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular">{plan.company_count}</TableCell>
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
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t(editing ? "plans.edit" : "plans.create")}</DialogTitle>
            <DialogDescription>{t("plans.formDescription")}</DialogDescription>
          </DialogHeader>
          {!editing && defaults.data && (
            <p className="text-xs text-muted-foreground">{t("hint.defaultsFrom")}</p>
          )}
          <QueryFailedNote query={defaults} what={t("what.planDefaults")} />

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <FieldWrapper label={t("field.code")} required><Input value={form.code} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("field.name")} required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("field.description")} optional={common("optional")} className="md:col-span-2">
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </FieldWrapper>
            <SelectField label={t("field.audience")} value={form.audience} disabled={Boolean(editing)} options={["CONTRACTOR", "RECYCLER"]} labelFor={(value) => t(`audience.${value}`)} onChange={(value) => setAudience(value as CompanyType)} />
            <SelectField label={t("field.tier")} value={form.tier} options={form.audience === "CONTRACTOR" ? ["SUBSCRIPTION"] : ["PARTNER", "STANDARD"]} labelFor={(value) => t(`tier.${value}`)} onChange={(value) => setTier(value as PlanTier)} />
            <SelectField label={t("field.billingCycle")} value={form.billing_cycle} hint={t("hint.billingCycle")} options={["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]} labelFor={(value) => t(`billingCycle.${value}`)} onChange={(value) => setForm((current) => ({ ...current, billing_cycle: value as BillingCycle }))} />
            <TextField label={t("field.currency")} value={form.currency} onChange={(currency) => setForm((current) => ({ ...current, currency: currency.toUpperCase() }))} />
            <NumberField label={t("field.monthlyFee")} value={form.monthly_fee} disabled={form.tier === "PARTNER"} decimal onChange={(monthly_fee) => setForm((current) => ({ ...current, monthly_fee }))} />
            <NumberField label={t("field.yearlyFee")} value={form.yearly_fee} disabled={form.tier === "PARTNER"} decimal onChange={(yearly_fee) => setForm((current) => ({ ...current, yearly_fee }))} />
            <NumberField label={t("field.setupFee")} value={form.setup_fee} decimal hint={form.tier === "PARTNER" ? t("hint.partnerServiceFee") : undefined} onChange={(setup_fee) => setForm((current) => ({ ...current, setup_fee }))} />
            <NumberField label={t("field.trialDays")} value={form.trial_days} hint={t("hint.trialDays")} onChange={(trial_days) => setForm((current) => ({ ...current, trial_days: trial_days ?? 0 }))} />
            <NumberField label={t("field.maxUsers")} value={form.max_users} optional onChange={(max_users) => setForm((current) => ({ ...current, max_users }))} />
            <NumberField label={t("field.maxProjects")} value={form.max_projects} optional onChange={(max_projects) => setForm((current) => ({ ...current, max_projects }))} />
            <NumberField label={t("field.maxSites")} value={form.max_sites} optional disabled={form.audience !== "RECYCLER"} hint={form.audience === "RECYCLER" ? t("hint.maxSites") : t("hint.contractorNoSiteLimit")} onChange={(max_sites) => setForm((current) => ({ ...current, max_sites }))} />
            <NumberField label={t("field.maxScales")} value={form.max_scales} optional disabled={form.audience !== "RECYCLER"} hint={form.audience === "RECYCLER" ? t("hint.maxScales") : t("hint.contractorNoSiteLimit")} onChange={(max_scales) => setForm((current) => ({ ...current, max_scales }))} />
            <NumberField label={t("field.commissionRate")} value={form.commission_rate_override} optional decimal disabled={form.tier !== "PARTNER"} onChange={(commission_rate_override) => setForm((current) => ({ ...current, commission_rate_override }))} />
            <NumberField label={t("field.sortOrder")} value={form.sort_order} onChange={(sort_order) => setForm((current) => ({ ...current, sort_order }))} />
            <FieldWrapper label={t("field.features")} optional={common("optional")} className="md:col-span-2" hint={t("hint.features")}>
              <PlanFeatureChecklist
                value={form.feature_flags}
                choices={defaults.data?.feature_choices[form.audience] ?? []}
                alwaysOn={defaults.data?.always_on_features ?? []}
                onChange={(feature_flags) => setForm((current) => ({ ...current, feature_flags }))}
              />
            </FieldWrapper>
            <ToggleField label={t("field.commissionEnabled")} checked={form.earns_platform_commission} disabled={form.tier !== "PARTNER"} onChange={(earns_platform_commission) => setForm((current) => ({ ...current, earns_platform_commission }))} />
            <ToggleField label={t("field.externalIntegration")} hint={t("hint.externalIntegration")} checked={form.allows_external_integration} disabled={form.audience !== "RECYCLER"} onChange={(allows_external_integration) => setForm((current) => ({ ...current, allows_external_integration }))} />
            <ToggleField label={t("field.cloudWeighing")} checked={form.allows_cloud_weighing} disabled={form.audience === "RECYCLER"} onChange={(allows_cloud_weighing) => setForm((current) => ({ ...current, allows_cloud_weighing }))} />
            <ToggleField label={t("field.publicPlan")} hint={t("hint.publicPlan")} checked={form.is_public} onChange={(is_public) => setForm((current) => ({ ...current, is_public }))} />
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

function SelectField({ label, value, options, labelFor, onChange, disabled, hint }: { label: string; value: string; options: string[]; labelFor: (value: string) => string; onChange: (value: string) => void; disabled?: boolean; hint?: string }) {
  return (
    <FieldWrapper label={label} required hint={hint}>
      <select className="native-control" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{labelFor(option)}</option>)}
      </select>
    </FieldWrapper>
  );
}

function ToggleField({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * A package's fee in the list: the monthly fee, and for a package not billed
 * monthly also what one bill is (JB213 walk 11-17: 「MYR 300.00 每月」 on a 季付
 * package; an older reader expects the amount on the bill). A monthly
 * package reads exactly as before.
 */
export function PlanFee({ plan }: { plan: Pick<SubscriptionPlan, "currency" | "monthly_fee" | "yearly_fee" | "billing_cycle"> }) {
  const t = useTranslations("subscriptions");
  const bill = cycleBill(plan);
  return (
    <span className="inline-flex flex-col items-end" data-plan-fee>
      <span>{plan.currency} {plan.monthly_fee} {t("fee.monthly")}</span>
      {bill && (
        <span className="text-xs text-muted-foreground">
          {t("fee.perBill", {
            cycle: t(`billingCycle.${plan.billing_cycle}`),
            months: bill.months,
            currency: plan.currency,
            amount: bill.amount,
          })}
        </span>
      )}
    </span>
  );
}

/** 不公开 / 默认 / 试用 badges on a package row (JB213). */
export function PlanBadges({ plan }: { plan: Pick<SubscriptionPlan, "is_public" | "is_default" | "trial_days"> }) {
  const t = useTranslations("subscriptions");
  if (plan.is_public && !plan.is_default && !plan.trial_days) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {plan.is_default && <TypeBadge label={t("badge.default")} />}
      {!plan.is_public && <TypeBadge label={t("badge.hidden")} />}
      {plan.trial_days > 0 && <TypeBadge label={t("badge.trialDays", { days: plan.trial_days })} />}
    </div>
  );
}

/**
 * 功能 as a checklist of the audience's own menus (JB213, 4.2.1 「功能权限」).
 *
 * Nothing ticked is every feature, as before. The menus every package keeps
 * show ticked and grey. A key typed as free text before this was a checklist
 * is listed as kept-but-unused rather than dropped.
 */
export function PlanFeatureChecklist({
  value,
  choices,
  alwaysOn,
  onChange,
}: {
  value: string[];
  choices: string[];
  alwaysOn: string[];
  onChange: (value: string[]) => void;
}) {
  const t = useTranslations();
  const fixed = new Set(alwaysOn);
  const { checked, legacy } = featureListParts(value, choices);
  const ticked = new Set(checked);
  const open = checked.length === 0;
  const label = (key: string) =>
    t.has(`subscriptions.featureName.${key}`)
      ? t(`subscriptions.featureName.${key}`)
      : t.has(`nav.${key}`)
        ? t(`nav.${key}`)
        : key;
  return (
    <div className="space-y-2" data-feature-checklist>
      <p className="text-xs font-medium">
        {open ? t("subscriptions.plans.featuresAll") : t("subscriptions.plans.featuresCount", { count: checked.length })}
      </p>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {choices.map((key) => {
          const always = fixed.has(key);
          return (
            <label key={key} className="flex items-center gap-2 text-sm" data-feature={key} data-always={always || undefined}>
              <Checkbox
                checked={always || ticked.has(key)}
                disabled={always}
                onCheckedChange={(next) => onChange(toggleFeature(value, key, next === true, choices))}
              />
              <span className={always ? "text-muted-foreground" : undefined}>{label(key)}</span>
            </label>
          );
        })}
      </div>
      {legacy.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("subscriptions.plans.legacyFeatures", { keys: legacy.join(", ") })}
        </p>
      )}
    </div>
  );
}
