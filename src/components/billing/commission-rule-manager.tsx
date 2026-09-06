"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  FieldWrapper,
  LoadFailed,
  StatusBadge,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <div className="min-h-0 overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <TableHead>{t("field.name")}</TableHead>
              <TableHead>{t("field.calculationBasis")}</TableHead>
              <TableHead className="text-right">{t("field.rate")}</TableHead>
              <TableHead>{t("field.settlementCycle")}</TableHead>
              <TableHead>{t("field.effectivePeriod")}</TableHead>
              <TableHead className="text-right">{t("field.paymentTerm")}</TableHead>
              <TableHead className="text-right">{t("field.invoices")}</TableHead>
              <TableHead>{t("field.state")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{common("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.isError ? (
              <LoadFailed onRetry={() => void rules.refetch()} />
            ) : rules.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-sm text-muted-foreground">{common("loading")}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="px-4 py-16">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{t("rules.empty")}</p>
                      <p className="text-sm text-muted-foreground">{t("rules.emptyHint")}</p>
                    </div>
                    {can("commission.manage") && (
                      <Button size="sm" variant="outline" onClick={() => openEditor(null)}>
                        <Plus className="h-4 w-4" />
                        {t("rules.create")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((rule) => (
                <TableRow key={rule.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <span className="font-medium text-foreground">{rule.name}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t(`basis.${rule.basis}`)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {rule.rate}
                      {rule.basis === "SETTLED_AMOUNT"
                        ? "%"
                        : ` ${t("rules.perTonne")}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t(`cycle.${rule.cycle}`)}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-muted-foreground whitespace-nowrap">
                      {df.date(rule.effective_from)} -{" "}
                      {rule.effective_to
                        ? df.date(rule.effective_to)
                        : t("rules.openEnded")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {t("rules.days", { count: rule.payment_term_days })}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium text-foreground">
                    {rule.invoice_count}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t(
                        rule.is_active
                          ? "ruleState.active"
                          : "ruleState.inactive",
                      )}
                      tone={rule.is_active ? "positive" : "neutral"}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {can("commission.manage") && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={common("edit")}
                            onClick={() => openEditor(rule)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={common("remove")}
                            disabledReason={
                              rule.invoice_count > 0
                                ? t("rules.hasInvoices")
                                : undefined
                            }
                            disabled={rule.invoice_count > 0}
                            onClick={() => setRemoving(rule)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {t(editing ? "rules.edit" : "rules.create")}
            </DialogTitle>
            <DialogDescription>{t("rules.description")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 pr-2 [scrollbar-gutter:stable]">
            <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
          {save.isError && (
            <p className="shrink-0 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {t("rules.saveError")}
            </p>
          )}
          <DialogFooter className="relative z-10 shrink-0">
            <Button variant="outline" onClick={() => setEditing(undefined)}>
              {common("cancel")}
            </Button>
            <Button
              requires={[
                [form.name.trim(), t("field.name")],
                [form.effective_from, t("field.effectiveFrom")],
              ]}
              disabled={save.isPending}
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
