"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical, Eye, FileCheck2, FilePlus2, Filter, XCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FieldWrapper, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type { Invoice, InvoiceKind, InvoiceState } from "@/interfaces/billing";
import { useDateFormat } from "@/lib/dates";
import {
  closeInvoice,
  exportInvoices,
  generateInvoice,
  getInvoice,
  getInvoices,
  issueInvoice,
} from "@/services/billing.service";
import { getCompanies } from "@/services/companies.service";

const STATES: InvoiceState[] = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID", "CANCELLED", "WRITTEN_OFF"];
const TONES: Record<InvoiceState, "positive" | "info" | "warning" | "danger" | "neutral"> = {
  DRAFT: "neutral", ISSUED: "info", PARTIALLY_PAID: "warning", OVERDUE: "danger", PAID: "positive", CANCELLED: "neutral", WRITTEN_OFF: "neutral",
};

export function InvoiceList({ fixedKind, embedded = false }: { fixedKind?: InvoiceKind; embedded?: boolean } = {}) {
  const t = useTranslations("billing");
  const common = useTranslations("common");
  const df = useDateFormat();
  const format = useFormatter();
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const list = useListQuery(["state", "kind", "company", "company_type", "date_from", "date_to", "unpaid"]);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [closing, setClosing] = useState<Invoice | null>(null);
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState<InvoiceKind>(fixedKind ?? "SAAS");
  const [onDate, setOnDate] = useState("");
  const [closeState, setCloseState] = useState<"CANCELLED" | "WRITTEN_OFF">("CANCELLED");
  const [notes, setNotes] = useState("");

  const query = { ...list.query, kind: fixedKind ?? list.query.kind };
  const invoices = useQuery({ queryKey: ["billing", "invoices", query], queryFn: () => getInvoices(query) });
  const companies = useQuery({
    queryKey: ["companies", "billing-options"],
    queryFn: () => getCompanies({ page_size: 100, sort_by: "name", status: "ACTIVE" }),
    enabled: Boolean(user?.is_platform_staff),
  });
  const detail = useQuery({
    queryKey: ["billing", "invoice", viewing?.id],
    queryFn: () => getInvoice(viewing!.id),
    enabled: Boolean(viewing),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["billing"] });
  };
  const generate = useMutation({
    mutationFn: () => generateInvoice({ company, kind, on_date: onDate || undefined }),
    onSuccess: async (invoice) => { await refresh(); setShowGenerate(false); setViewing(invoice); },
  });
  const issue = useMutation({ mutationFn: issueInvoice, onSuccess: refresh });
  const close = useMutation({
    mutationFn: () => closeInvoice(closing!.id, closeState, notes.trim()),
    onSuccess: async () => { await refresh(); setClosing(null); setNotes(""); },
  });

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(() => [
    { accessorKey: "invoice_no", meta: { label: t("field.invoiceNumber") }, header: ({ column }) => <SortableHeader label={t("field.invoiceNumber")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.invoice_no}</span> },
    { accessorKey: "company_name", meta: { label: t("field.company") }, header: () => t("field.company"), cell: ({ row }) => <div><p className="max-w-52 truncate font-medium">{row.original.company_name}</p><p className="text-xs text-muted-foreground">{row.original.company_code}</p></div> },
    { accessorKey: "company_type", meta: { label: t("field.companyType") }, header: () => t("field.companyType"), cell: ({ row }) => <TypeBadge label={t(`companyType.${row.original.company_type}`)} /> },
    { accessorKey: "kind", meta: { label: t("field.kind") }, header: () => t("field.kind"), cell: ({ row }) => <TypeBadge label={t(`kind.${row.original.kind}`)} /> },
    { accessorKey: "period_start", meta: { label: t("field.period") }, header: ({ column }) => <SortableHeader label={t("field.period")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{df.date(row.original.period_start)} - {df.date(row.original.period_end)}</span> },
    { accessorKey: "total_amount", meta: { label: t("field.receivable") }, header: ({ column }) => <SortableHeader label={t("field.receivable")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="font-medium tabular-nums">{format.number(Number(row.original.total_amount), { style: "currency", currency: row.original.currency })}</span> },
    { accessorKey: "amount_outstanding", meta: { label: t("field.outstanding") }, header: () => t("field.outstanding"), cell: ({ row }) => <span className="tabular-nums">{format.number(Number(row.original.amount_outstanding), { style: "currency", currency: row.original.currency })}</span> },
    { accessorKey: "due_on", meta: { label: t("field.dueDate") }, header: ({ column }) => <SortableHeader label={t("field.dueDate")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.due_on ? df.date(row.original.due_on) : common("emptyValue")}</span> },
    { accessorKey: "state", meta: { label: t("field.state") }, header: () => t("field.state"), cell: ({ row }) => <StatusBadge label={t(`state.${row.original.state}`)} tone={TONES[row.original.state]} /> },
    { id: "actions", enableHiding: false, header: () => <span className="sr-only">{common("actions")}</span>, cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" title={common("actions")}><EllipsisVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setViewing(row.original)}><Eye className="h-4 w-4" />{common("view")}</DropdownMenuItem>
          {can("billing.manage") && row.original.state === "DRAFT" && <DropdownMenuItem onSelect={() => issue.mutate(row.original.id)}><FileCheck2 className="h-4 w-4" />{t("action.issue")}</DropdownMenuItem>}
          {can("billing.manage") && !["PAID", "CANCELLED", "WRITTEN_OFF"].includes(row.original.state) && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => { setClosing(row.original); setCloseState("CANCELLED"); }}><XCircle className="h-4 w-4" />{t("action.close")}</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ], [can, common, df, format, issue, t]);

  const totalCount = invoices.data?.count ?? 0;
  const companyRows = companies.data?.results ?? [];
  async function runExport(exportFormat: "xlsx" | "pdf") {
    await exportInvoices({ format: exportFormat, title: t("export.title"), subtitle: t("export.subtitle"), emptyLabel: common("emptyValue"), query, columns: [
      { key: "invoice_no", label: t("field.invoiceNumber") }, { key: "kind", label: t("field.kind"), values: { SAAS: t("kind.SAAS"), COMMISSION: t("kind.COMMISSION") } }, { key: "state", label: t("field.state"), values: Object.fromEntries(STATES.map((state) => [state, t(`state.${state}`)])) }, { key: "company_name", label: t("field.company") }, { key: "period_start", label: t("field.periodStart") }, { key: "period_end", label: t("field.periodEnd") }, { key: "total_amount", label: t("field.receivable") }, { key: "amount_paid", label: t("field.received") }, { key: "amount_outstanding", label: t("field.outstanding") }, { key: "due_on", label: t("field.dueDate") },
    ] });
  }

  return (
    <div className={embedded ? "flex min-h-0 flex-1 flex-col" : "flex h-[calc(100dvh-5rem)] flex-col gap-4"}>
      <DataTable columns={columns} rows={invoices.data?.results ?? []} totalCount={totalCount} page={list.page} pageSize={list.pageSize} isLoading={invoices.isLoading} isError={invoices.isError} hasFilters={list.hasFilters} search={list.search} sortBy={list.sortBy} sortOrder={list.sortOrder} storageKey={`billing-${fixedKind ?? "all"}`}
        filterPills={[{ key: "ALL", label: common("all"), active: !list.filters.state, onSelect: () => list.setFilter("state", undefined) }, ...STATES.slice(0, 5).map((state) => ({ key: state, label: t(`state.${state}`), active: list.filters.state === state, onSelect: () => list.setFilter("state", state) }))]}
        toolbarActions={<><Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 rounded-full"><Filter className="h-4 w-4" />{t("filters.title")}</Button></PopoverTrigger><PopoverContent align="end" className="w-80 space-y-3">
          {!fixedKind && <FilterSelect label={t("field.kind")} value={list.filters.kind ?? ""} onChange={(value) => list.setFilter("kind", value || undefined)} options={[{ value: "", label: common("all") }, { value: "SAAS", label: t("kind.SAAS") }, { value: "COMMISSION", label: t("kind.COMMISSION") }]} />}
          <FilterSelect label={t("field.company")} value={list.filters.company ?? ""} onChange={(value) => list.setFilter("company", value || undefined)} options={[{ value: "", label: common("all") }, ...companyRows.map((row) => ({ value: row.id, label: row.name }))]} />
          <label className="block space-y-1 text-xs font-medium"><span>{t("filters.from")}</span><Input type="date" value={list.filters.date_from ?? ""} onChange={(event) => list.setFilter("date_from", event.target.value || undefined)} /></label>
          <label className="block space-y-1 text-xs font-medium"><span>{t("filters.to")}</span><Input type="date" value={list.filters.date_to ?? ""} onChange={(event) => list.setFilter("date_to", event.target.value || undefined)} /></label>
        </PopoverContent></Popover><ExportButton onExport={runExport} disabled={totalCount === 0} />{can("billing.manage") && <Button size="sm" onClick={() => { setKind(fixedKind ?? "SAAS"); setCompany(companyRows[0]?.id ?? ""); setShowGenerate(true); }}><FilePlus2 className="h-4 w-4" />{t("action.generate")}</Button>}</>}
        onSearchChange={list.setSearch} onSortChange={list.setSort} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} onClearFilters={list.clearFilters} />

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}><DialogContent><DialogHeader><DialogTitle>{t("generate.title")}</DialogTitle><DialogDescription>{t("generate.description")}</DialogDescription></DialogHeader><div className="space-y-4 py-2">
        <FilterSelect label={t("field.company")} value={company} onChange={setCompany} options={companyRows.map((row) => ({ value: row.id, label: `${row.code} / ${row.name}` }))} />
        {!fixedKind && <FilterSelect label={t("field.kind")} value={kind} onChange={(value) => setKind(value as InvoiceKind)} options={[{ value: "SAAS", label: t("kind.SAAS") }, { value: "COMMISSION", label: t("kind.COMMISSION") }]} />}
        <FieldWrapper label={t("generate.runDate")} optional={common("optional")}><Input type="date" value={onDate} onChange={(event) => setOnDate(event.target.value)} /></FieldWrapper>
      </div><DialogFooter><Button variant="outline" onClick={() => setShowGenerate(false)}>{common("cancel")}</Button><Button disabled={!company || generate.isPending} onClick={() => generate.mutate()}>{t("action.generate")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={closing !== null} onOpenChange={(open) => !open && setClosing(null)}><DialogContent><DialogHeader><DialogTitle>{t("close.title")}</DialogTitle><DialogDescription>{t("close.description", { invoice: closing?.invoice_no ?? "" })}</DialogDescription></DialogHeader><div className="space-y-4 py-2"><FilterSelect label={t("field.state")} value={closeState} onChange={(value) => setCloseState(value as "CANCELLED" | "WRITTEN_OFF")} options={[{ value: "CANCELLED", label: t("state.CANCELLED") }, { value: "WRITTEN_OFF", label: t("state.WRITTEN_OFF") }]} /><FieldWrapper label={t("field.notes")} required><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={() => setClosing(null)}>{common("cancel")}</Button><Button variant="destructive" disabled={!notes.trim() || close.isPending} onClick={() => close.mutate()}>{t("action.close")}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{viewing?.invoice_no}</DialogTitle><DialogDescription>{viewing ? `${viewing.company_name} / ${t(`kind.${viewing.kind}`)}` : ""}</DialogDescription></DialogHeader>{detail.isLoading ? <p>{common("loading")}</p> : detail.data && <InvoiceDetailView invoice={detail.data} />}</DialogContent></Dialog>
    </div>
  );
}

function InvoiceDetailView({ invoice }: { invoice: Awaited<ReturnType<typeof getInvoice>> }) {
  const t = useTranslations("billing"); const df = useDateFormat(); const format = useFormatter();
  return <div className="space-y-5"><div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y py-4 text-sm md:grid-cols-4"><Value label={t("field.state")} value={t(`state.${invoice.state}`)} /><Value label={t("field.period")} value={`${df.date(invoice.period_start)} - ${df.date(invoice.period_end)}`} /><Value label={t("field.receivable")} value={format.number(Number(invoice.total_amount), { style: "currency", currency: invoice.currency })} /><Value label={t("field.outstanding")} value={format.number(Number(invoice.amount_outstanding), { style: "currency", currency: invoice.currency })} /></div>
    {invoice.kind === "COMMISSION" && <div className="grid grid-cols-3 gap-3 text-sm"><Value label={t("field.businessWeight")} value={`${invoice.basis_weight_kg} kg`} /><Value label={t("field.settlementAmount")} value={`${invoice.currency} ${invoice.basis_amount}`} /><Value label={t("field.commissionRate")} value={invoice.basis_rate ?? "-"} /></div>}
    <div><h3 className="mb-2 text-sm font-semibold">{t("detail.lines")}</h3>{invoice.lines.map((line) => <div key={line.id} className="flex justify-between gap-4 border-t py-2 text-sm"><span>{line.description}</span><span className="tabular-nums">{invoice.currency} {line.line_total}</span></div>)}</div>
    {invoice.settlement_links.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">{t("detail.settlements")}</h3>{invoice.settlement_links.map((link) => <div key={link.id} className="grid grid-cols-3 border-t py-2 text-xs"><span>{link.settlement_no}</span><span>{link.settled_weight_kg} kg</span><span>{invoice.currency} {link.settled_amount}</span></div>)}</div>}
    {invoice.payments.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">{t("detail.payments")}</h3>{invoice.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 border-t py-2 text-sm"><span>{df.date(payment.paid_on)} / {payment.reference || "-"}</span><StatusBadge label={t(`paymentState.${payment.state}`)} tone={payment.state === "CONFIRMED" ? "positive" : payment.state === "REJECTED" ? "danger" : "warning"} /><span className="tabular-nums">{invoice.currency} {payment.amount}</span></div>)}</div>}
  </div>;
}

function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="block space-y-1 text-xs font-medium"><span>{label}</span><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || "ALL"} value={option.value}>{option.label}</option>)}</select></label>; }
