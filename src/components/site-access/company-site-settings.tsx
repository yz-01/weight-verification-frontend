"use client";

/**
 * 公司设置, the contractor's own (JB99, 客户 11-05 事项 2–4).
 *
 * 「公司设置只保留公司名称、SSM注册号码、地址、联系电话、Logo等基本公司资料」,
 * with the two things 事项 2 第三类 also leaves to the company: so three
 * blocks and nothing else -
 *
 * - 公司资料: name, SSM number, address, phone, email, logo, background
 *   picture (back since JB161), and the gate's emergency contact
 *   (「门岗、访客的日常业务资料」, may stay empty);
 * - 显示偏好: language, date and time format, timezone - four drop-downs;
 * - 分公司与总部: 「属于建筑商自己的资料，应该保留」.
 *
 * Between 公司资料 and 显示偏好, 「正式文件样板预览」 (JB162, its own file
 * `letterhead-preview.tsx`): the official details and an A4 sample of the
 * header every formal document prints, updated by 公司资料's save.
 *
 * Everything else that lived here is MSE's now (默认权限、二维码规则、通知规则、
 * GPS、系统安全、归档、照片及记录保存) and is set on the platform's company page
 * (`CompanyLockedSettingsPanel`); the backend refuses a contractor's write of one.
 * Departments and trades moved to 用户 → 部门与工种, the new-project categories
 * to 分类管理. No value was deleted: what is not shown keeps what it was.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Globe2, ImageIcon, ImageUp, MapPin, Pencil, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, ListHeader, StatusBadge } from "@/components/shared/page-primitives";
import { LetterheadPreviewSection } from "@/components/site-access/letterhead-preview";
import { ChoiceField, ErrorBanner, SectionTitle, State, Toggle } from "@/components/site-access/settings-fields";
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

const STATES = ["Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor", "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya"];
const TIMEZONES = ["Asia/Kuala_Lumpur", "Asia/Singapore", "UTC"];
/** The largest logo or background the backend takes (`MAX_COMPANY_IMAGE_BYTES`, C12). */
export const MAX_COMPANY_IMAGE_MB = 8;

/** A picture's size in MB (one decimal) when it is over the limit, else null. */
export function oversizeMb(file: Pick<File, "size">): number | null {
  const mb = file.size / (1024 * 1024);
  return mb > MAX_COMPANY_IMAGE_MB ? Math.ceil(mb * 10) / 10 : null;
}

/** The settings fields this page writes - the only ones a contractor may (JB99). */
export const PROFILE_SETTINGS = ["emergency_contact_name", "emergency_contact_phone"] as const;
// 「PDF 链接有效天数」 (客户 11-08, Lucas: 「那个失效链接弄成可以自行设置的」):
// how long the file link in a WhatsApp / email send works.
export const PREFERENCE_SETTINGS = ["language", "date_format", "time_format", "timezone", "pdf_link_valid_days"] as const;

/**
 * The settings the page starts from. JB164 (screens 11-10 round 2: 显示偏好 → 语言
 * showed 「英文」 for a Chinese company): the company's language is
 * `Company.default_language` - what new accounts and the PDFs use. The settings
 * row only keeps a copy written by a save here, and a row made before any save
 * holds its model default 「en」. So the drop-down shows, and a save keeps, the
 * company's own language.
 */
export function settingsBase(settings: ContractorSiteSettings, profile?: Pick<ContractorCompanyProfile, "default_language"> | null): ContractorSiteSettings {
  return profile?.default_language ? { ...settings, language: profile.default_language } : settings;
}

/**
 * 显示偏好's save. The language goes only when it was changed here (JB164): an
 * untouched drop-down never rewrites the company's language - and the
 * settings row does not take 「zh-TW」, so sending it with a date-format change
 * would refuse the whole save for a 繁體中文 company.
 */
export function preferencesToSave(form: ContractorSiteSettings, shown: ContractorSiteSettings): Partial<ContractorSiteSettings> {
  const payload: Partial<ContractorSiteSettings> = pickSettings(form, PREFERENCE_SETTINGS);
  if (payload.language === shown.language) delete payload.language;
  return payload;
}

/** Only the named fields of the draft: never send what this page does not show. */
export function pickSettings<K extends keyof ContractorSiteSettings>(
  form: ContractorSiteSettings,
  fields: readonly K[],
): Pick<ContractorSiteSettings, K> {
  return Object.fromEntries(fields.map((field) => [field, form[field]])) as Pick<ContractorSiteSettings, K>;
}

export function CompanySiteSettingsWorkspace() {
  const t = useTranslations("siteControl");
  const { can, refresh } = useAuth();
  const qc = useQueryClient();
  const canManage = can("company_settings.manage");
  const settings = useQuery({ queryKey: ["contractor-site-settings"], queryFn: getContractorSiteSettings });
  const profile = useQuery({ queryKey: ["contractor-company-profile"], queryFn: getContractorCompanyProfile });
  const branches = useQuery({ queryKey: ["company-branches"], queryFn: () => getCompanyBranches({ page_size: 100 }) });
  const [draft, setDraft] = useState<Partial<ContractorSiteSettings>>({});
  const [profileDraft, setProfileDraft] = useState<Partial<ContractorCompanyProfile>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const logoPreview = useObjectUrl(logoFile);
  // The background (JB161): a new picture, or the saved one taken away -
  // either goes with 【保存公司资料】, like every other change in the block.
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const backgroundPreview = useObjectUrl(backgroundFile);
  const [clearBackground, setClearBackground] = useState(false);
  const [backgroundTooBig, setBackgroundTooBig] = useState<number | null>(null);
  const [editingBranch, setEditingBranch] = useState<CompanyBranch | "new" | null>(null);
  const [removing, setRemoving] = useState<CompanyBranch | null>(null);
  const shownSettings = settings.data ? settingsBase(settings.data, profile.data) : null;
  const form = shownSettings ? { ...shownSettings, ...draft } : null;
  const profileForm = profile.data ? { ...profile.data, ...profileDraft } : null;
  const setForm = (next: ContractorSiteSettings) => setDraft(next);
  const setCompany = (next: ContractorCompanyProfile) => setProfileDraft(next);
  const savePreferences = useMutation({
    mutationFn: (payload: Partial<ContractorSiteSettings>) => updateContractorSiteSettings(payload),
    onSuccess: async () => {
      // The language is read from the company (``settingsBase``), which the
      // backend updates with the save: refetch it before the draft goes, so
      // the drop-down never flashes the old one (JB164).
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contractor-site-settings"] }),
        qc.invalidateQueries({ queryKey: ["contractor-company-profile"] }),
        qc.invalidateQueries({ queryKey: ["auth", "me"] }),
      ]);
      setDraft({});
    },
  });
  const saveProfile = useMutation({
    mutationFn: async () => {
      const saved = await updateContractorCompanyProfile(profileForm ?? {}, logoFile, backgroundFile, {
        removeBackground: clearBackground,
      });
      // The emergency contact is a setting, saved with the block it sits in.
      if (form && settings.data && PROFILE_SETTINGS.some((field) => form[field] !== settings.data[field])) {
        await updateContractorSiteSettings(pickSettings(form, PROFILE_SETTINGS));
      }
      return saved;
    },
    onSuccess: async (savedProfile) => {
      setProfileDraft({});
      setLogoFile(null);
      setBackgroundFile(null);
      setClearBackground(false);
      qc.setQueryData(["contractor-company-profile"], savedProfile);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contractor-company-profile"] }),
        qc.invalidateQueries({ queryKey: ["contractor-site-settings"] }),
        refresh(),
      ]);
    },
  });
  const remove = useMutation({ mutationFn: deleteCompanyBranch, onSuccess: async () => { setRemoving(null); await qc.invalidateQueries({ queryKey: ["company-branches"] }); } });

  if (settings.isLoading || profile.isLoading || branches.isLoading || !form || !profileForm) return <State text={t("state.loading")} />;
  if (settings.isError || profile.isError || branches.isError) return <State text={t("state.loadError")} danger />;

  const text = (label: string, value: string, onChange: (value: string) => void, options: { required?: boolean; className?: string; type?: string; hint?: string } = {}) => (
    <FieldWrapper label={label} required={options.required} className={options.className} hint={options.hint}>
      <Input disabled={!canManage} type={options.type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </FieldWrapper>
  );

  const shownBackground = backgroundPreview || (clearBackground ? "" : profileForm.background_image || "");
  // The backend's own limit, said before the upload rather than after it fails.
  const pickBackground = (file: File | null) => {
    const tooBig = file ? oversizeMb(file) : null;
    setBackgroundTooBig(tooBig);
    if (!file || tooBig !== null) return;
    setBackgroundFile(file);
    setClearBackground(false);
  };
  const removeBackground = () => {
    setBackgroundFile(null);
    setBackgroundTooBig(null);
    setClearBackground(Boolean(profileForm.background_image));
  };

  return <div className="flex flex-col gap-4">
    <ListHeader title={t("settings.title")} subtitle={t("settings.simpleSubtitle")} />
    <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground" data-testid="managed-by-mse">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{t("settings.managedByMse")}</span>
    </div>

    <section id="company-profile" className="scroll-mt-20 space-y-4 rounded-xl">
      <SectionTitle icon={Building2} title={t("profile.title")} description={t("profile.simpleSubtitle")} action={canManage ? <Button disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}><Save />{t("action.saveProfile")}</Button> : undefined} />
      {saveProfile.isError && <ErrorBanner text={t("settings.saveError")} />}
      <div className="surface-panel grid gap-6 rounded-xl p-4 sm:p-6 lg:grid-cols-[11.25rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t("profile.logo")}</p>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border bg-muted/40">
            {logoPreview || profileForm.logo ? <img src={logoPreview || profileForm.logo || ""} alt={profileForm.name} className="h-full w-full object-contain" /> : <Building2 className="size-12 text-muted-foreground" />}
          </div>
          {canManage && <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><ImageUp className="size-4" /><span className="truncate">{logoFile?.name || t("profile.chooseLogo")}</span><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} /></label>}
          <p className="text-2xs text-muted-foreground">{t("profile.imageHint")}</p>
          {/* JB161 (客户 11-10 第十批 「背景图设置呢？」, 第十一批 「在「公司设置」增加
              「仪表盘背景图」上传功能。建议上传尺寸 1920 × 400px。每家建筑公司可自行
              上传、更换」): hidden in the J batch (「背景图片：不在页面上显示」), never
              deleted, and set here again. It is the picture behind the dashboards'
              top card; the preview has that card's 1920 × 400 shape. */}
          <div className="space-y-3 pt-3" data-company-background>
            <p className="text-xs font-medium text-muted-foreground">{t("profile.dashboardBackground")}</p>
            <div className="grid aspect-[24/5] place-items-center overflow-hidden rounded-lg border bg-muted/40">
              {shownBackground ? <img src={shownBackground} alt={t("profile.dashboardBackground")} className="h-full w-full object-cover" /> : <ImageIcon className="size-6 text-muted-foreground" aria-hidden />}
            </div>
            {canManage && <div className="flex gap-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><ImageUp className="size-4 shrink-0" /><span className="truncate">{backgroundFile?.name || (shownBackground ? t("profile.replaceBackground") : t("profile.chooseBackground"))}</span><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { pickBackground(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label>
              {shownBackground && <Button type="button" variant="outline" size="icon" className="shrink-0 text-destructive" title={t("profile.removeBackground")} aria-label={t("profile.removeBackground")} onClick={removeBackground}><Trash2 /></Button>}
            </div>}
            {backgroundTooBig !== null && <p role="alert" className="text-xs text-destructive">{t("profile.backgroundTooBig", { actual: backgroundTooBig, limit: MAX_COMPANY_IMAGE_MB })}</p>}
            {clearBackground && !backgroundFile && <p className="text-xs text-muted-foreground">{t("profile.backgroundRemovePending")}</p>}
            <p className="text-2xs text-muted-foreground">{t("profile.backgroundHint")}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text(t("field.companyName"), profileForm.name, (value) => setCompany({ ...profileForm, name: value }), { required: true })}
          {text(t("field.ssmRegistrationNo"), profileForm.registration_no, (value) => setCompany({ ...profileForm, registration_no: value }))}
          {text(t("field.address"), profileForm.address_line_1, (value) => setCompany({ ...profileForm, address_line_1: value }), { className: "sm:col-span-2" })}
          {text(t("field.address2"), profileForm.address_line_2, (value) => setCompany({ ...profileForm, address_line_2: value }), { className: "sm:col-span-2" })}
          {text(t("field.city"), profileForm.city, (value) => setCompany({ ...profileForm, city: value }))}
          <FieldWrapper label={t("field.state")}><Select disabled={!canManage} value={profileForm.state || undefined} onValueChange={(value) => setCompany({ ...profileForm, state: value })}><SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseState")} /></SelectTrigger><SelectContent>{STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></FieldWrapper>
          {text(t("field.postcode"), profileForm.postcode, (value) => setCompany({ ...profileForm, postcode: value }))}
          {text(t("field.phone"), profileForm.contact_phone, (value) => setCompany({ ...profileForm, contact_phone: value }), { type: "tel" })}
          {text(t("field.email"), profileForm.contact_email, (value) => setCompany({ ...profileForm, contact_email: value }), { type: "email" })}
          {/* 门岗的日常资料 (事项 2 第三类): may stay empty. */}
          {text(t("field.emergencyContact"), form.emergency_contact_name, (value) => setForm({ ...form, emergency_contact_name: value }), { hint: t("profile.emergencyHint") })}
          {text(t("field.emergencyPhone"), form.emergency_contact_phone, (value) => setForm({ ...form, emergency_contact_phone: value }), { type: "tel" })}
        </div>
      </div>
    </section>

    {/* 「正式文件样板预览」 (JB162): the details and the A4 sample, refreshed by the save above. */}
    <LetterheadPreviewSection />

    <section id="company-preferences" className="scroll-mt-20 space-y-4 rounded-xl">
      <SectionTitle icon={Globe2} title={t("preferences.title")} description={t("preferences.subtitle")} action={canManage ? <Button disabled={savePreferences.isPending} onClick={() => savePreferences.mutate(preferencesToSave(form, shownSettings ?? form))}><Save />{t("action.saveSettings")}</Button> : undefined} />
      {savePreferences.isError && <ErrorBanner text={t("settings.saveError")} />}
      <div className="grid gap-4 surface-panel rounded-xl p-4 sm:p-6 sm:grid-cols-2 xl:grid-cols-4">
        <ChoiceField label={t("field.language")} value={form.language} disabled={!canManage} options={["en", "zh", "zh-TW", "ms"]} optionLabel={(value) => t(`language.${value}`)} onChange={(value) => setForm({ ...form, language: value as ContractorSiteSettings["language"] })} />
        <ChoiceField label={t("field.dateFormat")} value={form.date_format} disabled={!canManage} options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} onChange={(value) => setForm({ ...form, date_format: value as ContractorSiteSettings["date_format"] })} />
        <ChoiceField label={t("field.timeFormat")} value={form.time_format} disabled={!canManage} options={["12H", "24H"]} onChange={(value) => setForm({ ...form, time_format: value as ContractorSiteSettings["time_format"] })} />
        <ChoiceField label={t("field.timezone")} value={form.timezone} disabled={!canManage} options={TIMEZONES} onChange={(value) => setForm({ ...form, timezone: value })} />
        <FieldWrapper label={t("field.pdfLinkValid")} hint={t("preferences.pdfLinkHint")}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            disabled={!canManage}
            value={form.pdf_link_valid_days ?? 30}
            onChange={(event) => setForm({ ...form, pdf_link_valid_days: Math.round(Number(event.target.value)) || 1 })}
          />
        </FieldWrapper>
      </div>
    </section>

    <section id="company-branches" className="scroll-mt-20 space-y-4 rounded-xl"><div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle icon={Building2} title={t("branches.title")} description={t("branches.subtitle")} />{canManage && <Button variant="outline" onClick={() => setEditingBranch("new")}><Plus />{t("branches.new")}</Button>}</div>
      {!branches.data?.count ? <State text={t("branches.empty")} /> : <div className="grid gap-3 lg:grid-cols-2">{branches.data.results.map((row) => <article key={row.id} className="surface-panel rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.code} - {row.name}</h3>{row.is_headquarters && <StatusBadge label={t("branches.headquarters")} tone="info" />}<StatusBadge label={t(row.is_active ? "status.active" : "status.inactive")} tone={row.is_active ? "positive" : "neutral"} /></div><p className="mt-2 text-sm text-muted-foreground">{[row.address_line_1, row.city, row.state, row.postcode].filter(Boolean).join(", ")}</p></div>{canManage && <div className="flex"><Button size="icon-sm" variant="ghost" title={t("action.edit")} onClick={() => setEditingBranch(row)}><Pencil /></Button><Button size="icon-sm" variant="ghost" title={t("action.remove")} className="text-destructive" onClick={() => setRemoving(row)}><Trash2 /></Button></div>}</div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{row.phone || "-"}</span><span>{row.email || "-"}</span>{row.latitude && <span>{row.latitude}, {row.longitude}</span>}</div></article>)}</div>}
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
  function getGps() { navigator.geolocation?.getCurrentPosition((position) => { setGpsError(""); setForm({ ...form, latitude: position.coords.latitude.toFixed(7), longitude: position.coords.longitude.toFixed(7) }); }, () => setGpsError(t("geofence.gpsError")), { enableHighAccuracy: true, timeout: 15000 }); }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t(row ? "branches.editTitle" : "branches.createTitle")}</DialogTitle><DialogDescription>{t("branches.formHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
    <FieldWrapper label={t("field.code")} required={row !== null} hint={row ? undefined : t("field.codeAuto")}><Input value={form.code} placeholder={row ? undefined : t("field.codeAutoPlaceholder")} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></FieldWrapper><FieldWrapper label={t("field.name")} required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.address")} required className="sm:col-span-2"><Input value={form.address_line_1} onChange={(event) => setForm({ ...form, address_line_1: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.address2")} className="sm:col-span-2"><Input value={form.address_line_2} onChange={(event) => setForm({ ...form, address_line_2: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.city")}><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.state")}><Select value={form.state || undefined} onValueChange={(value) => setForm({ ...form, state: value })}><SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseState")} /></SelectTrigger><SelectContent>{STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></FieldWrapper><FieldWrapper label={t("field.postcode")}><Input value={form.postcode} onChange={(event) => setForm({ ...form, postcode: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.phone")}><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></FieldWrapper><FieldWrapper label={t("field.email")}><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></FieldWrapper>
  </div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={getGps}><MapPin />{t("geofence.useGps")}</Button>{form.latitude && <span className="text-xs text-muted-foreground">{form.latitude}, {form.longitude}</span>}{gpsError && <span className="text-xs text-destructive">{gpsError}</span>}</div><div className="grid gap-3 sm:grid-cols-2"><Toggle label={t("branches.headquarters")} description={t("branches.headquartersHelp")} checked={form.is_headquarters} onChange={(checked) => setForm({ ...form, is_headquarters: checked })} /><Toggle label={t("status.active")} description={t("branches.activeHelp")} checked={form.is_active} onChange={(checked) => setForm({ ...form, is_active: checked })} /></div>{save.isError && <ErrorBanner text={t("settings.saveError")} />}<DialogFooter><Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button><Button requires={[...(row ? [[form.code, t("field.code")] as [string, string]] : []), [form.name, t("field.name")], [form.address_line_1, t("field.address")]]}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.save")}</Button></DialogFooter></DialogContent></Dialog>;
}

/** A chosen file as a preview URL, released when it changes or the page closes. */
function useObjectUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
