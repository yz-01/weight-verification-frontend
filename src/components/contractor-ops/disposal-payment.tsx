"use client";

/**
 * 「付款凭证」 of a 清运结算 (JB299, 客户 11-28d 事项 2).
 *
 * 「请完善垃圾清运结算及付款凭证流程，与现有设备租赁结算的操作方式保持一致。
 * 1. 核对清运记录及金额，生成结算单。2. 财务付款后，上传付款凭证及填写付款编号。
 * 3. 确认结算完毕，系统自动记录确认人及时间，并锁定归档。……6. 未上传付款凭证，
 * 不允许确认结算完毕。系统不涉及实际转账，只负责记录付款证据。」
 *
 * - 【上传付款凭证】 on a 准备结算 row: 付款编号 (required) + photos / PDFs.
 * - 【准备结算】 with no voucher yet: a plain window says why it cannot go on
 *   and offers the upload - the server refuses it too
 *   (`disposal_settlement_payment_missing`).
 * - An old 结算完毕 row without vouchers is marked 「旧记录：没有付款凭证」 and
 *   offers 【补上传付款凭证】 once, signed with the PIN.
 *
 * Office only; the phone never sees these (the server refuses it too).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, ImageIcon, Loader2, Lock, Paperclip, Save, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
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
import { ApiError } from "@/interfaces/api";
import { useDateFormat } from "@/lib/dates";
import { mayHandleDisposalFees } from "@/lib/disposal-fees";
import {
  VOUCHER_ACCEPT,
  VOUCHER_MAX_FILES,
  fileSizeText,
  paymentReady,
  voucherProblem,
} from "@/lib/disposal-payment";
import { isSignOffCancelled } from "@/lib/sign-off";
import { useMoneyStep } from "@/lib/money-steps";
import {
  disposalVoucherUrl,
  recordDisposalPayment,
  type DisposalSettlement,
  type DisposalSettlementRow,
} from "@/services/disposal-settlement.service";

/** What a saved voucher changes elsewhere. */
const PAYMENT_STALE_KEYS = [["disposal-settlements"], ["site-disposals"]] as const;

/** 【上传付款凭证】 (准备结算) / 【补上传付款凭证】 (old 结算完毕) - or nothing. */
export function PaymentButton({ row, size = "sm" }: { row: DisposalSettlementRow; size?: "sm" | "default" }) {
  const t = useTranslations("jb299");
  const { can, user } = useAuth();
  const [open, setOpen] = useState(false);
  // JB306: 「结算确认」 switch - the 付款凭证 is part of the settlement.
  const settleStep = useMoneyStep("settle");
  if (!user || user.is_field_staff) return null;
  const old = Boolean(row.old_without_voucher);
  if (row.status === "SETTLED" && !old) return null;
  const label = old ? t("upload.again") : row.voucher_count ? t("upload.more") : t("upload.button");
  if (!mayHandleDisposalFees(user, can) || settleStep.off) {
    return (
      <Button size={size} variant="outline" disabled disabledReason={!mayHandleDisposalFees(user, can) ? t("upload.noRight") : settleStep.reason} showReason>
        <Lock />
        {label}
      </Button>
    );
  }
  return (
    <>
      <Button
        size={size}
        variant={row.voucher_count ? "outline" : "default"}
        data-slot="settlement-upload"
        onClick={() => setOpen(true)}
      >
        <Upload />
        {label}
      </Button>
      {open ? <PaymentDialog row={row} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The upload window: 付款编号 and the files, checked before anything is sent. */
export function PaymentDialog({
  row,
  onClose,
  onSaved,
}: {
  row: DisposalSettlementRow;
  onClose: () => void;
  onSaved?: (settlement: DisposalSettlement) => void;
}) {
  const t = useTranslations("jb299");
  const queryClient = useQueryClient();
  const old = Boolean(row.old_without_voucher);
  const hasVouchers = (row.voucher_count ?? 0) > 0;
  const [paymentNo, setPaymentNo] = useState(row.payment_no ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // One save per press: a double click must not send the files twice.
  const sending = useRef(false);
  const problem = voucherProblem(files);
  const save = useMutation({
    mutationFn: () => recordDisposalPayment(row.id, { paymentNo, files }),
    onSuccess: (settlement) => {
      for (const key of PAYMENT_STALE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
      onSaved?.(settlement);
      onClose();
    },
    onError: (reason) => {
      if (isSignOffCancelled(reason)) return;
      setError(reason instanceof ApiError ? reason.message : t("upload.failed"));
    },
  });
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError("");
    // Copied now: clearing the box below empties the list it handed over.
    const chosen = Array.from(list);
    setFiles((before) => [...before, ...chosen]);
    if (picker.current) picker.current.value = "";
  };
  const problemText = problem
    ? problem.key === "tooMany"
      ? t("upload.tooMany", { limit: problem.limit })
      : t(`upload.${problem.key}`, { name: problem.name })
    : "";
  const noNumber = tried && !paymentNo.trim();
  const noFile = tried && files.length === 0 && !hasVouchers;
  return (
    <Dialog open onOpenChange={(next) => !next && !save.isPending && onClose()}>
      <DialogContent data-slot="settlement-upload-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{old ? t("upload.againTitle", { number: row.number }) : t("upload.title", { number: row.number })}</DialogTitle>
          <DialogDescription>
            {t("upload.help", { supplier: row.supplier.name })}
          </DialogDescription>
        </DialogHeader>
        <FieldWrapper
          label={t("upload.paymentNo")}
          required
          hint={t("upload.paymentNoHint")}
          error={noNumber ? t("upload.paymentNoMissing") : undefined}
        >
          <Input
            value={paymentNo}
            maxLength={100}
            aria-label={t("upload.paymentNo")}
            data-slot="settlement-payment-no"
            onChange={(event) => {
              setPaymentNo(event.target.value);
              setError("");
            }}
          />
        </FieldWrapper>
        <FieldWrapper
          label={t("upload.files")}
          required={!hasVouchers}
          hint={t("upload.filesHint", { limit: VOUCHER_MAX_FILES })}
          error={problemText || (noFile ? t("upload.fileMissing") : undefined)}
        >
          <div className="space-y-2">
            <input
              ref={picker}
              type="file"
              multiple
              accept={VOUCHER_ACCEPT}
              className="sr-only"
              data-slot="settlement-voucher-input"
              onChange={(event) => addFiles(event.target.files)}
            />
            <Button type="button" variant="outline" className="h-11" onClick={() => picker.current?.click()}>
              <Paperclip />
              {t("upload.choose")}
            </Button>
            {files.length > 0 ? (
              <ul className="space-y-1" data-slot="settlement-voucher-chosen">
                {files.map((file, index) => {
                  const pdf = file.name.toLowerCase().endsWith(".pdf");
                  const Icon = pdf ? FileText : ImageIcon;
                  return (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="tabular text-xs text-muted-foreground">{fileSizeText(file.size)}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("upload.remove", { name: file.name })}
                        onClick={() => setFiles((before) => before.filter((_each, at) => at !== index))}
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : hasVouchers ? (
              <p className="text-xs text-muted-foreground">{t("upload.alreadyHas", { count: row.voucher_count ?? 0 })}</p>
            ) : null}
          </div>
        </FieldWrapper>
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm" data-slot="settlement-evidence-only">
          {t("evidenceOnly")}
        </p>
        <p className="text-xs text-muted-foreground">{old ? t("upload.againPin") : t("upload.keepNote")}</p>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose} data-slot="settlement-upload-cancel">
            {t("upload.cancel")}
          </Button>
          <Button
            data-slot="settlement-upload-save"
            disabled={save.isPending}
            onClick={() => {
              setTried(true);
              if (!paymentReady(paymentNo, files, hasVouchers) || sending.current) return;
              sending.current = true;
              save.mutate(undefined, {
                onSettled: () => {
                  sending.current = false;
                },
              });
            }}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("upload.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 【准备结算】 pressed before the payment evidence is in: why it cannot go on
 * (「未上传付款凭证，不允许确认结算完毕」) and the way forward.
 */
export function PaymentMissingDialog({ row, onClose }: { row: DisposalSettlementRow; onClose: () => void }) {
  const t = useTranslations("jb299");
  const [uploading, setUploading] = useState(false);
  if (uploading) return <PaymentDialog row={row} onClose={onClose} />;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-slot="settlement-payment-missing" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("missing.title")}</DialogTitle>
          <DialogDescription>{t("missing.body", { number: row.number })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("upload.cancel")}
          </Button>
          <Button data-slot="settlement-missing-upload" onClick={() => setUploading(true)}>
            <Upload />
            {t("upload.button")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 付款编号 in a list cell: the number, 「还没有上传」, or 「旧记录：没有付款凭证」. */
export function PaymentCell({ row }: { row: DisposalSettlementRow }) {
  const t = useTranslations("jb299");
  if (row.old_without_voucher) {
    return <StatusBadge label={t("oldNoVoucher")} tone="warning" />;
  }
  if (!row.payment_no) return <span className="text-sm text-muted-foreground">{t("notUploaded")}</span>;
  return (
    <span className="text-sm">
      <span className="font-medium">{row.payment_no}</span>
      <span className="block text-xs text-muted-foreground">{t("voucherCount", { count: row.voucher_count ?? 0 })}</span>
    </span>
  );
}

/** The window's 付款凭证 block: number, who / when, each file to open. */
export function PaymentFacts({ settlement }: { settlement: DisposalSettlement }) {
  const t = useTranslations("jb299");
  const df = useDateFormat();
  const [opening, setOpening] = useState<string | null>(null);
  const vouchers = settlement.vouchers ?? [];
  const open = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try {
      const url = await disposalVoucherUrl(settlement.id, id);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // The API client has already said why.
    } finally {
      setOpening(null);
    }
  };
  return (
    <section className="space-y-2 rounded-xl border p-4" data-slot="settlement-payment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("voucherTitle")}</h3>
        <PaymentButton row={settlement} />
      </div>
      {settlement.old_without_voucher ? (
        <p className="text-sm text-warning" data-slot="settlement-old-no-voucher">{t("oldNoVoucherHelp")}</p>
      ) : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("upload.paymentNo")}</dt>
          <dd className="font-semibold">{settlement.payment_no || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("recordedBy")}</dt>
          <dd className="font-semibold">
            {settlement.payment_recorded_at
              ? `${settlement.payment_recorded_by_name ?? ""} · ${df.dateTime(settlement.payment_recorded_at)}`
              : "—"}
          </dd>
        </div>
      </dl>
      {vouchers.length > 0 ? (
        <ul className="space-y-1" data-slot="settlement-vouchers">
          {vouchers.map((voucher, index) => (
            <li key={voucher.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
              <span className="text-muted-foreground">{t("voucherN", { n: index + 1 })}</span>
              <span className="min-w-0 flex-1 truncate">{voucher.name}</span>
              <span className="text-xs text-muted-foreground">
                {voucher.uploaded_by_name} · {df.dateTime(voucher.uploaded_at)}
              </span>
              <Button size="sm" variant="outline" onClick={() => void open(voucher.id)}>
                {opening === voucher.id ? <Loader2 className="animate-spin" /> : <FileText />}
                {t("openVoucher")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("evidenceOnly")}</p>
      <p className="text-xs text-muted-foreground">{t("inPdf")}</p>
    </section>
  );
}
