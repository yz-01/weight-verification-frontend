"use client";

/**
 * 「客户开放情况」 on MSE's company page (JB220-1 / -3, 客户 11-18).
 *
 * MSE's staff are the client's own people: they read whether this customer has
 * opened 「允许 MSE 查看」 / 「允许 MSE 管理账号」 and until when, ask for it with
 * a reason the customer reads in the notice, and see the same 「MSE 查看记录」
 * the customer sees. MSE cannot open a door itself - only the customer's
 * 公司管理员 can.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, Send, ShieldCheck, UserCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PlatformAccessRecords } from "@/components/platform-access/access-records";
import { FieldWrapper, LoadFailed, StatusBadge } from "@/components/shared/page-primitives";
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
import { ApiError } from "@/interfaces/api";
import type {
  CompanyPlatformAccess,
  PlatformAccessKind,
  PlatformAccessStatus,
} from "@/interfaces/platform-access";
import { useDateFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getPlatformAccessStatus, requestPlatformAccess } from "@/services/platform-access.service";

export const companyAccessKey = (company: string) => ["platform-access", "status", company] as const;

export function CompanyAccessPanel({ companyId }: { companyId: string }) {
  const t = useTranslations("mseAccess");
  const status = useQuery({
    queryKey: companyAccessKey(companyId),
    queryFn: () => getPlatformAccessStatus(companyId),
  });
  const [asking, setAsking] = useState<PlatformAccessKind | null>(null);

  return (
    <section id="company-platform-access" className="scroll-mt-20 space-y-4 border-t p-4 sm:p-6" data-company-access>
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{t("mse.title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("mse.help")}</p>
        </div>
      </div>
      {status.isError ? (
        <LoadFailed what={t("section.what")} onRetry={() => void status.refetch()} />
      ) : status.isLoading || !status.data ? (
        <p className="text-sm text-muted-foreground">{t("section.loading")}</p>
      ) : (
        <CompanyAccessStatus status={status.data} onAsk={setAsking} />
      )}
      <PlatformAccessRecords company={companyId} audience="mse" />
      {asking && (
        <AskDialog companyId={companyId} kind={asking} onClose={() => setAsking(null)} />
      )}
    </section>
  );
}

/**
 * 「客户开放」 in the company directory: 未开放, or what is open and until when.
 * A company still onboarding says MSE may set up its accounts.
 */
export function CompanyAccessCell({ access }: { access: CompanyPlatformAccess | null | undefined }) {
  const t = useTranslations("mseAccess.directory");
  const common = useTranslations("common");
  const df = useDateFormat();
  if (!access) return <span className="text-muted-foreground">{common("emptyValue")}</span>;
  const lines = [
    access.view_until ? t("view", { until: df.dateTime(access.view_until) }) : "",
    access.accounts_until ? t("accounts", { until: df.dateTime(access.accounts_until) }) : "",
  ].filter(Boolean);
  return (
    <div className="min-w-0 space-y-1" data-company-access-cell={lines.length ? "open" : "closed"}>
      {lines.length ? (
        lines.map((line) => <StatusBadge key={line} label={line} tone="warning" />)
      ) : (
        <StatusBadge label={t("closed")} tone="neutral" />
      )}
      {access.accounts_onboarding && !access.accounts_until && (
        <p className="text-xs text-muted-foreground">{t("onboarding")}</p>
      )}
    </div>
  );
}

/** The two doors in words, each with its 「请客户开放……」. */
export function CompanyAccessStatus({
  status,
  onAsk,
}: {
  status: PlatformAccessStatus;
  onAsk: (kind: PlatformAccessKind) => void;
}) {
  const t = useTranslations("mseAccess");
  const df = useDateFormat();
  const viewOpen = status.view.open && Boolean(status.view.until);
  const accountsOpen = status.accounts.open && Boolean(status.accounts.until);
  const onboarding = status.accounts.onboarding;
  const opened = (window: PlatformAccessStatus["view"]) =>
    window.opened_by_name && window.opened_at
      ? window.reason
        ? t("openedByReason", { name: window.opened_by_name, at: df.dateTime(window.opened_at), reason: window.reason })
        : t("openedBy", { name: window.opened_by_name, at: df.dateTime(window.opened_at) })
      : "";

  const row = (
    kind: PlatformAccessKind,
    open: boolean,
    sentence: string,
    detail: string,
    ask: string,
    blocked: string | undefined,
  ) => (
    <div
      key={kind}
      data-company-access-row={kind}
      data-open={open ? "true" : "false"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4",
        open ? "border-warning/50 bg-warning/10" : "border-panel-border bg-card",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {kind === "VIEW_RECORDS" ? (
          open ? <LockOpen className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden /> : <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <UserCog className={cn("mt-0.5 size-5 shrink-0", open ? "text-warning" : "text-muted-foreground")} aria-hidden />
        )}
        <div className="min-w-0">
          <p className="font-medium text-foreground">{sentence}</p>
          {detail && <p className="mt-0.5 break-words text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      <Button variant="outline" className="w-full sm:w-auto" disabled={Boolean(blocked)} disabledReason={blocked} showReason onClick={() => onAsk(kind)}>
        <Send />
        {ask}
      </Button>
    </div>
  );

  return (
    <div className="grid gap-3">
      {row(
        "VIEW_RECORDS",
        viewOpen,
        viewOpen ? t("mse.viewOpen", { until: df.dateTime(status.view.until) }) : t("mse.viewClosed"),
        viewOpen ? opened(status.view) : "",
        t("mse.askView"),
        viewOpen ? t("mse.alreadyOpen") : undefined,
      )}
      {row(
        "MANAGE_ACCOUNTS",
        accountsOpen,
        accountsOpen
          ? t("mse.accountsOpen", { until: df.dateTime(status.accounts.until) })
          : onboarding
            ? t("mse.accountsOnboarding")
            : t("mse.accountsClosed"),
        accountsOpen ? opened(status.accounts) : "",
        t("mse.askAccounts"),
        accountsOpen ? t("mse.alreadyOpen") : onboarding ? t("mse.onboardingNoAsk") : undefined,
      )}
    </div>
  );
}

function AskDialog({ companyId, kind, onClose }: { companyId: string; kind: PlatformAccessKind; onClose: () => void }) {
  const t = useTranslations("mseAccess");
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(kind === "VIEW_RECORDS" ? "mse.askView" : "mse.askAccounts")}</DialogTitle>
          <DialogDescription>{t("mse.askHelp")}</DialogDescription>
        </DialogHeader>
        <AskForm companyId={companyId} kind={kind} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The reason and 「发送」. Asking again within the hour is refused by the
 * server; that sentence (「一小时内已经通知过这家客户，请 N 分钟后再发。」)
 * stays in the dialog, where the person is looking.
 */
export function AskForm({ companyId, kind, onClose }: { companyId: string; kind: PlatformAccessKind; onClose: () => void }) {
  const t = useTranslations("mseAccess");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const ask = useMutation({
    mutationFn: () => requestPlatformAccess({ company: companyId, kind, reason }, { silent: true }),
    onSuccess: async () => {
      onClose();
      await queryClient.invalidateQueries({ queryKey: ["platform-access", "records"] });
    },
  });
  const refusal = ask.error instanceof ApiError ? ask.error.message : ask.isError ? common("unknownError") : "";

  return (
    <div className="space-y-4" data-ask-form={kind}>
      <FieldWrapper label={t("mse.reason")} required>
        <Textarea value={reason} maxLength={500} rows={3} placeholder={t("mse.reasonPlaceholder")} onChange={(event) => setReason(event.target.value)} />
      </FieldWrapper>
      {refusal && <p role="alert" className="text-sm text-destructive" data-ask-refusal>{refusal}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{common("cancel")}</Button>
        <Button requires={[[reason.trim(), t("mse.reason")]]} disabled={ask.isPending} onClick={() => ask.mutate()}>
          <Send />
          {t("mse.send")}
        </Button>
      </DialogFooter>
    </div>
  );
}
