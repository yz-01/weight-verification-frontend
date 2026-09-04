"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Info, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/shared/form-fields";
import { FormSection, FormShell } from "@/components/shared/form-shell";
import { ApiError } from "@/interfaces/api";
import {
  getIncoming,
  getSettlementQuote,
  issueSettlement,
} from "@/services/recycler.service";

/**
 * Turning a finished weighing into an amount owed.
 *
 * The working is on screen before anything is committed: net weight from the
 * bridge, less the deductions both sides agreed, times the price per tonne.
 * This is the number the two companies will argue about afterwards, so showing
 * only the total would be inviting exactly that argument.
 *
 * The load list is the yard's own order book narrowed to what has actually
 * been weighed. Offering everything and refusing on submit teaches people to
 * guess.
 *
 * Written from plain state rather than TanStack Form: there are two inputs and
 * the interesting behaviour is the quote that re-reads as the price is typed.
 */
export function CreateSettlement() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [dispatch, setDispatch] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: loadPage } = useQuery({
    queryKey: ["incoming", "weighed"],
    queryFn: () => getIncoming({ page_size: 100, state: "WEIGHED" }),
  });

  // The endpoint writes nothing, and both sides are entitled to see the figure
  // before anyone commits to it.
  const { data: quote } = useQuery({
    queryKey: ["settlements", "quote", dispatch, unitPrice],
    queryFn: () => getSettlementQuote(dispatch, unitPrice || undefined),
    enabled: Boolean(dispatch),
  });

  const issue = useMutation({
    mutationFn: () =>
      issueSettlement({ dispatch, unit_price: unitPrice, notes: notes.trim() }),
    onSuccess: (settlement) => {
      void queryClient.invalidateQueries({ queryKey: ["settlements"] });
      router.push(`/settlements/${settlement.id}`);
    },
  });

  const openDeductions = quote?.open_deductions ?? 0;
  const hasWeighing = quote?.net_weight_kg !== null;

  const submit = () => {
    setFormError(null);
    if (!dispatch) {
      setFormError(t("settlements.issue.pickLoad"));
      return;
    }
    if (!(Number(unitPrice) > 0)) {
      setFormError(t("validation.required"));
      return;
    }
    issue.mutate(undefined, {
      onError: (error) => {
        if (error instanceof ApiError) {
          const message = error.errors.unit_price ?? error.message;
          setFormError(message);
          toast.error(message);
        }
      },
    });
  };

  return (
    <FormShell
      backHref="/settlements"
      backLabel={t("settlements.title")}
      title={t("settlements.new")}
      isSubmitting={issue.isPending}
      submitLabel={t("settlements.issue.confirm")}
      submitIcon={FileCheck2}
      onSubmit={submit}
    >
      <FormSection title={t("settlements.section.load")}>
        <SelectField
          field={{
            name: "dispatch",
            state: { value: dispatch, meta: { errors: [] } },
            handleChange: setDispatch,
            handleBlur: () => undefined,
          }}
          label={t("settlements.field.dispatchNo")}
          required
          hint={t("settlements.issue.loadHint")}
          options={(loadPage?.results ?? []).map((load) => ({
            value: load.id,
            label: `${load.dispatch_no} — ${load.project_name}`,
          }))}
        />

        <TextField
          field={{
            name: "unit_price",
            state: { value: unitPrice, meta: { errors: [] } },
            handleChange: setUnitPrice,
            handleBlur: () => undefined,
          }}
          label={t("settlements.field.unitPrice")}
          type="number"
          required
          placeholder="150.00"
        />

        <TextAreaField
          field={{
            name: "notes",
            state: { value: notes, meta: { errors: [] } },
            handleChange: setNotes,
            handleBlur: () => undefined,
          }}
          label={t("settlements.field.notes")}
          optional
          className="md:col-span-2"
        />
      </FormSection>

      <FormSection title={t("settlements.quote.title")}>
        {!dispatch ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground md:col-span-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {t("settlements.issue.pickLoad")}
          </p>
        ) : (
          <div className="space-y-1 rounded-xl border bg-card px-5 py-4 md:col-span-2">
            <WorkingRow
              label={t("settlements.field.netWeight")}
              value={quote?.net_weight_kg}
              hint={quote?.session_no ?? undefined}
            />
            <WorkingRow
              label={t("settlements.field.deductionWeight")}
              value={
                quote?.deduction_weight_kg
                  ? `−${quote.deduction_weight_kg}`
                  : undefined
              }
            />
            <div className="border-t pt-2">
              <WorkingRow
                label={t("settlements.field.settledWeight")}
                value={quote?.settled_weight_kg}
                strong
              />
            </div>
            <div className="border-t pt-2">
              <WorkingRow
                label={t("settlements.field.totalAmount")}
                value={quote?.total_amount}
                strong
              />
            </div>
          </div>
        )}

        {/*
          An unanswered claim means the producer has been asked to agree to
          something and has not. Settling over the top of it would make the
          approval step decorative — the server refuses, and so does the button.
        */}
        {dispatch && openDeductions > 0 && (
          <Warning
            text={t("settlements.issue.blockedByDeductions", {
              count: openDeductions,
            })}
          />
        )}

        {dispatch && !hasWeighing && (
          <Warning text={t("settlements.issue.blockedByWeighing")} />
        )}

        <p className="text-xs text-muted-foreground md:col-span-2">
          {t("settlements.issue.description")}
        </p>

        {formError && (
          <p className="text-sm font-medium text-destructive md:col-span-2">
            {formError}
          </p>
        )}
      </FormSection>
    </FormShell>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-900 md:col-span-2 dark:text-amber-200">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}

function WorkingRow({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value?: string | null;
  hint?: string;
  strong?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground">
        {label}
        {hint && <span className="tabular ml-2 text-xs">{hint}</span>}
      </span>
      <span
        className={
          strong
            ? "tabular text-base font-semibold text-foreground"
            : "tabular text-sm text-foreground"
        }
      >
        {value ?? t("common.emptyValue")}
      </span>
    </div>
  );
}
