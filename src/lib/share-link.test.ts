/**
 * 客户 11-08: 「必须正常进入指定联系人的 WhatsApp 对话，用户能够实际发送PDF文件；
 * 未完成发送时，不能自动标记为已发送。」 The file goes as a private link in the
 * message; WhatsApp opens on the chosen contact's chat with it filled in.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { FileShare, SendRecipient, ShareLink } from "@/interfaces/file-action";
import { gmailComposeLink, mailtoLink } from "@/lib/file-actions";
import { cleanShareToken, linkTarget, sendByLink, sendsByLink, sendsThroughDialog, type LinkSendDeps } from "@/lib/share-link";

const share = (overrides: Partial<FileShare> = {}): FileShare => ({
  id: "s1",
  created_at: "2026-11-08T02:00:00Z",
  sent_by_name: "Lucas",
  method: "WHATSAPP",
  recipient_name: "Ah Kow",
  recipient_company: "",
  recipient_contact: "012-345 6789",
  subject: "GRN-001",
  file_name: "GRN-001.pdf",
  record_kind: "MATERIAL_RECEIPT",
  record_id: "r1",
  part: "",
  status: "OPENED",
  confirmed_at: null,
  confirmed_by_name: "",
  ...overrides,
});

const whatsappTo: SendRecipient = {
  method: "WHATSAPP",
  recipient_name: "Ah Kow",
  recipient_company: "",
  recipient_contact: "012-345 6789",
};
const emailTo: SendRecipient = {
  method: "EMAIL",
  recipient_name: "QS",
  recipient_company: "",
  recipient_contact: "qs@owner.test",
};
const file = new File(["%PDF-1.4"], "GRN-001.pdf", { type: "application/pdf" });

function harness(overrides: Partial<LinkSendDeps> = {}, sent: FileShare = share()) {
  const popup = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
  const win = { open: vi.fn(() => popup), location: { href: "" } };
  const made: ShareLink = { share: { ...sent, has_link: true }, token: "tok123", expires_at: "2026-12-08T02:00:00Z", days: 30 };
  const deps: LinkSendDeps = {
    win,
    share: null,
    writeLog: vi.fn(async () => sent),
    attach: vi.fn(async () => made),
    linkUrl: (token) => `https://trace.example/s/${token}`,
    text: (url, days) => `GRN-001\nPDF：${url}（${days} 天内有效）`,
    subject: "GRN-001",
    ...overrides,
  };
  return { popup, win, deps, made };
}

describe("which sends carry a link", () => {
  it("WhatsApp and Email go through the link dialog even where a share window could take the file", () => {
    expect(sendsByLink(whatsappTo)).toBe(true);
    expect(sendsByLink(emailTo)).toBe(true);
    expect(sendsByLink({ method: "OTHER" })).toBe(false);
    for (const recipient of [whatsappTo, emailTo]) {
      expect(sendsThroughDialog({ signs: true, action: "share", recipient, canShare: true })).toBe(true);
    }
    // 其他 keeps today's share window where there is one, the trio where not.
    expect(sendsThroughDialog({ signs: true, action: "share", recipient: { method: "OTHER" }, canShare: true })).toBe(false);
    expect(sendsThroughDialog({ signs: true, action: "share", recipient: { method: "OTHER" }, canShare: false })).toBe(true);
    // The phone is unchanged.
    expect(sendsThroughDialog({ signs: false, action: "share", recipient: null, canShare: true })).toBe(false);
  });

  it("the shared send flow asks this rule, with the recipient carried to the dialog", () => {
    const actions = readFileSync(resolve(process.cwd(), "src/components/shared/file-actions.tsx"), "utf8");
    expect(actions).toContain("sendsThroughDialog({ signs, action, recipient, canShare: canShareFile(file) })");
    expect(actions).toContain("source, writeLog, recipient })");
  });
});

describe("one click on 打开 WhatsApp 对话", () => {
  it("opens a blank window first, writes the send, keeps the file, then points the window at wa.me/60… with the link", async () => {
    const { popup, win, deps } = harness();

    const result = await sendByLink(whatsappTo, file, "whatsapp", deps);

    expect(result.ok).toBe(true);
    expect(win.open).toHaveBeenCalledWith("", "_blank");
    expect(popup.opener).toBeNull();
    expect(deps.writeLog).toHaveBeenCalledTimes(1);
    expect(deps.attach).toHaveBeenCalledWith("s1", file);
    expect(popup.location.href).toMatch(/^https:\/\/wa\.me\/60123456789\?text=/);
    const text = decodeURIComponent(popup.location.href.split("?text=")[1]);
    expect(text).toContain("https://trace.example/s/tok123");
    expect(text).toContain("30 天内有效");
    expect(win.location.href).toBe("");
  });

  it("a failed attach closes the blank window and opens nothing", async () => {
    const { popup, win, deps } = harness({ attach: vi.fn(async () => Promise.reject(new Error("413"))) });

    const result = await sendByLink(whatsappTo, file, "whatsapp", deps);

    expect(result.ok).toBe(false);
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe("");
    expect(win.location.href).toBe("");
  });

  it("a send the server refused attaches nothing and opens nothing", async () => {
    const { popup, win, deps } = harness({ writeLog: vi.fn(async () => null) });
    const result = await sendByLink(whatsappTo, file, "whatsapp", deps);
    expect(result.ok).toBe(false);
    expect(deps.attach).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalled();
    expect(win.location.href).toBe("");
  });

  it("without a popup window it opens WhatsApp in this page", async () => {
    const { win, deps } = harness();
    win.open.mockReturnValue(null as never);
    await sendByLink(whatsappTo, file, "whatsapp", deps);
    expect(win.location.href).toMatch(/^https:\/\/wa\.me\/60123456789\?text=/);
  });
});

describe("Email: the mail app or Gmail, addressed and filled in", () => {
  const sent = share({ method: "EMAIL", recipient_contact: "qs@owner.test" });

  it("the mail app opens in this page with to, subject and the link", async () => {
    const { win, deps } = harness({}, sent);
    const result = await sendByLink(emailTo, file, "mailto", deps);
    expect(result.ok).toBe(true);
    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.href.startsWith("mailto:qs@owner.test?subject=GRN-001&body=")).toBe(true);
    expect(decodeURIComponent(win.location.href)).toContain("https://trace.example/s/tok123");
  });

  it("Gmail opens in the pre-opened tab with to, su and body", async () => {
    const { popup, deps } = harness({}, sent);
    await sendByLink(emailTo, file, "gmail", deps);
    const url = new URL(popup.location.href);
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("fs")).toBe("1");
    expect(url.searchParams.get("to")).toBe("qs@owner.test");
    expect(url.searchParams.get("su")).toBe("GRN-001");
    expect(url.searchParams.get("body")).toContain("https://trace.example/s/tok123");
  });

  it("the second button reuses the link: the send is written and the file kept once", async () => {
    const first = harness({}, sent);
    const done = await sendByLink(emailTo, file, "mailto", first.deps);
    if (!done.ok) throw new Error("first failed");
    const second = harness({ existing: done.made, share: done.made.share }, sent);
    await sendByLink(emailTo, file, "gmail", second.deps);
    expect(second.deps.writeLog).not.toHaveBeenCalled();
    expect(second.deps.attach).not.toHaveBeenCalled();
    expect(second.popup.location.href).toContain("mail.google.com");
  });

  it("the URLs encode the address, subject and body", () => {
    const mail = mailtoLink("收料单 GRN-001", "PDF：https://x/s/a?b=1&c", "qs+site@owner.test");
    expect(mail).toBe(
      `mailto:qs%2Bsite@owner.test?subject=${encodeURIComponent("收料单 GRN-001")}&body=${encodeURIComponent("PDF：https://x/s/a?b=1&c")}`,
    );
    const gmail = new URL(gmailComposeLink("qs@owner.test", "收料单", "a&b=c"));
    expect(gmail.searchParams.get("su")).toBe("收料单");
    expect(gmail.searchParams.get("body")).toBe("a&b=c");
    expect(linkTarget("whatsapp", "0123456789", "s", "hi")).toBe("https://wa.me/60123456789?text=hi");
  });
});

describe("a link the chat app ran text into still opens (Lucas 11-08)", () => {
  const token = "FFVXtJFquDGwVqQ_PKSmKDhjgVdhgisRbV8DGBYxkRE";
  it("drops what WhatsApp glued onto the token", () => {
    expect(cleanShareToken(`${token}${encodeURIComponent("（30")}`)).toBe(token);
    expect(cleanShareToken(`${token}（30`)).toBe(token);
    expect(cleanShareToken(`${token})`)).toBe(token);
    expect(cleanShareToken(token)).toBe(token);
    expect(cleanShareToken("%E0%A4%A")).toBe("");
  });

  it("the message line ends with the link, so nothing can run into it", () => {
    for (const locale of ["zh", "zh-TW", "en", "ms"]) {
      const catalogue = JSON.parse(readFileSync(resolve(`src/messages/${locale}.json`), "utf8"));
      expect(catalogue.fileActions.link.messageLine.endsWith("{link}")).toBe(true);
    }
  });
});

