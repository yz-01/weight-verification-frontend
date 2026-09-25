"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import {
  DetailHeader,
  FieldWrapper,
  ListHeader,
  StatusBadge,
} from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  ConsultantOrganizationMember,
  ConsultantOrganizationOption,
  ConsultantProjectAccessGrant,
} from "@/interfaces/consultant-workflow";
import { ApiError } from "@/interfaces/api";
import { getProjects } from "@/services/contractor.service";
import {
  createConsultantAccessGrant,
  createConsultantOrganization,
  getConsultantAccessGrants,
  getConsultantMembers,
  getConsultantOrganizations,
  inviteConsultantAccount,
  revokeConsultantAccessGrant,
  updateConsultantAccessGrant,
  updateConsultantOrganization,
} from "@/services/consultant-workflow.service";

/**
 * Everything a consultant may be granted, and what a new grant starts with.
 *
 * Mirrors `CONSULTANT_PERMISSION_CODES` and `default_consultant_permissions`
 * on the backend, which are authoritative: a tick the API refuses comes back
 * as a 400 on the permissions field. Company documents and construction
 * progress are deliberately absent — a consultant inspects the safety record
 * and signs approvals, and the rest of the contractor's business is not
 * theirs to read.
 */
const PERMISSIONS = [
  "project.view",
  "approval.view",
  "approval.review",
  "notification.view",
  "safety.view",
  "report.view",
  "report.export",
] as const;

const DEFAULT_PERMISSIONS = [
  "project.view",
  "approval.view",
  "approval.review",
  "notification.view",
  "safety.view",
];

const PERMISSION_MESSAGE_KEYS: Record<(typeof PERMISSIONS)[number], string> = {
  "project.view": "project_view",
  "approval.view": "approval_view",
  "approval.review": "approval_review",
  "notification.view": "notification_view",
  "safety.view": "safety_view",
  "report.view": "report_view",
  "report.export": "report_export",
};

function localDateTime(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function readableError(error: unknown) {
  if (!(error instanceof ApiError)) return "";
  return Object.values(error.errors)[0] || error.message;
}

export function ConsultantAccessManagement() {
  const t = useTranslations("consultantAccess");
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("organizations");
  const [organizationDialog, setOrganizationDialog] = useState<
    ConsultantOrganizationOption | null | undefined
  >(undefined);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [grantDialog, setGrantDialog] = useState<
    ConsultantProjectAccessGrant | null | undefined
  >(undefined);

  const organizations = useQuery({
    queryKey: ["consultant-access", "organizations"],
    queryFn: getConsultantOrganizations,
    enabled: can("user.view"),
  });
  const members = useQuery({
    queryKey: ["consultant-access", "members"],
    queryFn: () => getConsultantMembers({ page_size: 200 }),
    enabled: can("user.view"),
  });
  const grants = useQuery({
    queryKey: ["consultant-access", "grants"],
    queryFn: () => getConsultantAccessGrants({ page_size: 200, active: "false" }),
    enabled: can("project.assign"),
  });
  const projects = useQuery({
    queryKey: ["consultant-access", "projects"],
    queryFn: () => getProjects({ page_size: 200 }),
    enabled: can("project.assign"),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["consultant-access"] });

  const revoke = useMutation({
    mutationFn: revokeConsultantAccessGrant,
    onSuccess: refresh,
  });

  const organizationRows = organizations.data?.results ?? [];
  const memberRows = members.data?.results ?? [];
  const grantRows = grants.data?.results ?? [];
  const failedSections = [
    organizations.isError
      ? `${t("error.organizations")}: ${readableError(organizations.error)}`
      : null,
    members.isError
      ? `${t("error.consultants")}: ${readableError(members.error)}`
      : null,
    grants.isError
      ? `${t("error.grants")}: ${readableError(grants.error)}`
      : null,
    projects.isError
      ? `${t("error.projects")}: ${readableError(projects.error)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-5 pb-10">
      <DetailHeader
        backHref="/modules/consultants"
        backLabel={t("back")}
      />
      <ListHeader title={t("title")} subtitle={t("subtitle")} />

      {failedSections.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
          <AlertCircle className="size-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-destructive">{t("error.title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {failedSections.join(" · ")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw /> {t("error.retry")}
          </Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <StepTile
          icon={Building2}
          title={t("step.organization")}
          description={t("step.organizationHelp")}
          done={organizationRows.length > 0}
        />
        <StepTile
          icon={Users}
          title={t("step.consultant")}
          description={t("step.consultantHelp")}
          done={memberRows.length > 0}
        />
        <StepTile
          icon={KeyRound}
          title={t("step.grant")}
          description={t("step.grantHelp")}
          done={grantRows.some((row) => row.is_current)}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 sm:w-fit">
          <TabsTrigger value="organizations" className="min-h-9 px-3">
            <Building2 /> {t("tab.organizations")}
          </TabsTrigger>
          <TabsTrigger value="consultants" className="min-h-9 px-3">
            <Users /> {t("tab.consultants")}
          </TabsTrigger>
          <TabsTrigger value="grants" className="min-h-9 px-3">
            <ShieldCheck /> {t("tab.grants")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <SectionToolbar
            title={t("organization.title")}
            description={t("organization.subtitle")}
            action={
              can("user.create") ? (
                <Button size="sm" onClick={() => setOrganizationDialog(null)}>
                  <Plus /> {t("organization.add")}
                </Button>
              ) : null
            }
          />
          <LoadingState
            loading={organizations.isLoading}
            empty={!organizationRows.length}
            emptyText={t("organization.empty")}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {organizationRows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{row.name}</h2>
                        <StatusBadge
                          label={t(row.is_active ? "status.active" : "status.inactive")}
                          tone={row.is_active ? "positive" : "neutral"}
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.registration_no || t("common.noRegistration")}
                      </p>
                      <p className="mt-2 text-sm">
                        {row.contact_name || t("common.noContact")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[row.contact_email, row.contact_phone]
                          .filter(Boolean)
                          .join(" · ") || t("common.noContact")}
                      </p>
                    </div>
                    {can("user.update") && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title={t("action.edit")}
                        onClick={() => setOrganizationDialog(row)}
                      >
                        <Pencil />
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </LoadingState>
        </TabsContent>

        <TabsContent value="consultants">
          <SectionToolbar
            title={t("consultant.title")}
            description={t("consultant.subtitle")}
            action={
              can("user.create") ? (
                <Button
                  size="sm"
                  disabled={!organizationRows.some((row) => row.is_active)}
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlus /> {t("consultant.invite")}
                </Button>
              ) : null
            }
          />
          <LoadingState
            loading={members.isLoading}
            empty={!memberRows.length}
            emptyText={t("consultant.empty")}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {memberRows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info/10 text-info">
                      <Users className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{row.consultant_name}</h2>
                        <StatusBadge
                          label={t(`userStatus.${row.consultant_status}`)}
                          tone={
                            row.consultant_status === "ACTIVE"
                              ? "positive"
                              : row.consultant_status === "SUSPENDED"
                                ? "danger"
                                : "warning"
                          }
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.organization_name}
                      </p>
                      <p className="mt-2 text-sm">{row.job_title || t("common.noJobTitle")}</p>
                      <p className="text-xs text-muted-foreground">
                        {[row.consultant_email, row.consultant_phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </LoadingState>
        </TabsContent>

        <TabsContent value="grants">
          <SectionToolbar
            title={t("grant.title")}
            description={t("grant.subtitle")}
            action={
              can("project.assign") ? (
                <Button
                  size="sm"
                  disabledReason={
                    !memberRows.length
                      ? t("grant.needsConsultants")
                      : !projects.data?.count
                        ? t("grant.needsProjects")
                        : undefined
                  }
                  disabled={!memberRows.length || !projects.data?.count}
                  onClick={() => setGrantDialog(null)}
                >
                  <Plus /> {t("grant.add")}
                </Button>
              ) : null
            }
          />
          <LoadingState
            loading={grants.isLoading}
            empty={!grantRows.length}
            emptyText={t("grant.empty")}
          >
            <div className="space-y-3">
              {grantRows.map((row) => (
                <article
                  key={row.id}
                  className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{row.consultant_name}</h2>
                      <StatusBadge
                        label={t(row.is_current ? "status.current" : "status.expired")}
                        tone={row.is_current ? "positive" : "neutral"}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.project_code} - {row.project_name} · {row.organization_name}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" />
                      {t("grant.validity", {
                        from: new Date(row.valid_from).toLocaleString(),
                        until: row.valid_until
                          ? new Date(row.valid_until).toLocaleString()
                          : t("grant.noExpiry"),
                      })}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.permissions
                        .map((code) =>
                          code in PERMISSION_MESSAGE_KEYS
                            ? t(
                                `permission.${PERMISSION_MESSAGE_KEYS[code as keyof typeof PERMISSION_MESSAGE_KEYS]}`,
                              )
                            : code,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                  {can("project.assign") && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrantDialog(row)}
                      >
                        <Pencil /> {t("action.edit")}
                      </Button>
                      {row.is_active && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(row.id)}
                        >
                          <XCircle /> {t("action.revoke")}
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </LoadingState>
        </TabsContent>
      </Tabs>

      {organizationDialog !== undefined && (
        <OrganizationDialog
          row={organizationDialog}
          onClose={() => setOrganizationDialog(undefined)}
          onSaved={() => {
            void refresh();
            setOrganizationDialog(undefined);
          }}
        />
      )}
      {inviteOpen && (
        <ConsultantInviteDialog
          organizations={organizationRows.filter((row) => row.is_active)}
          onClose={() => setInviteOpen(false)}
          onSaved={() => {
            void refresh();
            setInviteOpen(false);
            setTab("consultants");
          }}
        />
      )}
      {grantDialog !== undefined && (
        <GrantDialog
          row={grantDialog}
          organizations={organizationRows.filter((row) => row.is_active)}
          members={memberRows}
          projects={projects.data?.results ?? []}
          onClose={() => setGrantDialog(undefined)}
          onSaved={() => {
            void refresh();
            setGrantDialog(undefined);
            setTab("grants");
          }}
        />
      )}
    </div>
  );
}

function StepTile({
  icon: Icon,
  title,
  description,
  done,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {done && <ShieldCheck className="size-5 shrink-0 text-success" />}
    </div>
  );
}

function SectionToolbar({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function LoadingState({
  loading,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return <div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (empty) {
    return <div className="rounded-lg border border-dashed bg-muted/15 p-10 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }
  return children;
}

function OrganizationDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ConsultantOrganizationOption | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantAccess");
  const [form, setForm] = useState({
    name: row?.name ?? "",
    registration_no: row?.registration_no ?? "",
    contact_name: row?.contact_name ?? "",
    contact_email: row?.contact_email ?? "",
    contact_phone: row?.contact_phone ?? "",
    address: row?.address ?? "",
    is_active: row?.is_active ?? true,
  });
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((old) => ({ ...old, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      row
        ? updateConsultantOrganization(row.id, form)
        : createConsultantOrganization(form),
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(row ? "organization.editTitle" : "organization.createTitle")}</DialogTitle>
          <DialogDescription>{t("organization.formHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.organizationName")} required className="sm:col-span-2">
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.registrationNo")}>
            <Input value={form.registration_no} onChange={(event) => set("registration_no", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.contactName")}>
            <Input value={form.contact_name} onChange={(event) => set("contact_name", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.email")}>
            <Input type="email" value={form.contact_email} onChange={(event) => set("contact_email", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.phone")}>
            <Input value={form.contact_phone} onChange={(event) => set("contact_phone", event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.address")} className="sm:col-span-2">
            <Textarea value={form.address} onChange={(event) => set("address", event.target.value)} />
          </FieldWrapper>
          {row && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <span>
                <span className="block text-sm font-medium">{t("field.active")}</span>
                <span className="text-xs text-muted-foreground">{t("organization.activeHelp")}</span>
              </span>
              <Switch checked={form.is_active} onCheckedChange={(value) => set("is_active", value)} />
            </label>
          )}
        </div>
        {save.isError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {readableError(save.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button requires={[[form.name, t("field.organizationName")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Building2 />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsultantInviteDialog({
  organizations,
  onClose,
  onSaved,
}: {
  organizations: ConsultantOrganizationOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantAccess");
  const common = useTranslations("common");
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [language, setLanguage] = useState<"en" | "zh" | "zh-TW" | "ms">("en");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const save = useMutation({
    mutationFn: () => inviteConsultantAccount({
      organization: organizationId,
      full_name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      job_title: jobTitle.trim(),
      language,
    }),
    onSuccess: (result) => {
      if (result.invitation_url) {
        setInvitationUrl(result.invitation_url);
        return;
      }
      onSaved();
    },
  });

  const copyInvitation = async () => {
    await navigator.clipboard.writeText(invitationUrl);
    setCopied(true);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("consultant.inviteTitle")}</DialogTitle>
          <DialogDescription>{t("consultant.inviteHelp")}</DialogDescription>
        </DialogHeader>
        {invitationUrl ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <p className="font-semibold">{t("consultant.inviteTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("consultant.inviteHelp")}
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="break-all font-mono text-xs">{invitationUrl}</p>
            </div>
          </div>
        ) : <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.organization")} required className="sm:col-span-2">
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{organizations.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.fullName")} required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.jobTitle")}>
            <Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.email")} required>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.phone")}>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.language")} className="sm:col-span-2">
            <Select value={language} onValueChange={(value) => setLanguage(value as typeof language)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="ms">Bahasa Malaysia</SelectItem>
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>}
        {save.isError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {readableError(save.error)}
          </p>
        )}
        <DialogFooter>
          {invitationUrl ? (
            <>
              <Button variant="outline" onClick={() => void copyInvitation()}>
                {copied ? <CheckCircle2 /> : <Copy />}
                {common(copied ? "copied" : "copy")}
              </Button>
              <Button onClick={onSaved}>{common("close")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
              <Button requires={[[organizationId, t("field.organization")], [name, t("field.fullName")], [email, t("field.email")]]} disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                {t("consultant.sendInvite")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantDialog({
  row,
  organizations,
  members,
  projects,
  onClose,
  onSaved,
}: {
  row: ConsultantProjectAccessGrant | null;
  organizations: ConsultantOrganizationOption[];
  members: ConsultantOrganizationMember[];
  projects: Array<{ id: string; code: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("consultantAccess");
  const [organizationId, setOrganizationId] = useState(row?.organization ?? organizations[0]?.id ?? "");
  const filteredMembers = useMemo(
    () => members.filter((member) => member.organization === organizationId && member.is_active),
    [members, organizationId],
  );
  // An existing grant keeps its consultant, so it can only move to a firm that
  // consultant is registered under - the API refuses any other (update_grant).
  const organizationChoices = useMemo(
    () => row
      ? organizations.filter((item) => members.some((member) => member.organization === item.id && member.consultant === row.consultant && member.is_active))
      : organizations,
    [members, organizations, row],
  );
  const [consultant, setConsultant] = useState(row?.consultant ?? "");
  const [project, setProject] = useState(
    row?.project ?? (projects.length === 1 ? projects[0].id : ""),
  );
  const [validFrom, setValidFrom] = useState(localDateTime(row?.valid_from));
  const [validUntil, setValidUntil] = useState(localDateTime(row?.valid_until));
  const [noExpiry, setNoExpiry] = useState(!row?.valid_until);
  const [permissions, setPermissions] = useState<string[]>(row?.permissions ?? DEFAULT_PERMISSIONS);
  const [active, setActive] = useState(row?.is_active ?? true);
  const togglePermission = (code: string, checked: boolean) =>
    setPermissions((old) => checked ? [...new Set([...old, code])] : old.filter((item) => item !== code));
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        organization: organizationId,
        consultant,
        project,
        permissions,
        valid_from: toIso(validFrom) ?? new Date().toISOString(),
        valid_until: noExpiry ? null : toIso(validUntil),
        is_active: active,
      };
      return row
        ? updateConsultantAccessGrant(row.id, payload)
        : createConsultantAccessGrant(payload);
    },
    onSuccess: onSaved,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(row ? "grant.editTitle" : "grant.createTitle")}</DialogTitle>
          <DialogDescription>{t("grant.formHelp")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label={t("field.organization")} required hint={row ? t("grant.organizationEditHint") : undefined}>
            <Select value={organizationId} onValueChange={(value) => { setOrganizationId(value); if (!row) setConsultant(""); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{organizationChoices.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.consultant")} required>
            <Select value={consultant || undefined} onValueChange={setConsultant} disabled={Boolean(row)}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseConsultant")} /></SelectTrigger>
              <SelectContent>{filteredMembers.map((item) => <SelectItem key={item.consultant} value={item.consultant}>{item.consultant_name} - {item.consultant_email}</SelectItem>)}</SelectContent>
            </Select>
            {!filteredMembers.length && (
              <p className="mt-1 text-xs text-warning">{t("grant.noConsultants")}</p>
            )}
          </FieldWrapper>
          <FieldWrapper label={t("field.project")} required className="sm:col-span-2">
            <Select value={project || undefined} onValueChange={setProject} disabled={Boolean(row)}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("field.chooseProject")} /></SelectTrigger>
              <SelectContent>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.code} - {item.name}</SelectItem>)}</SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label={t("field.validFrom")} required>
            <Input type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("field.validUntil")} required={!noExpiry}>
            <Input type="datetime-local" disabled={noExpiry} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
          </FieldWrapper>
          <label className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
            <Checkbox checked={noExpiry} onCheckedChange={(value) => setNoExpiry(value === true)} />
            <span className="text-sm font-medium">{t("grant.noExpiry")}</span>
          </label>
          <FieldWrapper label={t("field.permissions")} required hint={t("grant.permissionHelp")} className="sm:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {PERMISSIONS.map((code) => (
                <label key={code} className="flex items-start gap-3 rounded-lg border p-3">
                  <Checkbox checked={permissions.includes(code)} onCheckedChange={(value) => togglePermission(code, value === true)} />
                  <span className="text-sm">
                    {t(`permission.${PERMISSION_MESSAGE_KEYS[code]}`)}
                  </span>
                </label>
              ))}
            </div>
          </FieldWrapper>
          {row && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <span className="text-sm font-medium">{t("field.active")}</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </label>
          )}
        </div>
        {save.isError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {readableError(save.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("action.cancel")}</Button>
          <Button requires={[[organizationId, t("field.organization")], [consultant, t("field.consultant")], [project, t("field.project")], [permissions.length, t("field.permissions")], [validFrom, t("field.validFrom")], [noExpiry || validUntil, t("field.validUntil")]]} disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
