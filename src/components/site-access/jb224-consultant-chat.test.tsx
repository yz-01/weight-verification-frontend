/**
 * JB224 (客户 11-19 事项 4): the consultant and the project office talk to each other.
 *
 * 「目前总部已经开启顾问的沟通权限，顾问端却没有「找人沟通」按钮，项目后台的沟通联系人名单
 * 中也没有顾问。」 - 「顾问可以主动联系获授权项目的项目经理。项目经理可以主动联系该项目的
 * 顾问。双方支持发送文字、照片、语音及文件。所有沟通记录必须保存在对应项目内。顾问不能查看
 * 建筑商内部的沟通记录，也不能联系其他未授权项目的人员。」
 *
 * The server decides who is listed and refuses every other mix
 * (`contractor_ops/tests/test_jb224_consultant_chat.py`); these check what the
 * two screens show. Rendered to static markup: the runner has no DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
const CONSULTANT = {
  account_type: "CONSULTANT",
  company_type: null,
  is_field_staff: false,
  active_project: { project_id: "p-tower" },
  consultant_projects: [{ project_id: "p-tower", is_current: true }],
};
const reader = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/field-chats",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: reader.user, can: () => true, refresh: vi.fn() }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useCurrentProject: () => ({ active: true, projects: undefined }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: ({ kind, recordId, labels }: { kind: string; recordId: string; labels?: { title?: string } }) => (
    <div data-stub="conversation" data-kind={kind} data-record={recordId} data-title={labels?.title ?? ""} />
  ),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { FieldChatsOffice } = await import("@/components/site-access/field-chats-office");
const { OfficeFindPeople, OfficePersonGroup, mixBlock, personGroup, OFFICE_FIELD_CHATS_KEY } = await import(
  "@/components/site-access/field-chats-find"
);
const { OFFICE_CHAT_PROJECTS_KEY } = await import("@/services/field-conversations.service");
const { conversationClosedLine } = await import("@/lib/record-chat");
const { consultantSeesConversation } = await import("@/lib/consultant-modules");
const { isRouteAllowed } = await import("@/lib/navigation");
type Person = import("@/services/field-conversations.service").OfficeChatPerson;
type Chat = import("@/services/field-conversations.service").OfficeFieldChat;
const zh = (await import("@/messages/zh.json")).default;
const zhTW = (await import("@/messages/zh-TW.json")).default;
const en = (await import("@/messages/en.json")).default;
const ms = (await import("@/messages/ms.json")).default;

const PROJECTS = [{ id: "p-tower", code: "T", name: "Tower" }];
const PM: Person = { id: "u-pm", full_name: "项目经理", kind: "office", avatar: null };
const SAFETY: Person = { id: "u-safety", full_name: "安全主任", kind: "office", avatar: null };
const SITE: Person = { id: "u-site", full_name: "小陈", kind: "site_staff", avatar: null };
const HQ: Person = { id: "u-hq", full_name: "总部", kind: "head_office", avatar: null };
const LILY: Person = { id: "u-lily", full_name: "lily", kind: "consultant", organization: "示范顾问工程师事务所", avatar: null };
const LIN: Person = { id: "u-lin", full_name: "林工", kind: "consultant", organization: "示范顾问工程师事务所", avatar: null };

function seeded(people: Person[], chats?: Chat[], listKey: readonly unknown[] = [...OFFICE_FIELD_CHATS_KEY, "consultant"]) {
  return (client: import("@tanstack/react-query").QueryClient) => {
    client.setQueryData(OFFICE_CHAT_PROJECTS_KEY, PROJECTS);
    client.setQueryData(["field-chats", "people", "p-tower"], people);
    if (chats) client.setQueryData(listKey, { results: chats, count: chats.length });
    // The office list waits for its package threads too (JB189).
    client.setQueryData(["evidence-packages", "threads", "all"], { results: [], count: 0 });
  };
}

function chat(extra: Partial<Chat>): Chat {
  return {
    id: "c-1",
    kind: "DIRECT",
    title: "项目经理",
    project: "p-tower",
    project_name: "Tower",
    people: [{ id: "u-pm", name: "项目经理", phone_role: "office" }],
    member: true,
    message_count: 0,
    last: { author: "u-pm", author_name: "项目经理", body: "请明天来看三楼", photo: false, audio: false, attachment: false, sent_at: "2026-11-19T08:00:00Z" },
    last_at: "2026-11-19T08:00:00Z",
    unread: 0,
    ...extra,
  };
}

describe("JB224 · 顾问端「找人沟通」 (事项 4)", () => {
  afterEach(() => {
    nav.search = "";
    reader.user = null;
  });

  it("opens 沟通记录 - and so 【找人沟通】 - only with head office's 「沟通记录」 tick", () => {
    // What `consultant_features` gives with and without the tick.
    const base = ["dashboard", "consultant_menu"];
    expect(isRouteAllowed("MSE_TRACE", base, "/field-chats")).toBe(false);
    expect(isRouteAllowed("MSE_TRACE", [...base, "field_chats"], "/field-chats")).toBe(true);
  });

  it("gives the consultant 【找人沟通】 and says what his list holds", () => {
    reader.user = CONSULTANT;
    const html = renderDetail(<FieldChatsOffice />, seeded([], []));
    expect(html).toContain("data-consultant-find-open");
    expect(html).toContain(zh.fieldChats.find.title);
    expect(html).toContain(zh.fieldChats.consultant.subtitle);
    expect(zh.fieldChats.consultant.subtitle).toContain("您和本项目后台的对话");
    expect(html).toContain(zh.fieldChats.consultant.empty);
    expect(zh.fieldChats.consultant.empty).toContain("「找人沟通」");
  });

  it("lists his conversation with the project office, with what he has not read, and opens it here", () => {
    reader.user = CONSULTANT;
    const html = renderDetail(<FieldChatsOffice />, seeded([], [chat({ unread: 2 })]));
    expect(html).toContain('data-consultant-chat-row="DIRECT"');
    expect(html).toContain(zh.fieldChats.consultant.kind.DIRECT);
    expect(html).toContain('data-unread="2"');
    expect(html).toContain("项目经理：请明天来看三楼");
    // A notice's link opens it on the right, with its people.
    nav.search = "chat=c-1&project=p-tower";
    const opened = renderDetail(<FieldChatsOffice />, seeded([], [chat({})]));
    expect(opened).toContain('data-stub="conversation"');
    expect(opened).toContain('data-kind="DIRECT"');
    expect(opened).toContain('data-record="c-1"');
    expect(opened).toContain("成员：项目经理");
    // The message box is the shared one: text, photo, voice and file, for him too.
    expect(consultantSeesConversation("CONSULTANT", "DIRECT")).toBe(true);
    expect(consultantSeesConversation("CONSULTANT", "MATERIAL_RECEIPT")).toBe(false);
  });

  it("his finder lists the project office and says so; nobody there says what to do", () => {
    reader.user = CONSULTANT;
    const html = renderDetail(
      <OfficeFindPeople project="p-tower" onBack={() => {}} onStarted={() => {}} />,
      seeded([PM, SAFETY]),
    );
    expect(html).toContain(zh.fieldChats.find.hintConsultant);
    expect(html).not.toContain(zh.fieldChats.find.hint);
    expect([...html.matchAll(/data-person-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["office"]);
    const empty = renderDetail(
      <OfficeFindPeople project="p-tower" onBack={() => {}} onStarted={() => {}} />,
      seeded([]),
    );
    expect(empty).toContain(zh.fieldChats.find.noOfficeForConsultant);
  });
});

describe("JB224 · 项目后台的联系人名单有顾问 (事项 4)", () => {
  afterEach(() => {
    reader.user = null;
  });

  it("shows the project's consultants last, with their firm, and the truthful hint", () => {
    reader.user = { company_type: "CONTRACTOR", is_field_staff: false };
    const html = renderDetail(
      <OfficeFindPeople project="p-tower" onBack={() => {}} onStarted={() => {}} />,
      seeded([SITE, PM, HQ, LILY]),
    );
    expect([...html.matchAll(/data-person-group="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "phone",
      "office",
      "head_office",
      "consultant",
    ]);
    expect(html).toContain(zh.fieldChats.find.group.consultant);
    expect(html).toContain(`${zh.fieldChats.find.kind.consultant} · 示范顾问工程师事务所`);
    expect(html).toContain(zh.fieldChats.find.hint);
    expect(zh.fieldChats.find.hint).toContain("本项目顾问");
    expect(zh.fieldChats.find.hint).toContain("顾问只和本项目后台在同一个对话里");
    expect(zh.fieldChats.subtitle).toContain("和顾问的对话");
  });

  it("one consultant with office people only: the others grey out and say why", () => {
    expect(personGroup(LILY)).toBe("consultant");
    expect(mixBlock(SITE, [LILY])).toBe("consultantChosen");
    expect(mixBlock(HQ, [LILY])).toBe("consultantChosen");
    expect(mixBlock(LIN, [LILY])).toBe("oneConsultant");
    expect(mixBlock(LILY, [SITE])).toBe("notWithConsultant");
    expect(mixBlock(LILY, [HQ])).toBe("notWithConsultant");
    expect(mixBlock(LILY, [PM, SAFETY])).toBe("");
    expect(mixBlock(PM, [LILY])).toBe("");
    // JB158's rule stays.
    expect(mixBlock(HQ, [SITE])).toBe("phoneChosen");
    expect(mixBlock(SITE, [HQ])).toBe("headOfficeChosen");

    const phones = renderDetail(
      <OfficePersonGroup name="phone" rows={[SITE]} chosen={[LILY.id]} chosenPeople={[LILY]} onToggle={() => {}} />,
    );
    expect(phones).toContain('data-mix-reason="consultantChosen"');
    expect(phones).toContain(zh.fieldChats.find.mix.consultantChosen);
    // The second consultant in the same group says it too, under the heading.
    const consultants = renderDetail(
      <OfficePersonGroup name="consultant" rows={[LILY, LIN]} chosen={[LILY.id]} chosenPeople={[LILY]} onToggle={() => {}} />,
    );
    expect(consultants).toContain('data-mix-reason="oneConsultant"');
    expect(consultants).toContain(zh.fieldChats.find.mix.oneConsultant);
    const blocked = renderDetail(
      <OfficePersonGroup name="consultant" rows={[LILY]} chosen={[SITE.id]} chosenPeople={[SITE]} onToggle={() => {}} />,
    );
    expect(blocked).toContain(zh.fieldChats.find.mix.notWithConsultant);
  });

  it("marks a conversation with a consultant on the office list", () => {
    reader.user = { company_type: "CONTRACTOR", is_field_staff: false };
    const withHim = chat({
      kind: undefined,
      title: "lily",
      people: [
        { id: "u-pm", name: "项目经理", phone_role: "office" },
        { id: "u-lily", name: "lily", phone_role: "consultant" },
      ],
    });
    const html = renderDetail(<FieldChatsOffice />, seeded([], [withHim], [...OFFICE_FIELD_CHATS_KEY, "all"]));
    expect(html).toContain("data-with-consultant");
    expect(html).toContain(zh.fieldChats.find.kind.consultant);
    const without = renderDetail(<FieldChatsOffice />, seeded([], [chat({ kind: undefined })], [...OFFICE_FIELD_CHATS_KEY, "all"]));
    expect(without).not.toContain("data-with-consultant");
  });

  it("says why the builder can only read it when head office switched him off", () => {
    expect(conversationClosedLine("consultant_off", "DIRECT")).toBe("recordChat.closedConsultantOff");
    expect(zh.recordChat.closedConsultantOff).toBe(
      "顾问在这个项目的沟通权限已经关闭（或授权已经结束），这个对话只能查看，不能再发送。",
    );
    for (const messages of [zhTW, en, ms]) {
      expect(messages.recordChat.closedConsultantOff).toBeTruthy();
      expect(messages.fieldChats.find.mix.oneConsultant).toBeTruthy();
      expect(messages.fieldChats.consultant.kind.DIRECT).toBeTruthy();
    }
  });
});
