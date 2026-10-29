"use client";

/**
 * 「发给谁？」 before every send, and 「发出去了吗？」 after it (JB64, 客户
 * 10-29 事项 2、3).
 *
 * The client: 「我已经把这条记录发送给 WhatsApp 了，发送给谁什么时候发送这个记录
 * 会留在哪里呢？」 - WhatsApp never tells the system who it went to, so the
 * person says it first: how (WhatsApp / Email / 其他), the name, the company
 * if there is one, the phone or the email. People this company sent to lately
 * are one tap away. Then the PIN, then the share window.
 *
 * 「必须区分「已打开分享窗口」与「已确认发送」，不能将点击分享直接记录为发送成
 * 功」: the send is written as 已打开分享窗口, and back on the page the person
 * is asked one plain question - 「已发送」 makes it 已确认发送, 「没有发」 leaves
 * it. It can still be marked later in the record's 发送记录.
 *
 * The client is elderly: four short fields, big buttons, no jargon.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail, MessageCircle, Send, Share2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import {
  SEND_METHODS,
  type FileShare,
  type SendMethod,
  type SendRecipient,
} from "@/interfaces/file-action";
import { cn } from "@/lib/utils";
import { confirmFileShare, getRecentRecipients } from "@/services/file-action.service";

const METHOD_ICONS = { WHATSAPP: MessageCircle, EMAIL: Mail, OTHER: Share2 } as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^[0-9+()\-\s]+$/;

/** The 发送记录 queries, refreshed after a send is written or answered. */
export const FILE_SHARES_KEY = ["file-shares"] as const;

/** Whether `value` is a phone number the server takes: digits, +, -, (), spaces; six digits at least. */
export function phoneOk(value: string): boolean {
  const text = value.trim();
  return PHONE.test(text) && text.replace(/\D/g, "").length >= 6;
}

/** The contact the method needs: WhatsApp a phone, Email an address, 其他 anything or nothing. */
export function contactOk(method: SendMethod, value: string): boolean {
  if (method === "WHATSAPP") return phoneOk(value);
  if (method === "EMAIL") return EMAIL.test(value.trim());
  return true;
}

/** The label of the contact field for `method`. */
export function contactKey(method: SendMethod): "phone" | "email" | "contact" {
  return method === "WHATSAPP" ? "phone" : method === "EMAIL" ? "email" : "contact";
}

/**
 * Call `onBack` once the person has left this page (WhatsApp, the email, the
 * Downloads folder) and come back to it - when 「发出去了吗？」 is asked after
 * a send without a share window (JB64). Returns the clean-up.
 */
export function watchReturn(win: EventTarget, doc: EventTarget & { visibilityState?: string }, onBack: () => void) {
  let away = false;
  const leave = () => {
    away = true;
  };
  const come = () => {
    if (!away) return;
    away = false;
    onBack();
  };
  const visibility = () => (doc.visibilityState === "hidden" ? leave() : come());
  win.addEventListener("blur", leave);
  win.addEventListener("focus", come);
  doc.addEventListener("visibilitychange", visibility);
  return () => {
    win.removeEventListener("blur", leave);
    win.removeEventListener("focus", come);
    doc.removeEventListener("visibilitychange", visibility);
  };
}

/**
 * The recent people offered as one-tap choices: only those with a name, so
 * a chip never reads as a bare number (JB64 fix, 10-29).
 */
export function offeredRecipients(people: readonly SendRecipient[]): SendRecipient[] {
  return people.filter((person) => person.recipient_name.trim() !== "");
}

/** One recent recipient, as a short line. */
export function recipientLine(person: Pick<SendRecipient, "recipient_name" | "recipient_company" | "recipient_contact">) {
  return [person.recipient_name, person.recipient_company, person.recipient_contact].filter(Boolean).join(" · ");
}

/**
 * 「发给谁？」: the recipient, before the PIN. `onDone(null)` when closed -
 * nothing is sent and nothing is asked.
 */
export function SendRecipientDialog({
  fileTitle,
  onDone,
}: {
  fileTitle: string;
  onDone: (recipient: SendRecipient | null) => void;
}) {
  const t = useTranslations("fileActions.send");
  const common = useTranslations("common");
  const [method, setMethod] = useState<SendMethod>("WHATSAPP");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  // query-failure: without the list the person types the recipient in; nothing else depends on it
  const recent = useQuery({
    queryKey: ["file-shares", "recent"],
    queryFn: () => getRecentRecipients(),
    staleTime: 60_000,
  });
  const people = offeredRecipients(recent.data ?? []);
  const contactLabel = t(contactKey(method));
  const typedBad = contact.trim() !== "" && !contactOk(method, contact);
  const go = () =>
    onDone({
      method,
      recipient_name: name.trim(),
      recipient_company: company.trim(),
      recipient_contact: contact.trim(),
    });
  return (
    <Dialog open onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent className="sm:max-w-md" data-slot="send-recipient">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="break-all">{fileTitle}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && contactOk(method, contact)) go();
          }}
        >
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
          {people.length > 0 ? (
            <div className="space-y-2" data-slot="send-recent">
              <p className="text-sm">{t("recent")}</p>
              <div className="flex flex-wrap gap-2">
                {people.map((person) => (
                  <Button
                    key={`${person.method}|${recipientLine(person)}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-9 max-w-full whitespace-normal text-left"
                    onClick={() => {
                      setMethod(person.method);
                      setName(person.recipient_name);
                      setCompany(person.recipient_company);
                      setContact(person.recipient_contact);
                    }}
                  >
                    {t(person.method)} · {recipientLine(person)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <FieldWrapper label={t("method")}>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("method")}>
              {SEND_METHODS.map((option) => {
                const Icon = METHOD_ICONS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={method === option}
                    data-send-method={option}
                    onClick={() => setMethod(option)}
                    className={cn(
                      "flex min-h-12 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-medium transition-colors",
                      method === option
                        ? "border-primary/40 bg-primary/12 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {t(option)}
                  </button>
                );
              })}
            </div>
          </FieldWrapper>
          <FieldWrapper label={t("name")} required>
            <Input
              value={name}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              data-slot="send-recipient-name"
            />
          </FieldWrapper>
          <FieldWrapper label={t("company")} optional={t("optional")}>
            <Input
              value={company}
              autoComplete="off"
              onChange={(event) => setCompany(event.target.value)}
              data-slot="send-recipient-company"
            />
          </FieldWrapper>
          <FieldWrapper
            label={contactLabel}
            required={method !== "OTHER"}
            optional={method === "OTHER" ? t("optional") : undefined}
            hint={method === "WHATSAPP" ? t("phoneHint") : undefined}
            error={typedBad ? t(method === "EMAIL" ? "emailBad" : "phoneBad") : undefined}
          >
            <Input
              value={contact}
              type={method === "EMAIL" ? "email" : method === "WHATSAPP" ? "tel" : "text"}
              inputMode={method === "EMAIL" ? "email" : method === "WHATSAPP" ? "tel" : "text"}
              autoComplete="off"
              onChange={(event) => setContact(event.target.value)}
              data-slot="send-recipient-contact"
            />
          </FieldWrapper>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onDone(null)}>
              {common("cancel")}
            </Button>
            <Button
              type="submit"
              data-slot="send-recipient-next"
              requires={[
                [name.trim(), t("name")],
                [contactOk(method, contact), contactLabel],
              ]}
            >
              <Send className="size-4" />
              {t("next")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 「发出去了吗？」 - asked once the person is back from the share window.
 * 「已发送」 → 已确认发送; 「没有发」 leaves 已打开分享窗口.
 */
export function SentQuestionDialog({
  share,
  onClose,
}: {
  share: FileShare;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-slot="send-question">
        <SentQuestion share={share} onAnswered={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** The question itself, for a dialog of its own or inside another. */
export function SentQuestion({
  share,
  onAnswered,
  inline = false,
}: {
  share: FileShare;
  onAnswered: () => void;
  /** Inside another dialog: a plain block rather than a dialog header. */
  inline?: boolean;
}) {
  const t = useTranslations("fileActions.send");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const body = t("askBody", { name: share.recipient_name, file: share.file_name || share.subject });
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: FILE_SHARES_KEY });
    void queryClient.invalidateQueries({ queryKey: ["file-actions"] });
    onAnswered();
  };
  const yes = async () => {
    setBusy(true);
    try {
      await confirmFileShare(share.id);
      toast.success(t("confirmed"));
    } catch {
      toast.error(t("confirmFailed"));
    } finally {
      setBusy(false);
      done();
    }
  };
  const no = () => {
    toast.info(t("keptOpened"));
    done();
  };
  const buttons = (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" size="lg" disabled={busy} disabledReason={common("saving")} onClick={no} data-slot="send-question-no">
        <X className="size-4" />
        {t("no")}
      </Button>
      <Button size="lg" disabled={busy} disabledReason={common("saving")} onClick={() => void yes()} data-slot="send-question-yes">
        <Check className="size-4" />
        {t("yes")}
      </Button>
    </div>
  );
  if (inline) {
    return (
      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3" data-slot="send-question">
        <p className="text-base font-semibold">{t("askTitle")}</p>
        <p className="break-all text-sm">{body}</p>
        {buttons}
      </div>
    );
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("askTitle")}</DialogTitle>
        <DialogDescription className="break-all">{body}</DialogDescription>
      </DialogHeader>
      {buttons}
    </>
  );
}
