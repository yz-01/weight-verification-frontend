"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  CommissionRule,
  CommissionRulePayload,
} from "@/interfaces/billing";
import { useDateFormat } from "@/lib/dates";
import {
  createCommissionRule,
  deleteCommissionRule,
  getCommissionRules,
  updateCommissionRule,
} from "@/services/billing.service";

const EMPTY: CommissionRulePayload = {
  name: "",
  basis: "SETTLED_AMOUNT",
  rate: "0.000",
  cycle: "MONTHLY",
  payment_term_days: 30,
  minimum_amount: "0.00",
  maximum_amount: null,
  effective_from: "",
  effective_to: null,
  notes: "",
  is_active: true,
};

export function CommissionRuleManager() {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CommissionRule | null | undefined>();
  const [removing, setRemoving] = useState<CommissionRule | null>(null);
  const [form, setForm] = useState<CommissionRulePayload>(EMPTY);

  const rules = useQuery({
    queryKey: ["billing", "commission-rules"],
    queryFn: () => getCommissionRules({ page_size: 100, defaults_only: true }),
  });
  const save = useMutation({
    mutationFn: () =>
      editing
        ? updateCommissionRule(editing.id, form)
        : createCommissionRule(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      setEditing(undefined);
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteCommissionRule(removing!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      setRemoving(null);
    },
  });

  function openEditor(rule: CommissionRule | null) {
    setEditing(rule);
    setForm(
      rule
        ? {
            name: rule.name,
            basis: rule.basis,
            rate: rule.rate,
            cycle: rule.cycle,
            payment_term_days: rule.payment_term_days,
            minimum_amount: rule.minimum_amount,
            maximum_amount: rule.maximum_amount,
            effective_from: rule.effective_from,
            effective_to: rule.effective_to,
            notes: rule.notes,
            is_active: rule.is_active,
          }
        : { ...EMPTY },
    );
  }

  const rows = rules.data?.results ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("rules.count", { count: rows.length })}
        </p>
        {can("commission.manage") && (
          <Button size="sm" onClick={() => openEditor(null)}>
            <Plus className="h-4 w-4" />
            {t("rules.create")}
          </Button>
        )}
      </div>
      <div className="min-h-0 overflow-x-auto rounded-lg border bg-card [scrollbar-gutter:stable]">
        <table className="min-w-max text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-3">{t("field.name")}</th>
              <th className="px-4 py-3">{t("field.calculationBasis")}</th>
              <th className="px-4 py-3">{t("field.rate")}</th>
              <th className="px-4 py-3">{t("field.settlementCycle")}</th>
              <th className="px-4 py-3">{t("field.effectivePeriod")}</th>
              <th className="px-4 py-3">{t("field.paymentTerm")}</th>
              <th className="px-4 py-3">{t("field.invoices")}</th>
              <th className="px-4 py-3">{t("field.state")}</th>
              <th className="px-4 py-3">
                <span className="sr-only">{common("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8">
                  {common("loading")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-muted-foreground">
                  {t("rules.empty")}
                </td>
              </tr>
            ) : (
              rows.map((rule) => (
                <tr key={rule.id} className="border-b">
                  <td className="px-4 py-3 font-medium">{rule.name}</td>
                  <td className="px-4 py-3">{t(`basis.${rule.basis}`)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {rule.rate}
                    {rule.basis === "SETTLED_AMOUNT"
                      ? "%"
                      : ` ${t("rules.perTonne")}`}
                  </td>
                  <td className="px-4 py-3">{t(`cycle.${rule.cycle}`)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {df.date(rule.effective_from)} -{" "}
                    {rule.effective_to
                      ? df.date(rule.effective_to)
                      : t("rules.openEnded")}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {t("rules.days", { count: rule.payment_term_days })}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {rule.invoice_count}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={t(
                        rule.is_active
                          ? "ruleState.active"
                          : "ruleState.inactive",
                      )}
                      tone={rule.is_active ? "positive" : "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {can("commission.manage") && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={common("edit")}
                            onClick={() => openEditor(rule)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={common("remove")}
                            disabled={rule.invoice_count > 0}
                            onClick={() => setRemoving(rule)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {t(editing ? "rules.edit" : "rules.create")}
            </DialogTitle>
            <DialogDescription>{t("rules.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-2 pr-2 [scrollbar-gutter:stable] sm:grid-cols-2">
            <FieldWrapper
              label={t("field.name")}
              required
              className="sm:col-span-2"
            >
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FieldWrapper>
            <SelectField
              label={t("field.calculationBasis")}
              value={form.basis}
              options={["SETTLED_AMOUNT", "SETTLED_WEIGHT"]}
              render={(value) => t(`basis.${value}`)}
              onChange={(basis) =>
                setForm((current) => ({
                  ...current,
                  basis: basis as CommissionRulePayload["basis"],
                }))
              }
            />
            <FieldWrapper label={t("field.rate")} required>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={form.rate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rate: event.target.value,
                  }))
                }
              />
            </FieldWrapper>
            <SelectField
              label={t("field.settlementCycle")}
              value={form.cycle}
              options={["MONTHLY", "QUARTERLY", "YEARLY"]}
              render={(value) => t(`cycle.${value}`)}
              onChange={(cycle) =>
                setForm((current) => ({
                  ...current,
                  cycle: cycle as CommissionRulePayload["cycle"],
                }))
              }
            />
            <FieldWrapper label={t("field.paymentTerm")} required>
              <Input
                type="number"
                min="1"
                value={form.payment_term_days}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    payment_term_days: Number(event.target.value),
                  }))
                }
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.minimumAmount")} required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.minimum_amount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    minimum_amount: event.target.value,
                  }))
                }
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("field.maximumAmount")}
              optional={common("optional")}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.maximum_amount ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maximum_amount: event.target.value || null,
                  }))
                }
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.effectiveFrom")} required>
              <Input
                type="date"
                value={form.effective_from}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    effective_from: event.target.value,
                  }))
                }
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("field.effectiveTo")}
              optional={common("optional")}
            >
              <Input
                type="date"
                value={form.effective_to ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    effective_to: event.target.value || null,
                  }))
                }
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("field.notes")}
              optional={common("optional")}
              className="sm:col-span-2"
            >
              <Textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </FieldWrapper>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
              <span className="text-sm font-medium">
                {t("field.activeRule")}
              </span>
              <Switch
                checked={form.is_active}
                onCheckedChange={(is_active) =>
                  setForm((current) => ({ ...current, is_active }))
                }
              />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setEditing(undefined)}>
              {common("cancel")}
            </Button>
            <Button
              disabled={
                !form.name.trim() || !form.effective_from || save.isPending
              }
              onClick={() => save.mutate()}
            >
              {common("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rules.removeTitle")}</DialogTitle>
            <DialogDescription>
              {t("rules.removeDescription", { name: removing?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {common("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {common("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  render,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  render: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldWrapper label={label} required>
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {render(option)}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
