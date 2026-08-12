"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Building2,
  FileArchive,
  Globe2,
  ImageUp,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  CompanyBranch,
  ContractorCompanyProfile,
  ContractorSiteSettings,
} from "@/interfaces/site-access";
import {
  createCompanyBranch,
  deleteCompanyBranch,
  getCompanyBranches,
  getContractorCompanyProfile,
  getContractorSiteSettings,
  updateCompanyBranch,
  updateContractorCompanyProfile,
  updateContractorSiteSettings,
} from "@/services/site-access.service";
import { getRoles } from "@/services/users.service";

const STATES = ["Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor", "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya"];
const TIMEZONES = ["Asia/Kuala_Lumpur", "Asia/Singapore", "UTC"];
const CONSULTANT_PERMISSIONS = ["project.view", "document.view", "approval.view", "approval.review", "notification.view", "progress.view", "safety.view", "report.view", "report.export"];

export function CompanySiteSettingsWorkspace() {
  const t = useTranslations("siteControl");
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can("company_settings.manage");
  const settings = useQuery({ queryKey: ["contractor-site-settings"], queryFn: getContractorSiteSettings });
  const profile = useQuery({ queryKey: ["contractor-company-profile"], queryFn: getContractorCompanyProfile });
  const branches = useQuery({ queryKey: ["company-branches"], queryFn: () => getCompanyBranches({ page_size: 100 }) });
  const roles = useQuery({ queryKey: ["company-roles", "settings"], queryFn: () => getRoles({ page_size: 100 }), enabled: can("role.view") });
  const [draft, setDraft] = useState<Partial<ContractorSiteSettings>>({});
  const [profileDraft, setProfileDraft] = useState<Partial<ContractorCompanyProfile>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [editingBranch, setEditingBranch] = useState<CompanyBranch | "new" | null>(null);
  const [removing, setRemoving] = useState<CompanyBranch | null>(null);
  const form = settings.data ? { ...settings.data, ...draft } : null;
  const profileForm = profile.data ? { ...profile.data, ...profileDraft } : null;
  const setForm = (next: ContractorSiteSettings) => setDraft(next);
  const setCompany = (next: ContractorCompanyProfile) => setProfileDraft(next);
  const save = useMutation({
    mutationFn: (payload: Partial<ContractorSiteSettings>) => updateContractorSiteSettings(payload),
    onSuccess: async () => {
      setDraft({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contractor-site-settings"] }),
        qc.invalidateQueries({ queryKey: ["auth", "me"] }),
      ]);
    },
  });
  const saveProfile = useMutation({
    mutationFn: () => updateContractorCompanyProfile(profileForm ?? {}, logoFile),
    onSuccess: async () => {
      setProfileDraft({});
      setLogoFile(null);
      await qc.invalidateQueries({ queryKey: ["contractor-company-profile"] });
    },
  });
  const remove = useMutation({ mutationFn: deleteCompanyBranch, onSuccess: async () => { setRemoving(null); await qc.invalidateQueries({ queryKey: ["company-branches"] }); } });

  if (settings.isLoading || profile.isLoading || branches.isLoading || !form || !profileForm) return <State text={t("state.loading")} />;
  if (settings.isError || profile.isError || branches.isError) return <State text={t("state.loadError")} danger />;

  const categories = form.default_project_categories ?? [];
  const roleOptions = roles.data?.results.map((role) => role.code) ?? Array.from(new Set([form.default_user_role_code, form.default_approval_role_code, form.default_guest_role_code]));
  const roleLabel = (code: string) => roles.data?.results.find((role) => role.code === code)?.name ?? code;
  const updateCategory = (index: number, patch: Partial<(typeof categories)[number]>) => {
    const next = categories.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row);
    setForm({ ...form, default_project_categories: next });
  };
  const updateRule = (
    field: "default_archive_rules" | "default_notification_rules",
    key: string,
    value: boolean,
  ) => setForm({ ...form, [field]: { ...(form[field] ?? {}), [key]: value } });

  return <div className="space-y-8">
    <ListHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
      <strong>{t("settings.realRulesTitle")}</strong> {t("settings.realRulesHelp")}
    </div>

    <section className="space-y-4">
      <SectionTitle icon={Building2} title={t("profile.title")} description={t("profile.subtitle")} action={canManage ? <Button size="sm" disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}><Save />{t("action.saveProfile")}</Button> : undefined} />
      {saveProfile.isError && <ErrorBanner text={t("settings.saveError")} />}
      <div className="grid gap-5 rounded-lg border bg-card p-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border bg-muted/40">
            {profileForm.logo ? <img src={profileForm.logo} alt={profileForm.name} className="h-full w-full object-contain" /> : <Building2 className="size-12 text-muted-foreground" />}
          </div>
          {canManage && <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><ImageUp className="size-4" />{logoFile?.name || t("profile.chooseLogo")}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} /></label>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.companyName")} required><Input disabled={!canManage} value={profileForm.name} onChange={(event) => setCompany({ ...profileForm, name: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.registrationNo")}><Input disabled={!canManage} value={profileForm.registration_no} onChange={(event) => setCompany({ ...profileForm, registration_no: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.companyIntro")} className="sm:col-span-2"><Textarea disabled={!canManage} value={profileForm.description} onChange={(event) => setCompany({ ...profileForm, description: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.address")} className="sm:col-span-2"><Input disabled={!canManage} value={profileForm.address_line_1} onChange={(event) => setCompany({ ...profileForm, address_line_1: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.address2")} className="sm:col-span-2"><Input disabled={!canManage} value={profileForm.address_line_2} onChange={(event) => setCompany({ ...profileForm, address_line_2: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.city")}><Input disabled={!canManage} value={profileForm.city} onChange={(event) => setCompany({ ...profileForm, city: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.state")}><Select disabled={!canManage} value={profileForm.state || undefined} onValueChange={(value) => setCompany({ ...profileForm, state: value })}><SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseState")} /></SelectTrigger><SelectContent>{STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></FieldWrapper>
          <FieldWrapper label={t("field.postcode")}><Input disabled={!canManage} value={profileForm.postcode} onChange={(event) => setCompany({ ...profileForm, postcode: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.phone")}><Input disabled={!canManage} value={profileForm.contact_phone} onChange={(event) => setCompany({ ...profileForm, contact_phone: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.email")}><Input disabled={!canManage} type="email" value={profileForm.contact_email} onChange={(event) => setCompany({ ...profileForm, contact_email: event.target.value })} /></FieldWrapper>
          <FieldWrapper label={t("field.website")}><Input disabled={!canManage} type="url" value={profileForm.website} onChange={(event) => setCompany({ ...profileForm, website: event.target.value })} /></FieldWrapper>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <SectionTitle icon={Settings2} title={t("projectDefaults.title")} description={t("projectDefaults.subtitle")} action={canManage ? <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(form)}><Save />{t("action.saveSettings")}</Button> : undefined} />
      {save.isError && <ErrorBanner text={t("settings.saveError")} />}
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <FieldWrapper label={t("field.defaultProjectStatus")}><Select disabled={!canManage} value={form.default_project_status} onValueChange={(value: "PLANNING" | "ACTIVE") => setForm({ ...form, default_project_status: value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PLANNING">{t("projectStatus.PLANNING")}</SelectItem><SelectItem value="ACTIVE">{t("projectStatus.ACTIVE")}</SelectItem></SelectContent></Select></FieldWrapper>
        <NumberField label={t("field.defaultRadius")} value={form.default_geofence_radius_m} min={10} max={10000} disabled={!canManage} onChange={(value) => setForm({ ...form, default_geofence_radius_m: value })} />
        <NumberField label={t("field.targetReminder")} value={form.target_reminder_percent} min={1} max={100} disabled={!canManage} onChange={(value) => setForm({ ...form, target_reminder_percent: value })} />
      </div>
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><h3 className="font-medium">{t("categories.title")}</h3><p className="text-sm text-muted-foreground">{t("categories.subtitle")}</p></div>{canManage && <Button size="sm" variant="outline" onClick={() => setForm({ ...form, default_project_categories: [...categories, { code: "", name: "", description: "", is_visible_in_pwa: true }] })}><Plus />{t("categories.add")}</Button>}</div>
        {!categories.length ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("categories.empty")}</p> : <div className="divide-y">{categories.map((row, index) => <div key={`${row.code}-${index}`} className="grid gap-3 p-4 md:grid-cols-[150px_minmax(180px,1fr)_auto_auto] md:items-end"><FieldWrapper label={t("field.code")}><Input disabled={!canManage} value={row.code} onChange={(event) => updateCategory(index, { code: event.target.value.toUpperCase() })} /></FieldWrapper><FieldWrapper label={t("field.name")}><Input disabled={!canManage} value={row.name} onChange={(event) => updateCategory(index, { name: event.target.value })} /></FieldWrapper><Toggle compact label={t("categories.fieldVisible")} description={t("categories.fieldVisibleHelp")} checked={row.is_visible_in_pwa} disabled={!canManage} onChange={(checked) => updateCategory(index, { is_visible_in_pwa: checked })} />{canManage && <Button size="icon" variant="ghost" className="text-destructive" title={t("action.remove")} onClick={() => setForm({ ...form, default_project_categories: categories.filter((_, rowIndex) => rowIndex !== index) })}><Trash2 /></Button>}</div>)}</div>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Toggle label={t("projectDefaults.archiveLock")} description={t("projectDefaults.archiveLockHelp")} checked={Boolean(form.default_archive_rules.lock_after_archive)} disabled={!canManage} onChange={(checked) => updateRule("default_archive_rules", "lock_after_archive", checked)} />
        <Toggle label={t("projectDefaults.notifyManager")} description={t("projectDefaults.notifyManagerHelp")} checked={Boolean(form.default_notification_rules.notify_project_manager ?? true)} disabled={!canManage} onChange={(checked) => updateRule("default_notification_rules", "notify_project_manager", checked)} />
      </div>
    </section>

    <section className="space-y-4">
      <SectionTitle icon={Globe2} title={t("preferences.title")} description={t("preferences.subtitle")} />
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3">
        <ChoiceField label={t("field.dateFormat")} value={form.date_format} disabled={!canManage} options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} onChange={(value) => setForm({ ...form, date_format: value as ContractorSiteSettings["date_format"] })} />
        <ChoiceField label={t("field.timeFormat")} value={form.time_format} disabled={!canManage} options={["12H", "24H"]} onChange={(value) => setForm({ ...form, time_format: value as ContractorSiteSettings["time_format"] })} />
        <ChoiceField label={t("field.language")} value={form.language} disabled={!canManage} options={["en", "zh", "ms"]} optionLabel={(value) => t(`language.${value}`)} onChange={(value) => setForm({ ...form, language: value as ContractorSiteSettings["language"] })} />
        <ChoiceField label={t("field.timezone")} value={form.timezone} disabled={!canManage} options={TIMEZONES} onChange={(value) => setForm({ ...form, timezone: value })} />
        <ChoiceField label={t("field.homePage")} value={form.home_page} disabled={!canManage} options={["/dashboard", "/projects", "/notifications", "/field-staff"]} optionLabel={(value) => t(`homePage.${value.slice(1).replace("-", "_")}`)} onChange={(value) => setForm({ ...form, home_page: value as ContractorSiteSettings["home_page"] })} />
        <ChoiceField label={t("field.notificationChannel")} value={form.default_notification_channel} disabled={!canManage} options={["IN_APP", "PUSH"]} optionLabel={(value) => t(`notificationChannel.${value}`)} onChange={(value) => setForm({ ...form, default_notification_channel: value as ContractorSiteSettings["default_notification_channel"] })} />
      </div>
    </section>

    <section className="space-y-4">
      <SectionTitle icon={Settings2} title={t("permissionDefaults.title")} description={t("permissionDefaults.subtitle")} action={can("role.view") ? <Button asChild size="sm" variant="outline"><Link href="/roles">{t("permissionDefaults.manageRoles")}</Link></Button> : undefined} />
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3">
        <ChoiceField label={t("field.defaultUserRole")} value={form.default_user_role_code} disabled={!canManage} options={roleOptions} optionLabel={roleLabel} onChange={(value) => setForm({ ...form, default_user_role_code: value })} />
        <ChoiceField label={t("field.defaultApprovalRole")} value={form.default_approval_role_code} disabled={!canManage} options={roleOptions} optionLabel={roleLabel} onChange={(value) => setForm({ ...form, default_approval_role_code: value })} />
        <ChoiceField label={t("field.defaultGuestRole")} value={form.default_guest_role_code} disabled={!canManage} options={roleOptions} optionLabel={roleLabel} onChange={(value) => setForm({ ...form, default_guest_role_code: value })} />
      </div>
      <div className="rounded-lg border bg-card p-4"><h3 className="font-medium">{t("permissionDefaults.consultant")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("permissionDefaults.consultantHelp")}</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CONSULTANT_PERMISSIONS.map((code) => <Toggle key={code} compact label={t(`permissionDefaults.permission.${code.replaceAll(".", "_")}`)} description={code} checked={form.default_consultant_permissions.includes(code)} disabled={!canManage} onChange={(checked) => setForm({ ...form, default_consultant_permissions: checked ? [...form.default_consultant_permissions, code] : form.default_consultant_permissions.filter((item) => item !== code) })} />)}</div></div>
    </section>

    <section className="space-y-4">
      <SectionTitle icon={QrCode} title={t("qrSettings.title")} description={t("qrSettings.subtitle")} />
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <FieldWrapper label={t("field.qrPrefix")}><Input disabled={!canManage} value={form.qr_prefix} maxLength={20} onChange={(event) => setForm({ ...form, qr_prefix: event.target.value.toUpperCase() })} /></FieldWrapper>
        <ChoiceField label={t("field.qrStyle")} value={form.qr_style} disabled={!canManage} options={["STANDARD", "COMPACT", "LARGE"]} optionLabel={(value) => t(`qrStyle.${value}`)} onChange={(value) => setForm({ ...form, qr_style: value as ContractorSiteSettings["qr_style"] })} />
        <Toggle label={t("qrSettings.siteAccess")} description={t("qrSettings.siteAccessHelp")} checked={form.enable_site_access_qr} disabled={!canManage} onChange={(checked) => setForm({ ...form, enable_site_access_qr: checked })} />
        <Toggle label={t("qrSettings.visitor")} description={t("qrSettings.visitorHelp")} checked={form.enable_visitor_qr} disabled={!canManage} onChange={(checked) => setForm({ ...form, enable_visitor_qr: checked })} />
        <Toggle label={t("qrSettings.vehicle")} description={t("qrSettings.vehicleHelp")} checked={form.enable_vehicle_qr} disabled={!canManage} onChange={(checked) => setForm({ ...form, enable_vehicle_qr: checked })} />
      </div>
    </section>

    <section className="space-y-4">
      <SectionTitle icon={BellRing} title={t("notificationSettings.title")} description={t("notificationSettings.subtitle")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Toggle label={t("notificationSettings.system")} description={t("notificationSettings.systemHelp")} checked={form.system_notifications} disabled={!canManage} onChange={(checked) => setForm({ ...form, system_notifications: checked })} />
        <Toggle label={t("notificationSettings.approval")} description={t("notificationSettings.approvalHelp")} checked={form.approval_notifications} disabled={!canManage} onChange={(checked) => setForm({ ...form, approval_notifications: checked })} />
        <Toggle label={t("notificationSettings.rectification")} description={t("notificationSettings.rectificationHelp")} checked={form.rectification_notifications} disabled={!canManage} onChange={(checked) => setForm({ ...form, rectification_notifications: checked })} />
        <Toggle label={t("notificationSettings.expiry")} description={t("notificationSettings.expiryHelp")} checked={form.expiry_notifications} disabled={!canManage} onChange={(checked) => setForm({ ...form, expiry_notifications: checked })} />
        <Toggle label={t("notificationSettings.email")} description={t("notificationSettings.emailHelp")} checked={form.email_notifications} disabled={!canManage} onChange={(checked) => setForm({ ...form, email_notifications: checked })} />
      </div>
    </section>

    <section className="space-y-4">
      <SectionTitle icon={FileArchive} title={t("settings.siteRules")} description={t("settings.siteRulesHelp")} />
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <NumberField label={t("field.locationInterval")} value={form.location_update_interval_seconds} min={30} max={900} disabled={!canManage} onChange={(value) => setForm({ ...form, location_update_interval_seconds: value })} />
        <NumberField label={t("field.liveWindow")} value={form.live_position_window_seconds} min={60} max={3600} disabled={!canManage} onChange={(value) => setForm({ ...form, live_position_window_seconds: value })} />
        <NumberField label={t("field.visitorHours")} value={form.visitor_pass_hours} min={1} max={168} disabled={!canManage} onChange={(value) => setForm({ ...form, visitor_pass_hours: value })} />
        <NumberField label={t("field.fieldPinExpiry")} value={form.field_pin_expiry_days} min={1} max={365} disabled={!canManage} onChange={(value) => setForm({ ...form, field_pin_expiry_days: value })} />
        <FieldWrapper label={t("field.emergencyContact")}><Input disabled={!canManage} value={form.emergency_contact_name} onChange={(event) => setForm({ ...form, emergency_contact_name: event.target.value })} /></FieldWrapper>
        <FieldWrapper label={t("field.emergencyPhone")}><Input disabled={!canManage} value={form.emergency_contact_phone} onChange={(event) => setForm({ ...form, emergency_contact_phone: event.target.value })} /></FieldWrapper>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><Toggle label={t("field.attendancePhoto")} description={t("settings.attendancePhotoHelp")} checked={form.require_attendance_photo} disabled={!canManage} onChange={(checked) => setForm({ ...form, require_attendance_photo: checked })} /><Toggle label={t("field.gatePhoto")} description={t("settings.gatePhotoHelp")} checked={form.require_gate_photo} disabled={!canManage} onChange={(checked) => setForm({ ...form, require_gate_photo: checked })} /></div>
    </section>

    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle icon={Building2} title={t("branches.title")} description={t("branches.subtitle")} />{canManage && <Button size="sm" variant="outline" onClick={() => setEditingBranch("new")}><Plus />{t("branches.new")}</Button>}</div>
      {!branches.data?.count ? <State text={t("branches.empty")} /> : <div className="grid gap-3 lg:grid-cols-2">{branches.data.results.map((row) => <article key={row.id} className="rounded-lg border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.code} - {row.name}</h3>{row.is_headquarters && <StatusBadge label={t("branches.headquarters")} tone="info" />}<StatusBadge label={t(row.is_active ? "status.active" : "status.inactive")} tone={row.is_active ? "positive" : "neutral"} /></div><p className="mt-2 text-sm text-muted-foreground">{[row.address_line_1, row.city, row.state, row.postcode].filter(Boolean).join(", ")}</p></div>{canManage && <div className="flex"><Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => setEditingBranch(row)}><Pencil /></Button><Button size="icon-sm" variant="ghost" title={t("action.remove")} className="text-destructive" onClick={() => setRemoving(row)}><Trash2 /></Button></div>}</div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{row.phone || "-"}</span><span>{row.email || "-"}</span>{row.latitude && <span>{row.latitude}, {row.longitude}</span>}</div></article>)}</div>}
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
  </div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={getGps}><MapPin />{t("geofence.useGps")}</Button>{form.latitude && <span className="text-xs text-muted-foreground">{form.latitude}, {form.longitude}</span>}{gpsError && <span className="text-xs text-destructive">{gpsError}</span>}</div><div className="grid gap-3 sm:grid-cols-2"><Toggle label={t("branches.headquarters")} description={t("branches.headquartersHelp")} checked={form.is_headquarters} onChange={(checked) => setForm({ ...form, is_headquarters: checked })} /><Toggle label={t("status.active")} description={t("branches.activeHelp")} checked={form.is_active} onChange={(checked) => setForm({ ...form, is_active: checked })} /></div>{save.isError && <ErrorBanner text={t("settings.saveError")} />}<DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button disabled={!valid || save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function SectionTitle({ icon: Icon, title, description, action }: { icon: typeof Settings2; title: string; description: string; action?: React.ReactNode }) { return <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><div><h2 className="font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div></div>{action}</div>; }
function NumberField({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) { return <FieldWrapper label={label}><Input type="number" value={value} min={min} max={max} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></FieldWrapper>; }
function ChoiceField({ label, value, options, disabled, optionLabel = (row) => row, onChange }: { label: string; value: string; options: string[]; disabled: boolean; optionLabel?: (value: string) => string; onChange: (value: string) => void }) { return <FieldWrapper label={label}><Select disabled={disabled} value={value} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{optionLabel(option)}</SelectItem>)}</SelectContent></Select></FieldWrapper>; }
function Toggle({ label, description, checked, disabled = false, compact = false, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; compact?: boolean; onChange: (checked: boolean) => void }) { return <label className={`flex items-center justify-between gap-4 rounded-lg border bg-card ${compact ? "px-3 py-2" : "p-4"}`}><span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></label>; }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`grid min-h-40 place-items-center rounded-lg border border-dashed p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>; }
function ErrorBanner({ text }: { text: string }) { return <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{text}</div>; }
