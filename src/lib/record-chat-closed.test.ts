import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

import { conversationClosedLine, recordConversationKey } from "./record-chat";

/**
 * A finished record's conversation closes (T-398, D-278).
 *
 * `get_conversation` says `closed: "" | "archived" | "paid"`, and
 * `post_message` refuses with 409 `conversation_closed` once it is set
 * (backend `contractor_ops/record_chat.py`, `closed_reason`). The screen keeps
 * the history, drops the composer and says why; whatever finishes the record
 * on the same screen refetches the conversation so this happens without a
 * reload.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("which line replaces the composer", () => {
  it("is nothing while the conversation is open", () => {
    expect(conversationClosedLine("")).toBeNull();
    expect(conversationClosedLine(undefined)).toBeNull();
    expect(conversationClosedLine(null)).toBeNull();
  });

  it("names the reason the server gave", () => {
    expect(conversationClosedLine("archived")).toBe("recordChat.closedArchived");
    expect(conversationClosedLine("paid")).toBe("recordChat.closedPaid");
  });

  it("still closes for a reason this screen does not know yet", () => {
    expect(conversationClosedLine("something-new")).toBe("recordChat.closedArchived");
  });

  it("says the customer's sentences", () => {
    expect(zh.recordChat.closedArchived).toBe("已归档，聊天室已关闭。记录仍可查看。");
    expect(zh.recordChat.closedPaid).toBe("已确认付款，聊天室已关闭。记录仍可查看。");
  });
});

describe("the panel", () => {
  const panel = read("src/components/shared/record-conversation.tsx");

  it("keeps the history and swaps the whole composer for the reason", () => {
    expect(panel).toMatch(/const closedLine = conversationClosedLine\(data\.closed\)/);
    // The messages are rendered unconditionally, before the closed branch.
    expect(panel.indexOf("data.messages.map(")).toBeGreaterThan(-1);
    expect(panel.indexOf("data.messages.map(")).toBeLessThan(panel.indexOf("{closedLine ? ("));
    expect(panel).toMatch(/\{closedLine \? \([\s\S]{0,200}\{t\(closedLine\)\}[\s\S]{0,40}\) : \([\s\S]{0,40}<ConversationComposer/);
    expect(panel.match(/<ConversationComposer/g)).toHaveLength(1);
  });

  it("refetches when a send is refused because somebody else closed it", () => {
    expect(panel).toMatch(/reason\.code === "conversation_closed"[\s\S]{0,120}invalidateQueries\(\{\s*queryKey: recordConversationKey\(kind, recordId\)/);
  });

  it("reads the shared key", () => {
    expect(panel).toMatch(/queryKey: recordConversationKey\(kind, recordId\)/);
    expect(recordConversationKey("SUNDRY_CLAIM", "c1")).toEqual(["record-conversation", "SUNDRY_CLAIM", "c1"]);
  });
});

describe("finishing a record on the same screen closes its chat without a reload", () => {
  it("【确认归档】 invalidates the conversation", () => {
    const closure = read("src/components/shared/record-closure.tsx");
    expect(closure).toMatch(/onSuccess: \(\) => \{[\s\S]{0,700}invalidateQueries\(\{\s*queryKey: recordConversationKey\(kind, recordId\)/);
  });

  it("【确认已付款】 invalidates the sundry claim's conversation", () => {
    const office = read("src/components/sundry-claims/sundry-claims-office.tsx");
    expect(office).toMatch(/confirmSundryClaimPaid\(id\),\s*onSuccess: \(\) => \{[\s\S]{0,300}recordConversationKey\("SUNDRY_CLAIM", id\)/);
  });
});

describe("the refusal is worded in every language", () => {
  it.each([["en", en], ["zh", zh], ["zh-TW", zhTW], ["ms", ms]] as const)("%s", (_locale, catalogue) => {
    expect(catalogue.errors.api.conversation_closed).toBeTruthy();
    expect(catalogue.recordChat.closedArchived).toBeTruthy();
    expect(catalogue.recordChat.closedPaid).toBeTruthy();
  });
});
