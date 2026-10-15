"use client";

/**
 * 新增人员 / 修改资料 (I20): 姓名、电话号码、CIDB 卡号、所属公司 / 分包商、
 * 其他证件（名称及号码）. The company comes from the company list; one that is
 * not on it yet is typed (「名单里没有的先打字」).
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { OptionCombobox } from "@/components/material-requests/option-combobox";
import { FieldWrapper, QueryFailedNote } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
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
} from "@/services/site-workers.service";

interface Draft {
  project: string;
  name: string;
  phone: string;
  cidb_no: string;
  supplier: string;
  supplierName: string;
  company_note: string;
  documents: SiteWorkerDocument[];
}

function draftOf(worker: SiteWorker | null | undefined, project?: string): Draft {
  return {
    project: worker?.project ?? project ?? "",
    name: worker?.name ?? "",
    phone: worker?.phone ?? "",
    cidb_no: worker?.cidb_no ?? "",
    supplier: worker?.supplier ?? "",
    supplierName: worker?.supplier_name ?? "",
    company_note: worker?.company_note ?? "",
    documents: worker?.documents.map((row) => ({ name: row.name, number: row.number })) ?? [],
  };
}

export function WorkerFormDialog({
  open,
  worker,
  defaultProject,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Editing this worker; absent for 新增人员. */
  worker?: SiteWorker | null;
  defaultProject?: string;
  onClose: () => void;
  onSaved: (worker: SiteWorker) => void;
}) {
  const t = useTranslations("siteWorkers");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(worker, defaultProject));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [term, setTerm] = useState("");
  const search = useDebounce(term.trim(), 300);

  useEffect(() => {
    if (open) {
      setDraft(draftOf(worker, defaultProject));
      setErrors({});
    }
  }, [open, worker, defaultProject]);

  const companies = useQuery({
    queryKey: ["site-workers", "company-options", "list", search],
    queryFn: () => getWorkerCompanyOptions(search ? { search } : {}),
    placeholderData: keepPreviousData,
    enabled: open,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: draft.name,
        phone: draft.phone,
        cidb_no: draft.cidb_no,
        supplier: draft.supplier || null,
        company_note: draft.supplier ? "" : draft.company_note,
        documents: cleanDocuments(draft.documents),
      };
      return worker
        ? updateSiteWorker(worker.id, payload)
        : createSiteWorker({ ...payload, project: draft.project });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["site-workers"] });
      onSaved(saved);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const next = { ...error.errors };
        if (error.code === "site_worker_phone_taken") next.phone = error.message;
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
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
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
          <FieldWrapper label={t("field.phone")} required error={errors.phone} hint={t("form.phoneHint")}>
            <Input
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
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
              [draft.phone.trim(), t("field.phone")],
            ]}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {common("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
