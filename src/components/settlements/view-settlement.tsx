"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Info, Lock, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FormSection,
  FormSkeleton,
  LoadErrorCard,
} from "@/components/shared/form-shell";
import {
  DetailHeader,
  FieldWrapper,
  ReadField,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { SETTLEMENT_STATE_TONE } from "@/components/settlements/settlements";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS, type PaymentMethod } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import {
  getSettlement,
  lockSettlement,
  recordPayment,
} from "@/services/recycler.service";

/**
 * One load's money, from both ends.
 *
 * The producer reads this; the recycler acts on it. The weights come first and
 * the arithmetic is shown rather than just the answer — net, less deductions,
 * equals settled — because this is the number the two companies will argue
 * about, and an unexplained total invites exactly that argument.
 */
export function ViewSettlement({ id }: { id: string }) {
  const t = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [locking, setLocking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settlements", "detail", id],
    queryFn: () => getSettlement(id),
  });

  const lock = useMutation({
    mutationFn: () => lockSettlement(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settlements"] });
      setLocking(false);
      setReason("");
    },
  });

  if (isLoading) return <FormSkeleton sections={4} />;
  if (isError || !data) {
    return (
      <LoadErrorCard
        backHref="/settlements"
        backLabel={t("settlements.title")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <DetailHeader
        backHref="/settlements"
        backLabel={t("settlements.title")}
        action={
          can("settlement.lock") && data.state === "ISSUED" ? (
            <Button
              size="sm"
              className="rounded-full px-4 shadow-sm"
              onClick={() => setLocking(true)}
            >
              <Lock className="h-4 w-4" />
              {t("settlements.lock.confirm")}
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <h2 className="tabular text-base font-semibold text-foreground">
            {data.settlement_no}
          </h2>
          <StatusBadge
            label={t(`settlements.state.${data.state}`)}
            tone={SETTLEMENT_STATE_TONE[data.state]}
          />
          <TypeBadge label={t(`dispatches.wasteType.${data.waste_type}`)} />
          <span className="tabular ml-auto text-lg font-semibold text-foreground">
            {data.currency} {data.total_amount ?? "—"}
          </span>
        </div>

        <p className="flex items-start gap-2 border-t bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("settlements.frozenNote")}
        </p>

        <div className="divide-y border-t">
          <FormSection title={t("settlements.section.load")}>
            <ReadField
              label={t("settlements.field.dispatchNo")}
              value={data.dispatch_no}
            />
            <ReadField
              label={t("settlements.field.sessionNo")}
              value={data.session_no}
            />
            <ReadField
              label={t("settlements.field.contractor")}
              value={data.contractor_name}
            />
            <ReadField
              label={t("settlements.field.recycler")}
              value={data.recycler_name}
            />
            <ReadField
              label={t("settlements.field.project")}
              value={data.project_name}
              className="md:col-span-2"
            />
          </FormSection>

          {/* The arithmetic, shown rather than asserted. */}
          <section className="px-6 py-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("settlements.section.weights")}
            </h3>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <Figure
                label={t("settlements.field.netWeight")}
                value={data.net_weight_kg}
              />
              <Minus className="mb-2 h-4 w-4 text-muted-foreground" />
              <Figure
                label={t("settlements.field.deductionWeight")}
                value={data.deduction_weight_kg}
              />
              <span className="mb-2 text-lg text-muted-foreground">=</span>
              <Figure
                label={t("settlements.field.settledWeight")}
                value={data.settled_weight_kg}
                emphasis
              />
            </div>
          </section>

          <FormSection title={t("settlements.section.money")}>
            <ReadField
              label={t("settlements.field.unitPrice")}
              value={data.unit_price}
            />
            <ReadField
              label={t("settlements.field.totalAmount")}
              value={
                data.total_amount
                  ? `${data.currency} ${data.total_amount}`
                  : null
              }
            />
            <ReadField
              label={t("settlements.field.amountPaid")}
              value={data.amount_paid}
            />
            <ReadField
              label={t("settlements.field.outstanding")}
              value={data.outstanding}
            />
            <ReadField
              label={t("settlements.field.issuedAt")}
              value={data.issued_at ? df.dateTime(data.issued_at) : null}
            />
            <ReadField
              label={t("settlements.field.lockedAt")}
              value={data.locked_at ? df.dateTime(data.locked_at) : null}
            />
            <ReadField
              label={t("settlements.field.notes")}
              value={data.notes}
              className="md:col-span-2"
            />
          </FormSection>

          <section className="px-6 py-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("settlements.section.payments")}
              </h3>
              {can("payment.create") && data.state !== "DRAFT" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full px-4"
                  onClick={() => setPaying(true)}
                >
                  <Banknote className="h-3.5 w-3.5" />
                  {t("settlements.payment.confirm")}
                </Button>
              )}
            </div>

            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settlements.payment.none")}
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {data.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <span className="tabular font-medium text-foreground">
                      {data.currency} {payment.amount}
                    </span>
                    <TypeBadge
                      label={t(`settlements.method.${payment.method}`)}
                    />
                    <span className="tabular text-sm text-muted-foreground">
                      {df.date(payment.paid_on)}
                    </span>
                    {payment.reference && (
                      <span className="tabular ml-auto text-xs text-muted-foreground">
                        {payment.reference}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {locking && (
        <ConfirmDialog
          open
          onOpenChange={() => {
            setLocking(false);
            setReason("");
          }}
          title={t("settlements.lock.title")}
          description={t("settlements.lock.description")}
          confirmLabel={t("settlements.lock.confirm")}
          confirmIcon={Lock}
          variant="default"
          isPending={lock.isPending}
          reason={reason}
          onReasonChange={setReason}
          reasonRequired
          onConfirm={() => lock.mutate()}
        />
      )}

      {paying && (
        <PaymentDialog
          settlementId={id}
          currency={data.currency}
          outstanding={data.outstanding}
          onClose={() => setPaying(false)}
        />
      )}
    </div>
  );
}

/** One number in the settled-weight equation. */
function Figure({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={
          emphasis
            ? "tabular text-2xl font-semibold text-foreground"
            : "tabular text-xl text-muted-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function PaymentDialog({
  settlementId,
  currency,
  outstanding,
  onClose,
}: {
  settlementId: string;
  currency: string;
  outstanding: string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // Pre-filled with what is still owed: paying the balance is the common case,
  // and a wrong number typed from memory is worse than one that was offered.
  const [amount, setAmount] = useState(outstanding ?? "");
  const [paidOn, setPaidOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");

  const record = useMutation({
    mutationFn: () =>
      recordPayment(settlementId, {
        amount,
        paid_on: paidOn,
        method,
        reference: reference.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settlements"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{t("settlements.payment.title")}</DialogTitle>
          <DialogDescription>
            {t("settlements.payment.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldWrapper
            label={`${t("settlements.payment.amount")} (${currency})`}
            required
          >
            <Input
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FieldWrapper>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("settlements.payment.paidOn")}
            </Label>
            <Input
              type="date"
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("settlements.payment.method")}
            </Label>
            <Select
              value={method}
              onValueChange={(value) => setMethod(value as PaymentMethod)}
            >
              <SelectTrigger className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`settlements.method.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("settlements.payment.reference")}
            </Label>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            className="rounded-full px-4 shadow-sm"
            requires={[[amount, t("settlements.payment.amount")]]}
            disabled={record.isPending}
            onClick={() => record.mutate()}
          >
            <Banknote className="h-4 w-4" />
            {t("settlements.payment.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
