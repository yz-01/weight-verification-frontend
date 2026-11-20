/**
 * JB228 (客户 11-19: 「顾问不能查看建筑商内部的沟通记录」): the 整改 / 施工准证
 * chat panel, for a consultant who is not one of the room's people.
 *
 * The server sends no messages and no people and says ``chat_withheld``; the
 * panel shows one plain line in their place and no message box. Everyone else
 * gets the room as before.
 */
import { describe, expect, it, vi } from "vitest";

import type { HazardConversation } from "@/interfaces/site-operations";
import messages from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-consultant" }, can: () => true }),
}));
// The phone's saved-draft wrapper waits for storage before it draws; here it
// is the plain state it stands in for.
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

function conversation(overrides: Partial<HazardConversation>): HazardConversation {
  return {
    incident: { id: "h1", incident_no: "SI-001" } as HazardConversation["incident"],
    messages: [],
    participants: [],
    is_closed: false,
    audio_seconds_limit: 60,
    ...overrides,
  };
}

function open(data: HazardConversation) {
  return renderDetail(<HazardConversationPanel incidentId="h1" />, (client) =>
    client.setQueryData(["hazard-conversation", "h1"], data),
  );
}

describe("the 整改 chat panel (JB228)", () => {
  it("shows a consultant outside the room one line and no message box", () => {
    const html = open(conversation({ chat_withheld: true }));
    expect(html).toContain("data-chat-withheld");
    expect(html).toContain(messages.hazard.chatWithheld);
    expect(html).toContain("建筑商内部的沟通记录不显示给顾问。");
    expect(html).not.toContain('data-stub="messages"');
    expect(html).not.toContain('data-stub="composer"');
    expect(html).not.toContain(messages.hazard.participants);
  });

  it("shows the room as before to anyone in it", () => {
    const html = open(
      conversation({
        messages: [{ id: "m1", body: "Board fixed at level 3" } as HazardConversation["messages"][number]],
        participants: [{ id: "u1", full_name: "Ah Seng", is_reporter: true } as HazardConversation["participants"][number]],
      }),
    );
    expect(html).not.toContain("data-chat-withheld");
    expect(html).toContain("Board fixed at level 3");
    expect(html).toContain("Ah Seng");
    expect(html).toContain('data-stub="composer"');
  });
});
