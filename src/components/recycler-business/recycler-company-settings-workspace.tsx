"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Banknote,
  Building2,
  Camera,
  FileClock,
  History,
  ImageUp,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  Save,
  Scale,
  ShieldCheck,
  Star,
  Trash2,
  Users,
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
import { Switch } from "@/components/ui/switch";
import type { RecyclerSettings } from "@/interfaces/recycler";
import type { ContractorCompanyProfile } from "@/interfaces/site-access";
import type { CompanyBankAccount, CompanyBankAccountPayload } from "@/interfaces/company";
import {
  getRecyclerSettings,
  updateRecyclerSettings,
} from "@/services/recycler.service";
import {
  getContractorCompanyProfile,
  getOwnCompanyBankAccounts,
  createOwnCompanyBankAccount,
  deleteOwnCompanyBankAccount,
  setOwnPrimaryBankAccount,
  updateOwnCompanyBankAccount,
  updateContractorCompanyProfile,
} from "@/services/site-access.service";

export function RecyclerCompanySettingsWorkspace() {
  const t = useTranslations("recyclerCompanySettings");
  const common = useTranslations("common");
  const { can, refresh } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("company_settings.manage");
  const settingsQuery = useQuery({
    queryKey: ["recycler-settings"],
    queryFn: getRecyclerSettings,
  });
  const profileQuery = useQuery({
    queryKey: ["recycler-company-profile"],
    queryFn: getContractorCompanyProfile,
  });
  const [settingsDraft, setSettingsDraft] = useState<Partial<RecyclerSettings>>({});
  const [profileDraft, setProfileDraft] = useState<Partial<ContractorCompanyProfile>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bankEditing, setBankEditing] = useState<CompanyBankAccount | null | undefined>();
  const [bankRemoving, setBankRemoving] = useState<CompanyBankAccount | null>(null);
  const settings = settingsQuery.data
    ? { ...settingsQuery.data, ...settingsDraft }
    : null;
  const bankAccounts = useQuery({
    queryKey: ["recycler-company-bank-accounts"],
    queryFn: getOwnCompanyBankAccounts,
  });
  const profile = profileQuery.data
    ? { ...profileQuery.data, ...profileDraft }
    : null;

  const saveSettings = useMutation({
    mutationFn: () => updateRecyclerSettings(settingsDraft),
    onSuccess: async (saved) => {
      setSettingsDraft({});
      queryClient.setQueryData(["recycler-settings"], saved);
      await queryClient.invalidateQueries({ queryKey: ["recycler-settings"] });
    },
  });
  const saveProfile = useMutation({
    mutationFn: () => updateContractorCompanyProfile(profileDraft, logoFile),
    onSuccess: async (saved) => {
      setProfileDraft({});
      setLogoFile(null);
      queryClient.setQueryData(["recycler-company-profile"], saved);
      await refresh();
    },
  });
  const removeBankAccount = useMutation({
    mutationFn: (id: string) => deleteOwnCompanyBankAccount(id),
    onSuccess: async () => {
      setBankRemoving(null);
      await queryClient.invalidateQueries({
        queryKey: ["recycler-company-bank-accounts"],
      });
    },
  });

  if (settingsQuery.isLoading || profileQuery.isLoading || !settings || !profile) {
    return <PageState text={t("state.loading")} />;
  }
  if (settingsQuery.isError || profileQuery.isError) {
    return <PageState text={t("state.error")} danger />;
  }

  const links = [
    { href: "/users", icon: Users, permission: "user.view", label: t("links.users"), help: t("links.usersHelp") },
    { href: "/roles", icon: KeyRound, permission: "role.view", label: t("links.roles"), help: t("links.rolesHelp") },
    { href: "/integrations", icon: Link2, permission: "integration.view", label: t("links.integrations"), help: t("links.integrationsHelp") },
    { href: "/scales", icon: Scale, permission: "scale.view", label: t("links.scales"), help: t("links.scalesHelp") },
    { href: "/login-records", icon: FileClock, permission: "audit.view", label: t("links.login"), help: t("links.loginHelp") },
    { href: "/audit-logs", icon: History, permission: "audit.view", label: t("links.audit"), help: t("links.auditHelp") },
  ].filter((item) => can(item.permission));

  const setSetting = <K extends keyof RecyclerSettings>(key: K, value: RecyclerSettings[K]) =>
    setSettingsDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-7 pb-8">
      <ListHeader title={t("title")} subtitle={t("subtitle")} />

      <section className="space-y-3">
        <SectionHeading icon={Building2} title={t("profile.title")} description={t("profile.help")} />
        <div className="grid gap-5 border bg-card p-4 lg:grid-cols-[150px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-md border bg-muted/30">
              {profile.logo ? <img src={profile.logo} alt={profile.name} className="h-full w-full object-contain" /> : <Building2 className="size-12 text-muted-foreground" />}
            </div>
            {canManage && (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                <ImageUp className="size-4" />
                <span className="truncate">{logoFile?.name || t("profile.logo")}</span>
                <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWrapper label={t("profile.name")} required><Input disabled={!canManage} value={profile.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.registration")}><Input disabled={!canManage} value={profile.registration_no} onChange={(event) => setProfileDraft((current) => ({ ...current, registration_no: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.taxId")}><Input disabled={!canManage} value={profile.tax_id} onChange={(event) => setProfileDraft((current) => ({ ...current, tax_id: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.sst")}><Input disabled={!canManage} value={profile.sst_no} onChange={(event) => setProfileDraft((current) => ({ ...current, sst_no: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.contactPerson")}><Input disabled={!canManage} value={profile.contact_person} onChange={(event) => setProfileDraft((current) => ({ ...current, contact_person: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.designation")}><Input disabled={!canManage} value={profile.contact_designation} onChange={(event) => setProfileDraft((current) => ({ ...current, contact_designation: event.target.value }))} /></FieldWrapper>
            <FieldWrapper className="sm:col-span-2" label={t("profile.address")}><Input disabled={!canManage} value={profile.address_line_1} onChange={(event) => setProfileDraft((current) => ({ ...current, address_line_1: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.phone")}><Input disabled={!canManage} value={profile.contact_phone} onChange={(event) => setProfileDraft((current) => ({ ...current, contact_phone: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.email")}><Input disabled={!canManage} type="email" value={profile.contact_email} onChange={(event) => setProfileDraft((current) => ({ ...current, contact_email: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={t("profile.billingEmail")}><Input disabled={!canManage} type="email" value={profile.billing_email} onChange={(event) => setProfileDraft((current) => ({ ...current, billing_email: event.target.value }))} /></FieldWrapper>
            {canManage && <div className="sm:col-span-2"><Button disabledReason={!Object.keys(profileDraft).length && !logoFile ? common("noChanges") : undefined} disabled={saveProfile.isPending || (!Object.keys(profileDraft).length && !logoFile)} onClick={() => saveProfile.mutate()}><Save />{t("action.saveProfile")}</Button></div>}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading icon={Banknote} title={t("bank.title")} description={t("bank.help")} />
          {canManage && <Button size="sm" onClick={() => setBankEditing(null)}><Plus />{t("bank.add")}</Button>}
        </div>
        <div className="divide-y overflow-hidden border bg-card">
          {bankAccounts.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">{t("state.loading")}</p>
          ) : (bankAccounts.data?.results ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("bank.empty")}</p>
          ) : (bankAccounts.data?.results ?? []).map((account) => (
            <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{account.bank_name}</span>
                  {account.is_primary && <StatusBadge label={t("bank.primary")} tone="positive" />}
                  <StatusBadge label={t(`bank.verification.${account.verification_status}`)} tone={account.verification_status === "VERIFIED" ? "positive" : account.verification_status === "REJECTED" ? "danger" : "warning"} />
                </div>
                <p className="mt-1 break-all text-sm text-muted-foreground">{account.account_name} / {account.masked_account_number} / {account.currency}</p>
              </div>
              {canManage && <div className="flex items-center gap-1">
                {!account.is_primary && <Button variant="ghost" size="icon" title={t("bank.makePrimary")} onClick={() => void setOwnPrimaryBankAccount(account.id).then(() => queryClient.invalidateQueries({ queryKey: ["recycler-company-bank-accounts"] }))}><Star /></Button>}
                <Button variant="ghost" size="icon" title={t("bank.edit")} onClick={() => setBankEditing(account)}><Pencil /></Button>
                <Button variant="ghost" size="icon" className="text-destructive" title={t("bank.remove")} onClick={() => setBankRemoving(account)}><Trash2 /></Button>
              </div>}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={BellRing} title={t("notifications.title")} description={t("notifications.help")} />
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle label={t("notifications.system")} help={t("notifications.systemHelp")} checked={settings.system_notifications} disabled={!canManage} onChange={(value) => setSetting("system_notifications", value)} />
          <Toggle label={t("notifications.email")} help={t("notifications.emailHelp")} checked={settings.email_notifications} disabled={!canManage} onChange={(value) => setSetting("email_notifications", value)} />
          <Toggle label={t("notifications.push")} help={t("notifications.pushHelp")} checked={settings.push_notifications} disabled={!canManage} onChange={(value) => setSetting("push_notifications", value)} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={ShieldCheck} title={t("business.title")} description={t("business.help")} />
        <div className="grid gap-4 border bg-card p-4 lg:grid-cols-3">
          <FieldWrapper label={t("business.deduction")}>
            <Input disabled={!canManage} type="number" min="0" step="0.001" value={settings.deduction_confirmation_kg} onChange={(event) => setSetting("deduction_confirmation_kg", event.target.value)} />
          </FieldWrapper>
          <HardwareToggle icon={Camera} label={t("business.cctv")} help={t("business.cctvHelp")} count={settings.ai_cctv_device_count} checked={settings.ai_cctv_enabled} disabled={!canManage} onChange={(value) => setSetting("ai_cctv_enabled", value)} />
          <HardwareToggle icon={Camera} label={t("business.anpr")} help={t("business.anprHelp")} count={settings.anpr_device_count} checked={settings.anpr_enabled} disabled={!canManage} onChange={(value) => setSetting("anpr_enabled", value)} />
        </div>
        <p className="text-sm text-muted-foreground">{t("business.hardwareOwner")}</p>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={Scale} title={t("commission.title")} description={t("commission.help")} />
        <div className="grid gap-4 border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          {settings.commission ? (
            <>
              <ReadOnly label={t("commission.rule")} value={settings.commission.name} />
              <ReadOnly label={t("commission.basis")} value={t(`commission.basisValue.${settings.commission.basis}`)} />
              <ReadOnly label={t("commission.rate")} value={settings.commission.basis === "SETTLED_AMOUNT" ? `${settings.commission.rate}%` : `MYR ${settings.commission.rate} / t`} />
              <ReadOnly label={t("commission.cycle")} value={t(`commission.cycleValue.${settings.commission.cycle}`)} />
            </>
          ) : <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">{t("commission.none")}</p>}
        </div>
      </section>

      {canManage && (
        <div className="sticky bottom-3 z-10 flex justify-end">
          <Button size="lg" disabledReason={!Object.keys(settingsDraft).length ? common("noChanges") : undefined} disabled={saveSettings.isPending || !Object.keys(settingsDraft).length} onClick={() => saveSettings.mutate()}>
            <Save />{t("action.saveSettings")}
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <SectionHeading icon={ShieldCheck} title={t("links.title")} description={t("links.help")} />
        <div className="grid overflow-hidden border bg-card sm:grid-cols-2 xl:grid-cols-3">
          {links.map(({ href, icon: Icon, label, help }) => (
            <Link key={href} href={href} className="flex min-h-24 items-center gap-3 border-b border-r p-4 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" /></span>
              <span><span className="block font-semibold">{label}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{help}</span></span>
            </Link>
          ))}
        </div>
      </section>
      {bankEditing !== undefined && <BankAccountDialog account={bankEditing} onClose={() => setBankEditing(undefined)} onSaved={() => { setBankEditing(undefined); void queryClient.invalidateQueries({ queryKey: ["recycler-company-bank-accounts"] }); }} />}
      <ConfirmDialog
        open={bankRemoving !== null}
        onOpenChange={() => setBankRemoving(null)}
        title={t("bank.removeTitle")}
        description={t("bank.removeDescription", {
          account: bankRemoving
            ? `${bankRemoving.bank_name} ${bankRemoving.masked_account_number}`
            : "",
        })}
        confirmLabel={t("bank.removeConfirm")}
        isPending={removeBankAccount.isPending}
        onConfirm={() => {
          if (bankRemoving) removeBankAccount.mutate(bankRemoving.id);
        }}
      />
    </div>
  );
}

const EMPTY_BANK: CompanyBankAccountPayload = { bank_name: "", account_name: "", account_number: "", account_type: "CURRENT", currency: "MYR" };

function BankAccountDialog({ account, onClose, onSaved }: { account: CompanyBankAccount | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("recyclerCompanySettings");
  const common = useTranslations("common");
  const [draft, setDraft] = useState<CompanyBankAccountPayload>(() => account ? {
    bank_name: account.bank_name,
    branch: account.branch,
    swift_code: account.swift_code,
    account_name: account.account_name,
    account_number: "",
    account_type: account.account_type,
    currency: account.currency,
  } : EMPTY_BANK);
  const save = useMutation({
    mutationFn: () => account
      ? updateOwnCompanyBankAccount(account.id, Object.fromEntries(Object.entries(draft).filter(([key, value]) => key !== "account_number" || value)) as Partial<CompanyBankAccountPayload>)
      : createOwnCompanyBankAccount(draft),
    onSuccess: onSaved,
  });
  const set = (key: keyof CompanyBankAccountPayload, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{t(account ? "bank.editTitle" : "bank.addTitle")}</DialogTitle><DialogDescription>{t("bank.formHelp")}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
    <FieldWrapper label={t("bank.bankName")} required><Input value={draft.bank_name} onChange={(event) => set("bank_name", event.target.value)} /></FieldWrapper>
    <FieldWrapper label={t("bank.branch")}><Input value={draft.branch ?? ""} onChange={(event) => set("branch", event.target.value)} /></FieldWrapper>
    <FieldWrapper label={t("bank.accountName")} required><Input value={draft.account_name} onChange={(event) => set("account_name", event.target.value)} /></FieldWrapper>
    <FieldWrapper label={t("bank.accountNumber")} required={!account} hint={account ? t("bank.numberKeep") : undefined}><Input inputMode="numeric" value={draft.account_number} onChange={(event) => set("account_number", event.target.value)} /></FieldWrapper>
    <FieldWrapper label={t("bank.accountType")}><select className="h-10 w-full rounded-md border bg-background px-3" value={draft.account_type} onChange={(event) => set("account_type", event.target.value)}><option value="CURRENT">{t("bank.type.CURRENT")}</option><option value="SAVINGS">{t("bank.type.SAVINGS")}</option></select></FieldWrapper>
    <FieldWrapper label={t("bank.currency")}><Input maxLength={3} value={draft.currency ?? "MYR"} onChange={(event) => set("currency", event.target.value.toUpperCase())} /></FieldWrapper>
    <FieldWrapper className="sm:col-span-2" label={t("bank.swift")}><Input value={draft.swift_code ?? ""} onChange={(event) => set("swift_code", event.target.value.toUpperCase())} /></FieldWrapper>
  </div><DialogFooter><Button variant="outline" onClick={onClose}>{common("cancel")}</Button><Button requires={[[draft.bank_name, t("bank.bankName")], [draft.account_name, t("bank.accountName")], [Boolean(account) || draft.account_number, t("bank.accountNumber")]]} disabled={save.isPending} onClick={() => save.mutate()}><Save />{common("save")}</Button></DialogFooter></DialogContent></Dialog>;
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof Building2; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" /></span><div><h2 className="font-semibold">{title}</h2><p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p></div></div>;
}

function Toggle({ label, help, checked, disabled, onChange }: { label: string; help: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-24 items-center justify-between gap-4 border bg-card p-4"><span><span className="block font-medium">{label}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{help}</span></span><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></label>;
}

function HardwareToggle({ icon: Icon, label, help, count, checked, disabled, onChange }: { icon: typeof Camera; label: string; help: string; count: number; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const t = useTranslations("recyclerCompanySettings");
  return <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-primary" /><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{label}</span><StatusBadge label={t("business.deviceCount", { count })} tone={count ? "positive" : "neutral"} /></div><p className="mt-1 text-sm leading-5 text-muted-foreground">{help}</p></div></div><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></div>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words font-semibold">{value}</p></div>;
}

function PageState({ text, danger = false }: { text: string; danger?: boolean }) {
  return <div className={`grid min-h-48 place-items-center border border-dashed p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>;
}
