"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeCanvas } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";

import {
  DEFAULT_LINK_RULE,
  LinkRuleFields,
  linkRuleIsComplete,
  linkRulePayload,
  type LinkRuleValue,
} from "@/components/tasks/trip-crew";
import { FieldWrapper } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DriverTaskDetail } from "@/interfaces/recycler";
import { useDateFormat } from "@/lib/dates";
import { whatsappShareUrl } from "@/lib/driver-link";
import { sendTaskLink } from "@/services/recycler.service";

/**
 * The trip's link, ready to hand to the driver: copy, scan or WhatsApp.
 *
 * Headed by the order number, and the share message leads with it too - the
 * link belongs to that order (「链接会绑定那个订单编号」). The link is shown
 * only here, straight after it was made; the server keeps only its hash.
 */
export function TripLinkShare({
  task,
  linkUrl,
}: {
  task: Pick<DriverTaskDetail, "dispatch_no" | "task_no" | "driver_name" | "driver_phone" | "link">;
  linkUrl: string;
}) {
  const t = useTranslations("tasks.link");
  const df = useDateFormat();
  const [copied, setCopied] = useState(false);
  const order = task.dispatch_no ?? task.task_no;
  const message = t("shareMessage", { order, url: linkUrl });

  return (
    <div className="grid gap-4 sm:grid-cols-[12.5rem_minmax(0,1fr)]">
      <div className="grid content-start justify-center gap-2">
        <div className="grid size-50 place-items-center rounded-lg border bg-paper p-2">
          <QRCodeCanvas value={linkUrl} size={180} level="H" marginSize={1} title={t("qrTitle")} />
        </div>
        <p className="tabular text-center text-sm font-semibold">{order}</p>
      </div>
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("order")}</p>
          <p className="tabular text-lg font-semibold">{order}</p>
          <p className="text-sm text-muted-foreground">
            {[task.driver_name, task.driver_phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <FieldWrapper label={t("link")}>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
            <code className="min-w-0 flex-1 break-all text-xs leading-5">{linkUrl}</code>
            <Button
              size="icon-sm"
              variant="outline"
              title={t("copy")}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(message)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? <CheckCircle2 /> : <Copy />}
            </Button>
          </div>
        </FieldWrapper>
        {task.link && (
          <p className="text-sm">
            {t(`rule.${task.link.close_rule}`, { days: task.link.idle_days ?? 7 })}
            {task.link.expires_at && (
              <span className="text-muted-foreground">
                {" · "}
                {t("expiresAt", { date: df.dateTime(task.link.expires_at) })}
              </span>
            )}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("onePhone")}</p>
        <Button asChild className="w-full">
          <a
            href={whatsappShareUrl(task.driver_phone ?? "", message)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle />
            {t("whatsapp")}
          </a>
        </Button>
      </div>
    </div>
  );
}

/** The link straight after a trip was assigned. */
export function TripLinkDialog({
  task,
  linkUrl,
  onClose,
}: {
  task: DriverTaskDetail;
  linkUrl: string;
  onClose: () => void;
}) {
  const t = useTranslations("tasks.link");
  const common = useTranslations("common");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("readyTitle")}</DialogTitle>
          <DialogDescription>{t("readyDescription")}</DialogDescription>
        </DialogHeader>
        <TripLinkShare task={task} linkUrl={linkUrl} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「发送链接」 / 「重新发送链接」 on a running trip.
 *
 * Also how a trip rostered before links existed gets one. Sending again makes
 * a new link and the old one stops working at once - the way to recover a
 * link forwarded to the wrong chat, or a driver who changed phones.
 */
export function SendTripLinkDialog({
  task,
  onClose,
}: {
  task: DriverTaskDetail;
  onClose: () => void;
}) {
  const t = useTranslations("tasks.link");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [rule, setRule] = useState<LinkRuleValue>(DEFAULT_LINK_RULE);
  const send = useMutation({
    mutationFn: () => sendTaskLink(task.id, linkRulePayload(rule)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const issued = send.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {issued ? t("readyTitle") : task.link ? t("resend") : t("send")}
          </DialogTitle>
          <DialogDescription>
            {issued ? t("readyDescription") : task.link ? t("resendDescription") : t("sendDescription")}
          </DialogDescription>
        </DialogHeader>
        {issued?.link_url ? (
          <TripLinkShare task={issued} linkUrl={issued.link_url} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <LinkRuleFields value={rule} onChange={setRule} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {issued ? common("close") : common("cancel")}
          </Button>
          {!issued && (
            <Button
              disabled={send.isPending}
              onClick={() => {
                if (!linkRuleIsComplete(rule)) {
                  toast.error(t("idleDaysHint"));
                  return;
                }
                send.mutate();
              }}
            >
              <Send />
              {task.link ? t("resend") : t("send")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
