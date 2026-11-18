"use client";

/**
 * 「MSE 查看权限」 on the customer's own 公司设置, builder and recycler alike
 * (JB220-1 / -3 / -4 / -5).
 *
 * The client's question (11-18): 「当客户使用自己的 Email 和密码登录后，MSE 管理
 * 人员及开发团队是否必须经过客户授权，才能进入客户后台查看其内部业务资料？」 and
 * 「请问现阶段应该如何解决这个问题，让客户能够放心使用我们的系统？」. This section is
 * the answer the customer can see for himself, in the three things an older
 * boss asks at a glance:
 *
 * - can MSE see my records right now? - one sentence per door, and an open
 *   door is amber, with the time it closes by itself;
 * - how do I open and close it? - 「允许 MSE 查看」 / 「允许 MSE 管理账号」, and
 *   「马上关闭」 while open. Only the 公司管理员 presses them (opening is signed
 *   with the sign-off PIN, through the shared dialog); everyone else is told
 *   whom to ask;
 * - who looked, and when? - 「MSE 查看记录」.
 *
 * Plus the two plain lists of what MSE always sees and what it does not, and
 * the external links MSE opened for the company. MSE's request notice links
 * here (`/company-settings#mse-access`).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Link2, Lock, LockOpen, ShieldCheck, UserCog, UserRoundCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PlatformAccessRecords } from "@/components/platform-access/access-records";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
import { SectionTitle } from "@/components/site-access/settings-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_ACCESS_HOURS,
  type PlatformAccessKind,
  type PlatformAccessStatus,
  type PlatformAccessWindow,
} from "@/interfaces/platform-access";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  closePlatformAccess,
  getPlatformAccessStatus,
  openPlatformAccess,
} from "@/services/platform-access.service";

export const MSE_ACCESS_ANCHOR = "mse-access";
export const OWN_STATUS_KEY = ["platform-access", "status", "own"] as const;

/** The three plain lists' keys (contract §8.1a), when an older server sends none. */
export const LIST_KEYS = {
  always: [
    "company_profile", "package_billing", "users_logins", "weighing_figures", "commission_settlements", "devices",
    "integration_settings", "project_directory", "yards_on_map", "qr_code_list", "notice_delivery", "external_link_list",
    "mse_staff_actions", "visitor_photo_counts",
  ],
  open: [
    "weighing_details", "weighing_photos_ticket", "staff_operations", "notice_words", "qr_subjects_scans", "camera_pictures",
    "plate_card_reads", "pushed_data", "report_files", "print_send_log", "sites_on_map", "visitor_names",
    "external_link_create", "qr_issue",
  ],
  never: [
    "receipts_materials", "documents_approvals", "deductions", "workers_visitors", "schedule_progress", "safety_equipment",
    "daily_reports", "consultant_applications", "chat", "project_details",
  ],
};

export function windowOf(status: PlatformAccessStatus, kind: PlatformAccessKind): PlatformAccessWindow {
  return kind === "VIEW_RECORDS" ? status.view : status.accounts;
}

export function hoursFor(status: Pick<PlatformAccessStatus, "durations"> | null | undefined, kind: PlatformAccessKind): number[] {
  const offered = status?.durations?.[kind];
  return offered && offered.length ? offered : DEFAULT_ACCESS_HOURS[kind];
}

export function MseAccessSection() {
  const t = useTranslations("mseAccess");
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: OWN_STATUS_KEY, queryFn: () => getPlatformAccessStatus() });
  const [opening, setOpening] = useState<PlatformAccessKind | null>(null);
  const [closing, setClosing] = useState<PlatformAccessKind | null>(null);
  const section = useRef<HTMLElement>(null);

  // MSE's request notice links to `#mse-access`; the section only has its
  // height once the status has loaded - after the browser looked for it.
  const loaded = status.isSuccess;
  useEffect(() => {
    if (loaded && window.location.hash === `#${MSE_ACCESS_ANCHOR}`) {
      section.current?.scrollIntoView({ block: "start" });
    }
  }, [loaded]);

  const settle = async (next: PlatformAccessStatus) => {
    queryClient.setQueryData(OWN_STATUS_KEY, next);
    await queryClient.invalidateQueries({ queryKey: ["platform-access", "records"] });
  };
  const close = useMutation({
    mutationFn: (kind: PlatformAccessKind) => closePlatformAccess(kind),
    onSuccess: async (next) => {
      setClosing(null);
      await settle(next);
    },
  });

  return (
    <section ref={section} id={MSE_ACCESS_ANCHOR} className="scroll-mt-20 space-y-4 rounded-xl" data-mse-access>
      <SectionTitle icon={ShieldCheck} title={t("section.title")} description={t("section.subtitle")} />
      {status.isError ? (
        <LoadFailed what={t("section.what")} onRetry={() => void status.refetch()} />
      ) : status.isLoading || !status.data ? (
        <p className="surface-panel rounded-xl p-4 text-sm text-muted-foreground sm:p-6">{t("section.loading")}</p>
      ) : (
        <MseAccessBody
          status={status.data}
          onOpen={setOpening}
          onClose={setClosing}
        />
      )}

      {/* Who looked, and when - also for someone who may not press. */}
      <div className="surface-panel rounded-xl p-4 sm:p-6">
        <PlatformAccessRecords audience="customer" />
      </div>

      {opening && status.data && (
        <OpenAccessDialog
          kind={opening}
          status={status.data}
          onDone={async (next) => {
            setOpening(null);
            await settle(next);
          }}
          onCancel={() => setOpening(null)}
        />
      )}
      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(next) => !next && setClosing(null)}
        title={t(closing === "MANAGE_ACCOUNTS" ? "closeDialog.accountsTitle" : "closeDialog.viewTitle")}
        description={t(closing === "MANAGE_ACCOUNTS" ? "closeDialog.accountsBody" : "closeDialog.viewBody")}
        confirmLabel={t("closeDialog.confirm")}
        confirmIcon={Lock}
        variant="default"
        isPending={close.isPending}
        onConfirm={() => closing && close.mutate(closing)}
      />
    </section>
  );
}

/** Everything the status says, for whoever reads it; the buttons only press for the 公司管理员. */
export function MseAccessBody({
  status,
  onOpen,
  onClose,
}: {
  status: PlatformAccessStatus;
  onOpen: (kind: PlatformAccessKind) => void;
  onClose: (kind: PlatformAccessKind) => void;
}) {
  const t = useTranslations("mseAccess");
  const df = useDateFormat();
  const always = status.always_visible?.length ? status.always_visible : LIST_KEYS.always;
  const whenOpen = status.visible_when_open?.length ? status.visible_when_open : LIST_KEYS.open;
  const never = status.never_visible?.length ? status.never_visible : LIST_KEYS.never;
  const links = status.external_links ?? [];
  // Read the clock once, lazily: calling it during every render is impure.
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <AccessCard kind="VIEW_RECORDS" window={status.view} canChange={status.can_change} onOpen={onOpen} onClose={onClose} />
        <AccessCard kind="MANAGE_ACCOUNTS" window={status.accounts} canChange={status.can_change} onOpen={onOpen} onClose={onClose} />
      </div>
      {!status.can_change && (
        // Said on the page, not only on the greyed buttons (a phone has no hover).
        <p className="rounded-lg border border-panel-border bg-muted/40 px-4 py-3 text-sm text-foreground" data-mse-access-admin-only>
          {t("adminOnly")}
        </p>
      )}

      {/* The three plain lists (JB220-5, contract §8.1a): numbered, because
          the 「允许 MSE 查看」 sentence above points at 「下面第 2 栏」. Side by
          side on a desk, stacked on a phone. */}
      <div className="grid gap-4 lg:grid-cols-3" data-mse-lists>
        <AccessList number={1} title={t("lists.alwaysTitle")} keys={always} tone="always" />
        <AccessList number={2} title={t("lists.openTitle")} keys={whenOpen} tone="open" />
        <AccessList number={3} title={t("lists.neverTitle")} keys={never} tone="never">
          <div className="mt-3 space-y-2 border-t border-panel-border pt-3 text-sm leading-6 text-foreground">
            <p>{t("lists.neverNote1")}</p>
            <p>{t("lists.neverNote2")}</p>
            <p className="text-muted-foreground">{t("lists.neverNote3")}</p>
          </div>
        </AccessList>
      </div>

      <MseAddedAccounts rows={status.mse_added_accounts ?? []} />

      <div className="surface-panel rounded-xl p-4 sm:p-5" data-mse-links>
        <h3 className="flex items-center gap-2 font-semibold text-foreground"><Link2 className="size-4 text-primary" aria-hidden />{t("links.title")}</h3>
        {links.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground" data-mse-links-empty>{t("links.empty")}</p>
        ) : (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("links.help")}</p>
          <ul className="mt-3 divide-y text-sm">
            {links.map((link) => {
              const expired = Boolean(link.expires_at && new Date(link.expires_at).getTime() <= now);
              return (
                <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{link.name} · {link.project_name || t("links.wholeCompany")}</span>
                    {link.created_by_name && <span className="block text-xs text-muted-foreground">{t("links.by", { name: link.created_by_name, at: df.dateTime(link.created_at) })}</span>}
                  </span>
                  <StatusBadge
                    label={link.revoked_at ? t("links.revoked") : expired ? t("links.expired") : t("links.valid", { at: df.dateTime(link.expires_at) })}
                    tone={link.revoked_at ? "danger" : expired ? "neutral" : "positive"}
                  />
                </li>
              );
            })}
          </ul>
        </>
        )}
      </div>
    </div>
  );
}

/** One of the three plain lists: a number, a heading, short lines. */
function AccessList({
  number,
  title,
  keys,
  tone,
  children,
}: {
  number: 1 | 2 | 3;
  title: string;
  keys: string[];
  tone: "always" | "open" | "never";
  children?: React.ReactNode;
}) {
  const t = useTranslations("mseAccess");
  const item = (key: string) => (t.has(`lists.item.${key}`) ? t(`lists.item.${key}`) : t("lists.item.other"));
  const Icon = tone === "always" ? Eye : tone === "open" ? LockOpen : EyeOff;
  return (
    <section className="surface-panel flex flex-col rounded-xl p-4 sm:p-5" data-mse-list={tone} aria-label={title}>
      <h3 className="flex items-start gap-2 font-semibold leading-6 text-foreground">
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
            tone === "open" ? "bg-warning/20 text-warning" : tone === "never" ? "bg-muted text-foreground" : "bg-primary/10 text-primary",
          )}
          aria-hidden
        >
          {number}
        </span>
        <span className="min-w-0">{title}</span>
      </h3>
      <ul className="mt-3 space-y-1.5 text-sm leading-6">
        {keys.map((key) => (
          <li key={key} className="flex gap-2">
            <Icon className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">{item(key)}</span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

/**
 * 「MSE 加的账号」 (contract §8.1b): every account MSE made in this company,
 * each a plain link to that user in 用户管理, where the customer's own
 * administrator stops it with the 停用 already there. Nothing is written here.
 */
export function MseAddedAccounts({ rows }: { rows: NonNullable<PlatformAccessStatus["mse_added_accounts"]> }) {
  const t = useTranslations("mseAccess.added");
  const users = useTranslations("users");
  const df = useDateFormat();
  return (
    <section className="surface-panel rounded-xl p-4 sm:p-5" data-mse-added aria-label={t("title")}>
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <UserRoundCheck className="size-4 text-primary" aria-hidden />
        {t("title")}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground" data-mse-added-empty>{t("empty")}</p>
      ) : (
        <ul className="mt-3 divide-y text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3" data-mse-added-row={row.kind}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{row.full_name}</span>
                  <MseAddedBadge kind={row.kind} />
                  <StatusBadge
                    label={users(`status.${row.status}`)}
                    tone={row.status === "ACTIVE" ? "positive" : row.status === "INVITED" ? "warning" : "neutral"}
                  />
                </div>
                <p className="break-all text-muted-foreground">
                  {[row.email, row.role_name].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.added_by_name ? t("addedBy", { name: row.added_by_name, at: df.dateTime(row.added_at) }) : df.dateTime(row.added_at)}
                  {" · "}
                  {row.last_login_at ? t("lastLogin", { at: df.dateTime(row.last_login_at) }) : t("neverLoggedIn")}
                </p>
              </div>
              <Link
                href={`/users/${encodeURIComponent(row.id)}`}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-panel-border pt-3 text-xs leading-5 text-muted-foreground">{t("note")}</p>
    </section>
  );
}

/** 「MSE 加的」 / 「开户时由 MSE 建立的负责人账号」 - a plain badge, nothing to press. */
export function MseAddedBadge({ kind }: { kind: "owner" | "added" | null | undefined }) {
  const t = useTranslations("mseAccess.added");
  if (!kind) return null;
  return (
    <span
      data-mse-added-badge={kind}
      className="inline-flex max-w-full items-center rounded-md border border-panel-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
    >
      {t(kind === "owner" ? "owner" : "added")}
    </span>
  );
}

function AccessCard({
  kind,
  window,
  canChange,
  onOpen,
  onClose,
}: {
  kind: PlatformAccessKind;
  window: PlatformAccessWindow;
  canChange: boolean;
  onOpen: (kind: PlatformAccessKind) => void;
  onClose: (kind: PlatformAccessKind) => void;
}) {
  const t = useTranslations("mseAccess");
  const df = useDateFormat();
  const words = kind === "VIEW_RECORDS" ? "view" : "accounts";
  const open = window.open && Boolean(window.until);
  const Icon = kind === "VIEW_RECORDS" ? (open ? LockOpen : Lock) : UserCog;
  const notAdmin = canChange ? undefined : t("adminOnly");
  const opened =
    open && window.opened_by_name && window.opened_at
      ? window.reason
        ? t("openedByReason", { name: window.opened_by_name, at: df.dateTime(window.opened_at), reason: window.reason })
        : t("openedBy", { name: window.opened_by_name, at: df.dateTime(window.opened_at) })
      : "";

  return (
    <article
      data-access-card={kind}
      data-open={open ? "true" : "false"}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:p-5",
        open ? "border-warning/50 bg-warning/10" : "surface-panel",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", open ? "bg-warning/20 text-warning" : "bg-primary/10 text-primary")}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{t(`${words}.name`)}</h3>
            <StatusBadge label={t(open ? "state.open" : "state.closed")} tone={open ? "warning" : "neutral"} />
          </div>
          <p className={cn("mt-1 text-sm leading-6", open ? "font-semibold text-foreground" : "text-foreground")} data-access-sentence>
            {open ? t(`${words}.open`, { until: df.dateTime(window.until) }) : t(`${words}.closed`)}
          </p>
          {opened && <p className="mt-1 break-words text-xs text-muted-foreground">{opened}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{t(`${words}.help`)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {open ? (
          <>
            <Button variant="outline" className="w-full sm:w-auto" disabled={!canChange} disabledReason={notAdmin} onClick={() => onOpen(kind)}>
              {t("action.change")}
            </Button>
            <Button className="w-full sm:w-auto" disabled={!canChange} disabledReason={notAdmin} onClick={() => onClose(kind)}>
              <Lock />
              {t("action.closeNow")}
            </Button>
          </>
        ) : (
          <Button className="w-full sm:w-auto" disabled={!canChange} disabledReason={notAdmin} onClick={() => onOpen(kind)}>
            <LockOpen />
            {t(`${words}.name`)}
          </Button>
        )}
      </div>
    </article>
  );
}

function OpenAccessDialog({
  kind,
  status,
  onDone,
  onCancel,
}: {
  kind: PlatformAccessKind;
  status: PlatformAccessStatus;
  onDone: (next: PlatformAccessStatus) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("mseAccess");
  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(kind === "VIEW_RECORDS" ? "view.name" : "accounts.name")}</DialogTitle>
          <DialogDescription>{t(kind === "VIEW_RECORDS" ? "view.help" : "accounts.help")}</DialogDescription>
        </DialogHeader>
        <OpenAccessForm kind={kind} status={status} onDone={onDone} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's body: how long, why, and 「开放」 (the PIN is asked after). */
export function OpenAccessForm({
  kind,
  status,
  onDone,
  onCancel,
}: {
  kind: PlatformAccessKind;
  status: PlatformAccessStatus;
  onDone: (next: PlatformAccessStatus) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("mseAccess");
  const common = useTranslations("common");
  const df = useDateFormat();
  const offered = hoursFor(status, kind);
  const [hours, setHours] = useState(offered[0]);
  const [reason, setReason] = useState("");
  const current = windowOf(status, kind);
  const open = useMutation({
    mutationFn: () => openPlatformAccess({ kind, hours, reason }, (until) => df.dateTime(until)),
    onSuccess: onDone,
  });

  return (
    <div className="space-y-4" data-open-access-form={kind}>
      {current.open && current.until && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t("openDialog.replace", { until: df.dateTime(current.until) })}</p>
      )}
      <FieldWrapper label={t("openDialog.howLong")} required>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("openDialog.howLong")}>
          {offered.map((value) => (
            <Button
              key={value}
              type="button"
              variant={value === hours ? "default" : "outline"}
              aria-pressed={value === hours}
              data-hours={value}
              onClick={() => setHours(value)}
            >
              {t.has(`duration.${value}`) ? t(`duration.${value}`) : String(value)}
            </Button>
          ))}
        </div>
      </FieldWrapper>
      <FieldWrapper label={t("openDialog.reason")}>
        <Textarea value={reason} maxLength={500} rows={3} placeholder={t("openDialog.reasonPlaceholder")} onChange={(event) => setReason(event.target.value)} />
      </FieldWrapper>
      <p className="text-sm text-muted-foreground">{t("openDialog.pin")}</p>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{common("cancel")}</Button>
        <Button disabled={open.isPending} onClick={() => open.mutate()}>
          <LockOpen />
          {t("openDialog.confirm")}
        </Button>
      </DialogFooter>
    </div>
  );
}
