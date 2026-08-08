"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Pencil, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CompanyBranch, ContractorSiteSettings } from "@/interfaces/site-access";
import { createCompanyBranch, deleteCompanyBranch, getCompanyBranches, getContractorSiteSettings, updateCompanyBranch, updateContractorSiteSettings } from "@/services/site-access.service";

const STATES = ["Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor", "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya"];

export function CompanySiteSettingsWorkspace() {
  const t = useTranslations("siteControl");
  const { can } = useAuth();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["contractor-site-settings"], queryFn: getContractorSiteSettings });
  const branches = useQuery({ queryKey: ["company-branches"], queryFn: () => getCompanyBranches({ page_size: 100 }) });
  const [draft, setDraft] = useState<Partial<ContractorSiteSettings>>({});
  const [editingBranch, setEditingBranch] = useState<CompanyBranch | "new" | null>(null);
  const [removing, setRemoving] = useState<CompanyBranch | null>(null);
  const form = settings.data ? { ...settings.data, ...draft } : null;
  const setForm = (next: ContractorSiteSettings) => setDraft(next);
  const save = useMutation({ mutationFn: (payload: Partial<ContractorSiteSettings>) => updateContractorSiteSettings(payload), onSuccess: async () => { setDraft({}); await qc.invalidateQueries({ queryKey: ["contractor-site-settings"] }); } });
  const remove = useMutation({ mutationFn: deleteCompanyBranch, onSuccess: async () => { setRemoving(null); await qc.invalidateQueries({ queryKey: ["company-branches"] }); } });
  if (settings.isLoading || branches.isLoading || !form) return <State text={t("state.loading")} />;
  if (settings.isError || branches.isError) return <State text={t("state.loadError")} danger />;

  return <div className="space-y-6">
    <ListHeader title={t("settings.title")} subtitle={t("settings.subtitle")} action={can("company_settings.manage") ? <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(form)}><Save />{t("action.save")}</Button> : undefined} />
    <section className="space-y-4"><SectionTitle icon={Settings2} title={t("settings.siteRules")} description={t("settings.siteRulesHelp")} />
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <NumberField label={t("field.defaultRadius")} value={form.default_geofence_radius_m} min={10} max={10000} disabled={!can("company_settings.manage")} onChange={(value) => setForm({ ...form, default_geofence_radius_m: value })} />
        <NumberField label={t("field.locationInterval")} value={form.location_update_interval_seconds} min={30} max={900} disabled={!can("company_settings.manage")} onChange={(value) => setForm({ ...form, location_update_interval_seconds: value })} />
        <NumberField label={t("field.liveWindow")} value={form.live_position_window_seconds} min={60} max={3600} disabled={!can("company_settings.manage")} onChange={(value) => setForm({ ...form, live_position_window_seconds: value })} />
        <NumberField label={t("field.visitorHours")} value={form.visitor_pass_hours} min={1} max={168} disabled={!can("company_settings.manage")} onChange={(value) => setForm({ ...form, visitor_pass_hours: value })} />
        <FieldWrapper label={t("field.qrPrefix")}><Input disabled={!can("company_settings.manage")} value={form.qr_prefix} maxLength={20} onChange={(event) => setForm({ ...form, qr_prefix: event.target.value.toUpperCase() })} /></FieldWrapper>
        <FieldWrapper label={t("field.emergencyContact")}><Input disabled={!can("company_settings.manage")} value={form.emergency_contact_name} onChange={(event) => setForm({ ...form, emergency_contact_name: event.target.value })} /></FieldWrapper>
        <FieldWrapper label={t("field.emergencyPhone")}><Input disabled={!can("company_settings.manage")} value={form.emergency_contact_phone} onChange={(event) => setForm({ ...form, emergency_contact_phone: event.target.value })} /></FieldWrapper>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Toggle label={t("field.attendancePhoto")} description={t("settings.attendancePhotoHelp")} checked={form.require_attendance_photo} disabled={!can("company_settings.manage")} onChange={(checked) => setForm({ ...form, require_attendance_photo: checked })} /><Toggle label={t("field.gatePhoto")} description={t("settings.gatePhotoHelp")} checked={form.require_gate_photo} disabled={!can("company_settings.manage")} onChange={(checked) => setForm({ ...form, require_gate_photo: checked })} /></div>
    </section>
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle icon={Building2} title={t("branches.title")} description={t("branches.subtitle")} />{can("company_settings.manage") && <Button size="sm" variant="outline" onClick={() => setEditingBranch("new")}><Plus />{t("branches.new")}</Button>}</div>
      {!branches.data?.count ? <State text={t("branches.empty")} /> : <div className="grid gap-3 lg:grid-cols-2">{branches.data.results.map((row) => <article key={row.id} className="rounded-lg border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.code} · {row.name}</h3>{row.is_headquarters && <StatusBadge label={t("branches.headquarters")} tone="info" />}<StatusBadge label={t(row.is_active ? "status.active" : "status.inactive")} tone={row.is_active ? "positive" : "neutral"} /></div><p className="mt-2 text-sm text-muted-foreground">{[row.address_line_1, row.city, row.state, row.postcode].filter(Boolean).join(", ")}</p></div>{can("company_settings.manage") && <div className="flex"><Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => setEditingBranch(row)}><Pencil /></Button><Button size="icon-sm" variant="ghost" title={t("action.remove")} className="text-destructive" onClick={() => setRemoving(row)}><Trash2 /></Button></div>}</div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{row.phone || "-"}</span><span>{row.email || "-"}</span>{row.latitude && <span>{row.latitude}, {row.longitude}</span>}</div></article>)}</div>}
    </section>
    {editingBranch && <BranchDialog row={editingBranch === "new" ? null : editingBranch} onClose={() => setEditingBranch(null)} onSaved={async () => { setEditingBranch(null); await qc.invalidateQueries({ queryKey: ["company-branches"] }); }} />}
    <ConfirmDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)} title={t("branches.removeTitle")} description={t("branches.removeBody")} confirmLabel={t("action.remove")} isPending={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} />
  </div>;
}

const EMPTY_BRANCH = { code: "", name: "", address_line_1: "", address_line_2: "", city: "", state: "", postcode: "", phone: "", email: "", latitude: null as string | null, longitude: null as string | null, is_headquarters: false, is_active: true };

function BranchDialog({ row, onClose, onSaved }: { row: CompanyBranch | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("siteControl");
  const [form, setForm] = useState(() => row ? { ...EMPTY_BRANCH, ...row } : EMPTY_BRANCH);
  const [gpsError, setGpsError] = useState("");
  const save = useMutation({ mutationFn: () => row ? updateCompanyBranch(row.id, form) : createCompanyBranch(form), onSuccess: onSaved });
  const valid = form.code.trim() && form.name.trim() && form.address_line_1.trim();
  function getGps() { navigator.geolocation?.getCurrentPosition((position) => { setGpsError(""); setForm({ ...form, latitude: position.coords.latitude.toFixed(7), longitude: position.coords.longitude.toFixed(7) }); }, () => setGpsError(t("geofence.gpsError")), { enableHighAccuracy: true, timeout: 15000 }); }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t(row ? "branches.editTitle" : "branches.createTitle")}</DialogTitle><DialogDescription>{t("branches.formHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
    <FieldWrapper label={t("field.code")} required><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></FieldWrapper><FieldWrapper label={t("field.name")} required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.address")} required className="sm:col-span-2"><Input value={form.address_line_1} onChange={(event) => setForm({ ...form, address_line_1: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.address2")} className="sm:col-span-2"><Input value={form.address_line_2} onChange={(event) => setForm({ ...form, address_line_2: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.city")}><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.state")}><Select value={form.state || undefined} onValueChange={(value) => setForm({ ...form, state: value })}><SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseState")} /></SelectTrigger><SelectContent>{STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.postcode")}><Input value={form.postcode} onChange={(event) => setForm({ ...form, postcode: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.phone")}><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.email")}><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></FieldWrapper>
  </div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={getGps}><MapPin />{t("geofence.useGps")}</Button>{form.latitude && <span className="text-xs text-muted-foreground">{form.latitude}, {form.longitude}</span>}{gpsError && <span className="text-xs text-destructive">{gpsError}</span>}</div><div className="grid gap-3 sm:grid-cols-2"><Toggle label={t("branches.headquarters")} description={t("branches.headquartersHelp")} checked={form.is_headquarters} onChange={(checked) => setForm({ ...form, is_headquarters: checked })} /><Toggle label={t("status.active")} description={t("branches.activeHelp")} checked={form.is_active} onChange={(checked) => setForm({ ...form, is_active: checked })} /></div><DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!valid || save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Settings2; title: string; description: string }) { return <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><div><h2 className="font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div></div>; }
function NumberField({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) { return <FieldWrapper label={label}><Input type="number" value={value} min={min} max={max} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></FieldWrapper>; }
function Toggle({ label, description, checked, disabled = false, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4"><span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></label>; }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`grid min-h-40 place-items-center rounded-lg border border-dashed p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>; }
