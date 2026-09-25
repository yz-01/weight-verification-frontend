"use client";

/**
 * 杂费报销, the office side (T-379; D-231, D-232, D-252, D-256).
 *
 * The receipt list's layout (图 4) and the shared detail shell (图 1／图 2).
 * The right column holds the steps, in order, for whoever may take them:
 *
 * 1. 【确认】, or the reject switch and then 【拒绝】 with a reason (C-018 -
 *    arm first, no confirmation dialog). A rejection needs something said on
 *    the record first; the server refuses otherwise (D-250) and the message
 *    says so.
 * 2. after confirming, finance uploads the payment voucher - chosen, then
 *    uploaded, and locked the moment it lands; a wrong one is answered by
 *    adding the right one (第 53 条). Only `sundry_claim.pay` sees this (D-256).
 * 3. 【确认已付款】, a separate step (第 55 条), which tells the applicant.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Check, Loader2, Upload, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ExportButton } from "@/components/shared/export-button";
import {
  FilterSelect,
  ModuleRecordsTable,
  PlainHeader,
  ProjectListFilter,
  sortable,
} from "@/components/shared/module-records-table";
import { FieldWrapper, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { RecordDetailDialog, RecordDetailShell } from "@/components/shared/record-detail-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import { ApiError } from "@/interfaces/api";
import { sundryStatus, type SundryClaim, type SundryClaimStatus } from "@/interfaces/sundry-claim";
import { useDateFormat } from "@/lib/dates";
import {
  addSundryPaymentProof,
  confirmSundryClaimPaid,
  exportSundryClaims,
  getSundryClaim,
  getSundryClaims,
  reviewSundryClaim,
} from "@/services/sundry-claim.service";

const TONE: Record<SundryClaimStatus, "neutral" | "positive" | "warning" | "danger" | "info"> = {
  SUBMITTED: "warning",
  CONFIRMED: "info",
  REJECTED: "danger",
  PAID: "positive",
};

export function SundryClaimsOffice() {
  const t = useTranslations("sundryClaim");
  const tRoot = useTranslations();
  const df = useDateFormat();
  const { can } = useAuth();
  const searchParams = useSearchParams();
  const list = useListQuery(["project", "state", "payment"]);
  const rows = useQuery({
    queryKey: ["sundry-claims", "office", list.query],
    queryFn: () => getSundryClaims(list.query),
  });
  // A notification links here with ?record=<id>; that record opens at once.
  const [viewing, setViewing] = useState<string | null>(searchParams.get("record"));
  const total = rows.data?.count ?? 0;
  const title = tRoot("nav.submodule.sundryClaims");

  const columns = useMemo<ColumnDef<SundryClaim, unknown>[]>(
    () => [
      {
        accessorKey: "claim_no",
        meta: { label: t("field.claimNo") },
        header: sortable(t("field.claimNo")),
        cell: ({ row }) => <span className="tabular text-foreground">{row.original.claim_no}</span>,
      },
      {
        id: "state",
        meta: { label: t("field.status") },
        header: () => <PlainHeader label={t("field.status")} />,
        cell: ({ row }) => {
          const status = sundryStatus(row.original);
          return (
            <div className="min-w-0">
              <StatusBadge label={t(`status.${status}`)} tone={TONE[status]} />
              {status === "REJECTED" && row.original.review_note ? (
                <p className="mt-1 max-w-64 truncate text-xs font-medium text-destructive">{row.original.review_note}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "amount",
        meta: { label: t("field.amount") },
        header: sortable(t("field.amount")),
        cell: ({ row }) => <span className="tabular font-medium">RM {row.original.amount}</span>,
      },
      {
        accessorKey: "description",
        meta: { label: t("field.description") },
        header: () => <PlainHeader label={t("field.description")} />,
        cell: ({ row }) => (
          <span className="block max-w-[240px] truncate" title={row.original.description}>
            {row.original.description}
          </span>
        ),
      },
      {
        accessorKey: "submitted_by_name",
        meta: { label: t("field.submittedBy") },
        header: () => <PlainHeader label={t("field.submittedBy")} />,
        cell: ({ row }) => row.original.submitted_by_name || "—",
      },
      {
        accessorKey: "created_at",
        meta: { label: t("field.submittedAt") },
        header: sortable(t("field.submittedAt")),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{df.dateTime(row.original.created_at)}</span>,
      },
      {
        accessorKey: "project_name",
        meta: { label: t("field.project") },
        header: () => <PlainHeader label={t("field.project")} />,
        cell: ({ row }) => <p className="max-w-[180px] truncate">{row.original.project_name}</p>,
      },
      {
        id: "attachments",
        meta: { label: tRoot("moduleTable.photos") },
        header: () => <PlainHeader label={tRoot("moduleTable.photos")} />,
        cell: ({ row }) => <TypeBadge label={String(row.original.attachments.length)} />,
      },
    ],
    [t, tRoot, df],
  );

  const runExport = (format: "xlsx" | "pdf") =>
    exportSundryClaims({
      format,
      title,
      subtitle: tRoot("moduleTable.count", { count: total }),
      emptyLabel: t("empty"),
      query: list.query,
      columns: [
        { key: "claim_no", label: t("field.claimNo") },
        { key: "project_name", label: t("field.project") },
        { key: "amount", label: t("field.amount") },
        { key: "description", label: t("field.description") },
        {
          key: "state",
          label: t("field.status"),
          values: { SUBMITTED: t("status.SUBMITTED"), CONFIRMED: t("status.CONFIRMED"), REJECTED: t("status.REJECTED") },
        },
        {
          key: "payment_state",
          label: t("field.payment"),
          values: { NOT_RECEIVED: t("payment.NOT_RECEIVED"), PARTIAL: t("payment.NOT_RECEIVED"), RECEIVED: t("payment.RECEIVED") },
        },
        { key: "submitted_by_name", label: t("field.submittedBy") },
        { key: "created_at", label: t("field.submittedAt") },
        { key: "reviewed_by_name", label: t("field.reviewedBy") },
        { key: "paid_by_name", label: t("field.paidBy") },
        { key: "paid_at", label: t("field.paidAt") },
      ],
    });

  return (
    <>
      <ModuleRecordsTable
        title={title}
        countLabel={tRoot("moduleTable.count", { count: total })}
        list={list}
        columns={columns}
        rows={rows.data?.results ?? []}
        totalCount={total}
        isLoading={rows.isLoading}
        isError={rows.isError}
        storageKey="sundry-claims"
        toolbar={
          <>
            <ProjectListFilter list={list} />
            <FilterSelect
              list={list}
              param="state"
              allLabel={tRoot("moduleTable.allStatuses")}
              options={(["SUBMITTED", "CONFIRMED", "REJECTED"] as const).map((state) => ({
                value: state,
                label: t(`status.${state}`),
              }))}
            />
            <FilterSelect
              list={list}
              param="payment"
              allLabel={t("payment.all")}
              options={(["NOT_RECEIVED", "RECEIVED"] as const).map((state) => ({
                value: state,
                label: t(`payment.${state}`),
              }))}
            />
            {can("report.export") || can("sundry_claim.view") ? (
              <ExportButton onExport={runExport} disabled={total === 0} />
            ) : null}
          </>
        }
        onOpen={(row) => setViewing(row.id)}
      />
      {viewing && <SundryClaimDetail id={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function SundryClaimDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("sundryClaim");
  const df = useDateFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["sundry-claims", "detail", id], queryFn: () => getSundryClaim(id) });
  const [rejectArmed, setRejectArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [voucher, setVoucher] = useState<File | null>(null);
  const [voucherAmount, setVoucherAmount] = useState("");
  const [error, setError] = useState("");
  const refresh = () => {
    setError("");
    void qc.invalidateQueries({ queryKey: ["sundry-claims"] });
  };
  const fail = (reasonError: unknown) =>
    setError(reasonError instanceof ApiError ? reasonError.message : t("failed"));
  const review = useMutation({
    mutationFn: (decision: "CONFIRMED" | "REJECTED") => reviewSundryClaim(id, decision, decision === "REJECTED" ? reason.trim() : ""),
    onSuccess: () => {
      setRejectArmed(false);
      setReason("");
      refresh();
    },
    onError: fail,
  });
  const upload = useMutation({
    mutationFn: () => addSundryPaymentProof(id, { file: voucher as File, amount: voucherAmount.trim() || undefined }),
    onSuccess: () => {
      setVoucher(null);
      setVoucherAmount("");
      refresh();
    },
    onError: fail,
  });
  const pay = useMutation({ mutationFn: () => confirmSundryClaimPaid(id), onSuccess: refresh, onError: fail });

  const claim = detail.data;
  if (!claim) {
    return (
      <RecordDetailDialog title={t("detailTitle")} onClose={onClose}>
        <div className="grid min-h-32 place-items-center">
          {detail.isError ? <p className="text-sm text-destructive">{t("failed")}</p> : <Loader2 className="size-7 animate-spin text-primary" />}
        </div>
      </RecordDetailDialog>
    );
  }
  const status = sundryStatus(claim);
  const who = (name: string | null, userId: string | null, at: string | null) =>
    name ? `${name}${userId ? ` (${userId.slice(0, 8)})` : ""}${at ? ` · ${df.dateTime(at)}` : ""}` : "—";

  return (
    <RecordDetailDialog title={claim.claim_no} description={`${claim.project_name} · RM ${claim.amount}`} onClose={onClose}>
      <RecordDetailShell
        reference={claim.claim_no}
        facts={[
          { label: t("field.status"), value: <StatusBadge label={t(`status.${status}`)} tone={TONE[status]} /> },
          { label: t("field.project"), value: claim.project_name },
          { label: t("field.amount"), value: `RM ${claim.amount}` },
          { label: t("field.submittedBy"), value: who(claim.submitted_by_name, null, claim.created_at) },
          { label: t("field.reviewedBy"), value: who(claim.reviewed_by_name, claim.reviewed_by_user_id, claim.reviewed_at) },
          { label: t("field.paidBy"), value: who(claim.paid_by_name, claim.paid_by_user_id, claim.paid_at) },
          { label: t("field.description"), value: claim.description, wide: true },
          ...(claim.review_note ? [{ label: t("field.reviewNote"), value: claim.review_note, wide: true }] : []),
        ]}
        photos={claim.attachments.map((file, index) => ({
          id: file.id,
          url: file.image,
          label: file.caption || t("attachmentNumber", { number: index + 1 }),
          takenAt: file.captured_at,
          latitude: file.latitude,
          longitude: file.longitude,
        }))}
        panel={
          <section className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("proofs.title")}</h3>
            {claim.payment_proofs.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("proofs.none")}</p>
            ) : (
              <ul className="space-y-1.5">
                {claim.payment_proofs.map((proof) => (
                  <li key={proof.id} className="flex items-center gap-2 text-xs">
                    <a href={proof.file} target="_blank" rel="noreferrer" className="block size-10 shrink-0 overflow-hidden rounded border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={proof.file} alt={t("proofs.title")} className="size-full object-cover" />
                    </a>
                    <span className="min-w-0">
                      <span className="block font-medium">{proof.amount ? `RM ${proof.amount}` : t("proofs.noAmount")}</span>
                      <span className="block text-muted-foreground">
                        {proof.uploaded_by_name ?? "—"} · {df.dateTime(proof.uploaded_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        }
        actions={
          <div className="space-y-2">
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{error}</p>}
            {claim.state === "SUBMITTED" && can("sundry_claim.review") && (
              <>
                <Button className="w-full" disabled={review.isPending} onClick={() => review.mutate("CONFIRMED")}>
                  <Check />
                  {t("action.confirm")}
                </Button>
                <label className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <Switch
                    checked={rejectArmed}
                    onCheckedChange={(next) => {
                      setRejectArmed(next);
                      if (!next) setReason("");
                    }}
                    aria-label={t("action.armReject")}
                  />
                  <span className="text-xs text-muted-foreground">{t("action.armRejectHelp")}</span>
                </label>
                {rejectArmed && (
                  <FieldWrapper label={t("field.rejectReason")} required>
                    <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
                    <Button
                      className="mt-2 w-full"
                      variant="destructive"
                      requires={[[reason.trim(), t("field.rejectReason")]]}
                      disabled={review.isPending}
                      onClick={() => review.mutate("REJECTED")}
                    >
                      <XCircle />
                      {t("action.reject")}
                    </Button>
                  </FieldWrapper>
                )}
              </>
            )}
            {claim.state === "CONFIRMED" && !claim.is_paid && can("sundry_claim.pay") && (
              <>
                {/* 【确认已付款】 waits on at least one voucher, and this is where
                    one is added - so the group wears that star. */}
                <FieldWrapper label={t("proofs.title")} required className="space-y-2 rounded-md border p-2">
                  <FieldWrapper label={t("proofs.file")} required hint={t("proofs.lockHint")}>
                    <Input type="file" accept="image/*" className="h-8 text-xs" onChange={(event) => setVoucher(event.target.files?.[0] ?? null)} />
                  </FieldWrapper>
                  <FieldWrapper label={t("proofs.amount")}>
                    <Input inputMode="decimal" type="number" min="0" step="0.01" className="h-8" value={voucherAmount} onChange={(event) => setVoucherAmount(event.target.value)} />
                  </FieldWrapper>
                  <Button
                    className="w-full"
                    variant="outline"
                    requires={[[voucher, t("proofs.file")]]}
                    disabled={upload.isPending}
                    onClick={() => upload.mutate()}
                  >
                    {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                    {t("action.uploadProof")}
                  </Button>
                </FieldWrapper>
                <Button
                  className="w-full"
                  requires={[[claim.payment_proofs.length > 0, t("proofs.title")]]}
                  disabled={pay.isPending}
                  onClick={() => pay.mutate()}
                >
                  <BadgeCheck />
                  {t("action.confirmPaid")}
                </Button>
              </>
            )}
            {claim.state === "CONFIRMED" && !claim.is_paid && !can("sundry_claim.pay") && (
              <p className="rounded-md border border-info/25 bg-info/5 px-2 py-1.5 text-xs">{t("waitingForFinance")}</p>
            )}
            {(status === "PAID" || status === "REJECTED") && (
              <p className="rounded-md border px-2 py-1.5 text-xs text-muted-foreground">{t("closed")}</p>
            )}
          </div>
        }
        conversation={{ kind: "SUNDRY_CLAIM", recordId: claim.id }}
      />
    </RecordDetailDialog>
  );
}
