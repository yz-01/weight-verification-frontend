"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  EmptyState,
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("rules.count", { count: rows.length })}
        </p>
        {can("commission.manage") && (
          <Button onClick={() => openEditor(null)}>
            <Plus className="h-4 w-4" />
            {t("rules.create")}
          </Button>
        )}
      </div>
      <div className="surface-panel min-h-0 overflow-hidden rounded-xl">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <TableHead>{t("field.name")}</TableHead>
              <TableHead>{t("field.calculationBasis")}</TableHead>
              <TableHead className="text-right tabular">{t("field.rate")}</TableHead>
              <TableHead>{t("field.settlementCycle")}</TableHead>
              <TableHead>{t("field.effectivePeriod")}</TableHead>
              <TableHead className="text-right tabular">{t("field.paymentTerm")}</TableHead>
              <TableHead className="text-right tabular">{t("field.invoices")}</TableHead>
              <TableHead>{t("field.state")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{common("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.isError ? (
              <TableRow>
                <TableCell colSpan={9} className="p-4">
                  <LoadFailed onRetry={() => void rules.refetch()} />
                </TableCell>
              </TableRow>
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
                <TableCell colSpan={9} className="p-4">
                  <EmptyState
                    icon={FileText}
                    title={t("rules.empty")}
                    description={t("rules.emptyHint")}
                    className="border-0"
                    action={can("commission.manage") && (
                      <Button variant="outline" onClick={() => openEditor(null)}>
                        <Plus className="size-4" />
                        {t("rules.create")}
                      </Button>
                    )}
                  />
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
                  <TableCell className="text-right tabular">
                    <span className="tabular text-sm font-medium text-foreground">
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
                    <span className="tabular whitespace-nowrap text-sm text-muted-foreground">
                      {df.date(rule.effective_from)} -{" "}
                      {rule.effective_to
                        ? df.date(rule.effective_to)
                        : t("rules.openEnded")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular text-sm text-muted-foreground">
                    {t("rules.days", { count: rule.payment_term_days })}
                  </TableCell>
                  <TableCell className="text-right tabular text-sm font-medium text-foreground">
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
                    <div className="flex items-center justify-end gap-0.5">
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
        <DialogContent className="flex flex-col overflow-hidden sm:max-w-2xl">
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
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
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
            <p className="shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
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
        className="native-control"
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
