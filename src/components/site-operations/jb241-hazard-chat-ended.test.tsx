/**
 * JB241 (客户 11-23 事项 13, 图 13–15): a 整改 / EHS item that has ended shows
 * 「已结束」 and no message box - on the office page and on the phone, which
 * draw the same panel from the same server answer.
 *
 * 「事项确认结束后，双方必须同步显示「已结束」。」
 * 「结束后不能继续发送文字、照片、文件及语音。」
 * 「原有沟通记录、附件、操作人及时间全部保留，可查看，不可修改。」
 * 「未结束的事项继续正常沟通。」
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { HazardConversation } from "@/interfaces/site-operations";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-ahong" }, can: () => true }),
}));
vi.mock("@/components/field-staff/field-draft", () => ({
  FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useClearDraft: () => () => {},
  useDraftState: (_key: string, initial?: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    () => {},
  ],
}));
vi.mock("@/hooks/use-bell-refresh-on-read", () => ({ useBellRefreshOnRead: () => {} }));
vi.mock("@/hooks/use-new-message-tone", () => ({ useNewMessageTone: () => {} }));
vi.mock("@/components/shared/conversation", () => ({
  FALLBACK_AUDIO_LIMIT: 60,
  ConversationMessageList: ({ messages: rows }: { messages: Array<{ body: string }> }) => (
    <div data-stub="messages">{rows.map((row) => row.body).join(" | ")}</div>
  ),
  ConversationComposer: () => <div data-stub="composer" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { HazardConversationPanel } = await import("@/components/site-operations/hazard-conversation");

const SAID = [
  { id: "m1", body: "Done", author_name: "ah ong" },
  { id: "m2", body: "ok", author_name: "lily" },
] as HazardConversation["messages"];

function conversation(overrides: Partial<HazardConversation>): HazardConversation {
  return {
    incident: { id: "h1", incident_no: "SI-PRJ-0003-005" } as HazardConversation["incident"],
    messages: SAID,
    participants: [],
    is_closed: false,
    closed_reason: "",
    audio_seconds_limit: 60,
    ...overrides,
  };
}

function open(data: HazardConversation) {
  return renderDetail(<HazardConversationPanel incidentId="h1" />, (client) =>
    client.setQueryData(["hazard-conversation", "h1"], data),
  );
}

describe("an ended 整改 (JB241)", () => {
  it("says 已结束, keeps every message and offers no message box", () => {
    const html = open(conversation({ is_closed: true, closed_reason: "completed" }));
    expect(html).toContain(zh.hazard.endedBadge);
    expect(html).toContain("已结束");
    expect(html).toContain(zh.hazard.ended);
    expect(html).toContain("data-hazard-chat-ended");
    expect(html).toContain("Done | ok");
    expect(html).not.toContain('data-stub="composer"');
  });

  it("keeps the archived words for an archived one, still 已结束", () => {
    const html = open(conversation({ is_closed: true, closed_reason: "archived" }));
    expect(html).toContain(zh.hazard.closed);
    expect(html).toContain(zh.hazard.endedBadge);
    expect(html).not.toContain('data-stub="composer"');
  });

  it("a closed answer from an older server still closes the box", () => {
    const html = open(conversation({ is_closed: true, closed_reason: undefined }));
    expect(html).toContain(zh.hazard.ended);
    expect(html).not.toContain('data-stub="composer"');
  });

  it("an item not ended keeps talking", () => {
    const html = open(conversation({}));
    expect(html).toContain('data-stub="composer"');
    expect(html).not.toContain("data-hazard-chat-ended");
    expect(html).not.toContain(zh.hazard.endedBadge);
  });

  it("the office page, the phone page and the permit all draw this one panel", () => {
    const root = join(process.cwd(), "src", "components");
    for (const file of [
      "site-operations/safety.tsx",
      "site-operations/field-hazards.tsx",
      "field-staff/field-talk-panel.tsx",
      "permits/permit-parts.tsx",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).toContain("<HazardConversationPanel");
    }
  });

  it("a refusal because it ended reloads the room", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "components", "site-operations", "hazard-conversation.tsx"),
      "utf8",
    );
    expect(source).toMatch(/HAZARD_ENDED_CODES = new Set\(\["hazard_chat_ended", "hazard_closed"\]\)/);
    expect(source).toMatch(/onError:[\s\S]*HAZARD_ENDED_CODES\.has\(error\.code\)[\s\S]*"hazard-conversation", incidentId/);
  });

  it("has its words in all four languages", () => {
    for (const [language, words] of Object.entries({ zh, "zh-TW": zhTW, en, ms })) {
      expect(words.hazard.ended, language).toBeTruthy();
      expect(words.hazard.endedBadge, language).toBeTruthy();
      expect(words.errors.api.hazard_chat_ended, language).toContain("{incident_no}");
    }
    expect(zh.hazard.endedBadge).toBe("已结束");
    expect(zhTW.hazard.endedBadge).toBe("已結束");
    // The UI speaks 你, never 您.
    for (const text of [zh.hazard.ended, zh.errors.api.hazard_chat_ended, zhTW.hazard.ended]) {
      expect(text).not.toContain("您");
    }
  });
});
