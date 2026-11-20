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
const {
  OfficeFindPeople,
  OfficePersonGroup,
  mixBlock,
  personGroup,
  narrowChatLayout,
  startRefusal,
  OFFICE_FIELD_CHATS_KEY,
} = await import("@/components/site-access/field-chats-find");
const { OFFICE_CHAT_PROJECTS_KEY } = await import("@/services/field-conversations.service");
const {
  conversationClosedLine,
  consultantChatClosed,
  consultantChatPoll,
  listReadAfter,
  CLOSED_WHILE_OPEN_CODES,
  CONSULTANT_CHAT_POLL_MS,
} = await import("@/lib/record-chat");
const { ApiError } = await import("@/interfaces/api");
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

describe("JB224 audit 11-19 fixes", () => {
  afterEach(() => {
    nav.search = "";
    reader.user = null;
  });
  const listClass = (html: string) => /<ul class="([^"]*)" data-field-chats/.exec(html)?.[1];
  const OFFICE = { company_type: "CONTRACTOR", is_field_staff: false };

  it("F2: on a phone 【找人沟通】 or a row takes the screen, with 【返回沟通列表】; wide, side by side as before", () => {
    expect(narrowChatLayout(false)).toEqual({ list: "", panel: "hidden lg:block" });
    expect(narrowChatLayout(true)).toEqual({ list: "hidden lg:block", panel: "" });
    // Nothing open: the list shows on a phone, the empty right-hand panel does not.
    reader.user = CONSULTANT;
    const list = renderDetail(<FieldChatsOffice />, seeded([], [chat({})]));
    expect(listClass(list)).toBe("space-y-2");
    expect(list).toContain('class="surface-panel min-h-64 rounded-xl p-4 hidden lg:block"');
    expect(list).not.toContain("data-chat-back");
    // A conversation open (a row, or a notice's link): it has the screen.
    nav.search = "chat=c-1&project=p-tower";
    const opened = renderDetail(<FieldChatsOffice />, seeded([], [chat({})]));
    expect(listClass(opened)).toBe("space-y-2 hidden lg:block");
    expect(opened).toContain('class="surface-panel min-h-64 rounded-xl p-4"');
    expect(opened).toContain("data-chat-back");
    expect(opened).toContain(zh.fieldChats.backToList);
    expect(opened).toContain('data-stub="conversation"');
    // The office page had the same fault: the same cure.
    reader.user = OFFICE;
    nav.search = "chat=c-1";
    const office = renderDetail(
      <FieldChatsOffice />,
      seeded([], [chat({ kind: undefined })], [...OFFICE_FIELD_CHATS_KEY, "all"]),
    );
    expect(listClass(office)).toBe("space-y-2 hidden lg:block");
    expect(office).toContain(zh.fieldChats.backToList);
    // The finder: the same 【返回沟通列表】 on a phone, its arrow on a wide screen.
    reader.user = CONSULTANT;
    const finder = renderDetail(
      <OfficeFindPeople project="p-tower" onBack={() => {}} onStarted={() => {}} />,
      seeded([PM]),
    );
    expect(finder).toContain("data-chat-back");
    expect(finder).toContain(zh.fieldChats.backToList);
    expect(finder).toContain("hidden lg:inline-flex");
    for (const messages of [zhTW, en, ms]) expect(messages.fieldChats.backToList).toBeTruthy();
  });

  it("F3: head office's 「沟通记录」 tick says it opens 找人沟通 both ways, and what unticking does", () => {
    const hint = zh.consultantAccess.moduleHint.conversations;
    expect(hint).toContain("他和本项目后台可以互相「找人沟通」");
    expect(hint).toContain("文字、照片、语音、文件");
    expect(hint).toContain("取消勾选后双方都不能再发送，记录保留");
    expect(zhTW.consultantAccess.moduleHint.conversations).toContain("找人溝通");
    expect(en.consultantAccess.moduleHint.conversations).toContain("each other");
    expect(ms.consultantAccess.moduleHint.conversations).toContain("antara satu sama lain");
  });

  it("F4: his own conversation closed by head office says so and whom to ask; the PM's race says the consultant's line", () => {
    const shut = new ApiError(zh.errors.api.consultant_chat_closed, 403, {}, "consultant_chat_closed");
    expect(consultantChatClosed(shut)).toBe(zh.errors.api.consultant_chat_closed);
    expect(consultantChatClosed(new ApiError(zh.errors.api.record_not_found, 404, {}, "record_not_found"))).toBeNull();
    expect(consultantChatClosed(undefined)).toBeNull();
    expect(zh.errors.api.consultant_chat_closed).toContain("建筑商总部已经关闭了您在这个项目的「沟通记录」");
    expect(zh.errors.api.consultant_chat_closed).toContain("请联系建筑商总部");
    expect(zh.errors.api.consultant_chat_closed).not.toContain("重试");
    // The PM sending in the same moment: re-read, so the composer gives way
    // to the 「顾问…已经关闭」 line - and the toast says that line too.
    expect(CLOSED_WHILE_OPEN_CODES).toEqual(["conversation_closed", "chat_consultant_off"]);
    expect(zh.errors.api.chat_consultant_off).toBe(zh.recordChat.closedConsultantOff);
    for (const messages of [zhTW, en, ms]) {
      expect(messages.errors.api.consultant_chat_closed).toBeTruthy();
      expect(messages.errors.api.chat_consultant_off).toBe(messages.recordChat.closedConsultantOff);
    }
  });

  it("F5: his finder says who reads his conversation - the people in it, this project's office, head office", () => {
    expect(zh.fieldChats.find.hintConsultant).toBe(
      "只列出本项目的项目后台人员。对话保存在这个项目里；对话里的人、本项目后台和建筑商总部都可以查看。",
    );
    expect(en.fieldChats.find.hintConsultant).toContain("this project's office");
  });

  it("F6: reading a conversation re-reads 「沟通记录」's red numbers at once", () => {
    expect(listReadAfter("DIRECT")).toEqual(OFFICE_FIELD_CHATS_KEY);
    expect(listReadAfter("FIELD_TASK")).toEqual(OFFICE_FIELD_CHATS_KEY);
    expect(listReadAfter("CONSULTANT_APPLICATION")).toEqual(OFFICE_FIELD_CHATS_KEY);
    expect(listReadAfter("MATERIAL_RECEIPT")).toBeNull();
  });

  it("F7: an open conversation is read again for a consultant, whom no live stream serves", () => {
    expect(consultantChatPoll("CONSULTANT", false)).toBe(CONSULTANT_CHAT_POLL_MS);
    expect(CONSULTANT_CHAT_POLL_MS).toBeLessThanOrEqual(15_000);
    // A refusal is not asked again every few seconds; the office keeps its stream.
    expect(consultantChatPoll("CONSULTANT", true)).toBe(false);
    expect(consultantChatPoll("TENANT", false)).toBe(false);
  });

  it("F10: a refused start says the true reason, once", () => {
    expect(startRefusal(new ApiError(zh.errors.api.chat_people_invalid, 400, {}, "chat_people_invalid"))).toEqual({
      key: "listChanged",
    });
    expect(zh.fieldChats.find.listChanged).toBe("名单已经变了，请返回重新选人。");
    const off = new ApiError(zh.errors.api.consultant_module_not_granted, 403, {}, "consultant_module_not_granted");
    expect(startRefusal(off)).toEqual({ message: zh.errors.api.consultant_module_not_granted });
    // 「请再试一次」 only when the server never answered.
    expect(startRefusal(new ApiError("无法连接服务器。", 0))).toEqual({ key: "startFailed" });
    expect(startRefusal(new Error("boom"))).toEqual({ key: "startFailed" });
    for (const messages of [zhTW, en, ms]) expect(messages.fieldChats.find.listChanged).toBeTruthy();
  });
});
