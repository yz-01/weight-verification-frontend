"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  Eye,
  FileUp,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Power,
  ShoppingCart,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/shared/data-table";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
  TypeBadge,
} from "@/components/shared/page-primitives";
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
  Buyer,
  BuyerPayload,
  OutboundAttachmentKind,
  OutboundShipment,
  OutboundShipmentPayload,
  RecyclerBusinessSource,
  RecyclerMaterialType,
} from "@/interfaces/recycler-business";
import { RECYCLER_MATERIAL_TYPES } from "@/interfaces/recycler-business";
import { useDateFormat } from "@/lib/dates";
import {
  cancelOutboundShipment,
  confirmOutboundShipment,
  createBuyer,
  createOutboundShipment,
  getBuyers,
  getOutboundShipments,
  setBuyerStatus,
  updateBuyer,
  updateOutboundShipment,
  uploadOutboundAttachment,
} from "@/services/recycler-business.service";

export function RecyclerOutboundWorkspace() {
  const t = useTranslations("recyclerBusiness");

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col gap-4">
      <ListHeader title={t("outbound.title")} subtitle={t("outbound.subtitle")} />
      <Tabs defaultValue="shipments" className="min-h-0 flex-1">
        <TabsList className="h-11 w-full justify-start overflow-x-auto p-1 sm:w-fit">
          <TabsTrigger value="shipments" className="min-w-40 px-4 py-2">
            <ShoppingCart />
            {t("outbound.shipmentsTab")}
          </TabsTrigger>
          <TabsTrigger value="buyers" className="min-w-40 px-4 py-2">
            <Users />
            {t("outbound.buyersTab")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="shipments" className="min-h-0"><ShipmentsPanel /></TabsContent>
        <TabsContent value="buyers" className="min-h-0"><BuyersPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function ShipmentsPanel() {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const { can } = useAuth();
  const df = useDateFormat();
  const list = useListQuery(["state", "business_source"]);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<OutboundShipment | "new" | null>(null);
  const [viewing, setViewing] = useState<OutboundShipment | null>(null);
  const [confirming, setConfirming] = useState<OutboundShipment | null>(null);
  const [cancelling, setCancelling] = useState<OutboundShipment | null>(null);
  const [reason, setReason] = useState("");
  const shipments = useQuery({ queryKey: ["recycler-outbound", list.query], queryFn: () => getOutboundShipments(list.query) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recycler-outbound"] });
  const confirm = useMutation({ mutationFn: () => confirmOutboundShipment(confirming!.id), onSuccess: () => { void refresh(); setConfirming(null); } });
  const cancel = useMutation({ mutationFn: () => cancelOutboundShipment(cancelling!.id, reason), onSuccess: () => { void refresh(); setCancelling(null); setReason(""); } });

  const columns = useMemo<ColumnDef<OutboundShipment, unknown>[]>(() => [
    { accessorKey: "shipment_no", meta: { label: t("field.shipmentNo") }, header: ({ column }) => <SortableHeader label={t("field.shipmentNo")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.shipment_no}</span> },
    { accessorKey: "buyer_name", meta: { label: t("field.buyer") }, header: () => t("field.buyer"), cell: ({ row }) => <div className="max-w-52"><p className="truncate font-medium">{row.original.buyer_name}</p><p className="truncate text-xs text-muted-foreground">{row.original.buyer_no}</p></div> },
    { accessorKey: "material_type", meta: { label: t("field.material") }, header: () => t("field.material"), cell: ({ row }) => <TypeBadge label={t(`material.${row.original.material_type}`)} /> },
    { accessorKey: "business_source", meta: { label: t("field.source") }, header: () => t("field.source"), cell: ({ row }) => t(`source.${row.original.business_source}`) },
    { accessorKey: "weight_kg", meta: { label: t("field.weight") }, header: ({ column }) => <SortableHeader label={t("field.weight")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.weight_kg} kg</span> },
    { accessorKey: "outbound_date", meta: { label: t("field.outboundDate") }, header: ({ column }) => <SortableHeader label={t("field.outboundDate")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="tabular-nums">{df.date(row.original.outbound_date)}</span> },
    { accessorKey: "state", meta: { label: t("field.status") }, header: () => t("field.status"), cell: ({ row }) => <StatusBadge label={t(`outboundState.${row.original.state}`)} tone={row.original.state === "CONFIRMED" ? "positive" : row.original.state === "CANCELLED" ? "danger" : "warning"} /> },
    { id: "actions", enableHiding: false, header: () => <span className="sr-only">{common("actions")}</span>, cell: ({ row }) => <div className="flex items-center justify-end gap-0.5"><Button size="icon" variant="ghost" title={common("view")} onClick={() => setViewing(row.original)}><Eye /></Button>{row.original.state === "DRAFT" && can("outbound.manage") && <><Button size="icon" variant="ghost" title={common("edit")} onClick={() => setEditing(row.original)}><Pencil /></Button><Button size="sm" variant="outline" onClick={() => setConfirming(row.original)}><PackageCheck />{t("action.confirmShipment")}</Button><Button size="icon" variant="ghost" title={common("cancel")} onClick={() => setCancelling(row.original)}><X /></Button></>}</div> },
  ], [can, common, df, t]);

  return <div className="flex h-full min-h-0 flex-col">
    <DataTable
      columns={columns} rows={shipments.data?.results ?? []} totalCount={shipments.data?.count ?? 0}
      page={list.page} pageSize={list.pageSize} isLoading={shipments.isLoading} isError={shipments.isError}
      hasFilters={list.hasFilters} search={list.search} sortBy={list.sortBy} sortOrder={list.sortOrder} storageKey="recycler-outbound"
      filterPills={[
        { key: "all", label: t("filter.all"), active: !list.filters.state, onSelect: () => list.setFilter("state", undefined) },
        { key: "draft", label: t("outboundState.DRAFT"), active: list.filters.state === "DRAFT", onSelect: () => list.setFilter("state", "DRAFT") },
        { key: "confirmed", label: t("outboundState.CONFIRMED"), active: list.filters.state === "CONFIRMED", onSelect: () => list.setFilter("state", "CONFIRMED") },
        { key: "cancelled", label: t("outboundState.CANCELLED"), active: list.filters.state === "CANCELLED", onSelect: () => list.setFilter("state", "CANCELLED") },
      ]}
      toolbarActions={can("outbound.manage") ? <Button size="sm" onClick={() => setEditing("new")}><Plus />{t("action.newShipment")}</Button> : undefined}
      onSearchChange={list.setSearch} onSortChange={list.setSort} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} onClearFilters={list.clearFilters}
    />
    {editing && <ShipmentDialog shipment={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    {viewing && <ShipmentDetailDialog shipment={viewing} onClose={() => setViewing(null)} />}
    {confirming && <ConfirmDialog open onOpenChange={() => setConfirming(null)} title={t("outbound.confirmTitle", { no: confirming.shipment_no })} description={t("outbound.confirmHelp", { weight: confirming.weight_kg })} confirmLabel={t("action.confirmShipment")} confirmIcon={PackageCheck} variant="default" isPending={confirm.isPending} onConfirm={() => confirm.mutate()} />}
    {cancelling && <ConfirmDialog open onOpenChange={() => { setCancelling(null); setReason(""); }} title={t("outbound.cancelTitle", { no: cancelling.shipment_no })} description={t("outbound.cancelHelp")} confirmLabel={t("action.cancelShipment")} reason={reason} onReasonChange={setReason} reasonRequired isPending={cancel.isPending} onConfirm={() => cancel.mutate()} />}
  </div>;
}

const EMPTY_SHIPMENT: OutboundShipmentPayload = {
  buyer: "",
  material_type: "METAL",
  business_source: "PLATFORM",
  weight_kg: "",
  outbound_date: new Date().toISOString().slice(0, 10),
  vehicle_plate: "",
  driver_name: "",
  e_invoice_no: "",
  notes: "",
};

function ShipmentDialog({ shipment, onClose }: { shipment: OutboundShipment | null; onClose: () => void }) {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OutboundShipmentPayload>(shipment ? {
    buyer: shipment.buyer, material_type: shipment.material_type, business_source: shipment.business_source, weight_kg: shipment.weight_kg,
    outbound_date: shipment.outbound_date, vehicle_plate: shipment.vehicle_plate, driver_name: shipment.driver_name, e_invoice_no: shipment.e_invoice_no, notes: shipment.notes,
  } : EMPTY_SHIPMENT);
  const buyers = useQuery({ queryKey: ["recycler-buyers", "shipment-form"], queryFn: () => getBuyers({ page_size: 200 }) });
  const save = useMutation({ mutationFn: () => shipment ? updateOutboundShipment(shipment.id, form) : createOutboundShipment(form), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["recycler-outbound"] }); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{t(shipment ? "outbound.editTitle" : "outbound.createTitle")}</DialogTitle><DialogDescription>{t("outbound.formHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
    <FieldWrapper label={t("field.buyer")} required><Select value={form.buyer} onValueChange={(buyer) => setForm({ ...form, buyer })}><SelectTrigger className="w-full"><SelectValue placeholder={common("selectPlaceholder")} /></SelectTrigger><SelectContent>{buyers.data?.results.filter((buyer) => buyer.is_active).map((buyer) => <SelectItem key={buyer.id} value={buyer.id}>{buyer.company_name} ({buyer.buyer_no})</SelectItem>)}</SelectContent></Select></FieldWrapper>
    <FieldWrapper label={t("field.material")} required><Select value={form.material_type} onValueChange={(value) => setForm({ ...form, material_type: value as RecyclerMaterialType })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RECYCLER_MATERIAL_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`material.${value}`)}</SelectItem>)}</SelectContent></Select></FieldWrapper>
    <FieldWrapper label={t("field.source")} required hint={t("outbound.sourceHelp")}><Select value={form.business_source} onValueChange={(value) => setForm({ ...form, business_source: value as RecyclerBusinessSource })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PLATFORM">{t("source.PLATFORM")}</SelectItem><SelectItem value="PRIVATE">{t("source.PRIVATE")}</SelectItem></SelectContent></Select></FieldWrapper>
    <FieldWrapper label={t("field.weight")} required><Input type="number" min="0.001" step="0.001" value={form.weight_kg} onChange={(event) => setForm({ ...form, weight_kg: event.target.value })} /></FieldWrapper>
    <FieldWrapper label={t("field.outboundDate")} required><Input type="date" value={form.outbound_date} onChange={(event) => setForm({ ...form, outbound_date: event.target.value })} /></FieldWrapper>
    <FieldWrapper label={t("field.vehiclePlate")}><Input value={form.vehicle_plate} onChange={(event) => setForm({ ...form, vehicle_plate: event.target.value.toUpperCase() })} /></FieldWrapper>
    <FieldWrapper label={t("field.driverName")}><Input value={form.driver_name} onChange={(event) => setForm({ ...form, driver_name: event.target.value })} /></FieldWrapper>
    <FieldWrapper label={t("field.eInvoiceNo")}><Input value={form.e_invoice_no} onChange={(event) => setForm({ ...form, e_invoice_no: event.target.value })} /></FieldWrapper>
    <FieldWrapper label={t("field.notes")} className="sm:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></FieldWrapper>
  </div><DialogFooter><Button variant="outline" onClick={onClose}><X />{common("cancel")}</Button><Button requires={[[form.buyer, t("field.buyer")], [Number(form.weight_kg) > 0, t("field.weight")], [form.outbound_date, t("field.outboundDate")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{common("save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function ShipmentDetailDialog({ shipment, onClose }: { shipment: OutboundShipment; onClose: () => void }) {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(shipment);
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<OutboundAttachmentKind>("DELIVERY_ORDER");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({ mutationFn: () => uploadOutboundAttachment(current.id, kind, file!, description), onSuccess: async () => { const refreshed = await getOutboundShipments({ search: current.shipment_no, page_size: 10 }); const next = refreshed.results.find((row) => row.id === current.id); if (next) setCurrent(next); void queryClient.invalidateQueries({ queryKey: ["recycler-outbound"] }); setFile(null); setDescription(""); if (inputRef.current) inputRef.current.value = ""; } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{current.shipment_no}</DialogTitle><DialogDescription>{t("outbound.detailHelp")}</DialogDescription></DialogHeader><div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3"><Detail label={t("field.buyer")} value={current.buyer_name} /><Detail label={t("field.material")} value={t(`material.${current.material_type}`)} /><Detail label={t("field.weight")} value={`${current.weight_kg} kg`} /><Detail label={t("field.source")} value={t(`source.${current.business_source}`)} /><Detail label={t("field.vehiclePlate")} value={current.vehicle_plate || "—"} /><Detail label={t("field.balance")} value={current.balance_after_kg ? `${current.balance_after_kg} kg` : "—"} /></div><div><h3 className="mb-2 font-medium">{t("outbound.attachments")}</h3>{current.attachments.length ? <div className="grid gap-2">{current.attachments.map((attachment) => <a key={attachment.id} href={attachment.file} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted"><FileUp className="size-4 text-primary" /><div className="min-w-0"><p className="font-medium">{t(`attachmentKind.${attachment.kind}`)}</p><p className="truncate text-xs text-muted-foreground">{attachment.description || attachment.file}</p></div></a>)}</div> : <p className="rounded-lg border border-dashed p-5 text-center text-muted-foreground">{t("outbound.noAttachments")}</p>}</div><div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[160px_1fr_auto]"><Select value={kind} onValueChange={(value) => setKind(value as OutboundAttachmentKind)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["DELIVERY_ORDER", "E_INVOICE", "PHOTO", "OTHER"] as const).map((value) => <SelectItem key={value} value={value}>{t(`attachmentKind.${value}`)}</SelectItem>)}</SelectContent></Select><div className="grid gap-2"><FieldWrapper label={t("outbound.attachmentFile")} required><Input ref={inputRef} type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></FieldWrapper><Input value={description} placeholder={t("field.description")} onChange={(event) => setDescription(event.target.value)} /></div><Button requires={[[file, t("outbound.attachmentFile")]]} disabled={upload.isPending} onClick={() => upload.mutate()}><Upload />{t("action.upload")}</Button></div><DialogFooter><Button variant="outline" onClick={onClose}><X />{common("close")}</Button></DialogFooter></DialogContent></Dialog>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-medium">{value}</p></div>; }

function BuyersPanel() {
  const t = useTranslations("recyclerBusiness");
  const common = useTranslations("common");
  const { can } = useAuth();
  const list = useListQuery();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Buyer | "new" | null>(null);
  const buyers = useQuery({ queryKey: ["recycler-buyers", list.query], queryFn: () => getBuyers(list.query) });
  const status = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setBuyerStatus(id, active), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recycler-buyers"] }) });
  const columns = useMemo<ColumnDef<Buyer, unknown>[]>(() => [
    { accessorKey: "buyer_no", meta: { label: t("field.buyerNo") }, header: ({ column }) => <SortableHeader label={t("field.buyerNo")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.buyer_no}</span> },
    { accessorKey: "company_name", meta: { label: t("field.companyName") }, header: ({ column }) => <SortableHeader label={t("field.companyName")} isSorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ row }) => <div><p className="font-medium">{row.original.company_name}</p><p className="text-xs text-muted-foreground">{row.original.contact_person || row.original.contact_phone || "—"}</p></div> },
    { accessorKey: "shipment_count", meta: { label: t("field.shipmentCount") }, header: () => t("field.shipmentCount"), cell: ({ row }) => <span className="tabular-nums">{row.original.shipment_count}</span> },
    { accessorKey: "total_weight_kg", meta: { label: t("field.totalWeight") }, header: () => t("field.totalWeight"), cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.total_weight_kg} kg</span> },
    { accessorKey: "is_active", meta: { label: t("field.status") }, header: () => t("field.status"), cell: ({ row }) => <StatusBadge label={t(row.original.is_active ? "status.active" : "status.inactive")} tone={row.original.is_active ? "positive" : "neutral"} /> },
    { id: "actions", enableHiding: false, header: () => <span className="sr-only">{common("actions")}</span>, cell: ({ row }) => can("outbound.manage") ? <div className="flex items-center justify-end gap-0.5"><Button size="icon" variant="ghost" title={common("edit")} onClick={() => setEditing(row.original)}><Pencil /></Button><Button size="icon" variant="ghost" title={t(row.original.is_active ? "action.deactivate" : "action.activate")} onClick={() => status.mutate({ id: row.original.id, active: !row.original.is_active })}><Power /></Button></div> : null },
  ], [can, common, status, t]);
  return <div className="flex h-full min-h-0 flex-col"><DataTable columns={columns} rows={buyers.data?.results ?? []} totalCount={buyers.data?.count ?? 0} page={list.page} pageSize={list.pageSize} isLoading={buyers.isLoading} isError={buyers.isError} hasFilters={list.hasFilters} search={list.search} sortBy={list.sortBy} sortOrder={list.sortOrder} storageKey="recycler-buyers" toolbarActions={can("outbound.manage") ? <Button size="sm" onClick={() => setEditing("new")}><Plus />{t("action.addBuyer")}</Button> : undefined} onSearchChange={list.setSearch} onSortChange={list.setSort} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} onClearFilters={list.clearFilters} />{editing && <BuyerDialog buyer={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}</div>;
}

const EMPTY_BUYER: BuyerPayload = { company_name: "", registration_no: "", contact_person: "", contact_phone: "", contact_email: "", address: "", notes: "" };
function BuyerDialog({ buyer, onClose }: { buyer: Buyer | null; onClose: () => void }) {
  const t = useTranslations("recyclerBusiness"); const common = useTranslations("common"); const queryClient = useQueryClient();
  const [form, setForm] = useState<BuyerPayload>(buyer ? { company_name: buyer.company_name, registration_no: buyer.registration_no, contact_person: buyer.contact_person, contact_phone: buyer.contact_phone, contact_email: buyer.contact_email, address: buyer.address, notes: buyer.notes } : EMPTY_BUYER);
  const set = (key: keyof BuyerPayload, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = useMutation({ mutationFn: () => buyer ? updateBuyer(buyer.id, form) : createBuyer(form), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["recycler-buyers"] }); onClose(); } });
  const field = (key: keyof BuyerPayload, label: string, required = false) => <FieldWrapper label={label} required={required}><Input value={form[key] ?? ""} onChange={(event) => set(key, event.target.value)} /></FieldWrapper>;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{t(buyer ? "buyers.editTitle" : "buyers.createTitle")}</DialogTitle><DialogDescription>{t("buyers.formHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{field("company_name", t("field.companyName"), true)}{field("registration_no", t("field.registrationNo"))}{field("contact_person", t("field.contactPerson"))}{field("contact_phone", t("field.phone"))}{field("contact_email", t("field.email"))}{field("address", t("field.address"))}<FieldWrapper label={t("field.notes")} className="sm:col-span-2"><Textarea value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} /></FieldWrapper></div><DialogFooter><Button variant="outline" onClick={onClose}><X />{common("cancel")}</Button><Button requires={[[form.company_name, t("field.companyName")]]} disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{common("save")}</Button></DialogFooter></DialogContent></Dialog>;
}
