"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
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
import { localToday } from "@/lib/local-date";
import {
  createCommissionRule,
  deleteCommissionRule,
  getCommissionRules,
  getPlatformDefaultCommission,
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

function toPayload(rule: CommissionRule): CommissionRulePayload {
  return {
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
  };
}

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
    onSuccess: () => {
      // Close first; the list refreshes behind it rather than holding the dialog open.
      setEditing(undefined);
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteCommissionRule(removing!.id),
    onSuccess: () => {
      // Close first; the list refreshes behind it rather than holding the dialog open.
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });

  function openEditor(rule: CommissionRule | null) {
    setEditing(rule);
    setForm(rule ? toPayload(rule) : { ...EMPTY });
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

      <CommissionRuleDialog
        open={editing !== undefined}
        title={t(editing ? "rules.edit" : "rules.create")}
        form={form}
        setForm={setForm}
        saving={save.isPending}
        saveFailed={save.isError}
        onSave={() => save.mutate()}
        onClose={() => setEditing(undefined)}
      />

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

/**
 * The 5.2.6 rule form. 11.2.3 佣金设置 opens the same one to add the next
 * version of the platform default (JB212-4, Lucas 11-16 「把它们真的做出来」),
 * so there is one form for the rule bills use, not two.
 */
function CommissionRuleDialog({
  open,
  title,
  notice,
  form,
  setForm,
  saving,
  saveFailed,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  /** A line above the fields, e.g. what saving a new version does. */
  notice?: string;
  form: CommissionRulePayload;
  setForm: React.Dispatch<React.SetStateAction<CommissionRulePayload>>;
  saving: boolean;
  saveFailed: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("rules.description")}</DialogDescription>
        </DialogHeader>
        {notice && (
          <p className="shrink-0 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            {notice}
          </p>
        )}
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
        {saveFailed && (
          <p className="shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {t("rules.saveError")}
          </p>
        )}
        <DialogFooter className="relative z-10 shrink-0">
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            requires={[
              [form.name.trim(), t("field.name")],
              [form.effective_from, t("field.effectiveFrom")],
            ]}
            disabled={saving}
            onClick={onSave}
          >
            {common("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The 11.2.3 card's query, shared with the screen test. */
export const PLATFORM_DEFAULT_COMMISSION_KEY = [
  "billing",
  "commission-platform-default",
] as const;

/**
 * 11.2.3 佣金设置 (JB212-4, Lucas 11-16 「把它们真的做出来」): [SA p.15]
 * 「平台佣金比例、佣金计算方式、结算周期、生效日期。所有回收商统一采用平台设定。」
 *
 * Those four things are the platform default rule that commission bills are
 * raised under, so this card shows that rule - the one in force today and
 * the next version if one is scheduled - instead of four boxes nothing read.
 * 「修改」 adds a new version through the 5.2.6 form; bills already issued
 * keep their figures (billing design: frozen at issue).
 */
export function PlatformDefaultCommissionCard() {
  const t = useTranslations("adminSystemSettings");
  const billing = useTranslations("billing");
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CommissionRulePayload>(EMPTY);
  const current = useQuery({
    queryKey: PLATFORM_DEFAULT_COMMISSION_KEY,
    queryFn: getPlatformDefaultCommission,
  });
  const save = useMutation({
    mutationFn: () => createCommissionRule(form),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
  const inForce = current.data?.in_force ?? null;
  const next = current.data?.next ?? null;
  const rate = (rule: CommissionRule) =>
    rule.basis === "SETTLED_AMOUNT"
      ? `${rule.rate}%`
      : `${rule.rate} ${billing("rules.perTonne")}`;

  function openNewVersion() {
    // A new version, never an edit: the rule in force has billed under its
    // numbers, and those bills must keep saying what they were raised under.
    setForm(
      inForce
        ? { ...toPayload(inForce), effective_from: localToday(), effective_to: null, is_active: true }
        : { ...EMPTY, name: t("commissionCard.title"), effective_from: localToday() },
    );
    setOpen(true);
  }

  return (
    <div
      data-commission-card="platform-default"
      className="border-b bg-muted/15 px-4 py-4 sm:px-6 sm:py-6"
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <p className="panel-title">{t("commissionCard.title")}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t("commissionCard.description")}
          </p>
        </div>
        {current.isError ? (
          <LoadFailed
            what={t("commissionCard.what")}
            onRetry={() => void current.refetch()}
          />
        ) : current.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <>
            {current.data?.commission_enabled === false && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                {t("commissionCard.switchedOff")}
              </p>
            )}
            {inForce ? (
              <dl className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-4 sm:divide-x">
                {[
                  [t("commissionCard.rate"), rate(inForce)],
                  [t("commissionCard.basis"), billing(`basis.${inForce.basis}`)],
                  [t("commissionCard.cycle"), billing(`cycle.${inForce.cycle}`)],
                  [t("commissionCard.effectiveFrom"), df.date(inForce.effective_from)],
                ].map(([label, value]) => (
                  <div key={label} className="border-b px-4 py-3 last:border-b-0 sm:border-b-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-base font-semibold tabular">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="rounded-lg border bg-card p-3 text-sm">
                {t("commissionCard.none")}
              </p>
            )}
            {next && (
              <p className="text-sm">
                {t("commissionCard.next", {
                  date: df.date(next.effective_from),
                  rate: rate(next),
                })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {can("commission.manage") && (
                <Button onClick={openNewVersion}>
                  <Pencil />
                  {inForce ? t("commissionCard.change") : t("commissionCard.set")}
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/billing/commission-rules">
                  <FileText />
                  {t("commissionCard.allVersions")}
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
      <CommissionRuleDialog
        open={open}
        title={t("commissionCard.dialogTitle")}
        notice={
          inForce ? t("commissionCard.dialogNotice") : t("commissionCard.firstWarning")
        }
        form={form}
        setForm={setForm}
        saving={save.isPending}
        saveFailed={save.isError}
        onSave={() => save.mutate()}
        onClose={() => setOpen(false)}
      />
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
