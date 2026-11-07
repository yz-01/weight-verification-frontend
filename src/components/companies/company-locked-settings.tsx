"use client";

/**
 * 锁定设定: a contractor's settings that MSE manages (JB99, 客户 11-05 事项 2).
 *
 * The client: 「公司管理员应该拥有管理自己公司业务的权力，不应该拥有修改 MSE
 * Trace 底层运行规则的权力」 - 默认权限、二维码规则、通知规则、GPS 技术参数、
 * 系统安全参数、归档后锁定、照片及记录保存规则 「应该锁起来，由 MSE 管理」, and
 * the defaults nobody needs to fill (访客证时长、新项目状态、登录后首页、Dashboard
 * 标题、电子围栏半径、目标提醒比例). They left the contractor's 公司设置 and the
 * backend refuses the contractor's write; MSE reads and changes them here, on
 * the platform's company page. A new company starts on the system's defaults.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, FileArchive, Lock, MapPin, QrCode, Save, Settings2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { ChoiceField, ErrorBanner, NumberField, SectionTitle, State, Toggle } from "@/components/site-access/settings-fields";
import { VisitorPrivacySection } from "@/components/site-access/visitor-privacy-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompanyLockedSettings, ContractorSiteSettings } from "@/interfaces/site-access";
import { roleName } from "@/lib/role-labels";
import { getCompanySiteSettings, updateCompanySiteSettings } from "@/services/companies.service";

// Mirrors CONSULTANT_PERMISSION_CODES on the backend, which is authoritative.
const CONSULTANT_PERMISSIONS = ["project.view", "approval.view", "approval.review", "notification.view", "safety.view", "report.view", "report.export"];

export function CompanyLockedSettingsPanel({ companyId }: { companyId: string }) {
  const t = useTranslations("siteControl");
  const tLocked = useTranslations("companies.lockedSettings");
  const tHq = useTranslations("headquarters.reference");
  const tAll = useTranslations();
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can("company.update");
  const queryKey = ["companies", "site-settings", companyId];
  const settings = useQuery({ queryKey, queryFn: () => getCompanySiteSettings(companyId) });
  const [draft, setDraft] = useState<Partial<CompanyLockedSettings>>({});
  const save = useMutation({
    // Only what was changed here: a field nobody touched keeps its value.
    mutationFn: () => updateCompanySiteSettings(companyId, draft),
    onSuccess: (row) => {
      setDraft({});
      qc.setQueryData(queryKey, row);
    },
  });

  if (settings.isLoading) return <State text={t("state.loading")} />;
  if (settings.isError || !settings.data) return <State text={t("state.loadError")} danger />;
  const form: CompanyLockedSettings = { ...settings.data, ...draft };
  const set = (next: Partial<ContractorSiteSettings>) => setDraft((current) => ({ ...current, ...next }));
  const roleOptions = Array.from(new Set([...form.role_options.map((role) => role.code), form.default_user_role_code, form.default_approval_role_code]));
  // Seeded roles are stored with an English name; roleName reads the catalogue.
  const roleLabel = (code: string) => roleName({ code, name: form.role_options.find((role) => role.code === code)?.name ?? code }, tAll);
  const rule = (field: "default_archive_rules" | "default_notification_rules", key: string, value: boolean) =>
    set({ [field]: { ...(form[field] ?? {}), [key]: value } });
  const off = !canManage;

  return <section id="company-locked-settings" className="scroll-mt-20 space-y-5 border-t p-4 sm:p-6" data-testid="company-locked-settings">
    <SectionTitle icon={Lock} title={tLocked("title")} description={tLocked("subtitle")} action={canManage ? <Button disabled={save.isPending} onClick={() => save.mutate()}><Save />{t("action.saveSettings")}</Button> : undefined} />
    {save.isError && <ErrorBanner text={t("settings.saveError")} />}

    <div className="space-y-3" data-locked="permissions">
      <SectionTitle icon={Settings2} title={t("permissionDefaults.title")} description={tLocked("permissionsHelp")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceField label={t("field.defaultUserRole")} value={form.default_user_role_code} disabled={off} options={roleOptions} optionLabel={roleLabel} onChange={(value) => set({ default_user_role_code: value })} />
        <ChoiceField label={t("field.defaultApprovalRole")} value={form.default_approval_role_code} disabled={off} options={roleOptions} optionLabel={roleLabel} onChange={(value) => set({ default_approval_role_code: value })} />
      </div>
      <p className="text-sm font-medium">{t("permissionDefaults.consultant")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CONSULTANT_PERMISSIONS.map((code) => <Toggle key={code} compact label={t(`permissionDefaults.permission.${code.replaceAll(".", "_")}`)} checked={form.default_consultant_permissions.includes(code)} disabled={off} onChange={(checked) => set({ default_consultant_permissions: checked ? [...form.default_consultant_permissions, code] : form.default_consultant_permissions.filter((item) => item !== code) })} />)}</div>
    </div>

    <div className="space-y-3" data-locked="qr">
      <SectionTitle icon={QrCode} title={t("qrSettings.title")} description={t("qrSettings.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FieldWrapper label={t("field.qrPrefix")}><Input disabled={off} value={form.qr_prefix} maxLength={20} onChange={(event) => set({ qr_prefix: event.target.value.toUpperCase() })} /></FieldWrapper>
        <ChoiceField label={t("field.qrStyle")} value={form.qr_style} disabled={off} options={["STANDARD", "COMPACT", "LARGE"]} optionLabel={(value) => t(`qrStyle.${value}`)} onChange={(value) => set({ qr_style: value as ContractorSiteSettings["qr_style"] })} />
        <Toggle label={t("qrSettings.siteAccess")} description={t("qrSettings.siteAccessHelp")} checked={form.enable_site_access_qr} disabled={off} onChange={(checked) => set({ enable_site_access_qr: checked })} />
        <Toggle label={t("qrSettings.visitor")} description={t("qrSettings.visitorHelp")} checked={form.enable_visitor_qr} disabled={off} onChange={(checked) => set({ enable_visitor_qr: checked })} />
        <Toggle label={t("qrSettings.vehicle")} description={t("qrSettings.vehicleHelp")} checked={form.enable_vehicle_qr} disabled={off} onChange={(checked) => set({ enable_vehicle_qr: checked })} />
      </div>
    </div>

    <div className="space-y-3" data-locked="notifications">
      <SectionTitle icon={BellRing} title={t("notificationSettings.title")} description={t("notificationSettings.subtitle")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Toggle label={t("notificationSettings.system")} description={t("notificationSettings.systemHelp")} checked={form.system_notifications} disabled={off} onChange={(checked) => set({ system_notifications: checked })} />
        <Toggle label={t("notificationSettings.approval")} description={t("notificationSettings.approvalHelp")} checked={form.approval_notifications} disabled={off} onChange={(checked) => set({ approval_notifications: checked })} />
        <Toggle label={t("notificationSettings.rectification")} description={t("notificationSettings.rectificationHelp")} checked={form.rectification_notifications} disabled={off} onChange={(checked) => set({ rectification_notifications: checked })} />
        <Toggle label={t("notificationSettings.expiry")} description={t("notificationSettings.expiryHelp")} checked={form.expiry_notifications} disabled={off} onChange={(checked) => set({ expiry_notifications: checked })} />
        <Toggle label={t("notificationSettings.email")} description={t("notificationSettings.emailHelp")} checked={form.email_notifications} disabled={off} onChange={(checked) => set({ email_notifications: checked })} />
        <Toggle label={t("projectDefaults.notifyManager")} description={t("projectDefaults.notifyManagerHelp")} checked={Boolean(form.default_notification_rules.notify_project_manager ?? true)} disabled={off} onChange={(checked) => rule("default_notification_rules", "notify_project_manager", checked)} />
        <ChoiceField label={t("field.notificationChannel")} value={form.default_notification_channel} disabled={off} options={["IN_APP", "PUSH"]} optionLabel={(value) => t(`notificationChannel.${value}`)} onChange={(value) => set({ default_notification_channel: value as ContractorSiteSettings["default_notification_channel"] })} />
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3" data-locked="gps">
        <SectionTitle icon={MapPin} title={tLocked("gps")} description={tLocked("gpsHelp")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label={t("field.locationInterval")} value={form.location_update_interval_seconds} min={30} max={7200} disabled={off} onChange={(value) => set({ location_update_interval_seconds: value })} />
          <NumberField label={t("field.liveWindow")} value={form.live_position_window_seconds} min={60} max={3600} disabled={off} onChange={(value) => set({ live_position_window_seconds: value })} />
        </div>
      </div>
      <div className="space-y-3" data-locked="security">
        <SectionTitle icon={ShieldCheck} title={tLocked("security")} description={tLocked("securityHelp")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label={t("field.fieldInviteValid")} value={form.field_invite_valid_days} min={1} max={90} disabled={off} onChange={(value) => set({ field_invite_valid_days: value })} />
          <NumberField label={t("field.fieldPinExpiry")} value={form.field_pin_expiry_days} min={1} max={365} disabled={off} onChange={(value) => set({ field_pin_expiry_days: value })} />
          <NumberField label={t("field.pdfLinkValid")} value={form.pdf_link_valid_days ?? 30} min={1} max={365} disabled={off} onChange={(value) => set({ pdf_link_valid_days: value })} />
        </div>
      </div>
    </div>

    <div className="space-y-3" data-locked="records">
      <SectionTitle icon={FileArchive} title={tLocked("records")} description={tLocked("recordsHelp")} />
      <div className="grid gap-3 md:grid-cols-3">
        <Toggle label={t("projectDefaults.archiveLock")} description={t("projectDefaults.archiveLockHelp")} checked={Boolean(form.default_archive_rules.lock_after_archive)} disabled={off} onChange={(checked) => rule("default_archive_rules", "lock_after_archive", checked)} />
        <Toggle label={t("field.attendancePhoto")} description={t("settings.attendancePhotoHelp")} checked={form.require_attendance_photo} disabled={off} onChange={(checked) => set({ require_attendance_photo: checked })} />
        <Toggle label={t("field.gatePhoto")} description={t("settings.gatePhotoHelp")} checked={form.require_gate_photo} disabled={off} onChange={(checked) => set({ require_gate_photo: checked })} />
      </div>
    </div>
    <VisitorPrivacySection form={form} canManage={canManage} companyId={companyId} onChange={set} />

    <div className="space-y-3" data-locked="defaults">
      <SectionTitle icon={Settings2} title={tLocked("defaults")} description={tLocked("defaultsHelp")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ChoiceField label={t("field.defaultProjectStatus")} value={form.default_project_status} disabled={off} options={["ACTIVE", "PLANNING"]} optionLabel={(value) => t(`projectStatus.${value}`)} onChange={(value) => set({ default_project_status: value as ContractorSiteSettings["default_project_status"] })} />
        <NumberField label={t("field.defaultRadius")} value={form.default_geofence_radius_m} min={10} max={10000} disabled={off} onChange={(value) => set({ default_geofence_radius_m: value })} />
        <NumberField label={t("field.targetReminder")} value={form.target_reminder_percent} min={1} max={100} disabled={off} onChange={(value) => set({ target_reminder_percent: value })} />
        <NumberField label={t("field.visitorHours")} value={form.visitor_pass_hours} min={1} max={168} disabled={off} onChange={(value) => set({ visitor_pass_hours: value })} />
        <ChoiceField label={t("field.homePage")} value={form.home_page} disabled={off} options={["/dashboard", "/projects", "/notifications", "/field-staff"]} optionLabel={(value) => t(`homePage.${value.slice(1).replace("-", "_")}`)} onChange={(value) => set({ home_page: value as ContractorSiteSettings["home_page"] })} />
        <FieldWrapper label={tHq("settingsTitle")} hint={tHq("settingsHint")}><Input disabled={off} maxLength={60} value={form.dashboard_title ?? ""} placeholder={tHq("title")} onChange={(event) => set({ dashboard_title: event.target.value })} /></FieldWrapper>
        <FieldWrapper label={tHq("settingsSubtitle")} hint={tHq("settingsHint")} className="sm:col-span-2 xl:col-span-3"><Input disabled={off} maxLength={160} value={form.dashboard_subtitle ?? ""} placeholder={tHq("subtitle")} onChange={(event) => set({ dashboard_subtitle: event.target.value })} /></FieldWrapper>
      </div>
    </div>
  </section>;
}
