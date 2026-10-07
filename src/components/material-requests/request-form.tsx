"use client";

/**
 * + New Request (C01, C02): Material Request or Other Request, one form.
 *
 * A material request is the electronic form - material and specification
 * from the back office's lists (the specification narrows to the chosen
 * material), a quantity above zero with at most two decimals, a unit, an
 * optional long remark and any number of attachments. An other request is a
 * file and a remark and nothing else (C07). The project is the current one:
 * on the phone it is the project the worker is on, in the office it is the
 * list's project filter when there is one.
 *
 * 「提交给」 (D2, Q15) names the one person who approves it: only people who
 * can approve on this project, never the applicant, and chosen for them when
 * there is only one. Same form, same words on the phone and in the office.
 *
 * Every field lives in the draft, so a mis-tap or a closed page loses nothing
 * (the same rule as every phone form).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Loader2, Paperclip, Settings2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ManufacturerPicker } from "@/components/shared/manufacturer-picker";
import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { chosenReviewer } from "@/components/material-requests/review-gate";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/interfaces/api";
import {
  isValidRequestQuantity,
  type MaterialRequest,
  type MaterialRequestType,
} from "@/interfaces/material-request";
import {
  createMaterialRequest,
  getMaterialRequestOptions,
  getMaterialRequestReviewerOptions,
} from "@/services/material-request.service";

/** The server's own ceilings (`MAX_ATTACHMENTS`, `MAX_ATTACHMENT_BYTES`). */
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_MB = 25;

/** A unit in the reader's words: a built-in code is translated, a company's own unit is its name. */
export function useUnitLabel() {
  const t = useTranslations("mySubmissions.unit");
  return (code: string) => (code && t.has(code) ? t(code) : code);
}

/** What a returned request is re-raised with (C05): same words, new number. */
export interface MaterialRequestPrefill {
  project: string;
  request_type: MaterialRequestType;
  material_name: string;
  specification: string;
  quantity: string;
  unit: string;
  remark: string;
}

export function MaterialRequestForm({
  initialProject = "",
  prefill,
  onSaved,
  onCancel,
  onManageLists,
}: {
  initialProject?: string;
  prefill?: MaterialRequestPrefill | null;
  onSaved: (row: MaterialRequest) => void;
  onCancel?: () => void;
  /** Shown to whoever keeps the lists, beside an empty list. */
  onManageLists?: () => void;
}) {
  const t = useTranslations("materialRequest");
  const common = useTranslations("common");
  const unitLabel = useUnitLabel();
  const { user } = useAuth();
  const qc = useQueryClient();
  const clearDraft = useClearDraft();
  const [project, setProject] = useDraftState("project", prefill?.project || initialProject);
  const [requestType, setRequestType] = useDraftState<MaterialRequestType>("requestType", prefill?.request_type ?? "MATERIAL");
  const [material, setMaterial] = useDraftState("material", prefill?.material_name ?? "");
  const [specification, setSpecification] = useDraftState("specification", prefill?.specification ?? "");
  const [quantity, setQuantity] = useDraftState("quantity", prefill?.quantity ?? "");
  const [unit, setUnit] = useDraftState("unit", prefill?.unit ?? "");
  const [remark, setRemark] = useDraftState("remark", prefill?.remark ?? "");
  const [attachments, setAttachments] = useDraftState<File[]>("attachments", []);
  const [assignedReviewer, setAssignedReviewer] = useDraftState("assignedReviewer", "");
  // Whose make (2026-10 D1): optional on the form - approving settles it.
  const [manufacturer, setManufacturer] = useDraftState("manufacturer", "");
  const [clientId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");

  const options = useQuery({
    queryKey: ["material-request-options"],
    queryFn: () => getMaterialRequestOptions(),
    staleTime: 60_000,
  });
  const rows = useMemo(() => options.data?.options ?? [], [options.data]);
  const materials = rows.filter((row) => row.kind === "MATERIAL");
  const chosenMaterial = materials.find((row) => row.name === material);
  const specifications = rows.filter(
    (row) => row.kind === "SPECIFICATION" && chosenMaterial && row.parent === chosenMaterial.id,
  );
  const units = [
    ...(options.data?.built_in_units ?? []).map((code) => ({ value: code, label: unitLabel(code) })),
    ...rows.filter((row) => row.kind === "UNIT").map((row) => ({ value: row.name, label: row.name })),
  ];
  const isMaterial = requestType === "MATERIAL";
  const quantityOk = isValidRequestQuantity(quantity);

  // 「提交给」: who may approve on this project (the server's own list).
  const reviewers = useQuery({
    queryKey: ["material-request-reviewers", project],
    queryFn: () => getMaterialRequestReviewerOptions(project),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const reviewerRows = useMemo(() => reviewers.data ?? [], [reviewers.data]);
  // Only one: chosen for them (Q15). A choice that is not on this project's
  // list (the project changed, or a stale draft) is not sent.
  const reviewer = chosenReviewer(reviewerRows, assignedReviewer);

  const save = useMutation({
    mutationFn: () =>
      createMaterialRequest({
        project,
        request_type: requestType,
        ...(isMaterial
          ? { material_name: material, specification, quantity, unit, manufacturer: manufacturer || undefined }
          : {}),
        remark: remark.trim(),
        assigned_reviewer: reviewer,
        client_event_id: `${user?.id ?? "user"}:${clientId}`,
        attachments,
      }),
    onSuccess: (row) => {
      clearDraft();
      setError("");
      void qc.invalidateQueries({ queryKey: ["material-requests"] });
      void qc.invalidateQueries({ queryKey: ["my-submissions"] });
      onSaved(row);
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("failed")),
  });

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files);
    const tooBig = picked.find((file) => file.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig) {
      setError(t("form.fileTooBig", { name: tooBig.name, limit: MAX_ATTACHMENT_MB }));
      return;
    }
    setError("");
    setAttachments((current) => [...(current ?? []), ...picked].slice(0, MAX_ATTACHMENTS));
  };

  const requirements: [unknown, string][] = isMaterial
    ? [
        [project, t("field.project")],
        [material, t("field.material")],
        [specification, t("field.specification")],
        [quantityOk, t("field.quantity")],
        [unit, t("field.unit")],
        [reviewer, t("field.assignedReviewer")],
      ]
    : [
        [project, t("field.project")],
        [attachments.length > 0 || remark.trim(), t("form.fileOrRemark")],
        [reviewer, t("field.assignedReviewer")],
      ];

  const listEmpty = !options.isLoading && materials.length === 0;

  return (
    <div className="space-y-4">
      <FieldWrapper label={t("field.requestType")} required>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("field.requestType")}>
          {(["MATERIAL", "OTHER"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={requestType === type}
              onClick={() => setRequestType(type)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                requestType === type ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"
              }`}
            >
              <span className="block">{t(`type.${type}`)}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{t(`typeHelp.${type}`)}</span>
            </button>
          ))}
        </div>
      </FieldWrapper>

      <FieldWrapper label={t("field.project")} required hint={t("form.projectHint")}>
        <ProjectPicker value={project} onValueChange={setProject} placeholder={t("form.chooseProject")} />
      </FieldWrapper>

      <FieldWrapper label={t("field.assignedReviewer")} required hint={t("form.assignedReviewerHint")}>
        <Select value={reviewer || undefined} onValueChange={setAssignedReviewer}>
          <SelectTrigger
            className="w-full"
            aria-label={t("field.assignedReviewer")}
            disabled={!project || reviewers.isLoading || reviewers.isError || reviewerRows.length === 0}
          >
            <SelectValue placeholder={project ? t("form.chooseReviewer") : t("form.projectFirst")} />
          </SelectTrigger>
          <SelectContent position="popper">
            {reviewerRows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reviewers.isError && (
          <LoadFailed what={t("field.assignedReviewer")} onRetry={() => void reviewers.refetch()} />
        )}
        {project && reviewers.isSuccess && reviewerRows.length === 0 && (
          <p role="alert" className="mt-1.5 rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs">
            {t("form.noReviewers")}
          </p>
        )}
      </FieldWrapper>

      {isMaterial && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldWrapper label={t("field.material")} required>
              <OptionCombobox
                ariaLabel={t("field.material")}
                value={material}
                onChange={(next) => {
                  setMaterial(next);
                  // The specification belongs to the material (C02 「随材料联动」).
                  if (next !== material) setSpecification("");
                }}
                options={materials.map((row) => ({ value: row.name, label: row.name }))}
                placeholder={t("form.chooseMaterial")}
                searchPlaceholder={t("form.search")}
                emptyLabel={t("form.noMatch")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.specification")} required>
              <OptionCombobox
                ariaLabel={t("field.specification")}
                value={specification}
                onChange={setSpecification}
                options={specifications.map((row) => ({ value: row.name, label: row.name }))}
                placeholder={material ? t("form.chooseSpecification") : t("form.materialFirst")}
                searchPlaceholder={t("form.search")}
                emptyLabel={t("form.noSpecifications")}
                disabled={!material}
              />
            </FieldWrapper>
          </div>
          {options.isError && <LoadFailed what={t("options.title")} onRetry={() => void options.refetch()} />}
          {listEmpty && !options.isError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
              <span>{t("form.listsEmpty")}</span>
              {onManageLists && (
                <Button type="button" size="sm" variant="outline" onClick={onManageLists}>
                  <Settings2 className="size-4" />
                  {t("options.open")}
                </Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-2">
            <FieldWrapper
              label={t("field.quantity")}
              required
              error={quantity && !quantityOk ? t("form.quantityRule") : undefined}
              hint={t("form.quantityRule")}
            >
              <Input
                inputMode="decimal"
                type="number"
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.unit")} required>
              <OptionCombobox
                ariaLabel={t("field.unit")}
                value={unit}
                onChange={setUnit}
                options={units}
                placeholder={t("form.chooseUnit")}
                searchPlaceholder={t("form.search")}
                emptyLabel={t("form.noMatch")}
              />
            </FieldWrapper>
          </div>
          <FieldWrapper
            label={t("field.manufacturer")}
            optional={common("optional")}
            hint={t("form.suggestHint")}
          >
            <ManufacturerPicker value={manufacturer} onChange={setManufacturer} />
          </FieldWrapper>
        </>
      )}

      <FieldWrapper
        label={t("field.remark")}
        optional={isMaterial ? common("optional") : undefined}
        required={!isMaterial && attachments.length === 0}
      >
        <Textarea
          rows={isMaterial ? 3 : 5}
          maxLength={10000}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          placeholder={isMaterial ? t("form.remarkPlaceholder") : t("form.otherRemarkPlaceholder")}
        />
      </FieldWrapper>

      <FieldWrapper
        label={t("field.attachments")}
        optional={isMaterial ? common("optional") : undefined}
        hint={t("form.attachmentHint", { count: MAX_ATTACHMENTS, limit: MAX_ATTACHMENT_MB })}
      >
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm font-medium hover:bg-muted">
          <Paperclip className="size-4" />
          {t("form.addFiles")}
          <input
            className="sr-only"
            type="file"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs">
                <span className="truncate">
                  {index + 1}. {file.name}
                </span>
                <button
                  type="button"
                  aria-label={t("form.removeFile", { name: file.name })}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  onClick={() => setAttachments((current) => (current ?? []).filter((_, at) => at !== index))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FieldWrapper>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {common("cancel")}
          </Button>
        )}
        <Button type="button" requires={requirements} disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
          {t("form.submit")}
        </Button>
      </div>
    </div>
  );
}
