/**
 * JB224 audit 11-19 F4: the consultant's conversation with the project office,
 * closed by head office (「沟通记录」 unticked) or an ended grant while his
 * screen is still open.
 *
 * Plan JB224-6: 「这个沟通现在打不开：总部关闭了您在这个项目的「沟通记录」，或授权已经
 * 结束。」 He read 「这条记录不在你这个账号的范围内。」 and 「事项沟通读取失败，请重试。」 -
 * retrying never helps. The server now answers `consultant_chat_closed`
 * (`contractor_ops/tests/test_jb224_consultant_chat.py`); this checks the panel
 * says that sentence in place of the conversation. Rendered to static markup
 * with the real panel: the runner has no DOM.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/field-chats",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-lily", account_type: "CONSULTANT" }, can: () => true, refresh: vi.fn() }),
}));
// The draft store loads on the device after the first paint; here it only
// passes the panel through.
vi.mock("@/components/field-staff/field-draft", async () => {
  const React = await import("react");
  return {
    FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    // (key, initial): the initial value, kept in plain state.
    useDraftState: (...args: unknown[]) => React.useState(args[1]),
    useClearDraft: () => () => {},
  };
});

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { RecordConversationPanel } = await import("@/components/shared/record-conversation");
const { ApiError } = await import("@/interfaces/api");
const { recordConversationKey } = await import("@/lib/record-chat");
const zh = (await import("@/messages/zh.json")).default;

const KEY = recordConversationKey("DIRECT", "c-9");

/** The conversation he had open, then its next read refused with `error`. */
function readRefused(error: Error) {
  return (client: import("@tanstack/react-query").QueryClient) => {
    client.setQueryData(KEY, {
      kind: "DIRECT",
      record: "c-9",
      reference: "",
      messages: [],
      closed: "",
      audio_seconds_limit: 60,
      cleared_notices: 0,
    });
    client.getQueryCache().find({ queryKey: KEY })!.setState({ status: "error", error, errorUpdatedAt: 1 });
  };
}

describe("JB224 audit 11-19 F4 · 顾问的对话被总部关闭", () => {
  it("says head office closed it and whom to ask - not 「请重试」, and no message box", () => {
    const sentence = zh.errors.api.consultant_chat_closed;
    const html = renderDetail(
      <RecordConversationPanel kind="DIRECT" recordId="c-9" />,
      readRefused(new ApiError(sentence, 403, {}, "consultant_chat_closed")),
    );
    expect(html).toContain("data-chat-shut");
    expect(html).toContain(sentence);
    expect(sentence).toContain("请联系建筑商总部");
    expect(html).not.toContain(zh.recordChat.failed);
    expect(html).not.toContain("<textarea");
  });
});
