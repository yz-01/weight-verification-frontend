"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  FileCheck2,
  FileUp,
  Landmark,
  Pencil,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CompanyBankAccount,
  CompanyBankAccountPayload,
  CompanyDetail,
  CompanyDocumentType,
  VerificationStatus,
} from "@/interfaces/company";
import {
  createCompanyBankAccount,
  deleteCompanyBankAccount,
  deleteCompanyDocument,
  getCompanyOnboarding,
  reviewCompany,
  setPrimaryCompanyBankAccount,
  updateCompanyBankAccount,
  uploadCompanyDocument,
  verifyCompanyBankAccount,
  verifyCompanyDocument,
} from "@/services/companies.service";

const DOCUMENT_TYPES: CompanyDocumentType[] = [
  "SSM_CERTIFICATE",
  "SSM_FORM_9",
  "SSM_FORM_24",
  "SSM_FORM_49",
  "BUSINESS_LICENCE",
  "DOE_LICENCE",
  "BANK_STATEMENT",
  "DIRECTOR_IC",
  "TAX_DOCUMENT",
  "SIGNED_AGREEMENT",
  "OTHER",
];

type PendingAction =
  | { kind: "verify-document" | "reject-document" | "remove-document"; id: string }
  | { kind: "verify-bank" | "reject-bank" | "primary-bank" | "remove-bank"; id: string }
  | { kind: "approve-company" | "reject-company"; id: string };

export function CompanyOnboarding({ company }: { company: CompanyDetail }) {
  const t = useTranslations();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<CompanyDocumentType>("SSM_CERTIFICATE");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentReference, setDocumentReference] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [showBankForm, setShowBankForm] = useState(false);
  const [editingBank, setEditingBank] = useState<CompanyBankAccount | null>(null);
  const [bank, setBank] = useState<CompanyBankAccountPayload>({
    bank_name: "",
    account_name: company.ssm_registered_name || company.name,
    account_number: "",
    account_type: "CURRENT",
    currency: "MYR",
    is_primary: true,
  });
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");

  const onboarding = useQuery({
    queryKey: ["companies", "onboarding", company.id],
    queryFn: () => getCompanyOnboarding(company.id),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["companies", "onboarding", company.id] });
    void queryClient.invalidateQueries({ queryKey: ["companies", "detail", company.id] });
    void queryClient.invalidateQueries({ queryKey: ["companies"] });
  };

  const upload = useMutation({
    mutationFn: () => {
      if (!documentFile) throw new Error("document_file_required");
      return uploadCompanyDocument(company.id, documentType, documentFile, {
        title: documentTitle.trim(),
        reference_no: documentReference.trim(),
      });
    },
    onSuccess: () => {
      setDocumentFile(null);
      setDocumentTitle("");
      setDocumentReference("");
      refresh();
    },
  });

  const addBank = useMutation({
    mutationFn: () => createCompanyBankAccount(company.id, bank),
    onSuccess: () => {
      setShowBankForm(false);
      setBank({
        bank_name: "",
        account_name: company.ssm_registered_name || company.name,
        account_number: "",
        account_type: "CURRENT",
        currency: "MYR",
        is_primary: true,
      });
      refresh();
    },
  });

  // Same form, different verb. `currency` and `is_primary` are left out on
  // purpose: currency is fixed once the account exists, and which account is
  // primary has its own control, so sending them here would let an edit
  // quietly change something the person did not touch.
  const saveBank = useMutation({
    mutationFn: (account: CompanyBankAccount) =>
      updateCompanyBankAccount(account.id, {
        bank_name: bank.bank_name,
        account_name: bank.account_name,
        // Omitted when the box was left alone. The API patches, so an absent
        // field keeps the stored number - which is the only sane reading of
        // an empty box on a field the screen was never allowed to show.
        ...(bank.account_number.trim()
          ? { account_number: bank.account_number.trim() }
          : {}),
        branch: bank.branch,
        swift_code: bank.swift_code,
        account_type: bank.account_type,
      }),
    onSuccess: () => {
      setShowBankForm(false);
      setEditingBank(null);
      setBank({
        bank_name: "",
        account_name: company.ssm_registered_name || company.name,
        account_number: "",
        account_type: "CURRENT",
        currency: "MYR",
        is_primary: true,
      });
      refresh();
    },
  });

  const executeAction = useMutation({
    mutationFn: async (action: PendingAction) => {
      switch (action.kind) {
        case "verify-document":
          return verifyCompanyDocument(action.id, "VERIFIED", reason.trim());
        case "reject-document":
          return verifyCompanyDocument(action.id, "REJECTED", reason.trim());
        case "remove-document":
          return deleteCompanyDocument(action.id);
        case "verify-bank":
          return verifyCompanyBankAccount(action.id, "VERIFIED", reason.trim());
        case "reject-bank":
          return verifyCompanyBankAccount(action.id, "REJECTED", reason.trim());
        case "primary-bank":
          return setPrimaryCompanyBankAccount(action.id);
        case "remove-bank":
          return deleteCompanyBankAccount(action.id);
        case "approve-company":
          return reviewCompany(action.id, { status: "APPROVED", note: reason.trim() });
        case "reject-company":
          return reviewCompany(action.id, { status: "REJECTED", note: reason.trim() });
      }
    },
    onSuccess: () => {
      setPending(null);
      setReason("");
      refresh();
    },
  });

  const data = onboarding.data;
  if (onboarding.isLoading) {
    return <p className="border-t px-6 py-8 text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (onboarding.isError || !data) {
    return <p className="border-t px-6 py-8 text-sm text-destructive">{t("table.errorBody")}</p>;
  }

  return (
    <section className="border-t" aria-labelledby="company-onboarding-title">
      <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="company-onboarding-title" className="text-sm font-semibold">
            {t("companies.onboarding.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.is_complete
              ? t("companies.onboarding.complete")
              : t("companies.onboarding.incomplete", { count: data.missing.length })}
          </p>
        </div>
        <StatusBadge
          label={t(`companies.reviewStatus.${data.review_status}`)}
          tone={reviewTone(data.review_status)}
        />
      </div>

      {data.missing.length > 0 && (
        <div className="flex flex-wrap gap-2 border-y bg-muted/30 px-6 py-3">
          {data.missing.map((item) => (
            <span key={item} className="text-xs font-medium text-destructive">
              {t(`companies.onboarding.missing.${item}`)}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-5 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">{t("companies.onboarding.documents.title")}</h4>
          </div>
          <span className="text-xs text-muted-foreground">{data.documents.length}</span>
        </div>

        {can("company.update") && (
          <div className="grid gap-3 border-y py-4 md:grid-cols-2 xl:grid-cols-[12rem_1fr_1fr_1.4fr_auto]">
            <FieldWrapper label={t("companies.onboarding.documents.type")} required>
              <select className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={documentType} onChange={(event) => setDocumentType(event.target.value as CompanyDocumentType)}>
                {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{t(`companies.onboarding.documentType.${type}`)}</option>)}
              </select>
            </FieldWrapper>
            <FieldWrapper label={t("companies.onboarding.documents.titleField")} optional={t("common.optional")}>
              <Input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} />
            </FieldWrapper>
            <FieldWrapper label={t("companies.onboarding.documents.reference")} optional={t("common.optional")}>
              <Input value={documentReference} onChange={(event) => setDocumentReference(event.target.value)} />
            </FieldWrapper>
            <FieldWrapper label={t("companies.onboarding.documents.file")} required>
              <Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
            </FieldWrapper>
            <div className="flex items-end">
              <Button size="sm" requires={[[documentFile, t("companies.onboarding.documents.file")]]} disabled={upload.isPending} onClick={() => upload.mutate()}>
                <FileUp className="h-4 w-4" />
                {t("companies.onboarding.documents.upload")}
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y border-y">
          {data.documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("companies.onboarding.documents.empty")}</p>
          ) : data.documents.map((document) => (
            <div key={document.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <a href={document.file_url ?? "#"} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                  {document.title || t(`companies.onboarding.documentType.${document.document_type}`)}
                </a>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {document.reference_no || t("common.emptyValue")}
                  {document.verification_note ? ` | ${document.verification_note}` : ""}
                </p>
              </div>
              <StatusBadge label={t(`companies.verificationStatus.${document.verification_status}`)} tone={verificationTone(document.verification_status)} />
              <div className="flex items-center gap-1">
                {can("company.review") && document.verification_status !== "VERIFIED" && (
                  <Button variant="ghost" size="icon" title={t("companies.onboarding.verify")} onClick={() => setPending({ kind: "verify-document", id: document.id })}>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  </Button>
                )}
                {can("company.review") && document.verification_status !== "REJECTED" && (
                  <Button variant="ghost" size="icon" title={t("companies.onboarding.reject")} onClick={() => setPending({ kind: "reject-document", id: document.id })}>
                    <XCircle className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                {can("company.update") && (
                  <Button variant="ghost" size="icon" title={t("common.remove")} onClick={() => setPending({ kind: "remove-document", id: document.id })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-5 border-t px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">{t("companies.onboarding.bank.title")}</h4>
          </div>
          {can("company.update") && (
            <Button variant="outline" size="sm" onClick={() => setShowBankForm((value) => !value)}>
              <Building2 className="h-4 w-4" />
              {t("companies.onboarding.bank.add")}
            </Button>
          )}
        </div>

        {showBankForm && (
          <div className="grid gap-3 border-y py-4 md:grid-cols-2 xl:grid-cols-3">
            <BankInput label={t("companies.onboarding.bank.bankName")} value={bank.bank_name} onChange={(value) => setBank({ ...bank, bank_name: value })} required />
            <BankInput label={t("companies.onboarding.bank.accountName")} value={bank.account_name} onChange={(value) => setBank({ ...bank, account_name: value })} required />
            <BankInput label={t("companies.onboarding.bank.accountNumber")} value={bank.account_number} onChange={(value) => setBank({ ...bank, account_number: value })} required={!editingBank} hint={editingBank ? t("companies.onboarding.bank.numberUnchanged", { masked: editingBank.masked_account_number }) : undefined} />
            <BankInput label={t("companies.onboarding.bank.branch")} value={bank.branch ?? ""} onChange={(value) => setBank({ ...bank, branch: value })} />
            <BankInput label={t("companies.onboarding.bank.swiftCode")} value={bank.swift_code ?? ""} onChange={(value) => setBank({ ...bank, swift_code: value })} />
            <FieldWrapper label={t("companies.onboarding.bank.accountType")} required>
              <select className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={bank.account_type} onChange={(event) => setBank({ ...bank, account_type: event.target.value as "CURRENT" | "SAVINGS" })}>
                <option value="CURRENT">{t("companies.onboarding.bank.type.CURRENT")}</option>
                <option value="SAVINGS">{t("companies.onboarding.bank.type.SAVINGS")}</option>
              </select>
            </FieldWrapper>
            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
              <Button size="sm" requires={[[bank.bank_name, t("companies.onboarding.bank.bankName")], [bank.account_name, t("companies.onboarding.bank.accountName")], [Boolean(editingBank) || bank.account_number, t("companies.onboarding.bank.accountNumber")]]} disabled={addBank.isPending || saveBank.isPending} onClick={() => (editingBank ? saveBank.mutate(editingBank) : addBank.mutate())}>
                <Landmark className="h-4 w-4" />
                {t("companies.onboarding.bank.save")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowBankForm(false); setEditingBank(null); }}>{t("common.cancel")}</Button>
            </div>
          </div>
        )}

        <div className="divide-y border-y">
          {data.bank_accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("companies.onboarding.bank.empty")}</p>
          ) : data.bank_accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{account.bank_name} | {account.masked_account_number}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {account.account_name}{account.branch ? ` | ${account.branch}` : ""}
                  {account.verification_note ? ` | ${account.verification_note}` : ""}
                </p>
              </div>
              {account.is_primary && <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Star className="h-3.5 w-3.5" />{t("companies.onboarding.bank.primary")}</span>}
              <StatusBadge label={t(`companies.verificationStatus.${account.verification_status}`)} tone={verificationTone(account.verification_status)} />
              <div className="flex items-center gap-1">
                {can("company.review") && account.verification_status !== "VERIFIED" && <Button variant="ghost" size="icon" title={t("companies.onboarding.verify")} onClick={() => setPending({ kind: "verify-bank", id: account.id })}><CheckCircle2 className="h-4 w-4 text-success" /></Button>}
                {can("company.review") && account.verification_status !== "REJECTED" && <Button variant="ghost" size="icon" title={t("companies.onboarding.reject")} onClick={() => setPending({ kind: "reject-bank", id: account.id })}><XCircle className="h-4 w-4 text-destructive" /></Button>}
                {can("company.update") && <Button variant="ghost" size="icon" title={t("common.edit")} onClick={() => { setEditingBank(account); setBank({ bank_name: account.bank_name, account_name: account.account_name, account_number: "", branch: account.branch ?? "", swift_code: account.swift_code ?? "", account_type: account.account_type }); setShowBankForm(true); }}><Pencil className="h-4 w-4" /></Button>}
                {can("company.update") && !account.is_primary && <Button variant="ghost" size="icon" title={t("companies.onboarding.bank.makePrimary")} onClick={() => setPending({ kind: "primary-bank", id: account.id })}><Star className="h-4 w-4" /></Button>}
                {can("company.update") && <Button variant="ghost" size="icon" title={t("common.remove")} onClick={() => setPending({ kind: "remove-bank", id: account.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {can("company.review") && data.review_status !== "APPROVED" && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-5">
          <Button variant="outline" disabled={executeAction.isPending} onClick={() => setPending({ kind: "reject-company", id: company.id })}>
            <XCircle className="h-4 w-4" />
            {t("companies.onboarding.companyReject")}
          </Button>
          <Button disabledReason={!data.is_complete ? t("companies.onboarding.incomplete", { count: data.missing.length }) : undefined} disabled={!data.is_complete || executeAction.isPending} onClick={() => setPending({ kind: "approve-company", id: company.id })}>
            <BadgeCheck className="h-4 w-4" />
            {t("companies.onboarding.companyApprove")}
          </Button>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={() => { setPending(null); setReason(""); }}
          title={t(`companies.onboarding.confirm.${pending.kind}.title`)}
          description={t(`companies.onboarding.confirm.${pending.kind}.description`)}
          confirmLabel={t(`companies.onboarding.confirm.${pending.kind}.confirm`)}
          confirmIcon={pending.kind.includes("reject") ? XCircle : pending.kind.includes("remove") ? Trash2 : CheckCircle2}
          variant={pending.kind.includes("reject") || pending.kind.includes("remove") ? "destructive" : "default"}
          isPending={executeAction.isPending}
          reason={reason}
          onReasonChange={pending.kind.includes("reject") || pending.kind.includes("verify") || pending.kind === "approve-company" ? setReason : undefined}
          reasonRequired={pending.kind.includes("reject")}
          onConfirm={() => executeAction.mutate(pending)}
        />
      )}
    </section>
  );
}

function BankInput({ label, value, onChange, required = false, hint }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; hint?: string }) {
  const t = useTranslations();
  return <FieldWrapper label={label} required={required} optional={required ? undefined : t("common.optional")} hint={hint}><Input value={value} onChange={(event) => onChange(event.target.value)} /></FieldWrapper>;
}

function verificationTone(status: VerificationStatus) {
  return status === "VERIFIED" ? "positive" as const : status === "REJECTED" ? "danger" as const : "warning" as const;
}

function reviewTone(status: CompanyDetail["review_status"]) {
  return status === "APPROVED" ? "positive" as const : status === "REJECTED" ? "danger" as const : "warning" as const;
}
