/**
 * JB190 (Lucas 11-13: 「沟通采用左右沟通」, with the client's photograph of the
 * office's 沟通记录 page, where every message was a full-width row).
 *
 * The reader's own messages sit on the right, everybody else's on the left -
 * the bubbles the phone's chat has had since JB127 (客户 11-07 事项 7: 「好像
 * 微信上聊天」) - on the office's 沟通记录 page and in every record's 沟通记录
 * panel, which are one component (`RecordConversationPanel`).
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock("@/components/shared/record-detail-shell", () => ({
  PhotoViewer: () => <div data-viewer="open" />,
}));

const { ConversationMessageList } = await import("@/components/shared/conversation");

function line(id: string, author: string, author_name: string, body: string) {
  return {
    id,
    author,
    author_name,
    body,
    photo: null,
    watermarked_photo: null,
    audio: null,
    attachment: null,
    attachment_name: "",
    sent_at: "2026-11-10T12:07:00Z",
  };
}

const THREAD = [
  line("m-1", "u-ong", "ah ong", "可以发"),
  line("m-2", "u-mike", "mike", "ok"),
  line("m-3", "u-ong", "ah ong", "信息"),
];

function render(mineId?: string) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
      <ConversationMessageList messages={THREAD} emptyLabel="-" reference="PUTRA_MAS" mineId={mineId} />
    </NextIntlClientProvider>,
  );
}

/** Each message's side, in order, with whose it is. */
function sides(html: string): string[] {
  return [
    ...html.matchAll(
      /<li class="([^"]*)" data-bubble="(mine|theirs)">.*?<span class="font-medium">([^<]*)<\/span>/g,
    ),
  ].map(
    (found) =>
      `${found[3]}:${found[2]}:${found[1].includes("ml-auto") ? "right" : found[1].includes("mr-auto") ? "left" : "?"}`,
  );
}

describe("沟通记录: 左右对话", () => {
  it("my messages are on the right and the others' on the left", () => {
    expect(sides(render("u-mike"))).toEqual(["ah ong:theirs:left", "mike:mine:right", "ah ong:theirs:left"]);
  });

  it("it is the reader's own side that is on the right: the same thread read by ah ong", () => {
    expect(sides(render("u-ong"))).toEqual(["ah ong:mine:right", "mike:theirs:left", "ah ong:mine:right"]);
  });

  it("every message still says who and when", () => {
    const html = render("u-mike");
    for (const words of ["ah ong", "mike", "可以发", "ok", "信息"]) expect(html).toContain(words);
    // One time beside each name (in the reader's own date format).
    expect(html.match(/<span class="text-xs text-muted-foreground">[^<]*2026[^<]*<\/span>/g)?.length).toBe(3);
  });

  it("the office's panel asks for it too - the 沟通记录 page and every record window are that one panel", () => {
    const panel = readFileSync(path.resolve(__dirname, "record-conversation.tsx"), "utf8").replace(/\r\n/g, "\n");
    // Twice: the phone's chat room (JB127) and, since JB190, the office's panel.
    expect(panel.match(/mineId=\{user\?\.id\}/g)?.length).toBe(2);
    const office = panel.slice(panel.indexOf('<div className="space-y-3">'));
    expect(office).toContain("mineId={user?.id}");
    const page = readFileSync(path.resolve(__dirname, "../site-access/field-chats-office.tsx"), "utf8");
    expect(page).toContain("<RecordConversationPanel");
  });
});
