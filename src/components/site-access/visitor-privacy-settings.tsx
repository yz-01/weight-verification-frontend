"use client";

/**
 * 访客资料: the visitor's PDPA notice, how long their photographs are kept and
 * whether their way out is photographed (J33-2, J33-4, J33-5).
 *
 * Part of the company settings form - saved with it - plus 「到期访客照片」:
 * the photographs past their keeping time, removed only when the
 * administrator confirms with their sign-off PIN. Only the picture files go;
 * passes, visits and gate records stay, and each removal is logged.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState, FieldWrapper, LoadFailed } from "@/components/shared/page-primitives";
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
import { Textarea } from "@/components/ui/textarea";
import type { ContractorSiteSettings } from "@/interfaces/site-access";
import { useDateFormat } from "@/lib/dates";
import { getExpiredVisitorPhotos, purgeVisitorPhotos } from "@/services/site-access.service";

const LANGUAGES = ["zh", "en", "zh-TW", "ms"] as const;

export function VisitorPrivacySection({
  form,
  onChange,
  canManage,
}: {
  form: ContractorSiteSettings;
  onChange: (next: Partial<ContractorSiteSettings>) => void;
  canManage: boolean;
}) {
  const t = useTranslations("siteControl.visitorPrivacy");
  const [reviewing, setReviewing] = useState(false);
  const notice = form.visitor_pdpa_notice ?? {};
  return (
    <section className="space-y-4" data-visitor-privacy>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-5 text-primary" aria-hidden />
          <div>
            <h2 className="panel-title">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setReviewing(true)}>
            <ImageOff />
            {t("expired.open")}
          </Button>
        )}
      </div>
      <div className="grid gap-4 surface-panel rounded-xl p-4 sm:p-6 sm:grid-cols-2">
        <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">{t("exitPhoto")}</span>
            <span className="block text-xs text-muted-foreground">{t("exitPhotoHelp")}</span>
          </span>
          <Switch
            checked={form.visitor_exit_photo_required ?? true}
            disabled={!canManage}
            onCheckedChange={(checked) => onChange({ visitor_exit_photo_required: checked })}
            aria-label={t("exitPhoto")}
          />
        </label>
        <FieldWrapper label={t("retention")} hint={t("retentionHelp")}>
          <Input
            type="number"
            min={1}
            max={120}
            disabled={!canManage}
            value={form.visitor_photo_retention_months ?? 12}
            onChange={(event) =>
              onChange({ visitor_photo_retention_months: Math.min(120, Math.max(1, Number(event.target.value) || 12)) })
            }
          />
        </FieldWrapper>
        {LANGUAGES.map((language) => (
          <FieldWrapper key={language} label={t(`notice.${language}`)} hint={t("noticeHelp")} className="sm:col-span-2">
            <Textarea
              rows={3}
              maxLength={4000}
              disabled={!canManage}
              value={notice[language] ?? ""}
              placeholder={t("noticePlaceholder")}
              onChange={(event) =>
                onChange({ visitor_pdpa_notice: { ...notice, [language]: event.target.value } })
              }
            />
          </FieldWrapper>
        ))}
      </div>
      {reviewing && <ExpiredVisitorPhotosDialog onClose={() => setReviewing(false)} />}
    </section>
  );
}

/** 「到期访客照片」: listed, then removed with the administrator's PIN (J33-5). */
export function ExpiredVisitorPhotosDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("siteControl.visitorPrivacy.expired");
  const df = useDateFormat();
  const qc = useQueryClient();
  const expired = useQuery({ queryKey: ["visitor-photos", "expired"], queryFn: getExpiredVisitorPhotos });
  const purge = useMutation({
    // The server asks for the sign-off PIN; the shared dialog collects it.
    mutationFn: purgeVisitorPhotos,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["visitor-photos", "expired"] }),
  });
  const data = expired.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {data ? t("help", { months: data.retention_months, cutoff: df.date(data.cutoff) }) : t("loading")}
          </DialogDescription>
        </DialogHeader>
        {expired.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </p>
        ) : expired.isError || !data ? (
          <LoadFailed what={t("title")} onRetry={() => void expired.refetch()} />
        ) : data.count === 0 ? (
          <EmptyState icon={ImageOff} title={t("none")} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("count", { count: data.count })}</p>
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
              {data.photos.map((row) => (
                <li key={`${row.source}:${row.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">
                    {row.pass_no} · {row.visitor} · {row.project_name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t(`direction.${row.direction}`)} · {df.dateTime(row.taken_at)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("keeps")}</p>
          </div>
        )}
        {data && data.purges.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">{t("history")}</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {data.purges.map((purge) => (
                <li key={purge.id}>
                  {t("historyRow", {
                    when: df.dateTime(purge.purged_at),
                    who: purge.purged_by_name,
                    count: purge.count,
                    months: purge.retention_months,
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
        {purge.isSuccess && (
          <p role="status" className="text-sm text-success">
            {t("done", { count: purge.data.purged })}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
          <Button
            variant="destructive"
            disabled={purge.isPending || !data || data.count === 0}
            disabledReason={t("none")}
            onClick={() => purge.mutate()}
          >
            {purge.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
