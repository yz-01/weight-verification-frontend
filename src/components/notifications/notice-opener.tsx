"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NotificationRow } from "@/interfaces/platform-ops";
import { useDateFormat } from "@/lib/dates";
import { confirmNotificationDone, getNotification } from "@/services/platform-ops.service";

/**
 * What `?notice=<id>` opens (JB97).
 *
 * Lucas 11-03: 「铃铛那里按进去确保是可以看到事项的详情，不是首页，手机端和后台
 * 都一样」. A push whose notice has a screen of its own goes there; the server
 * cannot always know that screen (an office link mapped by
 * `officeNotificationHref`, an old notice), so the push names the notice and
 * this goes on to its item with the same rule the bell uses (`resolve`). A
 * notice with nowhere to go - a pass that ran out, a company notice - opens
 * here, whole, instead of the home page.
 */
export function NoticeOpener({
  id,
  resolve,
  navigate,
  onClose,
}: {
  id: string;
  /** The bell's own rule: where this notice leads, or `null`. */
  resolve: (notice: NotificationRow) => string | null;
  /**
   * Go there (it closes this). The `?notice=` address must not stay in
   * history under the item: going back to it would come here and go on to
   * the item again, for ever (客户 11-13, JB187). The phone replaces it; the
   * office takes the notice out of its entry first (`dropFromAddress`), so
   * closing the item comes back to 通知中心.
   */
  navigate: (href: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const notice = useQuery({
    queryKey: ["notifications", "one", id],
    queryFn: () => getNotification(id),
  });
  const row = notice.data ?? null;
  const href = row ? resolve(row) : null;
  const went = useRef(false);
  useEffect(() => {
    if (!href || went.current) return;
    went.current = true;
    // The new address no longer names the notice, which closes this.
    navigate(href);
  }, [href, navigate]);
  const confirm = useMutation({
    mutationFn: confirmNotificationDone,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onClose();
    },
  });

  if (href) return null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {notice.isLoading ? (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">{t("common.loading")}</DialogTitle>
            </DialogHeader>
            <div className="grid min-h-24 place-items-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          </>
        ) : row && !notice.isError ? (
          <>
            <DialogHeader>
              <DialogTitle>{row.title}</DialogTitle>
              <DialogDescription>
                {[row.kind_label, df.dateTime(row.created_at)].filter(Boolean).join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-sm leading-6">{row.message}</p>
            <DialogFooter>
              {row.is_outstanding && (
                <Button
                  variant="outline"
                  disabled={confirm.isPending}
                  disabledReason={t("common.loading")}
                  onClick={() => confirm.mutate(row.id)}
                >
                  {t("notifications.confirmDone")}
                </Button>
              )}
              <Button onClick={onClose}>{t("common.close")}</Button>
            </DialogFooter>
          </>
        ) : (
          // Failed to load, or not this reader's any more: said so.
          <>
            <DialogHeader>
              <DialogTitle>{t("notifications.notice.missing")}</DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={onClose}>{t("common.close")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
