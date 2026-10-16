"use client";

/**
 * + New Request: one form for every request type the project keeps (I16).
 *
 * The type comes first after the project: the project's own list (材料申请,
 * 设备申请, 分包队申请, 现场基础设施申请, 其他申请 and whatever it adds,
 * ID36), and the type decides which of the two forms follows - never a form
 * per type (「不需要为每种分类单独开发表格」):
 *
 * - **材料明细** (I19, ID46): the material and its specification from the
 *   project's material data, the unit comes with the specification and cannot
 *   be changed (「其他」 is typed, with its unit chosen), and the quantity
 *   with up to three decimals. A material that is not set up says so -
 *   「该材料尚未建立，请先到分类管理设置。」 - with 「前往分类管理」 for whoever
 *   may add it, in a new tab; the lists read again when this tab is back, and
 *   everything typed here stays (it lives in the draft).
 * - **简单申请表** (ID48): 申请事项, 申请内容, 备注 and files; the subject
 *   always, and the content or a file.
 *
 * Every type takes photos, PDF and other files of the listed kinds (ID49).
 * 「提交给」 (D2, Q15) names the one person who approves it. Same form, same
 * words on the phone and in the office.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FilePlus2, Loader2, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useClearDraft, useDraftState } from "@/components/field-staff/field-draft";
import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { chosenReviewer } from "@/components/material-requests/review-gate";
import { useAuth } from "@/components/providers/auth-provider";
import { ManufacturerPicker } from "@/components/shared/manufacturer-picker";
import { FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUnitName } from "@/hooks/use-material-units";
import { ApiError } from "@/interfaces/api";
import {
  REQUEST_ATTACHMENT_ACCEPT,
  isAllowedRequestAttachment,
  isValidRequestQuantity,
  type MaterialRequest,
  type MaterialRequestType,
} from "@/interfaces/material-request";
import { categoryManagementLink, offeredSpecs, specChoice } from "@/lib/material-catalogue";
import {
  createMaterialRequest,
  getMaterialCatalogue,
  getMaterialRequestReviewerOptions,
  getRequestTypes,
} from "@/services/material-request.service";

/** The server's own ceilings (`MAX_ATTACHMENTS`, `MAX_ATTACHMENT_BYTES`). */
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_MB = 25;

/**
 * A unit in the reader's words: a built-in code is translated (ID47 - the
 * same 「包（Bag）」 on MR and on deliveries), a company's own unit is its name.
 */
export function useUnitLabel() {
  const unitName = useUnitName();
  return useCallback((code: string) => unitName(code), [unitName]);
}

/** What a returned request is re-raised with (C05): same words, new number. */
export interface MaterialRequestPrefill {
  project: string;
  request_type: MaterialRequestType;
  request_kind?: string | null;
  category?: string | null;
  spec_category?: string | null;
  material_name: string;
  specification: string;
  quantity: string;
  unit: string;
  remark: string;
  subject?: string;
  content?: string;
}

export function MaterialRequestForm({
  initialProject = "",
  prefill,
  onSaved,
  onCancel,
}: {
  initialProject?: string;
  prefill?: MaterialRequestPrefill | null;
  onSaved: (row: MaterialRequest) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("materialRequest");
  const common = useTranslations("common");
  const unitName = useUnitName();
  const { user } = useAuth();
  const qc = useQueryClient();
  const clearDraft = useClearDraft();
  const [project, setProject] = useDraftState("project", prefill?.project || initialProject);
  const [requestKind, setRequestKind] = useDraftState("requestKind", prefill?.request_kind ?? "");
  const [category, setCategory] = useDraftState("category", prefill?.category ?? "");
  const [spec, setSpec] = useDraftState("spec", prefill?.spec_category ?? "");
  const [typedSpec, setTypedSpec] = useDraftState("typedSpec", prefill?.specification ?? "");
  const [quantity, setQuantity] = useDraftState("quantity", prefill?.quantity ?? "");
  const [typedUnit, setTypedUnit] = useDraftState("typedUnit", prefill?.unit ?? "");
  const [subject, setSubject] = useDraftState("subject", prefill?.subject ?? "");
  const [content, setContent] = useDraftState("content", prefill?.content ?? "");
  const [remark, setRemark] = useDraftState("remark", prefill?.remark ?? "");
  const [attachments, setAttachments] = useDraftState<File[]>("attachments", []);
  const [assignedReviewer, setAssignedReviewer] = useDraftState("assignedReviewer", "");
  // Whose make (2026-10 D1): optional on the form - approving settles it.
  const [manufacturer, setManufacturer] = useDraftState("manufacturer", "");
  const [clientId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");

  // The project's types (ID36). Read again when the page comes back into view:
  // a type added in another tab is offered without reopening the form.
  const types = useQuery({
    queryKey: ["material-request-types", project],
    queryFn: () => getRequestTypes(project),
    enabled: Boolean(project),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const typeRows = useMemo(() => types.data ?? [], [types.data]);
  const chosenType = typeRows.find((row) => row.id === requestKind) ?? null;
  // The first type (材料申请) until somebody picks another; a type that is not
  // this project's (the project changed, or a stale draft) is not kept.
  useEffect(() => {
    if (!types.isSuccess || !typeRows.length) return;
    if (!typeRows.some((row) => row.id === requestKind)) setRequestKind(typeRows[0].id);
  }, [types.isSuccess, typeRows, requestKind, setRequestKind]);
  const isMaterial = chosenType?.form_style === "MATERIAL";

  // The material data (I19): read again when this tab is back, so what was
  // just set up in 分类管理 can be chosen at once (I19-12).
  const catalogue = useQuery({
    queryKey: ["material-catalogue", project],
    queryFn: () => getMaterialCatalogue(project),
    enabled: Boolean(project) && isMaterial,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const materials = useMemo(() => catalogue.data?.materials ?? [], [catalogue.data]);
  const material = materials.find((row) => row.id === category) ?? null;
  const specs = offeredSpecs(material, spec);
  const choice = specChoice(material, spec);
  const unit = choice.unitLocked ? choice.unit : typedUnit;
  const canSetUp = Boolean(catalogue.data?.can_manage_categories);
  const quantityOk = isValidRequestQuantity(quantity);

  // 「提交给」: who may approve on this project (the server's own list).
  const reviewers = useQuery({
    queryKey: ["material-request-reviewers", project],
    queryFn: () => getMaterialRequestReviewerOptions(project),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
  const reviewerRows = useMemo(() => reviewers.data ?? [], [reviewers.data]);
  // Only one: chosen for them (Q15).
  const reviewer = chosenReviewer(reviewerRows, assignedReviewer);

  const save = useMutation({
    mutationFn: () =>
      createMaterialRequest({
        project,
        request_type: isMaterial ? "MATERIAL" : "OTHER",
        request_kind: requestKind,
        ...(isMaterial
          ? {
              category,
              spec_category: spec,
              quantity,
              ...(choice.typed ? { specification: typedSpec.trim(), unit } : {}),
              manufacturer: manufacturer || undefined,
            }
          : { subject: subject.trim(), content: content.trim() }),
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
    // The listed kinds only (ID49), said before sending, as the server says it.
    const refused = picked.find((file) => !isAllowedRequestAttachment(file.name));
    if (refused) {
      setError(t("form.fileKindRefused", { name: refused.name }));
      return;
    }
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
        [requestKind, t("field.requestType")],
        [category, t("field.material")],
        [spec, t("field.specification")],
        ...(choice.typed ? ([[typedSpec.trim(), t("field.specificationName")]] as [unknown, string][]) : []),
        [quantityOk, t("field.quantity")],
        [unit, t("field.unit")],
        [reviewer, t("field.assignedReviewer")],
      ]
    : [
        [project, t("field.project")],
        [requestKind, t("field.requestType")],
        [subject.trim(), t("field.subject")],
        [attachments.length > 0 || content.trim(), t("field.content")],
        [reviewer, t("field.assignedReviewer")],
      ];

  const openCategoryManagement = () => {
    window.open(categoryManagementLink(project), "_blank", "noopener");
  };
  // 「该材料尚未建立」 and what to do about it (I19-11, I19-12): the button for
  // whoever may set it up, the sentence for everyone else.
  const notSetUp = canSetUp ? (
    <Button type="button" size="sm" variant="outline" onClick={openCategoryManagement}>
      <ExternalLink className="size-4" />
      {t("form.goToCategories")}
    </Button>
  ) : (
    <span>{t("form.askToSetUp")}</span>
  );

  return (
    <div className="space-y-4">
      <FieldWrapper label={t("field.project")} required hint={t("form.projectHint")}>
        <ProjectPicker value={project} onValueChange={setProject} placeholder={t("form.chooseProject")} />
      </FieldWrapper>

      <FieldWrapper label={t("field.requestType")} required>
        <Select value={requestKind || undefined} onValueChange={setRequestKind}>
          <SelectTrigger
            className="w-full"
            aria-label={t("field.requestType")}
            disabled={!project || types.isLoading || types.isError || typeRows.length === 0}
          >
            <SelectValue placeholder={project ? t("form.chooseType") : t("form.projectFirst")} />
          </SelectTrigger>
          <SelectContent position="popper">
            {typeRows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {types.isError && <LoadFailed what={t("field.requestType")} onRetry={() => void types.refetch()} />}
      </FieldWrapper>

      <FieldWrapper
        label={t("field.assignedReviewer")}
        required
        // A site staff's request goes to the project manager first, who
        // sends it on to head office (I12, ID29) - said, so nobody looks
        // for head office in the list.
        hint={
          reviewerRows[0]?.stage === "MANAGER"
            ? t("form.assignedReviewerManagerHint")
            : t("form.assignedReviewerHint")
        }
      >
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
          <p role="alert" className="mt-1.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
            {t("form.noReviewers")}
          </p>
        )}
      </FieldWrapper>

      {chosenType && isMaterial && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldWrapper label={t("field.material")} required>
              <OptionCombobox
                ariaLabel={t("field.material")}
                value={category}
                onChange={(next) => {
                  setCategory(next);
                  // The specification belongs to the material.
                  if (next !== category) {
                    setSpec("");
                    setTypedSpec("");
                  }
                }}
                options={materials.map((row) => ({ value: row.id, label: row.name }))}
                placeholder={t("form.chooseMaterial")}
                searchPlaceholder={t("form.search")}
                emptyLabel={t("form.notSetUp")}
                emptyAction={notSetUp}
                disabled={!project}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.specification")} required>
              <OptionCombobox
                ariaLabel={t("field.specification")}
                value={spec}
                onChange={(next) => {
                  setSpec(next);
                  setTypedSpec("");
                }}
                options={specs.map((row) => ({ value: row.id, label: row.name }))}
                placeholder={category ? t("form.chooseSpecification") : t("form.materialFirst")}
                searchPlaceholder={t("form.search")}
                emptyLabel={t("form.notSetUp")}
                emptyAction={notSetUp}
                disabled={!category}
              />
            </FieldWrapper>
          </div>
          {catalogue.isError && (
            <LoadFailed what={t("form.materialData")} onRetry={() => void catalogue.refetch()} />
          )}
          {catalogue.isSuccess && materials.length === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
              <span>{t("form.notSetUp")}</span>
              {notSetUp}
            </div>
          )}
          {choice.typed && (
            <FieldWrapper label={t("field.specificationName")} required hint={t("form.otherSpecHint")}>
              <Input value={typedSpec} maxLength={150} onChange={(event) => setTypedSpec(event.target.value)} />
            </FieldWrapper>
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
                min="0.001"
                step="0.001"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("field.unit")}
              required
              hint={choice.unitLocked ? t("form.unitFromSpec") : undefined}
            >
              {choice.typed ? (
                <Select value={typedUnit || undefined} onValueChange={setTypedUnit}>
                  <SelectTrigger className="w-full" aria-label={t("field.unit")}>
                    <SelectValue placeholder={t("form.chooseUnit")} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(catalogue.data?.units ?? []).map((row) => (
                      <SelectItem key={row.code} value={row.code}>
                        {unitName(row.code, row.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // The unit comes with the specification and cannot be changed (ID46).
                <Input
                  aria-label={t("field.unit")}
                  value={choice.unitLocked ? unitName(choice.unit, choice.spec?.default_unit_label) : ""}
                  placeholder={t("form.unitAfterSpec")}
                  readOnly
                  disabled
                />
              )}
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

      {chosenType && !isMaterial && (
        <>
          <FieldWrapper label={t("field.subject")} required hint={t("form.subjectHint")}>
            <Input value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.content")}
            required={attachments.length === 0}
            hint={t("form.contentOrFile")}
          >
            <Textarea
              rows={5}
              maxLength={10000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("form.contentPlaceholder")}
            />
          </FieldWrapper>
        </>
      )}

      <FieldWrapper label={t("field.remark")} optional={common("optional")}>
        <Textarea
          rows={3}
          maxLength={10000}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          placeholder={t("form.remarkPlaceholder")}
        />
      </FieldWrapper>

      <FieldWrapper
        label={t("field.attachments")}
        optional={common("optional")}
        hint={t("form.attachmentKindsHint", { count: MAX_ATTACHMENTS, limit: MAX_ATTACHMENT_MB })}
      >
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm font-medium hover:bg-muted">
          <Paperclip className="size-4" />
          {t("form.addFiles")}
          <input
            className="sr-only"
            type="file"
            multiple
            accept={REQUEST_ATTACHMENT_ACCEPT}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2 py-1 text-xs">
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
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
