/**
 * The file's private link in a WhatsApp / email send (客户 11-08).
 *
 * The client clicked 发送 → WhatsApp on a Windows PC: WhatsApp stuck on its
 * splash screen, no chat opened, no PDF went - 「必须正常进入指定联系人的
 * WhatsApp 对话，用户能够实际发送PDF文件；未完成发送时，不能自动标记为已发送。」
 * A website cannot put a file into a WhatsApp chat (wa.me fills only the number
 * and the text), so the message carries a link to the file instead.
 *
 * The plumbing lives here, apart from the dialog, so it can be tested without a
 * page: which sends take this path, and the one click's steps in their order.
 */

import type { FileShare, SendRecipient, ShareLink } from "@/interfaces/file-action";
import { gmailComposeLink, mailtoLink, whatsappLink } from "@/lib/file-actions";

/** WhatsApp and Email send the file as a link; 其他 keeps the old buttons. */
export function sendsByLink(recipient: Pick<SendRecipient, "method"> | null | undefined): boolean {
  return recipient?.method === "WHATSAPP" || recipient?.method === "EMAIL";
}

/**
 * Whether a desktop send opens the send dialog rather than the share window:
 * always for WhatsApp / Email (the link), and for 其他 where this browser has
 * no share window for the file.
 */
export function sendsThroughDialog(options: {
  signs: boolean;
  action: string;
  recipient: Pick<SendRecipient, "method"> | null | undefined;
  canShare: boolean;
}): boolean {
  return options.signs && options.action === "share" && (sendsByLink(options.recipient) || !options.canShare);
}

/** Where the message is opened: WhatsApp, the computer's mail app, or Gmail in the browser. */
export type LinkVia = "whatsapp" | "mailto" | "gmail";

interface PopupLike {
  opener: unknown;
  location: { href: string };
  close: () => void;
}

export interface LinkSendDeps {
  /** The page's window: a blank one is opened from it straight away. */
  win: { open: (url: string, target: string) => PopupLike | null; location: { href: string } };
  /** The send already written (已打开分享窗口), or null - `writeLog` writes it. */
  share: FileShare | null;
  writeLog?: () => Promise<FileShare | null>;
  /** The link made by an earlier button of the same dialog: not made again. */
  existing?: ShareLink | null;
  attach: (share: string, file: File) => Promise<ShareLink>;
  /** The recipient's page for a token. */
  linkUrl: (token: string) => string;
  /** The message, with the link and its days in it. */
  text: (url: string, days: number) => string;
  /** The email's subject. */
  subject: string;
}

export type LinkSendResult =
  | { ok: true; made: ShareLink; url: string; target: string }
  | { ok: false; share: FileShare | null };

/** The address a message opens at. */
export function linkTarget(via: LinkVia, contact: string, subject: string, text: string): string {
  if (via === "whatsapp") return whatsappLink(text, contact);
  if (via === "gmail") return gmailComposeLink(contact, subject, text);
  return mailtoLink(subject, text, contact);
}

/**
 * One click on 「打开 {name} 的 WhatsApp 对话」, 「打开电邮发给 {name}」 or
 * 「用 Gmail 网页版发送」:
 *
 * 1. a blank window, opened at once from the click so no popup blocker stops
 *    it (WhatsApp and Gmail - the mail app opens from this page);
 * 2. the send written, if it is not yet (已打开分享窗口 - never 已确认发送);
 * 3. the file kept on the server for the link - once per dialog;
 * 4. the window pointed at the chat of the number typed in 「发给谁？」, or the
 *    email addressed to them, the text and the link filled in.
 *
 * Any failure closes the blank window and opens nothing.
 */
/**
 * The token out of whatever the chat app made the link (Lucas 11-08): WhatsApp
 * ran 「（30 天内有效）」 into the link, so the address ended in 「（30」. A
 * token is only letters, digits, - and _; the rest is not part of it.
 */
export function cleanShareToken(raw: string): string {
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // A broken % sequence: keep what came.
  }
  return /^[A-Za-z0-9_-]*/.exec(text)?.[0] ?? "";
}

export async function sendByLink(
  recipient: SendRecipient,
  file: File,
  via: LinkVia,
  deps: LinkSendDeps,
): Promise<LinkSendResult> {
  const popup = via === "mailto" ? null : deps.win.open("", "_blank");
  if (popup) popup.opener = null;
  let written = deps.share;
  try {
    let made = deps.existing ?? null;
    if (!made) {
      if (!written && deps.writeLog) written = await deps.writeLog();
      if (!written) throw new Error("not written");
      made = await deps.attach(written.id, file);
    }
    const url = deps.linkUrl(made.token);
    const contact = made.share.recipient_contact || recipient.recipient_contact;
    const target = linkTarget(via, contact, deps.subject, deps.text(url, made.days));
    if (popup) popup.location.href = target;
    else deps.win.location.href = target;
    return { ok: true, made, url, target };
  } catch {
    popup?.close();
    return { ok: false, share: written };
  }
}
