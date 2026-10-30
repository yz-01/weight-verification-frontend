"use client";

/**
 * 新增人员 / 修改资料 (I20): 姓名、电话号码、CIDB 卡号、所属公司 / 分包商、
 * 其他证件（名称及号码）. The company comes from the company list; one that is
 * not on it yet is typed (「名单里没有的先打字」).
 *
 * JB61 (10-28): the phone is optional (no phone, no location link), and the
 * passport is on the form - number, nationality, birth date, expiry and a
 * photo or PDF of the data page, sent after the worker is saved.
 *
 * JB91 (10-31): 「施工工种」, a dropdown of the company's trades with
 * 「新增工种」 beside it. Optional - a worker from before has none until filled.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { TradeSelect } from "@/components/site-workers/trade-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { ApiError } from "@/interfaces/api";
import type { SiteWorker, SiteWorkerDocument } from "@/interfaces/site-workers";
import { cleanDocuments, incompleteDocument } from "@/lib/site-workers";
import {
  createSiteWorker,
  getWorkerCompanyOptions,
  updateSiteWorker,
  uploadPassportPhoto,
} from "@/services/site-workers.service";

interface Draft {
  project: string;
  name: string;
  phone: string;
  passport_no: string;
  nationality: string;
  date_of_birth: string;
  passport_expiry: string;
  cidb_no: string;
  supplier: string;
  supplierName: string;
  company_note: string;
  /** 「施工工种」 (JB91): a trade's id, or "" for 「未填工种」. */
  trade: string;
  documents: SiteWorkerDocument[];
}

function draftOf(worker: SiteWorker | null | undefined, project?: string): Draft {
  return {
    project: worker?.project ?? project ?? "",
    name: worker?.name ?? "",
    phone: worker?.phone ?? "",
    passport_no: worker?.passport_no ?? "",
    nationality: worker?.nationality ?? "",
    date_of_birth: worker?.date_of_birth ?? "",
    passport_expiry: worker?.passport_expiry ?? "",
    cidb_no: worker?.cidb_no ?? "",
    supplier: worker?.supplier ?? "",
    supplierName: worker?.supplier_name ?? "",
    company_note: worker?.company_note ?? "",
    trade: worker?.trade ?? "",
    documents: worker?.documents.map((row) => ({ name: row.name, number: row.number })) ?? [],
  };
}

interface FormProps {
  /** Editing this worker; absent for 新增人员. */
  worker?: SiteWorker | null;
  defaultProject?: string;
  onClose: () => void;
  onSaved: (worker: SiteWorker) => void;
}

/** The form starts afresh each time it opens: its body mounts with it. */
export function WorkerFormDialog({ open, ...props }: FormProps & { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && props.onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && <WorkerFormBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function WorkerFormBody({ worker, defaultProject, onClose, onSaved }: FormProps) {
  const t = useTranslations("siteWorkers");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(worker, defaultProject));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);
  const [photo, setPhotoState] = useState<File | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const setPhoto = (file: File | null) => {
    setPhotoState(file);
    // The old preview is let go by the effect below.
    setPhotoPreview(file && file.type !== "application/pdf" ? URL.createObjectURL(file) : null);
  };
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  const companies = useQuery({
    queryKey: ["site-workers", "company-options", "list", search],
    queryFn: () => getWorkerCompanyOptions(search ? { search } : {}),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name,
        phone: draft.phone,
        passport_no: draft.passport_no,
        nationality: draft.nationality,
        date_of_birth: draft.date_of_birth || null,
        passport_expiry: draft.passport_expiry || null,
        cidb_no: draft.cidb_no,
        supplier: draft.supplier || null,
        company_note: draft.supplier ? "" : draft.company_note,
        trade: draft.trade || null,
        documents: cleanDocuments(draft.documents),
      };
      // A worker created on an earlier press whose photo was refused is
      // updated now, never created twice.
      const existing = worker?.id ?? createdId;
      const saved = existing
        ? await updateSiteWorker(existing, payload)
        : await createSiteWorker({ ...payload, project: draft.project });
      setCreatedId(saved.id);
      // The photo goes once the worker exists; a refused photo leaves the
      // worker saved and says why under the photo box.
      return photo ? uploadPassportPhoto(saved.id, photo) : saved;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["site-workers"] });
      onSaved(saved);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const next = { ...error.errors };
        if (error.code === "site_worker_phone_taken") next.phone = error.message;
        if (error.code === "site_worker_passport_taken") next.passport_no = error.message;
        if (error.code === "passport_file_invalid" || error.code === "passport_file_too_large") {
          next.passport_photo = error.message;
          // The worker itself was saved: show it in the list behind.
          void queryClient.invalidateQueries({ queryKey: ["site-workers"] });
        }
        setErrors(next);
      }
    },
  });

  const set = (key: keyof Draft, value: string) => {
    setErrors((current) => ({ ...current, [key]: "" }));
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setDocument = (index: number, key: "name" | "number", value: string) =>
    setDraft((current) => ({
      ...current,
      documents: current.documents.map((row, at) => (at === index ? { ...row, [key]: value } : row)),
    }));

  const options = [
    { value: "__none__", label: t("form.noCompany") },
    ...(companies.data ?? []).map((option) => ({ value: option.value, label: option.label })),
  ];
  const documentsIncomplete = incompleteDocument(draft.documents);

  return (
    <>
        <DialogHeader>
          <DialogTitle>{worker ? t("form.editTitle") : t("form.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {!worker && (
            <FieldWrapper label={t("field.project")} required error={errors.project}>
              <ProjectPicker
                value={draft.project}
                onValueChange={(project) => set("project", project)}
                placeholder={t("filter.project")}
              />
            </FieldWrapper>
          )}
          <FieldWrapper label={t("field.name")} required error={errors.name}>
            <Input value={draft.name} onChange={(event) => set("name", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper
            label={t("field.phone")}
            optional={common("optional")}
            error={errors.phone}
            hint={t("form.phoneHint")}
          >
            <Input
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper label={t("field.trade")} optional={common("optional")} error={errors.trade}>
            <TradeSelect
              project={worker ? worker.project : draft.project}
              value={draft.trade}
              current={
                worker?.trade
                  ? { id: worker.trade, code: worker.trade_code, name: worker.trade_name }
                  : null
              }
              canAdd
              onChange={(trade) => set("trade", trade)}
            />
          </FieldWrapper>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWrapper label={t("field.passportNo")} optional={common("optional")} error={errors.passport_no}>
              <Input
                value={draft.passport_no}
                autoCapitalize="characters"
                onChange={(event) => set("passport_no", event.target.value.toUpperCase())}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.nationality")} optional={common("optional")} error={errors.nationality}>
              <Input
                value={draft.nationality}
                placeholder={t("form.nationalityPlaceholder")}
                onChange={(event) => set("nationality", event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.dateOfBirth")} optional={common("optional")} error={errors.date_of_birth}>
              <Input
                type="date"
                value={draft.date_of_birth}
                onChange={(event) => set("date_of_birth", event.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper label={t("field.passportExpiry")} optional={common("optional")} error={errors.passport_expiry}>
              <Input
                type="date"
                value={draft.passport_expiry}
                onChange={(event) => set("passport_expiry", event.target.value)}
              />
            </FieldWrapper>
          </div>
          <FieldWrapper
            label={t("field.passportPhoto")}
            optional={common("optional")}
            error={errors.passport_photo}
            hint={t("form.passportPhotoHint")}
          >
            <div className="flex items-center gap-3">
              {photoPreview || (!photo && worker?.passport_photo_url && !worker.passport_photo_is_pdf) ? (
                <span className="relative block size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                  <Image
                    src={photoPreview ?? worker?.passport_photo_url ?? ""}
                    alt={t("field.passportPhoto")}
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized
                  />
                </span>
              ) : photo || worker?.passport_photo_url ? (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </span>
              ) : null}
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(event) => {
                  setErrors((current) => ({ ...current, passport_photo: "" }));
                  setPhoto(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => photoInput.current?.click()}>
                <Upload className="h-4 w-4" />
                {photo || worker?.passport_photo_url ? t("form.replacePassportPhoto") : t("form.addPassportPhoto")}
              </Button>
            </div>
          </FieldWrapper>
          <FieldWrapper label={t("field.cidb")} optional={common("optional")} error={errors.cidb_no}>
            <Input value={draft.cidb_no} onChange={(event) => set("cidb_no", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.company")} optional={common("optional")} error={errors.supplier}>
            <OptionCombobox
              value={draft.supplier || "__none__"}
              onChange={(value) => {
                const picked = options.find((option) => option.value === value);
                setDraft((current) => ({
                  ...current,
                  supplier: value === "__none__" ? "" : value,
                  supplierName: value === "__none__" ? "" : picked?.label ?? "",
                }));
              }}
              options={options}
              onSearch={setTerm}
              selectedLabel={draft.supplier ? draft.supplierName : t("form.noCompany")}
              placeholder={t("form.pickCompany")}
              searchPlaceholder={t("form.searchCompany")}
              emptyLabel={t("form.noCompanyMatch")}
              ariaLabel={t("field.company")}
            />
            <QueryFailedNote query={companies} what={t("what.companies")} />
          </FieldWrapper>
          {!draft.supplier && (
            <FieldWrapper
              label={t("field.companyNote")}
              optional={common("optional")}
              error={errors.company_note}
              hint={t("form.companyNoteHint")}
            >
              <Input value={draft.company_note} onChange={(event) => set("company_note", event.target.value)} />
            </FieldWrapper>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("field.documents")}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">({common("optional")})</span>
            </p>
            {draft.documents.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={t("form.documentName")}
                  placeholder={t("form.documentName")}
                  value={row.name}
                  onChange={(event) => setDocument(index, "name", event.target.value)}
                />
                <Input
                  aria-label={t("form.documentNumber")}
                  placeholder={t("form.documentNumber")}
                  value={row.number}
                  onChange={(event) => setDocument(index, "number", event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("form.removeDocument")}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      documents: current.documents.filter((_, at) => at !== index),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {draft.documents.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({ ...current, documents: [...current.documents, { name: "", number: "" }] }))
                }
              >
                <Plus className="h-4 w-4" />
                {t("form.addDocument")}
              </Button>
            )}
            {documentsIncomplete && <p className="text-xs text-destructive">{t("form.documentIncomplete")}</p>}
            {errors.documents && <p className="text-xs text-destructive">{errors.documents}</p>}
          </div>
          {errors.non_field_errors && <p className="text-xs text-destructive">{errors.non_field_errors}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={documentsIncomplete || save.isPending}
            disabledReason={documentsIncomplete ? t("form.documentIncomplete") : undefined}
            requires={[
              [worker ? worker.project : draft.project, t("field.project")],
              [draft.name.trim(), t("field.name")],
            ]}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {common("save")}
          </Button>
        </DialogFooter>
    </>
  );
}
