"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Link2, Link2Off, MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FieldWrapper, ReadField, StatusBadge } from "@/components/shared/page-primitives";
import { FormSection } from "@/components/shared/form-shell";
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
import type { Driver, DriverLinkIssued } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import {
  DRIVER_LINK_CLOSE_RULES,
  parseIdleDays,
  whatsappShareUrl,
  type DriverLinkCloseRule,
  type DriverLinkStatus,
} from "@/lib/driver-link";
import { revokeDriverLoginLink, sendDriverLoginLink } from "@/services/driver-link.service";

/** "Use the company setting" in the rule picker; sends no rule at all. */
const COMPANY_DEFAULT = "COMPANY_DEFAULT";

/**
 * 「发送登录链接」 for one driver.
 *
 * Two steps in one dialog: choose how the link ends (the company's setting
 * unless the office picks otherwise for this link), then copy or WhatsApp the
 * link that comes back. The link exists in full only in this response.
 */
export function SendDriverLinkDialog({
  driver,
  onClose,
}: {
  driver: Pick<Driver, "id" | "full_name" | "phone" | "login_link">;
  onClose: () => void;
}) {
  const t = useTranslations("drivers.loginLink");
  const common = useTranslations("common");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [rule, setRule] = useState<DriverLinkCloseRule | typeof COMPANY_DEFAULT>(COMPANY_DEFAULT);
  const [days, setDays] = useState("7");
  const [result, setResult] = useState<DriverLinkIssued | null>(null);
  const [copied, setCopied] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      sendDriverLoginLink(
        driver.id,
        rule === COMPANY_DEFAULT
          ? {}
          : rule === "EXPIRE_AFTER_IDLE_DAYS"
            ? { close_rule: rule, idle_days: parseIdleDays(days) ?? undefined }
            : { close_rule: rule },
      ),
    onSuccess: (issued) => {
      setResult(issued);
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });

  const idle = rule === "EXPIRE_AFTER_IDLE_DAYS";
  const shareText = result
    ? t("shareMessage", { name: result.full_name, url: result.login_url })
    : "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{result ? t("resultTitle") : t("title", { name: driver.full_name })}</DialogTitle>
          <DialogDescription>{result ? t("resultDescription") : t("description")}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-4 sm:grid-cols-[12.5rem_minmax(0,1fr)]">
            <div className="grid content-start justify-center gap-2">
              <div className="grid size-50 place-items-center rounded-lg border bg-paper p-2">
                <QRCodeCanvas value={result.login_url} size={180} level="H" marginSize={1} title={t("qrTitle")} />
              </div>
              <p className="text-center text-xs text-muted-foreground">{result.full_name}</p>
            </div>
            <div className="min-w-0 space-y-4">
              <FieldWrapper label={t("link")}>
                <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
                  <code className="min-w-0 flex-1 break-all text-xs leading-5">{result.login_url}</code>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    title={t("copyLink")}
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(result.login_url)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false));
                    }}
                  >
                    {copied ? <CheckCircle2 /> : <Copy />}
                  </Button>
                </div>
              </FieldWrapper>
              <div className="rounded-lg border px-3 py-2 text-sm">
                <p className="font-medium">{t(`rule.${result.link.close_rule}`, { days: result.link.idle_days })}</p>
                {result.link.expires_at && (
                  <p className="mt-1 text-muted-foreground">
                    {t("expiresAt", { date: df.dateTime(result.link.expires_at) })}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("onePhone")}</p>
              <Button asChild className="w-full">
                <a href={whatsappShareUrl(result.phone, shareText)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                  {t("whatsapp")}
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {driver.login_link && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm sm:col-span-2">
                {t("replacesOld")}
              </p>
            )}
            <FieldWrapper label={t("ruleLabel")} className={idle ? undefined : "sm:col-span-2"}>
              <Select value={rule} onValueChange={(value) => setRule(value as typeof rule)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={COMPANY_DEFAULT}>{t("companyDefault")}</SelectItem>
                  {DRIVER_LINK_CLOSE_RULES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`ruleOption.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            {idle && (
              <FieldWrapper label={t("idleDays")} required hint={t("idleDaysHint")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
              </FieldWrapper>
            )}
            <p className="text-sm text-muted-foreground sm:col-span-2">{t("ruleHelp")}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {result ? common("close") : common("cancel")}
          </Button>
          {!result && (
            <Button
              requires={idle ? [[parseIdleDays(days) !== null, t("idleDays")]] : undefined}
              disabled={send.isPending}
              onClick={() => send.mutate()}
            >
              <Send />
              {t("send")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The 「登录链接」 block on a driver's page: state of the link, and actions. */
export function DriverLoginLinkSection({ driver }: { driver: Driver }) {
  const t = useTranslations("drivers.loginLink");
  const df = useDateFormat();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const link = driver.login_link;
  const revoke = useMutation({
    mutationFn: () => revokeDriverLoginLink(driver.id),
    onSuccess: () => {
      setRevoking(false);
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
  const status: DriverLinkStatus | "NONE" = link?.status ?? "NONE";

  return (
    <FormSection title={t("section")}>
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <StatusBadge label={t(`status.${status}`)} tone={linkStatusTone(status)} />
        {link && (
          <span className="text-sm text-muted-foreground">
            {t(`rule.${link.close_rule}`, { days: link.idle_days })}
          </span>
        )}
      </div>
      {link && (
        <>
          <ReadField label={t("sentAt")} value={df.dateTime(link.created_at)} />
          <ReadField label={t("openedAt")} value={link.bound_at ? df.dateTime(link.bound_at) : null} />
          <ReadField label={t("lastUsedAt")} value={link.last_used_at ? df.dateTime(link.last_used_at) : null} />
          {link.expires_at && (
            <ReadField label={t("expiresAtLabel")} value={df.dateTime(link.expires_at)} />
          )}
        </>
      )}
      {!link && (
        <p className="text-sm text-muted-foreground md:col-span-2">
          {driver.signs_in_by_link ? t("noneLinkOnly") : t("noneHasPassword")}
        </p>
      )}
      {can("fleet.manage") && driver.is_active && (
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button size="sm" onClick={() => setSending(true)}>
            <Link2 />
            {link ? t("resend") : t("send")}
          </Button>
          {link && (
            <Button size="sm" variant="outline" onClick={() => setRevoking(true)}>
              <Link2Off />
              {t("revoke")}
            </Button>
          )}
        </div>
      )}
      {sending && <SendDriverLinkDialog driver={driver} onClose={() => setSending(false)} />}
      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={() => setRevoking(false)}
          title={t("revokeTitle")}
          description={t("revokeDescription")}
          confirmLabel={t("revoke")}
          confirmIcon={Link2Off}
          isPending={revoke.isPending}
          onConfirm={() => revoke.mutate()}
        />
      )}
    </FormSection>
  );
}

function linkStatusTone(status: DriverLinkStatus | "NONE") {
  if (status === "ACTIVE") return "positive" as const;
  if (status === "NOT_OPENED") return "info" as const;
  if (status === "EXPIRED" || status === "CLOSED") return "warning" as const;
  return "neutral" as const;
}
