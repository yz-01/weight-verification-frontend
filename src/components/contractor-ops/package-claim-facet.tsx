"use client";

import { useMutation } from "@tanstack/react-query";
import { Coins, FileUp } from "lucide-react";
import { FileThumbs } from "@/components/shared/file-thumbs";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PaymentDialog } from "@/components/contractor-ops/claim-engine";
import { Shell } from "@/components/contractor-ops/package-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDateFormat } from "@/lib/dates";
import type { ClaimDetail, PackageClaimFacet, PaymentProof } from "@/interfaces/contractor-ops";
import { addClaimPaymentProof, setClaimAmount } from "@/services/contractor-ops.service";

/**
 * Amount, period, collection and payment proofs - on the two claim types
 * only (batch H, HD17: 「非 Progress Claim 的 Package 不需要显示 Claim 金额、期数
 * 或收款功能」).
 *
 * A Progress Claim's are its claim's: what it asks for, the period, 收款 and
 * the client's vouchers. A Sundry Claim package carries sundry claims as its
 * records; each keeps its own submit → review → voucher flow in 杂费报销, and
 * this only adds them up.
 */
export function ClaimFacetBlock({ facet, onChanged }: { facet: PackageClaimFacet; onChanged: () => void }) {
  const t = useTranslations("multiEngine");
  const claims = useTranslations("claims");
  const formatter = useDateFormat();
  const { can } = useAuth();
  const [editing, setEditing] = useState<"amount" | "voucher" | "payment" | null>(null);

  if (facet.type === "SUNDRY_CLAIM") {
    const rows = facet.sundry ?? [];
    return (
      <section className="space-y-2 rounded-lg border bg-muted/20 p-3" aria-label={t("claimFacet.title")}>
        <p className="text-sm font-medium">
          {t("claimFacet.sundryTotal", { amount: money(facet.sundry_total ?? "0") })}
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("claimFacet.noSundry")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2">
                <span>{row.claim_no}</span>
                <span className="text-muted-foreground">
                  {money(row.amount ?? "0")} · {claims(`payment.${row.payment_state}`)} ·{" "}
                  {t("claimFacet.voucherCount", { count: row.payment_proof_count })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const claim = facet.claim;
  if (!claim) return null;
  const paid = claim.payment_state === "RECEIVED";
  return (
    <section className="space-y-2 rounded-lg border bg-muted/20 p-3" aria-label={t("claimFacet.title")}>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <Fact label={claims("field.period")} value={`${claim.claim_no} · ${formatter.date(claim.period)}`} />
        <Fact
          label={t("claimFacet.amount")}
          value={claim.amount === null ? t("claimFacet.noAmount") : money(claim.amount)}
        />
        <Fact label={claims("column.payment")} value={claims(`payment.${claim.payment_state}`)} />
        {claim.payment_note && <Fact label={claims("field.paymentNote")} value={claim.payment_note} />}
      </div>
      <Vouchers proofs={claim.payment_proofs} />
      <div className="flex flex-wrap gap-2">
        {can("claim.manage") && !paid && (
          <Button size="sm" variant="outline" onClick={() => setEditing("amount")}>
            {t("claimFacet.setAmount")}
          </Button>
        )}
        {can("claim.confirm_payment") && claim.state === "CONFIRMED" && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing("voucher")}>
              <FileUp className="size-4" />
              {t("claimFacet.addVoucher")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing("payment")}>
              <Coins className="size-4" />
              {claims("recordPayment")}
            </Button>
          </>
        )}
      </div>
      {editing === "amount" && (
        <AmountDialog
          claimId={claim.id}
          current={claim.amount ?? ""}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {editing === "voucher" && (
        <VoucherDialog
          claimId={claim.id}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {editing === "payment" && (
        <PaymentDialog
          claim={{ id: claim.id, payment_state: claim.payment_state, payment_note: claim.payment_note }}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

/** The way 杂费报销 writes an amount. */
function money(value: string) {
  return `RM ${value}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value}</p>
    </div>
  );
}

/** The vouchers, each opened from its stored file. */
export function Vouchers({ proofs }: { proofs: PaymentProof[] }) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  if (!proofs.length) {
    return <p className="text-xs text-muted-foreground">{t("claimFacet.noVouchers")}</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {proofs.map((proof) => (
        <li key={proof.id} className="flex flex-wrap items-center gap-2">
          {/* The voucher as a picture (J34-11): a photo itself, a PDF its type. */}
          <FileThumbs
            files={[
              {
                id: proof.id,
                name: proof.name,
                thumbnail_url: proof.file && proof.preview_type?.startsWith("image/") ? proof.file : null,
                href: proof.file,
              },
            ]}
          />
          {proof.file ? (
            <a href={proof.file} target="_blank" rel="noreferrer noopener" className="text-primary underline">
              {proof.name}
            </a>
          ) : (
            <span>{proof.name}</span>
          )}
          <span className="text-muted-foreground">
            {proof.amount ? `${money(proof.amount)} · ` : ""}
            {proof.note ? `${proof.note} · ` : ""}
            {proof.uploaded_by_name ?? "—"} · {formatter.dateTime(proof.uploaded_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AmountDialog({
  claimId,
  current,
  onClose,
  onDone,
}: {
  claimId: string;
  current: string;
  onClose: () => void;
  onDone: (row: ClaimDetail) => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const [amount, setAmount] = useState(current);
  const save = useMutation({ mutationFn: () => setClaimAmount(claimId, amount), onSuccess: onDone });
  return (
    <Shell title={t("claimFacet.setAmount")} onClose={onClose}>
      <div className="space-y-4 p-4">
        <FieldWrapper label={t("claimFacet.amount")} hint={t("claimFacet.amountHelp")}>
          <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </FieldWrapper>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {common("save")}
        </Button>
      </footer>
    </Shell>
  );
}

export function VoucherDialog({
  claimId,
  onClose,
  onDone,
}: {
  claimId: string;
  onClose: () => void;
  onDone: (row: ClaimDetail) => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => addClaimPaymentProof(claimId, { file: file as File, amount, note }),
    onSuccess: onDone,
  });
  return (
    <Shell title={t("claimFacet.addVoucher")} onClose={onClose}>
      <div className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground">{t("claimFacet.voucherHelp")}</p>
        <FieldWrapper label={t("claimFacet.voucherFile")} required>
          <input
            type="file"
            accept="image/*,application/pdf"
            aria-label={t("claimFacet.voucherFile")}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </FieldWrapper>
        <FieldWrapper label={t("claimFacet.voucherAmount")}>
          <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </FieldWrapper>
        <FieldWrapper label={t("claimFacet.voucherNote")}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={255} />
        </FieldWrapper>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[[file, t("claimFacet.voucherFile")]]}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {common("save")}
        </Button>
      </footer>
    </Shell>
  );
}
