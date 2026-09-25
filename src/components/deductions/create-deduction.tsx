"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  SelectField,
  TextAreaField,
  TextField,
  type BoundField,
} from "@/components/shared/form-fields";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import {
  FormSection,
  FormShell,
  applyServerErrors,
  minLength,
  required,
} from "@/components/shared/form-shell";
import { ApiError } from "@/interfaces/api";
import {
  DEDUCTION_KINDS,
  type DeductionKind,
  type DeductionPayload,
} from "@/interfaces/recycler";
import { createDeduction, getIncoming } from "@/services/recycler.service";
import { getSites } from "@/services/weighing.service";

/**
 * Recording what the inspection found.
 *
 * The reason field is the one that matters. A deduction is a claim against
 * somebody else's money, and it will be read months later by a person who was
 * not standing at the tipping face — so a minimum length is enforced here and
 * again on the server. "Wet" is not a reason anyone can act on.
 */
export function CreateDeduction() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  // Arrived here from the weighing screen: the operator has already told us
  // which load they are standing in front of, so do not make them find it in a
  // list of a hundred.
  const presetDispatch = useSearchParams().get("dispatch") ?? "";

  const loads = useQuery({
    queryKey: ["incoming", "options", "collected"],
    // Both states, because the inspection that finds contamination
    // happens on either side of the weighbridge. Asking for COLLECTED alone
    // hid every load that had already been weighed - which is most of the
    // ones an operator actually wants.
    queryFn: () =>
      getIncoming({ page_size: 100, state: "COLLECTED,WEIGHED" }),
  });
  const sites = useQuery({
    queryKey: ["sites", "options"],
    queryFn: () => getSites({ page_size: 100 }),
  });

  const mutation = useMutation({
    mutationFn: (values: DeductionPayload) => createDeduction(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deductions"] });
      router.push("/deductions");
    },
  });

  const form = useForm({
    defaultValues: {
      dispatch: presetDispatch,
      site: "",
      kind: "MOISTURE" as DeductionKind,
      weight_kg: "",
      reason: "",
      inspected_by_name: "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await mutation.mutateAsync(value);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.isValidation) {
            const leftover = applyServerErrors(
              error.errors,
              form as unknown as Parameters<typeof applyServerErrors>[1],
            );
            if (leftover.length > 0) setFormError(leftover[0]);
          } else {
            setFormError(error.message);
          }
        }
      }
    },
  });

  return (
    <FormShell
      backHref="/deductions"
      backLabel={t("deductions.title")}
      title={t("deductions.createTitle")}
      isSubmitting={mutation.isPending}
      submitLabel={t("common.create")}
      submitIcon={Plus}
      onSubmit={() => void form.handleSubmit()}
    >
      <FormSection title={t("deductions.section.load")}>
        <form.Field
          name="dispatch"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <div className="space-y-1">
              <SelectField
                field={field as unknown as BoundField}
                label={t("deductions.field.dispatchNo")}
                required
                options={(loads.data?.results ?? []).map((load) => ({
                  value: load.id,
                  label: `${load.dispatch_no} — ${load.project_name}`,
                }))}
              />
              <QueryFailedNote query={loads} what={t("deductions.what.loads")} />
            </div>
          )}
        </form.Field>

        <form.Field
          name="site"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <div className="space-y-1">
              <SelectField
                field={field as unknown as BoundField}
                label={t("deductions.field.site")}
                required
                options={(sites.data?.results ?? []).map((site) => ({
                  value: site.id,
                  label: `${site.code} — ${site.name}`,
                }))}
              />
              <QueryFailedNote query={sites} what={t("deductions.what.sites")} />
            </div>
          )}
        </form.Field>
      </FormSection>

      <FormSection title={t("deductions.section.claim")}>
        <form.Field name="kind">
          {(field) => (
            <SelectField
              field={field as unknown as BoundField}
              label={t("deductions.field.kind")}
              required
              options={DEDUCTION_KINDS.map((kind) => ({
                value: kind,
                label: t(`deductions.kind.${kind}`),
              }))}
            />
          )}
        </form.Field>

        <form.Field
          name="weight_kg"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("deductions.field.weightKg")}
              type="number"
              required
              hint={t("deductions.thresholdNote", { threshold: 300 })}
            />
          )}
        </form.Field>

        <form.Field
          name="reason"
          validators={{
            onSubmit: minLength(10, t("deductions.reasonHint")),
          }}
        >
          {(field) => (
            <TextAreaField
              field={field as unknown as BoundField}
              label={t("deductions.field.reason")}
              required
              rows={4}
              className="md:col-span-2"
            />
          )}
        </form.Field>

        <form.Field
          name="inspected_by_name"
          validators={{ onSubmit: required(t("validation.required")) }}
        >
          {(field) => (
            <TextField
              field={field as unknown as BoundField}
              label={t("deductions.field.inspectedBy")}
              required
            />
          )}
        </form.Field>

        <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("deductions.photoNote")}
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
