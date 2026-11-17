"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Download, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExportButton } from "@/components/shared/export-button";
import { LoadMoreRow } from "@/components/shared/load-more-row";
import { FieldWrapper, ListHeader, QueryFailedNote, StatusBadge, TypeBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { readAllPages, usePagedList } from "@/hooks/use-paged-list";
import { ApiError } from "@/interfaces/api";
import type { Department } from "@/interfaces/auth";
import type {
  Asset, AssetAssignment, AssetCategory, AssetCategoryDefinition, AssetDisposal,
  AssetInstallation, AssetMaintenance, AssetOptions, AssetPurchase, AssetStatus,
  CreateAssetPayload, InstallationStatus, MaintenanceType,
} from "@/interfaces/asset";
import { useDateFormat } from "@/lib/dates";
import {
  completeAssetMaintenance, createAsset, createAssetAssignment, createAssetCategory,
  createAssetDisposal, createAssetInstallation, createAssetMaintenance, createAssetPurchase,
  createMovement, decideAssetDisposal, deleteAssetCategory, exportAssetReport,
  getAssetAssignments, getAssetCategories, getAssetDisposals, getAssetInstallations,
  getAssetMaintenance, getAssetOptions, getAssetPurchases, getAssetReportSummary,
  getAssets, getAssetStock, getAssetSummary, getMovements, receiveAssetPurchase,
  returnAssetAssignment, setAssetActive, startAssetMaintenance,
  transitionAssetInstallation, updateAsset, updateAssetCategory,
} from "@/services/asset.service";
import { createDepartment, deleteDepartment, getDepartments, updateDepartment } from "@/services/users.service";
import { localToday } from "@/lib/local-date";

export type AssetSection =
  | "overview" | "management" | "categories" | "purchases"
  | "inventory" | "assignments" | "installations" | "transfers" | "repairs"
  | "maintenance" | "disposals" | "reports" | "departments";

const SUBMODULES: Array<{ section: Exclude<AssetSection, "overview">; number: string }> = [
  { section: "management", number: "17.2.1" },
  { section: "categories", number: "17.2.3" }, { section: "purchases", number: "17.2.4" },
  { section: "inventory", number: "17.2.5" }, { section: "assignments", number: "17.2.6" },
  { section: "installations", number: "17.2.7" }, { section: "transfers", number: "17.2.8" },
  { section: "departments", number: "17.2.8" },
  { section: "repairs", number: "17.2.9" }, { section: "maintenance", number: "17.2.10" },
  { section: "disposals", number: "17.2.11" },
  { section: "reports", number: "17.2.13" },
];

const CATEGORIES: AssetCategory[] = [
  "GATEWAY", "AI_CCTV", "ANPR_CAMERA", "INDUSTRIAL_COMPUTER", "INDUSTRIAL_GATEWAY",
  "ROUTER", "SIM_CARD", "DEMO_KIT", "NOTEBOOK", "TABLET", "MOBILE_PHONE",
  "TEST_EQUIPMENT", "TOOL", "LED_DISPLAY", "BARRIER_GATE", "NETWORK_SWITCH",
  "UPS", "SERVER", "OTHER",
];
const ASSET_STATUSES: AssetStatus[] = ["IN_STOCK", "DEPLOYED", "BORROWED", "MAINTENANCE", "FAULTY", "RETIRED"];
const MAINTENANCE_TYPES: MaintenanceType[] = ["PREVENTIVE", "CORRECTIVE", "CALIBRATION", "UPGRADE", "INSPECTION"];
// Columns that hold a number or an amount: right-aligned, tabular figures,
// on the heading and on the value alike.
const NUMERIC_COLUMNS = new Set(["quantity", "received", "unitPrice", "total", "available", "installed", "borrowed", "maintenance", "faulty", "retired", "value", "cost"]);
const NUMERIC_HEAD = "text-right tabular";
const headAlign = (column: string) => (NUMERIC_COLUMNS.has(column) ? NUMERIC_HEAD : undefined);

const statusTone = (status: string): "positive" | "info" | "warning" | "danger" | "neutral" => {
  if (["ACTIVE", "COMPLETED", "RECEIVED", "RETURNED", "IN_STOCK", "APPROVED"].includes(status)) return "positive";
  if (["REJECTED", "FAULTY", "OVERDUE", "RETIRED"].includes(status)) return "danger";
  if (["IN_PROGRESS", "PARTIALLY_RECEIVED", "MAINTENANCE", "BORROWED", "REQUESTED"].includes(status)) return "warning";
  if (["DEPLOYED", "INSTALLED", "ORDERED", "SCHEDULED"].includes(status)) return "info";
  return "neutral";
};

export function AssetManagementWorkspace({ section = "overview" }: { section?: AssetSection }) {
  const t = useTranslations("adminAssetManagement");
  if (section === "overview") return <Overview />;
  return <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
    <ListHeader title={t(`section.${section}.title`)} subtitle={t(`section.${section}.subtitle`)} />
    {section === "management" && <AssetPanel mode="search" />}
    {section === "categories" && <CategoryPanel />}
    {section === "purchases" && <PurchasePanel />}
    {section === "inventory" && <InventoryPanel />}
    {section === "assignments" && <AssignmentPanel />}
    {section === "installations" && <InstallationPanel />}
    {section === "transfers" && <TransferPanel />}
    {section === "departments" && <DepartmentPanel />}
    {section === "repairs" && <MaintenancePanel repairs />}
    {section === "maintenance" && <MaintenancePanel repairs={false} />}
    {section === "disposals" && <DisposalPanel />}
    {section === "reports" && <ReportPanel />}
  </div>;
}

function Overview() {
  const t = useTranslations("adminAssetManagement");
  const summary = useQuery({ queryKey: ["asset-summary"], queryFn: getAssetSummary });
  return <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
    <ListHeader title={t("title")} subtitle={t("subtitle")} />
    <QueryFailedNote query={summary} what={t("what.summary")} />
    <div className="surface-panel shrink-0 overflow-hidden rounded-xl"><div className="-mb-px -mr-px grid sm:grid-cols-2 xl:grid-cols-4">
      {(summary.isError ? [["total", "—"], ["available", "—"], ["deployed", "—"], ["value", "—"]] : [["total", summary.data?.total_assets ?? 0], ["available", summary.data?.by_status?.IN_STOCK ?? 0], ["deployed", summary.data?.by_status?.DEPLOYED ?? 0], ["value", `RM ${summary.data?.total_value ?? "0.00"}`]]).map(([key, value]) => <div key={key} className="min-w-0 border-b border-r px-4 py-4 sm:px-6"><p className="text-xs font-medium text-muted-foreground">{t(`metric.${key}`)}</p><p className="tabular mt-1 break-words text-2xl font-semibold">{value}</p></div>)}
    </div></div>
    <div className="surface-panel min-h-0 flex-1 overflow-auto rounded-xl"><div className="grid md:grid-cols-2 xl:grid-cols-3">
      {SUBMODULES.map((item) => <Link key={item.section} href={`/assets/${item.section}`} className="flex min-h-20 items-center gap-3 border-b border-r px-5 py-4 hover:bg-muted/40"><span className="min-w-0 flex-1 font-medium">{t(`section.${item.section}.title`)}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}
    </div></div>
  </div>;
}

function Panel({ loading, error, children }: { loading: boolean; error: boolean; children: React.ReactNode }) {
  const t = useTranslations("adminAssetManagement");
  if (loading) return <div className="surface-panel flex min-h-48 flex-1 items-center justify-center rounded-xl text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t("loading")}</div>;
  if (error) return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive sm:p-6">{t("loadError")}</div>;
  return <div className="surface-panel min-h-0 flex-1 overflow-auto rounded-xl">{children}</div>;
}

function SelectField({ value, onChange, children, className = "" }: { value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  return <select className={`native-control ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>;
}

/** The server's field name -> the words this page shows above that field. */
const FIELD_LABELS: Record<string, string> = {
  category: "field.category", custom_category: "field.customCategory", name: "field.name",
  serial_number: "field.serial", brand: "field.brand", model: "field.model",
  purchase_date: "field.purchaseDate", purchase_price: "field.purchasePrice", supplier: "field.supplier",
  invoice_number: "field.invoice", warranty_period_months: "field.warrantyMonths", firmware_version: "field.firmware",
  ip_address: "field.ipAddress", mac_address: "field.macAddress", location_notes: "field.location",
  location: "field.location", notes: "field.notes", code: "field.code", description: "field.description",
  asset_name: "field.assetName", quantity: "field.quantity", received_quantity: "field.quantity",
  unit_price: "field.unitPrice", received_on: "field.receivedOn", asset_id: "column.asset", asset: "column.asset",
  holder_id: "column.holder", borrowed_on: "column.borrowedOn", expected_return_on: "column.expectedReturn",
  purpose: "field.purpose", returned_on: "column.actualReturn", return_condition: "field.returnCondition",
  company_id: "column.company", project: "column.project", installed_on: "column.installedOn",
  installed_by_id: "column.installer", movement_date: "column.date", reason: "field.reason",
  to_user: "column.to", to_department: "column.to", to_project: "column.to", to_company: "column.to", to_warehouse: "column.to",
  from_user: "column.from", from_department: "column.from", from_project: "column.from", from_company: "column.from", from_warehouse: "column.from",
  fault_date: "column.faultDate", scheduled_date: "column.scheduledDate", technician_id: "column.technician",
  completed_date: "field.completedOn", work_performed: "field.workPerformed", parts_replaced: "field.partsReplaced",
  labor_cost: "field.laborCost", parts_cost: "field.partsCost", result: "field.result",
  next_maintenance_date: "column.nextDate", disposal_method: "field.disposalMethod", salvage_value: "field.salvageValue",
  disposal_cost: "field.disposalCost", note: "field.note", disposal_date: "column.disposalDate", status: "column.status",
};

/** The first field a refused save names, with the server's (already translated) reason. */
export function firstFieldError(error: Error | null): { key: string; message: string } | null {
  if (!(error instanceof ApiError)) return null;
  const key = Object.keys(error.errors).find((x) => error.errors[x]);
  return key ? { key, message: error.errors[key] } : null;
}

/**
 * Why a save was refused, inside the dialog. JB209-16 (Lucas 11-16 audit):
 * a refusal only said 「请检查标红的字段后重试」, and no field on this page
 * is ever marked red, so the person could not tell which box to fix. This
 * names the first field the server refused and its reason. `labels` covers a
 * dialog whose field means something else here (a department's 名称).
 */
function SaveError({ error, labels = {} }: { error: Error | null; labels?: Record<string, string> }) {
  const t = useTranslations("adminAssetManagement");
  if (!error) return null;
  const field = firstFieldError(error);
  const label = field ? labels[field.key] ?? (FIELD_LABELS[field.key] ? t(FIELD_LABELS[field.key]) : "") : "";
  return <p role="alert" data-save-error className="text-sm font-medium text-destructive">{field ? (label ? t("saveFieldError", { field: label, error: field.message }) : field.message) : error.message || t("saveError")}</p>;
}

function AssetPanel({ mode }: { mode: "management" | "details" | "search" }) {
  const t = useTranslations("adminAssetManagement"); const df = useDateFormat(); const qc = useQueryClient(); const { can } = useAuth();
  const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [status, setStatus] = useState("");
  const rows = usePagedList({ queryKey: ["assets", mode, search, category, status], queryFn: (paging) => getAssets({ ...paging, search: search || undefined, category: category || undefined, status: status || undefined, sort_by: "asset_code" }) });
  const [editing, setEditing] = useState<Asset | null | undefined>(undefined);
  const active = useMutation({ mutationFn: ({ row, enabled }: { row: Asset; enabled: boolean }) => setAssetActive(row.id, enabled), onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }) });
  const detailed = mode !== "management";
  return <Panel loading={rows.isLoading} error={rows.isError}>
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6">
      {mode === "search" && <Input className="sm:max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("field.search")} />}
      {mode === "search" && <><SelectField className="sm:w-48" value={category} onChange={setCategory}><option value="">{t("field.allCategories")}</option>{CATEGORIES.map((x) => <option key={x} value={x}>{t(`category.${x}`)}</option>)}</SelectField><SelectField className="sm:w-48" value={status} onChange={setStatus}><option value="">{t("field.allStatuses")}</option>{ASSET_STATUSES.map((x) => <option key={x} value={x}>{t(`assetStatus.${x}`)}</option>)}</SelectField></>}
      {/* JB209-9 (Lucas 11-16 audit, D-A1): the page has rendered this panel
          as "search" since the workspaces were merged (c7184ceb), and the
          button still waited for "management", so 「新增资产」 never showed and
          equipment MSE already owned could not be entered. Every mode but the
          read-only details view may add. */}
      {mode !== "details" && can("asset.manage") && <Button className="ml-auto" onClick={() => setEditing(null)}><Plus />{t("action.addAsset")}</Button>}
    </div>
    <Table><TableHeader><TableRow>{(detailed ? ["code", "name", "category", "brandModel", "serial", "purchaseDate", "warranty", "holder", "companyProject", "status", "actions"] : ["code", "name", "category", "serial", "location", "status", "active", "actions"]).map((x) => <TableHead key={x}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>
      {(rows.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.asset_code}</TableCell><TableCell>{row.name}</TableCell><TableCell><TypeBadge label={row.custom_category_name || t(`category.${row.category}`)} /></TableCell>{detailed && <TableCell>{[row.brand, row.model].filter(Boolean).join(" / ") || "-"}</TableCell>}<TableCell>{row.serial_number}</TableCell>{detailed ? <><TableCell>{df.date(row.purchase_date)}<p className="text-xs text-muted-foreground">RM {row.purchase_price}</p></TableCell><TableCell>{df.date(row.warranty_expires_on) || "-"}</TableCell><TableCell>{row.holder_name || row.department_name || row.current_warehouse || "-"}</TableCell><TableCell>{row.deployed_company_name || "-"}<p className="text-xs text-muted-foreground">{row.project_name || ""}</p></TableCell></> : <TableCell>{row.project_name || row.deployed_company_name || row.current_warehouse || row.holder_name || "-"}</TableCell>}<TableCell><StatusBadge label={t(`assetStatus.${row.status}`)} tone={statusTone(row.status)} /></TableCell>{!detailed && <TableCell><StatusBadge label={t(row.is_active ? "status.active" : "status.inactive")} tone={row.is_active ? "positive" : "neutral"} /></TableCell>}<TableCell>{can("asset.manage") && <div className="flex items-center gap-1"><Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => setEditing(row)}><Pencil /></Button>{row.status !== "RETIRED" && <Button size="sm" variant="outline" disabled={active.isPending} onClick={() => active.mutate({ row, enabled: !row.is_active })}>{t(row.is_active ? "action.deactivate" : "action.activate")}</Button>}</div>}</TableCell></TableRow>)}
    </TableBody></Table>
    <LoadMoreRow list={rows} />
    {editing !== undefined && <AssetDialog row={editing} onClose={() => setEditing(undefined)} onSaved={() => qc.invalidateQueries({ queryKey: ["assets"] })} />}
  </Panel>;
}

/**
 * 类别「其他」 with nothing to choose. JB209-16 (Lucas 11-16 audit): the
 * 自定义类别 list stayed empty and nothing said that its entries are made on
 * the 资产类别 page.
 */
function NoCustomCategories({ query }: { query: { isLoading: boolean; isError: boolean; data?: { results: AssetCategoryDefinition[] } } }) {
  const t = useTranslations("adminAssetManagement");
  if (query.isLoading || query.isError || (query.data?.results ?? []).some((x) => x.is_active && !x.is_system)) return null;
  return <p data-no-custom-categories className="text-xs text-muted-foreground">{t("field.noCustomCategories")} <Link href="/assets/categories" className="font-medium text-primary hover:underline">{t("action.goToCategories")}</Link></p>;
}

function AssetDialog({ row, onClose, onSaved }: { row: Asset | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement");
  const categories = useQuery({ queryKey: ["asset-categories", "options"], queryFn: () => readAllPages((paging) => getAssetCategories(paging)) });
  const [form, setForm] = useState<CreateAssetPayload>({ category: row?.category ?? "GATEWAY", custom_category: row?.custom_category ?? null, name: row?.name ?? "", brand: row?.brand ?? "", model: row?.model ?? "", serial_number: row?.serial_number ?? "", purchase_date: row?.purchase_date ?? "", purchase_price: row?.purchase_price ?? "", supplier: row?.supplier ?? "", invoice_number: row?.invoice_number ?? "", warranty_period_months: row?.warranty_period_months ?? 12, firmware_version: row?.firmware_version ?? "", ip_address: row?.ip_address ?? "", mac_address: row?.mac_address ?? "", location_notes: row?.location_notes ?? "", notes: row?.notes ?? "" });
  const set = (key: keyof CreateAssetPayload, value: string | number | null) => setForm((x) => ({ ...x, [key]: value }));
  const save = useMutation({ mutationFn: () => { const payload = { ...form, ip_address: form.ip_address || null }; return row ? updateAsset(row.id, payload) : createAsset(payload); }, onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{t(row ? "action.editAsset" : "action.addAsset")}</DialogTitle><DialogDescription>{row?.asset_code || t("dialog.asset")}</DialogDescription></DialogHeader><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <FieldWrapper label={t("field.category")} required><SelectField className="w-full" value={form.category} onChange={(v) => set("category", v)}>{CATEGORIES.map((x) => <option key={x} value={x}>{t(`category.${x}`)}</option>)}</SelectField></FieldWrapper>
    {form.category === "OTHER" && <FieldWrapper label={t("field.customCategory")} required><SelectField className="w-full" value={form.custom_category ?? ""} onChange={(v) => set("custom_category", v || null)}><option value="">{t("field.selectCustomCategory")}</option>{(categories.data?.results ?? []).filter((x) => x.is_active && !x.is_system).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectField><QueryFailedNote query={categories} what={t("what.categories")} /><NoCustomCategories query={categories} /></FieldWrapper>}
    <FieldWrapper label={t("field.name")} required><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.serial")} required><Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.brand")}><Input value={form.brand} onChange={(e) => set("brand", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.model")}><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.purchaseDate")} required><Input type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.purchasePrice")} required><Input type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.supplier")}><Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.invoice")}><Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.warrantyMonths")}><Input type="number" min="0" value={form.warranty_period_months} onChange={(e) => set("warranty_period_months", Number(e.target.value))} /></FieldWrapper><FieldWrapper label={t("field.firmware")}><Input value={form.firmware_version} onChange={(e) => set("firmware_version", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.ipAddress")}><Input value={form.ip_address ?? ""} onChange={(e) => set("ip_address", e.target.value || null)} /></FieldWrapper><FieldWrapper label={t("field.macAddress")}><Input value={form.mac_address} onChange={(e) => set("mac_address", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.location")}><Textarea value={form.location_notes} onChange={(e) => set("location_notes", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.notes")}><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FieldWrapper>
  </div><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.category, t("field.category")], [form.category !== "OTHER" || form.custom_category, t("field.customCategory")], [form.name, t("field.name")], [form.serial_number, t("field.serial")], [form.purchase_date, t("field.purchaseDate")], [form.purchase_price, t("field.purchasePrice")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function CategoryPanel() {
  const t = useTranslations("adminAssetManagement"); const qc = useQueryClient(); const { can } = useAuth(); const rows = usePagedList({ queryKey: ["asset-categories"], queryFn: (paging) => getAssetCategories(paging) }); const [editing, setEditing] = useState<AssetCategoryDefinition | null | undefined>(undefined);
  // JB209-16 (Lucas 11-16 audit): 🗑 deleted a category at the first press;
  // it now asks first, in the shared confirmation dialog.
  const [removing, setRemoving] = useState<AssetCategoryDefinition | null>(null);
  const remove = useMutation({ mutationFn: deleteAssetCategory, onSuccess: () => { setRemoving(null); void qc.invalidateQueries({ queryKey: ["asset-categories"] }); } });
  return <Panel loading={rows.isLoading} error={rows.isError}>{can("asset.manage") && <div className="flex justify-end border-b px-4 py-3 sm:px-6"><Button onClick={() => setEditing(null)}><Plus />{t("action.addCategory")}</Button></div>}<Table><TableHeader><TableRow>{["code", "name", "description", "source", "status", "actions"].map((x) => <TableHead key={x}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{(rows.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.code}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.description || "-"}</TableCell><TableCell>{t(row.is_system ? "status.system" : "status.custom")}</TableCell><TableCell><StatusBadge label={t(row.is_active ? "status.active" : "status.inactive")} tone={row.is_active ? "positive" : "neutral"} /></TableCell><TableCell>{can("asset.manage") && <div className="flex items-center gap-1"><Button size="icon-sm" variant="ghost" title={t("action.editCategory")} onClick={() => setEditing(row)}><Pencil /></Button>{!row.is_system && <Button size="icon-sm" variant="ghost" title={t("action.removeCategory")} onClick={() => setRemoving(row)}><Trash2 /></Button>}</div>}</TableCell></TableRow>)}</TableBody></Table><LoadMoreRow list={rows} />{editing !== undefined && <CategoryDialog row={editing} onClose={() => setEditing(undefined)} onSaved={() => qc.invalidateQueries({ queryKey: ["asset-categories"] })} />}<ConfirmDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)} title={t("action.removeCategory")} description={t("confirm.removeCategory", { name: removing?.name ?? "" })} confirmLabel={t("action.removeCategory")} isPending={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} /></Panel>;
}

function CategoryDialog({ row, onClose, onSaved }: { row: AssetCategoryDefinition | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const [code, setCode] = useState(row?.code ?? ""); const [name, setName] = useState(row?.name ?? ""); const [description, setDescription] = useState(row?.description ?? ""); const [active, setActive] = useState(row?.is_active ?? true);
  const save = useMutation({ mutationFn: () => row ? updateAssetCategory(row.id, { name, description, is_active: active }) : createAssetCategory({ code, name, description }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t(row ? "action.editCategory" : "action.addCategory")}</DialogTitle><DialogDescription>{t("dialog.category")}</DialogDescription></DialogHeader><FieldWrapper label={t("field.code")} required><Input disabled={Boolean(row)} value={code} onChange={(e) => setCode(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.categoryName")} required><Input value={name} onChange={(e) => setName(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.description")}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></FieldWrapper>{row && <label className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} />{t("status.active")}</label>}<SaveError error={save.error} labels={{ name: t("field.categoryName") }} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[code, t("field.code")], [name, t("field.categoryName")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function PurchasePanel() {
  const t = useTranslations("adminAssetManagement"); const df = useDateFormat(); const qc = useQueryClient(); const { can } = useAuth(); const rows = usePagedList({ queryKey: ["asset-purchases"], queryFn: (paging) => getAssetPurchases(paging) }); const [creating, setCreating] = useState(false); const [receiving, setReceiving] = useState<AssetPurchase | null>(null);
  return <Panel loading={rows.isLoading} error={rows.isError}>{can("asset.manage") && <div className="flex justify-end border-b px-4 py-3 sm:px-6"><Button onClick={() => setCreating(true)}><Plus />{t("action.addPurchase")}</Button></div>}<Table><TableHeader><TableRow>{["purchaseCode", "supplier", "date", "asset", "quantity", "received", "unitPrice", "total", "purchaser", "status", "actions"].map((x) => <TableHead key={x} className={headAlign(x)}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{(rows.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.purchase_code}</TableCell><TableCell>{row.supplier}</TableCell><TableCell>{df.date(row.purchase_date)}</TableCell><TableCell>{row.asset_name}<p className="text-xs text-muted-foreground">{t(`category.${row.category}`)}</p></TableCell><TableCell className="text-right tabular">{row.quantity}</TableCell><TableCell className="text-right tabular">{row.received_quantity}</TableCell><TableCell className="text-right tabular">RM {row.unit_price}</TableCell><TableCell className="text-right tabular">RM {row.total_amount}</TableCell><TableCell>{row.purchaser_name || "-"}</TableCell><TableCell><StatusBadge label={t(`purchaseStatus.${row.delivery_status}`)} tone={statusTone(row.delivery_status)} /></TableCell><TableCell>{can("asset.manage") && !["RECEIVED", "CANCELLED"].includes(row.delivery_status) && <Button size="sm" onClick={() => setReceiving(row)}><Download />{t("action.receive")}</Button>}</TableCell></TableRow>)}</TableBody></Table><LoadMoreRow list={rows} />{creating && <PurchaseDialog onClose={() => setCreating(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["asset-purchases"] })} />}{receiving && <ReceiveDialog row={receiving} onClose={() => setReceiving(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-purchases"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}</Panel>;
}

function PurchaseDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const categories = useQuery({ queryKey: ["asset-categories", "options"], queryFn: () => readAllPages((paging) => getAssetCategories(paging)) }); const [form, setForm] = useState({ supplier: "", purchase_date: "", category: "GATEWAY", custom_category: "", asset_name: "", brand: "", model: "", quantity: "1", unit_price: "", invoice_number: "", warranty_period_months: "12", notes: "" }); const set = (k: keyof typeof form, v: string) => setForm((x) => ({ ...x, [k]: v }));
  const save = useMutation({ mutationFn: () => createAssetPurchase({ ...form, custom_category: form.custom_category || null, quantity: Number(form.quantity), warranty_period_months: Number(form.warranty_period_months) }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{t("action.addPurchase")}</DialogTitle><DialogDescription>{t("dialog.purchase")}</DialogDescription></DialogHeader><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.supplier")} required><Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.purchaseDate")} required><Input type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.category")}><SelectField className="w-full" value={form.category} onChange={(v) => set("category", v)}>{CATEGORIES.map((x) => <option key={x} value={x}>{t(`category.${x}`)}</option>)}</SelectField></FieldWrapper>{form.category === "OTHER" && <FieldWrapper label={t("field.customCategory")} required><SelectField className="w-full" value={form.custom_category} onChange={(v) => set("custom_category", v)}><option value="">{t("field.selectCustomCategory")}</option>{(categories.data?.results ?? []).filter((x) => !x.is_system && x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectField><QueryFailedNote query={categories} what={t("what.categories")} /><NoCustomCategories query={categories} /></FieldWrapper>}<FieldWrapper label={t("field.assetName")} required><Input value={form.asset_name} onChange={(e) => set("asset_name", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.brand")}><Input value={form.brand} onChange={(e) => set("brand", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.model")}><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.quantity")} required><Input type="number" min="1" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.unitPrice")} required><Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.invoice")}><Input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.warrantyMonths")}><Input type="number" min="0" value={form.warranty_period_months} onChange={(e) => set("warranty_period_months", e.target.value)} /></FieldWrapper><FieldWrapper className="sm:col-span-2" label={t("field.notes")}><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FieldWrapper></div><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.supplier, t("field.supplier")], [form.purchase_date, t("field.purchaseDate")], [form.category !== "OTHER" || form.custom_category, t("field.customCategory")], [form.asset_name, t("field.assetName")], [form.quantity, t("field.quantity")], [form.unit_price, t("field.unitPrice")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function ReceiveDialog({ row, onClose, onSaved }: { row: AssetPurchase; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const [quantity, setQuantity] = useState(String(row.quantity - row.received_quantity)); const [receivedOn, setReceivedOn] = useState(localToday()); const save = useMutation({ mutationFn: () => receiveAssetPurchase(row.id, { received_quantity: Number(quantity), received_on: receivedOn }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.receive")}</DialogTitle><DialogDescription>{row.purchase_code} / {row.asset_name}</DialogDescription></DialogHeader><FieldWrapper label={t("field.quantity")} required><Input type="number" min="1" max={row.quantity - row.received_quantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.receivedOn")} required><Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} /></FieldWrapper><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[quantity, t("field.quantity")], [receivedOn, t("field.receivedOn")]]} disabled={save.isPending} onClick={() => save.mutate()}><Check />{t("action.confirm")}</Button></DialogFooter></DialogContent></Dialog>;
}

function InventoryPanel() {
  const t = useTranslations("adminAssetManagement"); const rows = useQuery({ queryKey: ["asset-stock"], queryFn: getAssetStock });
  return <Panel loading={rows.isLoading} error={rows.isError}><Table><TableHeader><TableRow>{["category", "total", "available", "installed", "borrowed", "maintenance", "faulty", "retired", "value"].map((x) => <TableHead key={x} className={headAlign(x)}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{(rows.data ?? []).map((row) => <TableRow key={row.category}><TableCell><TypeBadge label={t(`category.${row.category}`)} /></TableCell><TableCell className="text-right tabular">{row.total_quantity}</TableCell><TableCell className="text-right tabular">{row.in_stock_quantity}</TableCell><TableCell className="text-right tabular">{row.deployed_quantity}</TableCell><TableCell className="text-right tabular">{row.borrowed_quantity}</TableCell><TableCell className="text-right tabular">{row.maintenance_quantity}</TableCell><TableCell className="text-right tabular">{row.faulty_quantity}</TableCell><TableCell className="text-right tabular">{row.retired_quantity}</TableCell><TableCell className="text-right tabular">RM {row.total_value}</TableCell></TableRow>)}</TableBody></Table></Panel>;
}

function AssignmentPanel() {
  const t = useTranslations("adminAssetManagement"); const df = useDateFormat(); const qc = useQueryClient(); const { can } = useAuth(); const rows = usePagedList({ queryKey: ["asset-assignments"], queryFn: (paging) => getAssetAssignments(paging) }); const [creating, setCreating] = useState(false); const [returning, setReturning] = useState<AssetAssignment | null>(null);
  return <Panel loading={rows.isLoading} error={rows.isError}>{can("asset.issue") && <div className="flex justify-end border-b px-4 py-3 sm:px-6"><Button onClick={() => setCreating(true)}><Plus />{t("action.issueAsset")}</Button></div>}<Table><TableHeader><TableRow>{["assignmentCode", "asset", "holder", "borrowedOn", "expectedReturn", "actualReturn", "purpose", "status", "actions"].map((x) => <TableHead key={x}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{(rows.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.assignment_code}</TableCell><TableCell>{row.asset.asset_code}<p className="text-xs text-muted-foreground">{row.asset.name}</p></TableCell><TableCell>{row.holder_name}</TableCell><TableCell>{df.date(row.borrowed_on)}</TableCell><TableCell>{df.date(row.expected_return_on) || "-"}</TableCell><TableCell>{df.date(row.returned_on) || "-"}</TableCell><TableCell>{row.purpose}</TableCell><TableCell><StatusBadge label={t(`assignmentStatus.${row.status}`)} tone={statusTone(row.status)} /></TableCell><TableCell>{can("asset.issue") && ["BORROWED", "OVERDUE"].includes(row.status) && <Button size="sm" onClick={() => setReturning(row)}><RotateCcw />{t("action.return")}</Button>}</TableCell></TableRow>)}</TableBody></Table><LoadMoreRow list={rows} />{creating && <AssignmentDialog onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-assignments"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}{returning && <ReturnDialog row={returning} onClose={() => setReturning(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-assignments"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}</Panel>;
}

function AssignmentDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const options = useQuery({ queryKey: ["asset-options"], queryFn: getAssetOptions });
  // JB209-16 (Lucas 11-16 audit): an inactive 在库 asset was offered and then
  // refused by the server; only active ones are asked for now.
  const assets = useQuery({ queryKey: ["assets", "assignable"], queryFn: () => readAllPages((paging) => getAssets({ ...paging, status: "IN_STOCK", is_active: true })) }); const [form, setForm] = useState({ asset_id: "", holder_id: "", borrowed_on: "", expected_return_on: "", purpose: "", notes: "" }); const set = (k: keyof typeof form, v: string) => setForm((x) => ({ ...x, [k]: v })); const save = useMutation({ mutationFn: () => createAssetAssignment({ ...form, expected_return_on: form.expected_return_on || null }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.issueAsset")}</DialogTitle><DialogDescription>{t("dialog.assignment")}</DialogDescription></DialogHeader><FieldWrapper label={t("column.asset")} required><SelectField className="w-full" value={form.asset_id} onChange={(v) => set("asset_id", v)}><option value="">{t("field.selectAsset")}</option>{(assets.data?.results ?? []).map((x) => <option key={x.id} value={x.id}>{x.asset_code} / {x.name}</option>)}</SelectField><QueryFailedNote query={assets} what={t("what.assets")} /></FieldWrapper><FieldWrapper label={t("column.holder")} required><SelectField className="w-full" value={form.holder_id} onChange={(v) => set("holder_id", v)}><option value="">{t("field.selectHolder")}</option>{(options.data?.users ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name} / {x.email}</option>)}</SelectField><QueryFailedNote query={options} what={t("what.staff")} /></FieldWrapper><FieldWrapper label={t("column.borrowedOn")} required><Input type="date" value={form.borrowed_on} onChange={(e) => set("borrowed_on", e.target.value)} /></FieldWrapper><FieldWrapper label={t("column.expectedReturn")}><Input type="date" value={form.expected_return_on} onChange={(e) => set("expected_return_on", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.purpose")} required><Textarea value={form.purpose} onChange={(e) => set("purpose", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.notes")}><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FieldWrapper><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.asset_id, t("column.asset")], [form.holder_id, t("column.holder")], [form.borrowed_on, t("column.borrowedOn")], [form.purpose, t("field.purpose")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function ReturnDialog({ row, onClose, onSaved }: { row: AssetAssignment; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const [returnedOn, setReturnedOn] = useState(localToday()); const [condition, setCondition] = useState(""); const save = useMutation({ mutationFn: () => returnAssetAssignment(row.id, { returned_on: returnedOn, return_condition: condition }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.return")}</DialogTitle><DialogDescription>{row.asset.asset_code} / {row.holder_name}</DialogDescription></DialogHeader><FieldWrapper label={t("column.actualReturn")} required><Input type="date" value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.returnCondition")} required><Textarea value={condition} onChange={(e) => setCondition(e.target.value)} /></FieldWrapper><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[returnedOn, t("column.actualReturn")], [condition, t("field.returnCondition")]]} disabled={save.isPending} onClick={() => save.mutate()}><Check />{t("action.confirm")}</Button></DialogFooter></DialogContent></Dialog>;
}

function InstallationPanel() {
  const t = useTranslations("adminAssetManagement"); const df = useDateFormat(); const qc = useQueryClient(); const { can } = useAuth(); const rows = usePagedList({ queryKey: ["asset-installations"], queryFn: (paging) => getAssetInstallations(paging) }); const [creating, setCreating] = useState(false); const [transitioning, setTransitioning] = useState<AssetInstallation | null>(null);
  return <Panel loading={rows.isLoading} error={rows.isError}>{can("asset.manage") && <div className="flex justify-end border-b px-4 py-3 sm:px-6"><Button onClick={() => setCreating(true)}><Plus />{t("action.installAsset")}</Button></div>}<Table><TableHeader><TableRow>{["installationCode", "asset", "company", "project", "location", "installedOn", "installer", "activatedOn", "status", "actions"].map((x) => <TableHead key={x}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{(rows.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.installation_code}</TableCell><TableCell>{row.asset.asset_code}<p className="text-xs text-muted-foreground">{row.asset.name}</p></TableCell><TableCell>{row.company_name}</TableCell><TableCell>{row.project_name || "-"}</TableCell><TableCell>{row.location}</TableCell><TableCell>{df.date(row.installed_on)}</TableCell><TableCell>{row.installed_by_name || "-"}</TableCell><TableCell>{df.date(row.activated_on) || "-"}</TableCell><TableCell><StatusBadge label={t(`installationStatus.${row.status}`)} tone={statusTone(row.status)} /></TableCell><TableCell>{can("asset.manage") && row.status !== "REMOVED" && <Button size="sm" onClick={() => setTransitioning(row)}>{t("action.changeStatus")}</Button>}</TableCell></TableRow>)}</TableBody></Table><LoadMoreRow list={rows} />{creating && <InstallationDialog onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-installations"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}{transitioning && <InstallationStatusDialog row={transitioning} onClose={() => setTransitioning(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-installations"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}</Panel>;
}

function InstallationDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const options = useQuery({ queryKey: ["asset-options"], queryFn: getAssetOptions }); const assets = useQuery({ queryKey: ["assets", "installable"], queryFn: () => readAllPages((paging) => getAssets({ ...paging, is_active: true })) }); const [form, setForm] = useState({ asset_id: "", company_id: "", project: "", location: "", installed_on: "", installed_by_id: "", notes: "" }); const set = (k: keyof typeof form, v: string) => setForm((x) => ({ ...x, [k]: v, ...(k === "company_id" ? { project: "" } : {}) })); const save = useMutation({ mutationFn: () => createAssetInstallation({ ...form, project: form.project || null, installed_by_id: form.installed_by_id || null }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.installAsset")}</DialogTitle><DialogDescription>{t("dialog.installation")}</DialogDescription></DialogHeader><FieldWrapper label={t("column.asset")} required><SelectField className="w-full" value={form.asset_id} onChange={(v) => set("asset_id", v)}><option value="">{t("field.selectAsset")}</option>{(assets.data?.results ?? []).filter((x) => !["BORROWED", "MAINTENANCE", "FAULTY", "RETIRED"].includes(x.status)).map((x) => <option key={x.id} value={x.id}>{x.asset_code} / {x.name}</option>)}</SelectField><QueryFailedNote query={assets} what={t("what.assets")} /></FieldWrapper><FieldWrapper label={t("column.company")} required><SelectField className="w-full" value={form.company_id} onChange={(v) => set("company_id", v)}><option value="">{t("field.selectCompany")}</option>{(options.data?.companies ?? []).map((x) => <option key={x.id} value={x.id}>{x.code} / {x.name}</option>)}</SelectField><QueryFailedNote query={options} what={t("what.options")} /></FieldWrapper><FieldWrapper label={t("column.project")}><SelectField className="w-full" value={form.project} onChange={(v) => set("project", v)}><option value="">{t("field.noProject")}</option>{(options.data?.projects ?? []).filter((x) => x.company_id === form.company_id).map((x) => <option key={x.id} value={x.id}>{x.code} / {x.name}</option>)}</SelectField></FieldWrapper><FieldWrapper label={t("column.installer")}><SelectField className="w-full" value={form.installed_by_id} onChange={(v) => set("installed_by_id", v)}><option value="">{t("field.currentOperator")}</option>{(options.data?.users ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</SelectField></FieldWrapper><FieldWrapper label={t("field.location")} required><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></FieldWrapper><FieldWrapper label={t("column.installedOn")} required><Input type="date" value={form.installed_on} onChange={(e) => set("installed_on", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.notes")}><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FieldWrapper><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.asset_id, t("column.asset")], [form.company_id, t("column.company")], [form.location, t("field.location")], [form.installed_on, t("column.installedOn")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function InstallationStatusDialog({ row, onClose, onSaved }: { row: AssetInstallation; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const choices: InstallationStatus[] = row.status === "INSTALLED" ? ["ACTIVE", "REMOVED"] : row.status === "ACTIVE" ? ["INACTIVE", "REMOVED"] : ["ACTIVE", "REMOVED"]; const [status, setStatus] = useState<InstallationStatus>(choices[0]); const [date, setDate] = useState(localToday()); const save = useMutation({ mutationFn: () => transitionAssetInstallation(row.id, { status, ...(status === "ACTIVE" ? { activated_on: date } : status === "REMOVED" ? { removed_on: date } : {}) }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.changeStatus")}</DialogTitle><DialogDescription>{row.installation_code}</DialogDescription></DialogHeader><FieldWrapper label={t("column.status")}><SelectField className="w-full" value={status} onChange={(v) => setStatus(v as InstallationStatus)}>{choices.map((x) => <option key={x} value={x}>{t(`installationStatus.${x}`)}</option>)}</SelectField></FieldWrapper>{status !== "INACTIVE" && <FieldWrapper label={status === "ACTIVE" ? t("column.activatedOn") : t("field.removedOn")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FieldWrapper>}<SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={save.isPending} onClick={() => save.mutate()}><Check />{t("action.confirm")}</Button></DialogFooter></DialogContent></Dialog>;
}

/**
 * MSE's own departments.
 *
 * 17.2.8 lists "部门之间调拨" as one of the four ways platform equipment moves.
 * The transfer picker offered a department all along, but nothing anywhere
 * could create one, so the list was always empty and that quarter of the
 * requirement could not be exercised. This is the screen that fills it.
 */
function DepartmentPanel() {
  const t = useTranslations("adminAssetManagement"); const qc = useQueryClient(); const { can } = useAuth();
  const rows = usePagedList({ queryKey: ["departments", "platform"], queryFn: (paging) => getDepartments({ ...paging, sort_by: "code" }) });
  const [editing, setEditing] = useState<Department | null | undefined>(undefined);
  // JB209-16 (Lucas 11-16 audit): 🗑 removed a department at the first press;
  // it now asks first, in the shared confirmation dialog.
  const [removing, setRemoving] = useState<Department | null>(null);
  const drop = useMutation({ mutationFn: (row: Department) => deleteDepartment(row.id), onSuccess: () => { setRemoving(null); void qc.invalidateQueries({ queryKey: ["departments"] }); void qc.invalidateQueries({ queryKey: ["asset-options"] }); } });
  return <Panel loading={rows.isLoading} error={rows.isError}>
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6">
      <p className="text-sm text-muted-foreground">{t("department.help")}</p>
      {can("department.manage") && <Button className="ml-auto" onClick={() => setEditing(null)}><Plus />{t("department.action.add")}</Button>}
    </div>
    {!(rows.data?.results ?? []).length
      ? <p className="m-4 rounded-xl border border-dashed border-panel-border p-6 text-center text-sm text-muted-foreground sm:m-6">{t("department.empty")}</p>
      : <Table><TableHeader><TableRow>{["code", "name", "parent", "status"].map((x) => <TableHead key={x}>{t(`department.column.${x}`)}</TableHead>)}<TableHead /></TableRow></TableHeader><TableBody>
        {(rows.data?.results ?? []).map((row) => <TableRow key={row.id}>
          <TableCell className="font-medium">{row.code}</TableCell>
          <TableCell>{row.name}</TableCell>
          <TableCell>{row.parent_name || "-"}</TableCell>
          <TableCell><StatusBadge label={t(row.is_active ? "status.active" : "status.inactive")} tone={row.is_active ? "positive" : "neutral"} /></TableCell>
          <TableCell>{can("department.manage") && <div className="flex items-center justify-end gap-0.5">
            <Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => setEditing(row)}><Pencil /></Button>
            <Button size="icon-sm" variant="ghost" title={t("department.action.remove")} disabled={drop.isPending} onClick={() => setRemoving(row)}><Trash2 /></Button>
          </div>}</TableCell>
        </TableRow>)}
      </TableBody></Table>}
    <LoadMoreRow list={rows} />
    <ConfirmDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)} title={t("department.action.remove")} description={t("confirm.removeDepartment", { name: removing ? `${removing.code} / ${removing.name}` : "" })} confirmLabel={t("department.action.remove")} isPending={drop.isPending} onConfirm={() => removing && drop.mutate(removing)} />
    {editing !== undefined && <DepartmentDialog row={editing} parents={rows.data?.results ?? []} onClose={() => setEditing(undefined)} onSaved={() => { void qc.invalidateQueries({ queryKey: ["departments"] }); void qc.invalidateQueries({ queryKey: ["asset-options"] }); }} />}
  </Panel>;
}

function DepartmentDialog({ row, parents, onClose, onSaved }: { row: Department | null; parents: Department[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement");
  const [code, setCode] = useState(row?.code ?? ""); const [name, setName] = useState(row?.name ?? "");
  const [parent, setParent] = useState(row?.parent ?? ""); const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const save = useMutation({
    mutationFn: () => {
      const payload = { code: code.trim(), name: name.trim(), parent: parent || null, is_active: isActive };
      return row ? updateDepartment(row.id, payload) : createDepartment(payload);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });
  // A department cannot parent itself, and the backend rejects a cycle anyway.
  const options = parents.filter((x) => x.id !== row?.id);
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>{row ? t("department.action.edit") : t("department.action.add")}</DialogTitle><DialogDescription>{t("department.help")}</DialogDescription></DialogHeader>
    <FieldWrapper label={t("department.column.code")} required><Input value={code} onChange={(e) => setCode(e.target.value)} /></FieldWrapper>
    <FieldWrapper label={t("department.column.name")} required><Input value={name} onChange={(e) => setName(e.target.value)} /></FieldWrapper>
    <FieldWrapper label={t("department.column.parent")}><SelectField className="w-full" value={parent} onChange={setParent}><option value="">{t("department.noParent")}</option>{options.map((x) => <option key={x.id} value={x.id}>{x.code} / {x.name}</option>)}</SelectField></FieldWrapper>
    <label className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"><Switch checked={isActive} onCheckedChange={setIsActive} /><span className="text-sm">{t("status.active")}</span></label>
    <SaveError error={save.error} labels={{ code: t("department.column.code"), name: t("department.column.name"), parent: t("department.column.parent") }} />
    <DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[code, t("department.column.code")], [name, t("department.column.name")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function TransferPanel() {
  const t = useTranslations("adminAssetManagement"); const df = useDateFormat(); const qc = useQueryClient(); const { can } = useAuth(); const rows = usePagedList({ queryKey: ["asset-movements", "transfers"], queryFn: (paging) => getMovements({ ...paging, type: "TRANSFER" }) }); const [creating, setCreating] = useState(false);
  // A movement carries only the company id, so its name comes from the options list.
  const options = useQuery({ queryKey: ["asset-options"], queryFn: getAssetOptions }); const companyName = (id: string | null) => (id && options.data?.companies.find((x) => x.id === id)?.name) || "";
  return <Panel loading={rows.isLoading} error={rows.isError}>{can("asset.transfer") && <div className="flex justify-end border-b px-4 py-3 sm:px-6"><Button onClick={() => setCreating(true)}><Plus />{t("action.transferAsset")}</Button></div>}<QueryFailedNote className="border-b px-3 py-2" query={options} what={t("what.customers")} /><Table><TableHeader><TableRow>{["movementCode", "asset", "from", "to", "date", "reason", "operator"].map((x) => <TableHead key={x}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{(rows.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.movement_code}</TableCell><TableCell>{row.asset.asset_code}<p className="text-xs text-muted-foreground">{row.asset.name}</p></TableCell><TableCell>{row.from_user_name || row.from_department_name || row.from_project_name || companyName(row.from_company) || row.from_warehouse || row.from_location || "-"}</TableCell><TableCell>{row.to_user_name || row.to_department_name || row.to_project_name || companyName(row.to_company) || row.to_warehouse || row.to_location || "-"}</TableCell><TableCell>{df.date(row.movement_date)}</TableCell><TableCell>{row.reason}</TableCell><TableCell>{row.handled_by_name || "-"}</TableCell></TableRow>)}</TableBody></Table><LoadMoreRow list={rows} />{creating && <TransferDialog onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-movements"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}</Panel>;
}

type Place = "user" | "department" | "warehouse" | "project" | "company";
const PLACES: Place[] = ["user", "department", "warehouse", "project", "company"];

/**
 * Where an asset is right now, as the "from" side of a transfer (T-382).
 * The backend stores from_* exactly as sent and never derives it, so the
 * form proposes the asset's current placement and lets the operator correct
 * it. The order matches how the list reads a row's placement: a holder wins
 * over a department, a project over the customer it belongs to.
 */
function placeOf(asset: Asset | undefined): { kind: Place; target: string; label: string } {
  if (!asset) return { kind: "warehouse", target: "", label: "" };
  if (asset.current_holder) return { kind: "user", target: asset.current_holder, label: asset.holder_name ?? "" };
  if (asset.current_department) return { kind: "department", target: asset.current_department, label: asset.department_name ?? "" };
  if (asset.current_project) return { kind: "project", target: asset.current_project, label: asset.project_name ?? "" };
  if (asset.deployed_at) return { kind: "company", target: asset.deployed_at, label: asset.deployed_company_name ?? "" };
  return { kind: "warehouse", target: asset.current_warehouse ?? "", label: "" };
}

/** A place type plus the place itself: a typed warehouse name, or a record chosen from the options list. */
function PlacePicker({ options, kind, target, empty, known, onKind, onTarget }: { options: AssetOptions | undefined; kind: Place; target: string; empty: string; known?: { id: string; label: string }; onKind: (value: Place) => void; onTarget: (value: string) => void }) {
  const t = useTranslations("adminAssetManagement");
  const choices: Array<{ id: string; label: string }> = (kind === "user" ? options?.users.map((x) => ({ id: x.id, label: x.full_name })) : kind === "department" ? options?.departments.map((x) => ({ id: x.id, label: `${x.code} / ${x.name}` })) : kind === "project" ? options?.projects.map((x) => ({ id: x.id, label: `${x.code} / ${x.name}` })) : kind === "company" ? options?.companies.map((x) => ({ id: x.id, label: `${x.code} / ${x.name}` })) : []) ?? [];
  // The asset's current holder may be missing from the list (an inactive user, say); it is still where the asset is, so it stays choosable and visibly selected.
  const listed = known && known.id && !choices.some((x) => x.id === known.id) ? [...choices, known] : choices;
  return <div className="flex gap-2"><SelectField className="w-32 shrink-0" value={kind} onChange={(v) => { onKind(v as Place); onTarget(""); }}>{PLACES.map((x) => <option key={x} value={x}>{t(`destination.${x}`)}</option>)}</SelectField>{kind === "warehouse" ? <Input className="min-w-0 flex-1" placeholder={t("field.warehouse")} value={target} onChange={(e) => onTarget(e.target.value)} /> : <SelectField className="min-w-0 flex-1" value={target} onChange={onTarget}><option value="">{empty}</option>{listed.map((x) => <option key={x.id} value={x.id}>{x.label || x.id}</option>)}</SelectField>}</div>;
}

function TransferDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const options = useQuery({ queryKey: ["asset-options"], queryFn: getAssetOptions }); const assets = useQuery({ queryKey: ["assets", "transferable"], queryFn: () => readAllPages((paging) => getAssets({ ...paging, is_active: true })) }); const [destination, setDestination] = useState<Place>("warehouse"); const [target, setTarget] = useState(""); const [movementDate, setMovementDate] = useState(""); const [reason, setReason] = useState(""); const [notes, setNotes] = useState(""); const [assetId, setAssetId] = useState("");
  const [origin, setOrigin] = useState<{ kind: Place; target: string; label: string }>(placeOf(undefined));
  const pickAsset = (id: string) => { setAssetId(id); setOrigin(placeOf((assets.data?.results ?? []).find((x) => x.id === id))); };
  // A project always sits under a customer, so moving out of one also records the customer it left.
  const fromPayload = !origin.target ? {} : origin.kind === "user" ? { from_user: origin.target } : origin.kind === "department" ? { from_department: origin.target } : origin.kind === "project" ? { from_project: origin.target, from_company: options.data?.projects.find((x) => x.id === origin.target)?.company_id ?? null } : origin.kind === "company" ? { from_company: origin.target } : { from_warehouse: origin.target };
  const save = useMutation({ mutationFn: () => createMovement({ asset_id: assetId, type: "TRANSFER", movement_date: movementDate, reason, notes, ...fromPayload, ...(destination === "user" ? { to_user: target } : destination === "department" ? { to_department: target } : destination === "project" ? { to_project: target } : destination === "company" ? { to_company: target } : { to_warehouse: target }) }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.transferAsset")}</DialogTitle><DialogDescription>{t("dialog.transfer")}</DialogDescription></DialogHeader><FieldWrapper label={t("column.asset")} required><SelectField className="w-full" value={assetId} onChange={pickAsset}><option value="">{t("field.selectAsset")}</option>{(assets.data?.results ?? []).filter((x) => x.status !== "RETIRED").map((x) => <option key={x.id} value={x.id}>{x.asset_code} / {x.name}</option>)}</SelectField><QueryFailedNote query={assets} what={t("what.assets")} /></FieldWrapper><FieldWrapper label={t("column.from")} hint={t("field.fromHint")}><PlacePicker options={options.data} kind={origin.kind} target={origin.target} empty={t("field.selectSource")} known={origin.target && origin.kind !== "warehouse" ? { id: origin.target, label: origin.label } : undefined} onKind={(kind) => setOrigin({ kind, target: "", label: "" })} onTarget={(value) => setOrigin((x) => ({ ...x, target: value }))} /></FieldWrapper><FieldWrapper label={t("column.to")} required><PlacePicker options={options.data} kind={destination} target={target} empty={t("field.selectDestination")} onKind={setDestination} onTarget={setTarget} /><QueryFailedNote query={options} what={t("what.options")} /></FieldWrapper><FieldWrapper label={t("column.date")} required><Input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.reason")} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.notes")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></FieldWrapper><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[assetId, t("column.asset")], [target, t("column.to")], [movementDate, t("column.date")], [reason, t("field.reason")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function MaintenancePanel({ repairs }: { repairs: boolean }) {
  const t = useTranslations("adminAssetManagement"); const df = useDateFormat(); const qc = useQueryClient(); const { can } = useAuth(); const rows = usePagedList({ queryKey: ["asset-maintenance", repairs], queryFn: (paging) => getAssetMaintenance({ ...paging, ...(repairs ? { type: "CORRECTIVE" } : {}) }) }); const filtered = (rows.data?.results ?? []).filter((x) => repairs ? x.type === "CORRECTIVE" : x.type !== "CORRECTIVE"); const [creating, setCreating] = useState(false); const [completing, setCompleting] = useState<AssetMaintenance | null>(null); const start = useMutation({ mutationFn: startAssetMaintenance, onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset-maintenance"] }); qc.invalidateQueries({ queryKey: ["assets"] }); } });
  return <Panel loading={rows.isLoading} error={rows.isError}>{can("asset.maintain") && <div className="flex justify-end border-b px-4 py-3 sm:px-6"><Button onClick={() => setCreating(true)}><Plus />{t(repairs ? "action.addRepair" : "action.addMaintenance")}</Button></div>}<Table><TableHeader><TableRow>{["maintenanceCode", "asset", "type", "faultDate", "scheduledDate", "nextDate", "technician", "description", "result", "cost", "status", "actions"].map((x) => <TableHead key={x} className={headAlign(x)}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{filtered.map((row) => <TableRow key={row.id}><TableCell>{row.maintenance_code}</TableCell><TableCell>{row.asset.asset_code}<p className="text-xs text-muted-foreground">{row.asset.name}</p></TableCell><TableCell>{t(`maintenanceType.${row.type}`)}</TableCell><TableCell>{df.date(row.fault_date) || "-"}</TableCell><TableCell>{df.date(row.scheduled_date)}</TableCell><TableCell>{df.date(row.next_maintenance_date) || "-"}</TableCell><TableCell>{row.technician_name || "-"}</TableCell><TableCell>{row.description}</TableCell><TableCell>{row.result || "-"}</TableCell><TableCell className="text-right tabular">{row.total_cost ? `RM ${row.total_cost}` : "-"}</TableCell><TableCell><StatusBadge label={t(`maintenanceStatus.${row.status}`)} tone={statusTone(row.status)} /></TableCell><TableCell>{can("asset.maintain") && ["SCHEDULED", "IN_PROGRESS"].includes(row.status) && <div className="flex items-center gap-1">{row.status === "SCHEDULED" && <Button size="sm" variant="outline" onClick={() => start.mutate(row.id)}><Wrench />{t("action.start")}</Button>}<Button size="sm" onClick={() => setCompleting(row)}><Check />{t("action.complete")}</Button></div>}</TableCell></TableRow>)}</TableBody></Table><LoadMoreRow list={rows} />{creating && <MaintenanceDialog repairs={repairs} onClose={() => setCreating(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["asset-maintenance"] })} />}{completing && <MaintenanceCompleteDialog row={completing} onClose={() => setCompleting(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-maintenance"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}</Panel>;
}

function MaintenanceDialog({ repairs, onClose, onSaved }: { repairs: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const options = useQuery({ queryKey: ["asset-options"], queryFn: getAssetOptions }); const assets = useQuery({ queryKey: ["assets", "maintenance-options"], queryFn: () => readAllPages((paging) => getAssets({ ...paging, is_active: true })) }); const [form, setForm] = useState({ asset_id: "", type: repairs ? "CORRECTIVE" : "PREVENTIVE", fault_date: "", scheduled_date: "", description: "", technician_id: "", is_recurring: false }); const set = (k: keyof typeof form, v: string | boolean) => setForm((x) => ({ ...x, [k]: v })); const save = useMutation({ mutationFn: () => createAssetMaintenance({ ...form, fault_date: form.fault_date || null, technician_id: form.technician_id || null }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t(repairs ? "action.addRepair" : "action.addMaintenance")}</DialogTitle><DialogDescription>{t("dialog.maintenance")}</DialogDescription></DialogHeader><FieldWrapper label={t("column.asset")} required><SelectField className="w-full" value={form.asset_id} onChange={(v) => set("asset_id", v)}><option value="">{t("field.selectAsset")}</option>{(assets.data?.results ?? []).filter((x) => x.status !== "RETIRED").map((x) => <option key={x.id} value={x.id}>{x.asset_code} / {x.name}</option>)}</SelectField><QueryFailedNote query={assets} what={t("what.assets")} /></FieldWrapper>{!repairs && <FieldWrapper label={t("column.type")}><SelectField className="w-full" value={form.type} onChange={(v) => set("type", v)}>{MAINTENANCE_TYPES.filter((x) => x !== "CORRECTIVE").map((x) => <option key={x} value={x}>{t(`maintenanceType.${x}`)}</option>)}</SelectField></FieldWrapper>}{repairs && <FieldWrapper label={t("column.faultDate")}><Input type="date" value={form.fault_date} onChange={(e) => set("fault_date", e.target.value)} /></FieldWrapper>}<FieldWrapper label={t("column.scheduledDate")} required><Input type="date" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} /></FieldWrapper><FieldWrapper label={t("column.technician")}><SelectField className="w-full" value={form.technician_id} onChange={(v) => set("technician_id", v)}><option value="">{t("field.noTechnician")}</option>{(options.data?.users ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</SelectField><QueryFailedNote query={options} what={t("what.staff")} /></FieldWrapper><FieldWrapper label={t("field.description")} required><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></FieldWrapper>{/* JB209-16 (Lucas 11-16 audit): a recurring 保养 repeats only when the
      next date is filled in at 完成; nothing on screen said so. */}
  {!repairs && <div className="space-y-1"><label className="flex items-center gap-2"><Switch checked={form.is_recurring} onCheckedChange={(v) => set("is_recurring", v)} />{t("field.recurring")}</label><p data-recurring-hint className="text-xs text-muted-foreground">{t("field.recurringHint")}</p></div>}<SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.asset_id, t("column.asset")], [form.scheduled_date, t("column.scheduledDate")], [form.description, t("field.description")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function MaintenanceCompleteDialog({ row, onClose, onSaved }: { row: AssetMaintenance; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const [form, setForm] = useState({ completed_date: localToday(), work_performed: "", parts_replaced: "", labor_cost: "0.00", parts_cost: "0.00", result: "", next_maintenance_date: "" }); const set = (k: keyof typeof form, v: string) => setForm((x) => ({ ...x, [k]: v })); const save = useMutation({ mutationFn: () => completeAssetMaintenance(row.id, { ...form, next_maintenance_date: form.next_maintenance_date || null }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{t("action.complete")}</DialogTitle><DialogDescription>{row.maintenance_code}</DialogDescription></DialogHeader><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.completedOn")} required><Input type="date" value={form.completed_date} onChange={(e) => set("completed_date", e.target.value)} /></FieldWrapper><FieldWrapper label={t("column.nextDate")} required={row.is_recurring} hint={row.is_recurring ? t("field.nextDateRecurringHint") : undefined}><Input type="date" value={form.next_maintenance_date} onChange={(e) => set("next_maintenance_date", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.workPerformed")} required><Textarea value={form.work_performed} onChange={(e) => set("work_performed", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.partsReplaced")}><Textarea value={form.parts_replaced} onChange={(e) => set("parts_replaced", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.laborCost")}><Input type="number" min="0" step="0.01" value={form.labor_cost} onChange={(e) => set("labor_cost", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.partsCost")}><Input type="number" min="0" step="0.01" value={form.parts_cost} onChange={(e) => set("parts_cost", e.target.value)} /></FieldWrapper><FieldWrapper className="sm:col-span-2" label={t("field.result")} required><Textarea value={form.result} onChange={(e) => set("result", e.target.value)} /></FieldWrapper></div><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.completed_date, t("field.completedOn")], [!row.is_recurring || form.next_maintenance_date, t("column.nextDate")], [form.work_performed, t("field.workPerformed")], [form.result, t("field.result")]]} disabled={save.isPending} onClick={() => save.mutate()}><Check />{t("action.confirm")}</Button></DialogFooter></DialogContent></Dialog>;
}

function DisposalPanel() {
  const t = useTranslations("adminAssetManagement"); const df = useDateFormat(); const qc = useQueryClient(); const { can } = useAuth(); const rows = usePagedList({ queryKey: ["asset-disposals"], queryFn: (paging) => getAssetDisposals(paging) }); const [creating, setCreating] = useState(false); const [acting, setActing] = useState<AssetDisposal | null>(null);
  return <Panel loading={rows.isLoading} error={rows.isError}>{can("asset.dispose") && <div className="flex justify-end border-b px-4 py-3 sm:px-6"><Button onClick={() => setCreating(true)}><Plus />{t("action.requestDisposal")}</Button></div>}<Table><TableHeader><TableRow>{["disposalCode", "asset", "requestedOn", "requester", "method", "reason", "approver", "disposalDate", "status", "actions"].map((x) => <TableHead key={x}>{t(`column.${x}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{(rows.data?.results ?? []).map((row) => <TableRow key={row.id}><TableCell>{row.disposal_code}</TableCell><TableCell>{row.asset.asset_code}<p className="text-xs text-muted-foreground">{row.asset.name}</p></TableCell><TableCell>{df.date(row.requested_on)}</TableCell><TableCell>{row.requested_by_name || "-"}</TableCell><TableCell>{row.disposal_method}</TableCell><TableCell>{row.reason}</TableCell><TableCell>{row.approved_by_name || "-"}</TableCell><TableCell>{df.date(row.disposal_date) || "-"}</TableCell><TableCell><StatusBadge label={t(`disposalStatus.${row.status}`)} tone={statusTone(row.status)} /></TableCell><TableCell>{can("asset.dispose") && ["REQUESTED", "APPROVED"].includes(row.status) && <Button size="sm" onClick={() => setActing(row)}>{t("action.process")}</Button>}</TableCell></TableRow>)}</TableBody></Table><LoadMoreRow list={rows} />{creating && <DisposalDialog onClose={() => setCreating(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["asset-disposals"] })} />}{acting && <DisposalDecisionDialog row={acting} onClose={() => setActing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["asset-disposals"] }); qc.invalidateQueries({ queryKey: ["assets"] }); }} />}</Panel>;
}

function DisposalDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const assets = useQuery({ queryKey: ["assets", "disposal-options"], queryFn: () => readAllPages((paging) => getAssets({ ...paging, is_active: true })) }); const [form, setForm] = useState({ asset_id: "", reason: "", disposal_method: "", salvage_value: "", disposal_cost: "", notes: "" }); const set = (k: keyof typeof form, v: string) => setForm((x) => ({ ...x, [k]: v })); const save = useMutation({ mutationFn: () => createAssetDisposal({ ...form, salvage_value: form.salvage_value || null, disposal_cost: form.disposal_cost || null }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.requestDisposal")}</DialogTitle><DialogDescription>{t("dialog.disposal")}</DialogDescription></DialogHeader><FieldWrapper label={t("column.asset")} required><SelectField className="w-full" value={form.asset_id} onChange={(v) => set("asset_id", v)}><option value="">{t("field.selectAsset")}</option>{(assets.data?.results ?? []).filter((x) => x.status !== "RETIRED").map((x) => <option key={x.id} value={x.id}>{x.asset_code} / {x.name}</option>)}</SelectField><QueryFailedNote query={assets} what={t("what.assets")} /></FieldWrapper><FieldWrapper label={t("field.disposalMethod")} required><Input value={form.disposal_method} onChange={(e) => set("disposal_method", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.reason")} required><Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} /></FieldWrapper><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FieldWrapper label={t("field.salvageValue")}><Input type="number" min="0" step="0.01" value={form.salvage_value} onChange={(e) => set("salvage_value", e.target.value)} /></FieldWrapper><FieldWrapper label={t("field.disposalCost")}><Input type="number" min="0" step="0.01" value={form.disposal_cost} onChange={(e) => set("disposal_cost", e.target.value)} /></FieldWrapper></div><FieldWrapper label={t("field.notes")}><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FieldWrapper><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[[form.asset_id, t("column.asset")], [form.reason, t("field.reason")], [form.disposal_method, t("field.disposalMethod")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function DisposalDecisionDialog({ row, onClose, onSaved }: { row: AssetDisposal; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("adminAssetManagement"); const [decision, setDecision] = useState(row.status === "APPROVED" ? "COMPLETE" : "APPROVE"); const [note, setNote] = useState(""); const [date, setDate] = useState(localToday()); const choices = row.status === "APPROVED" ? ["COMPLETE"] : ["APPROVE", "REJECT"]; const save = useMutation({ mutationFn: () => decideAssetDisposal(row.id, { decision, note, ...(decision === "COMPLETE" ? { disposal_date: date } : {}) }), onSuccess: () => { onSaved(); onClose(); } });
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{t("action.process")}</DialogTitle><DialogDescription>{row.disposal_code}</DialogDescription></DialogHeader><FieldWrapper label={t("field.decision")}><SelectField className="w-full" value={decision} onChange={setDecision}>{choices.map((x) => <option key={x} value={x}>{t(`decision.${x}`)}</option>)}</SelectField></FieldWrapper>{decision === "COMPLETE" && <FieldWrapper label={t("column.disposalDate")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FieldWrapper>}<FieldWrapper label={t("field.note")} required={decision === "REJECT"}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FieldWrapper><SaveError error={save.error} /><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={decision === "REJECT" ? [[note, t("field.note")]] : []} disabled={save.isPending} onClick={() => save.mutate()}><Check />{t("action.confirm")}</Button></DialogFooter></DialogContent></Dialog>;
}

const REPORTS: Record<string, string[]> = {
  assets: ["asset_code", "name", "category", "brand", "model", "serial_number", "purchase_date", "warranty_expires_on", "status", "holder_name", "deployed_company_name", "project_name"],
  inventory: ["category", "total", "available", "installed", "borrowed", "maintenance", "retired", "value"],
  purchases: ["purchase_code", "supplier", "purchase_date", "asset_name", "quantity", "received_quantity", "unit_price", "total_amount", "purchaser_name", "delivery_status"],
  assignments: ["assignment_code", "asset", "holder_name", "borrowed_on", "expected_return_on", "returned_on", "status", "purpose"],
  installations: ["installation_code", "asset", "company_name", "project_name", "location", "installed_on", "installed_by_name", "activated_on", "status"],
  movements: ["movement_code", "asset", "type", "from_location", "to_location", "movement_date", "reason", "handled_by_name"],
  repairs: ["maintenance_code", "asset", "fault_date", "scheduled_date", "completed_date", "technician_name", "description", "result", "total_cost", "status"],
  maintenance: ["maintenance_code", "asset", "type", "scheduled_date", "completed_date", "next_maintenance_date", "technician_name", "description", "result", "total_cost", "status"],
  disposals: ["disposal_code", "asset", "requested_on", "requested_by_name", "disposal_date", "reason", "disposal_method", "approved_by_name", "status"],
};

/**
 * The word group that turns a report column's codes into words. JB209-16
 * (Lucas 11-16 audit): the files printed IN_STOCK, GATEWAY, CORRECTIVE; the
 * screen's own words now go with the columns (`utils/exports.py` `values`).
 * JB215B-1: 调拨报表's 「类型」 printed TRANSFER / ISSUE / RETURN; it reads the
 * movement types' own words now (`assets/constants.py` MovementType).
 */
export const REPORT_VALUE_GROUPS: Record<string, Record<string, string>> = {
  assets: { category: "category", status: "assetStatus" },
  inventory: { category: "category" },
  purchases: { delivery_status: "purchaseStatus" },
  assignments: { status: "assignmentStatus" },
  installations: { status: "installationStatus" },
  movements: { type: "movementType" },
  repairs: { status: "maintenanceStatus" },
  maintenance: { type: "maintenanceType", status: "maintenanceStatus" },
  disposals: { status: "disposalStatus" },
};

function ReportPanel() {
  const t = useTranslations("adminAssetManagement"); const summary = useQuery({ queryKey: ["asset-report-summary"], queryFn: getAssetReportSummary });
  const values = (dataset: string, key: string) => { const group = REPORT_VALUE_GROUPS[dataset]?.[key]; return group ? { values: t.raw(group) as Record<string, string> } : {}; };
  const run = (dataset: string, format: "xlsx" | "pdf") => exportAssetReport(dataset, format, REPORTS[dataset].map((key) => ({ key, label: t(`exportColumn.${key}`), ...values(dataset, key) })), t(`report.${dataset}`));
  return <Panel loading={summary.isLoading} error={summary.isError}><div className="grid md:grid-cols-2 xl:grid-cols-3">{Object.keys(REPORTS).map((dataset) => <div key={dataset} className="border-b border-r p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{t(`report.${dataset}`)}</p><p className="tabular mt-1 text-2xl font-semibold">{dataset === "inventory" ? summary.data?.inventory?.length ?? 0 : summary.data?.[dataset as keyof typeof summary.data] as number ?? 0}</p></div><div className="flex flex-wrap items-center gap-2"><ExportButton size="sm" onExport={(format) => run(dataset, format)} title={t(`report.${dataset}`)} /></div></div></div>)}</div></Panel>;
}
