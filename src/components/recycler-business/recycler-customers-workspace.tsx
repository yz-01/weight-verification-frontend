"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  Plus,
  Power,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
import { GateQrScanner } from "@/components/site-access/gate-qr-scanner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useListQuery } from "@/hooks/use-list-query";
import type {
  PrivateIntake,
  RecyclerCustomer,
  RecyclerCustomerPayload,
  RecyclerMaterialType,
  StartPrivateIntakePayload,
} from "@/interfaces/recycler-business";
import { RECYCLER_MATERIAL_TYPES } from "@/interfaces/recycler-business";
import type { WeighSessionRow } from "@/interfaces/weighing";
import { useDateFormat } from "@/lib/dates";
import {
  cancelPrivateIntake,
  completePrivateIntake,
  createRecyclerCustomer,
  getCustomerQr,
  getPrivateIntakes,
  getRecyclerCustomers,
  issueCustomerQr,
  reissueCustomerQr,
  setCustomerQrStatus,
  setRecyclerCustomerStatus,
  startPrivateIntake,
  syncPlatformCustomers,
  updateRecyclerCustomer,
} from "@/services/recycler-business.service";
import { getSites, getWeighSessions } from "@/services/weighing.service";

export function RecyclerCustomersWorkspace() {
  const t = useTranslations("recyclerBusiness");

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col gap-4">
      <ListHeader
        title={t("customers.title")}
        subtitle={t("customers.subtitle")}
      />
      <Tabs defaultValue="customers" className="min-h-0 flex-1">
        <TabsList className="h-11 w-full justify-start overflow-x-auto p-1 sm:w-fit">
          <TabsTrigger value="customers" className="min-w-40 px-4 py-2">
            <Users />
            {t("customers.tab")}
          </TabsTrigger>
          <TabsTrigger value="intakes" className="min-w-40 px-4 py-2">
            <ScanLine />
            {t("intakes.tab")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="min-h-0">
          <CustomersPanel />
        </TabsContent>
        <TabsContent value="intakes" className="min-h-0">
          <PrivateIntakesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CustomersPanel() {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const { can } = useAuth();
  const list = useListQuery(["customer_type"]);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RecyclerCustomer | "new" | null>(null);
  const [qrCustomer, setQrCustomer] = useState<RecyclerCustomer | null>(null);

  const customers = useQuery({
    queryKey: ["recycler-customers", list.query],
    queryFn: () => getRecyclerCustomers(list.query),
  });
  const sync = useMutation({
    mutationFn: syncPlatformCustomers,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["recycler-customers"] }),
  });
  const status = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setRecyclerCustomerStatus(id, active),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["recycler-customers"] }),
  });

  const columns = useMemo<ColumnDef<RecyclerCustomer, unknown>[]>(
    () => [
      {
        accessorKey: "customer_no",
        meta: { label: t("field.customerNo") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.customerNo")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.customer_no}</span>
        ),
      },
      {
        accessorKey: "company_name",
        meta: { label: t("field.companyName") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.companyName")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="max-w-64">
            <p className="truncate font-medium">{row.original.company_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.contact_person || row.original.contact_phone || common("emptyValue")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "customer_type",
        meta: { label: t("field.source") },
        header: () => t("field.source"),
        cell: ({ row }) => (
          <TypeBadge label={t(`source.${row.original.customer_type}`)} />
        ),
      },
      {
        accessorKey: "total_weight_kg",
        meta: { label: t("field.totalWeight") },
        header: ({ column }) => (
          <SortableHeader
            label={t("field.totalWeight")}
            isSorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.total_weight_kg} kg</span>
        ),
      },
      {
        accessorKey: "is_active",
        meta: { label: t("field.status") },
        header: () => t("field.status"),
        cell: ({ row }) => (
          <StatusBadge
            label={t(row.original.is_active ? "status.active" : "status.inactive")}
            tone={row.original.is_active ? "positive" : "neutral"}
          />
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">{common("actions")}</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {row.original.customer_type === "PRIVATE" && (
              <Button
                size="icon"
                variant="ghost"
                title={t("qr.action")}
                onClick={() => setQrCustomer(row.original)}
              >
                <QrCode />
              </Button>
            )}
            {can("customer.manage") && row.original.customer_type === "PRIVATE" && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  title={common("edit")}
                  onClick={() => setEditing(row.original)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title={t(row.original.is_active ? "action.deactivate" : "action.activate")}
                  onClick={() =>
                    status.mutate({ id: row.original.id, active: !row.original.is_active })
                  }
                >
                  <Power />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [can, common, status, t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <DataTable
        columns={columns}
        rows={customers.data?.results ?? []}
        totalCount={customers.data?.count ?? 0}
        page={list.page}
        pageSize={list.pageSize}
        isLoading={customers.isLoading}
        isError={customers.isError}
        hasFilters={list.hasFilters}
        search={list.search}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        storageKey="recycler-customers"
        filterPills={[
          { key: "all", label: t("filter.all"), active: !list.filters.customer_type, onSelect: () => list.setFilter("customer_type", undefined) },
          { key: "platform", label: t("source.PLATFORM"), active: list.filters.customer_type === "PLATFORM", onSelect: () => list.setFilter("customer_type", "PLATFORM") },
          { key: "private", label: t("source.PRIVATE"), active: list.filters.customer_type === "PRIVATE", onSelect: () => list.setFilter("customer_type", "PRIVATE") },
        ]}
        toolbarActions={
          can("customer.manage") ? (
            <>
              <Button variant="outline" size="sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
                {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                <span className="hidden sm:inline">{t("action.sync")}</span>
              </Button>
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus />
                {t("action.addCustomer")}
              </Button>
            </>
          ) : undefined
        }
        onSearchChange={list.setSearch}
        onSortChange={list.setSort}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onClearFilters={list.clearFilters}
      />
      {editing && (
        <CustomerDialog
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {qrCustomer && (
        <CustomerQrDialog customer={qrCustomer} onClose={() => setQrCustomer(null)} />
      )}
    </div>
  );
}

const EMPTY_CUSTOMER: RecyclerCustomerPayload = {
  company_name: "",
  registration_no: "",
  contact_person: "",
  contact_phone: "",
  contact_email: "",
  address: "",
  notes: "",
  bank_name: "",
  bank_account_name: "",
  bank_account_no: "",
  bank_notes: "",
};

function CustomerDialog({ customer, onClose }: { customer: RecyclerCustomer | null; onClose: () => void }) {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RecyclerCustomerPayload>(
    customer ? Object.fromEntries(Object.keys(EMPTY_CUSTOMER).map((key) => [key, customer[key as keyof RecyclerCustomer] ?? ""])) as unknown as RecyclerCustomerPayload : EMPTY_CUSTOMER,
  );
  const save = useMutation({
    mutationFn: () => customer ? updateRecyclerCustomer(customer.id, form) : createRecyclerCustomer(form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recycler-customers"] });
      onClose();
    },
  });
  const set = (key: keyof RecyclerCustomerPayload, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key: keyof RecyclerCustomerPayload, label: string, required = false) => (
    <FieldWrapper label={label} required={required}>
      <Input value={form[key] ?? ""} onChange={(event) => set(key, event.target.value)} />
    </FieldWrapper>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(customer ? "customers.editTitle" : "customers.createTitle")}</DialogTitle>
          <DialogDescription>{t("customers.formHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("company_name", t("field.companyName"), true)}
          {input("registration_no", t("field.registrationNo"))}
          {input("contact_person", t("field.contactPerson"))}
          {input("contact_phone", t("field.phone"))}
          {input("contact_email", t("field.email"))}
          {input("address", t("field.address"))}
          {input("bank_name", t("field.bankName"))}
          {input("bank_account_name", t("field.bankAccountName"))}
          {input("bank_account_no", t("field.bankAccountNo"))}
          <FieldWrapper label={t("field.bankNotes")} className="sm:col-span-2">
            <Textarea value={form.bank_notes ?? ""} onChange={(event) => set("bank_notes", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.notes")} className="sm:col-span-2">
            <Textarea value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X />{common("cancel")}</Button>
          <Button disabled={!form.company_name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {common("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerQrDialog({ customer, onClose }: { customer: RecyclerCustomer; onClose: () => void }) {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const qr = useQuery({ queryKey: ["recycler-customer-qr", customer.id], queryFn: () => getCustomerQr(customer.id) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["recycler-customer-qr", customer.id] });
    void queryClient.invalidateQueries({ queryKey: ["recycler-customers"] });
  };
  const issue = useMutation({ mutationFn: () => issueCustomerQr(customer.id), onSuccess: refresh });
  const reissue = useMutation({ mutationFn: () => reissueCustomerQr(customer.id, reason), onSuccess: () => { setReason(""); refresh(); } });
  const status = useMutation({ mutationFn: (next: "ACTIVE" | "DISABLED") => setCustomerQrStatus(customer.id, next), onSuccess: refresh });

  function downloadQr() {
    const svg = document.getElementById(`customer-qr-${customer.id}`);
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${customer.customer_no}-qr.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printQr() {
    const svg = document.getElementById(`customer-qr-${customer.id}`);
    const popup = window.open("", "_blank", "width=640,height=720");
    if (!svg || !popup) return;
    popup.document.write(`<html><head><title>${customer.customer_no}</title></head><body style="font-family:Arial;text-align:center;padding:40px"><h1>${customer.company_name}</h1><p>${customer.customer_no}</p>${svg.outerHTML}<script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  const value = qr.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("qr.title", { name: customer.company_name })}</DialogTitle>
          <DialogDescription>{t("qr.help")}</DialogDescription>
        </DialogHeader>
        {qr.isLoading ? (
          <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin" /></div>
        ) : value ? (
          <div className="space-y-4">
            <div className="mx-auto grid w-fit place-items-center rounded-lg border bg-white p-5">
              <QRCodeSVG id={`customer-qr-${customer.id}`} value={value.qr_payload} size={220} level="H" includeMargin />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
              <div><p className="text-xs text-muted-foreground">{t("field.serial")}</p><p className="font-medium tabular-nums">{value.serial}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("field.status")}</p><StatusBadge label={value.status} tone={value.status === "ACTIVE" ? "positive" : "neutral"} /></div>
              <div><p className="text-xs text-muted-foreground">{t("field.scanCount")}</p><p className="font-medium tabular-nums">{value.scan_count}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("field.issuedOn")}</p><p className="font-medium tabular-nums">{value.issued_on}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadQr}><Download />{t("action.download")}</Button>
              <Button variant="outline" onClick={printQr}><Printer />{t("action.print")}</Button>
              <Button variant="outline" onClick={() => status.mutate(value.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}>
                <Power />{t(value.status === "ACTIVE" ? "action.disableQr" : "action.enableQr")}
              </Button>
            </div>
            <FieldWrapper label={t("qr.reissueReason")}>
              <div className="flex gap-2">
                <Input value={reason} onChange={(event) => setReason(event.target.value)} />
                <Button variant="outline" disabled={!reason.trim() || reissue.isPending} onClick={() => reissue.mutate()}>
                  <RefreshCw />{t("action.reissue")}
                </Button>
              </div>
            </FieldWrapper>
          </div>
        ) : (
          <div className="grid min-h-52 place-items-center rounded-lg border border-dashed text-center">
            <div><QrCode className="mx-auto mb-3 size-10 text-muted-foreground" /><p className="font-medium">{t("qr.notIssued")}</p><p className="mt-1 text-sm text-muted-foreground">{t("qr.notIssuedHelp")}</p></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X />{common("close")}</Button>
          {!value && <Button disabled={issue.isPending || !customer.is_active} onClick={() => issue.mutate()}><QrCode />{t("action.issueQr")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrivateIntakesPanel() {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const { can } = useAuth();
  const df = useDateFormat();
  const list = useListQuery(["state"]);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState<PrivateIntake | null>(null);
  const [cancelling, setCancelling] = useState<PrivateIntake | null>(null);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const intakes = useQuery({ queryKey: ["private-intakes", list.query], queryFn: () => getPrivateIntakes(list.query) });
  const cancel = useMutation({ mutationFn: () => cancelPrivateIntake(cancelling!.id, reason), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["private-intakes"] }); setCancelling(null); setReason(""); } });

  const columns = useMemo<ColumnDef<PrivateIntake, unknown>[]>(() => [
    { accessorKey: "intake_no", meta: { label: t("field.intakeNo") }, header: ({ column }) => <SortableHeader label={t("field.intakeNo")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.intake_no}</span> },
    { accessorKey: "customer_name", meta: { label: t("field.customer") }, header: () => t("field.customer"), cell: ({ row }) => <div><p className="font-medium">{row.original.customer_name}</p><p className="text-xs text-muted-foreground">{row.original.customer_no}</p></div> },
    { accessorKey: "material_type", meta: { label: t("field.material") }, header: () => t("field.material"), cell: ({ row }) => <TypeBadge label={t(`material.${row.original.material_type}`)} /> },
    { accessorKey: "state", meta: { label: t("field.status") }, header: () => t("field.status"), cell: ({ row }) => <StatusBadge label={t(`intakeState.${row.original.state}`)} tone={row.original.state === "COMPLETED" ? "positive" : row.original.state === "CANCELLED" ? "danger" : "warning"} /> },
    { accessorKey: "net_weight_kg", meta: { label: t("field.netWeight") }, header: () => t("field.netWeight"), cell: ({ row }) => <span className="tabular-nums">{row.original.net_weight_kg ? `${row.original.net_weight_kg} kg` : common("emptyValue")}</span> },
    { accessorKey: "created_at", meta: { label: t("field.createdAt") }, header: ({ column }) => <SortableHeader label={t("field.createdAt")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="tabular-nums">{df.dateTime(row.original.created_at)}</span> },
    { id: "actions", enableHiding: false, header: () => <span className="sr-only">{common("actions")}</span>, cell: ({ row }) => row.original.state === "WAITING_WEIGHING" && can("weighing.operate") ? <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => setCompleting(row.original)}><CheckCircle2 />{t("action.complete")}</Button><Button size="icon" variant="ghost" title={common("cancel")} onClick={() => setCancelling(row.original)}><X /></Button></div> : null },
  ], [can, common, df, t]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataTable
        columns={columns} rows={intakes.data?.results ?? []} totalCount={intakes.data?.count ?? 0}
        page={list.page} pageSize={list.pageSize} isLoading={intakes.isLoading} isError={intakes.isError}
        hasFilters={list.hasFilters} search={list.search} sortBy={list.sortBy} sortOrder={list.sortOrder} storageKey="private-intakes"
        filterPills={[
          { key: "all", label: t("filter.all"), active: !list.filters.state, onSelect: () => list.setFilter("state", undefined) },
          { key: "waiting", label: t("intakeState.WAITING_WEIGHING"), active: list.filters.state === "WAITING_WEIGHING", onSelect: () => list.setFilter("state", "WAITING_WEIGHING") },
          { key: "completed", label: t("intakeState.COMPLETED"), active: list.filters.state === "COMPLETED", onSelect: () => list.setFilter("state", "COMPLETED") },
        ]}
        toolbarActions={can("weighing.operate") ? <Button size="sm" onClick={() => setStarting(true)}><ScanLine />{t("action.startIntake")}</Button> : undefined}
        onSearchChange={list.setSearch} onSortChange={list.setSort} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} onClearFilters={list.clearFilters}
      />
      {starting && <StartIntakeDialog onClose={() => setStarting(false)} />}
      {completing && <CompleteIntakeDialog intake={completing} onClose={() => setCompleting(null)} />}
      {cancelling && <ConfirmDialog open onOpenChange={() => { setCancelling(null); setReason(""); }} title={t("intakes.cancelTitle")} description={t("intakes.cancelHelp")} confirmLabel={t("action.cancelIntake")} reason={reason} onReasonChange={setReason} reasonRequired isPending={cancel.isPending} onConfirm={() => cancel.mutate()} />}
    </div>
  );
}

function StartIntakeDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [scanner, setScanner] = useState(false);
  const [form, setForm] = useState<StartPrivateIntakePayload>({ token: "", site: "", material_type: "METAL", vehicle_plate: "", notes: "" });
  const sites = useQuery({ queryKey: ["sites", "private-intake"], queryFn: () => getSites({ page_size: 100 }) });
  const start = useMutation({ mutationFn: () => startPrivateIntake(form), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["private-intakes"] }); onClose(); } });
  const ready = form.token.trim() && form.site && form.material_type;
  return <>
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{t("intakes.startTitle")}</DialogTitle><DialogDescription>{t("intakes.startHelp")}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <FieldWrapper label={t("field.qrToken")} required hint={t("intakes.scanHelp")}>
            <div className="flex gap-2"><Input value={form.token} autoFocus onChange={(event) => setForm({ ...form, token: event.target.value })} /><Button type="button" variant="outline" onClick={() => setScanner(true)}><ScanLine />{t("action.scan")}</Button></div>
          </FieldWrapper>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWrapper label={t("field.yard")} required><Select value={form.site} onValueChange={(site) => setForm({ ...form, site })}><SelectTrigger className="w-full"><SelectValue placeholder={common("selectPlaceholder")} /></SelectTrigger><SelectContent>{sites.data?.results.filter((site) => site.is_active).map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent></Select></FieldWrapper>
            <FieldWrapper label={t("field.material")} required><Select value={form.material_type} onValueChange={(value) => setForm({ ...form, material_type: value as RecyclerMaterialType })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RECYCLER_MATERIAL_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`material.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>
            <FieldWrapper label={t("field.vehiclePlate")}><Input value={form.vehicle_plate} onChange={(event) => setForm({ ...form, vehicle_plate: event.target.value.toUpperCase() })} /></FieldWrapper>
            <FieldWrapper label={t("field.notes")}><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></FieldWrapper>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}><X />{common("cancel")}</Button><Button disabled={!ready || start.isPending} onClick={() => start.mutate()}>{start.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{t("action.startIntake")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <GateQrScanner open={scanner} onClose={() => setScanner(false)} onDetected={(token) => setForm((current) => ({ ...current, token }))} />
  </>;
}

function CompleteIntakeDialog({ intake, onClose }: { intake: PrivateIntake; onClose: () => void }) {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [session, setSession] = useState("");
  const sessions = useQuery({ queryKey: ["weigh-sessions", "private-intake", intake.site], queryFn: () => getWeighSessions({ page_size: 100, site: intake.site, state: "COMPLETED", verdict: "VALID", direction: "GROSS" }) });
  const completedIntakes = useQuery({ queryKey: ["private-intakes", "used-weigh-sessions"], queryFn: () => getPrivateIntakes({ page_size: 100, state: "COMPLETED" }) });
  const usedSessionIds = new Set((completedIntakes.data?.results ?? []).map((row) => row.gross_session).filter(Boolean));
  const candidates = completedIntakes.isSuccess ? (sessions.data?.results ?? []).filter((row: WeighSessionRow) => row.direction === "GROSS" && row.state === "COMPLETED" && row.verdict === "VALID" && !row.dispatch_no && !usedSessionIds.has(row.id)) : [];
  const complete = useMutation({ mutationFn: () => completePrivateIntake(intake.id, session), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["private-intakes"] }); void queryClient.invalidateQueries({ queryKey: ["recycler-inventory"] }); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("intakes.completeTitle", { no: intake.intake_no })}</DialogTitle><DialogDescription>{t("intakes.completeHelp")}</DialogDescription></DialogHeader><FieldWrapper label={t("field.weighSession")} required><Select value={session} onValueChange={setSession}><SelectTrigger className="w-full"><SelectValue placeholder={common("selectPlaceholder")} /></SelectTrigger><SelectContent>{candidates.map((row) => <SelectItem key={row.id} value={row.id}>{row.session_no} · {row.vehicle_plate} · {row.stable_weight_kg ?? "—"} kg</SelectItem>)}</SelectContent></Select>{!sessions.isLoading && !completedIntakes.isLoading && candidates.length === 0 && <p className="mt-2 text-sm text-warning">{t("intakes.noEligibleSession")}</p>}</FieldWrapper><DialogFooter><Button variant="outline" onClick={onClose}><X />{common("cancel")}</Button><Button disabled={!session || complete.isPending} onClick={() => complete.mutate()}><CheckCircle2 />{t("action.complete")}</Button></DialogFooter></DialogContent></Dialog>;
}
