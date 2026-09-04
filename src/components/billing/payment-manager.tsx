"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Plus, XCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Payment, PaymentMethod } from "@/interfaces/billing";
import { useDateFormat } from "@/lib/dates";
import {
  createPayment,
  getInvoices,
  getPayments,
  reviewPayment,
} from "@/services/billing.service";

export function PaymentManager({ proofsOnly = false }: { proofsOnly?: boolean }) {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const df = useDateFormat();
  const format = useFormatter();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [reviewing, setReviewing] = useState<Payment | null>(null);
  const [reviewState, setReviewState] = useState<"CONFIRMED" | "REJECTED">("CONFIRMED");
  const [reviewNote, setReviewNote] = useState("");
  const [invoice, setInvoice] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<File | null>(null);

  const payments = useQuery({
    queryKey: ["billing", "payments", state],
    queryFn: () => getPayments({ page_size: 100, state: state || undefined }),
  });
  const openInvoices = useQuery({
    queryKey: ["billing", "invoices", "payable"],
    queryFn: () => getInvoices({ page_size: 100, unpaid: true }),
    enabled: showCreate,
  });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["billing"] }); };
  const create = useMutation({
    mutationFn: () => createPayment({ invoice, amount, paid_on: paidOn, method, reference: reference.trim(), notes: notes.trim(), proof }),
    onSuccess: async () => { await refresh(); setShowCreate(false); resetForm(); },
  });
  const review = useMutation({
    mutationFn: () => reviewPayment(reviewing!.id, reviewState, reviewNote.trim()),
    onSuccess: async () => { await refresh(); setReviewing(null); setReviewNote(""); },
  });

  function resetForm() {
    setInvoice(""); setAmount(""); setPaidOn(""); setMethod("BANK_TRANSFER"); setReference(""); setNotes(""); setProof(null);
  }
  function openReview(payment: Payment, next: "CONFIRMED" | "REJECTED") {
    setReviewing(payment); setReviewState(next); setReviewNote("");
  }

  const rows = (payments.data?.results ?? []).filter((payment) => !proofsOnly || payment.proof);
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1.5">{["", "PENDING", "CONFIRMED", "REJECTED"].map((value) => <Button key={value || "ALL"} size="sm" variant={state === value ? "secondary" : "ghost"} onClick={() => setState(value)}>{value ? t(`paymentState.${value}`) : common("all")}</Button>)}</div>
      {can("billing.pay") && <Button size="sm" onClick={() => { setShowCreate(true); resetForm(); }}><Plus className="h-4 w-4" />{t("payment.record")}</Button>}
    </div>
    <div className="min-h-0 overflow-auto rounded-lg border bg-card">
      <Table><TableHeader><TableRow><TableHead>{t("field.invoiceNumber")}</TableHead><TableHead>{t("field.company")}</TableHead><TableHead>{t("field.paidOn")}</TableHead><TableHead>{t("field.method")}</TableHead><TableHead>{t("field.reference")}</TableHead><TableHead>{t("field.amount")}</TableHead><TableHead>{t("field.proof")}</TableHead><TableHead>{t("field.state")}</TableHead><TableHead className="text-right"><span className="sr-only">{common("actions")}</span></TableHead></TableRow></TableHeader>
        <TableBody>{payments.isLoading ? <TableRow><TableCell colSpan={9} className="h-24">{common("loading")}</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={9} className="h-24 text-muted-foreground">{t("payment.empty")}</TableCell></TableRow> : rows.map((payment) => <TableRow key={payment.id}><TableCell className="font-medium tabular-nums">{payment.invoice_no}</TableCell><TableCell>{payment.company_name}</TableCell><TableCell className="tabular-nums">{df.date(payment.paid_on)}</TableCell><TableCell>{t(`paymentMethod.${payment.method}`)}</TableCell><TableCell>{payment.reference || common("emptyValue")}</TableCell><TableCell className="font-medium tabular-nums">{format.number(Number(payment.amount), { style: "currency", currency: "MYR" })}</TableCell><TableCell>{payment.proof ? <a href={payment.proof} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{t("payment.viewProof")}<ExternalLink className="h-3 w-3" /></a> : common("emptyValue")}</TableCell><TableCell><StatusBadge label={t(`paymentState.${payment.state}`)} tone={payment.state === "CONFIRMED" ? "positive" : payment.state === "REJECTED" ? "danger" : "warning"} /></TableCell><TableCell><div className="flex items-center justify-end gap-0.5">{can("billing.collect") && payment.state === "PENDING" && <><Button size="icon-sm" variant="ghost" title={t("payment.confirm")} onClick={() => openReview(payment, "CONFIRMED")}><CheckCircle2 className="text-success" /></Button><Button size="icon-sm" variant="ghost" title={t("payment.reject")} onClick={() => openReview(payment, "REJECTED")}><XCircle className="text-destructive" /></Button></>}</div></TableCell></TableRow>)}</TableBody></Table>
    </div>

    <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("payment.record")}</DialogTitle><DialogDescription>{t("payment.recordDescription")}</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2">
      <FieldWrapper label={t("field.invoiceNumber")} required className="sm:col-span-2"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={invoice} onChange={(event) => { const id = event.target.value; setInvoice(id); const row = openInvoices.data?.results.find((item) => item.id === id); if (row) setAmount(row.amount_outstanding); }}><option value="">{t("payment.chooseInvoice")}</option>{(openInvoices.data?.results ?? []).map((row) => <option key={row.id} value={row.id}>{row.invoice_no} / {row.company_name} / {row.currency} {row.amount_outstanding}</option>)}</select></FieldWrapper>
      <FieldWrapper label={t("field.amount")} required><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></FieldWrapper>
      <FieldWrapper label={t("field.paidOn")} required><Input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} /></FieldWrapper>
      <FieldWrapper label={t("field.method")} required><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{["BANK_TRANSFER", "CHEQUE", "CASH", "ONLINE", "OTHER"].map((value) => <option key={value} value={value}>{t(`paymentMethod.${value}`)}</option>)}</select></FieldWrapper>
      <FieldWrapper label={t("field.reference")} optional={common("optional")}><Input value={reference} onChange={(event) => setReference(event.target.value)} /></FieldWrapper>
      <FieldWrapper label={t("field.proof")} optional={common("optional")} className="sm:col-span-2"><Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setProof(event.target.files?.[0] ?? null)} /></FieldWrapper>
      <FieldWrapper label={t("field.notes")} optional={common("optional")} className="sm:col-span-2"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></FieldWrapper>
    </div><DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)}>{common("cancel")}</Button><Button requires={[[invoice, t("field.invoiceNumber")], [amount, t("field.amount")], [paidOn, t("field.paidOn")]]} disabled={create.isPending} onClick={() => create.mutate()}>{t("payment.record")}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={reviewing !== null} onOpenChange={(open) => !open && setReviewing(null)}><DialogContent><DialogHeader><DialogTitle>{t(reviewState === "CONFIRMED" ? "payment.confirm" : "payment.reject")}</DialogTitle><DialogDescription>{reviewing?.invoice_no} / MYR {reviewing?.amount}</DialogDescription></DialogHeader><FieldWrapper label={t("field.reviewNote")} required={reviewState === "REJECTED"} optional={reviewState === "CONFIRMED" ? common("optional") : undefined}><Textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></FieldWrapper><DialogFooter><Button variant="outline" onClick={() => setReviewing(null)}>{common("cancel")}</Button><Button variant={reviewState === "REJECTED" ? "destructive" : "default"} requires={[[reviewState !== "REJECTED" || reviewNote, t("field.reviewNote")]]} disabled={review.isPending} onClick={() => review.mutate()}>{t(reviewState === "CONFIRMED" ? "payment.confirm" : "payment.reject")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
