/**
 * 后台「沟通记录」 and its 找人沟通 (JB158, 客户 11-10 第七批):
 *
 * 「2. 项目后台：可以联系本项目的手机端人员，也可以联系建筑商总部，不能直接联系其他
 * 项目后台。3. 建筑商总部：可以联系旗下所有项目后台，各项目后台也可以联系总部。」
 *
 * The server decides who is on the list; the screen shows each one's kind,
 * lets head office choose any project, never puts a phone person and head
 * office together, and opens what it started. Rendered to static markup: the
 * runner has no DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
const reader = vi.hoisted(() => ({
  user: { company_type: "CONTRACTOR", is_field_staff: false } as Record<string, unknown> | null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/field-chats",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: reader.user, can: () => true }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useCurrentProject: () => ({ active: true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: ({ kind, recordId, labels }: { kind: string; recordId: string; labels?: { title?: string } }) => (
    <div data-stub="conversation" data-kind={kind} data-record={recordId} data-title={labels?.title ?? ""} />
  ),
}));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api-client")>()),
  api: { ...api, list: vi.fn(), delete: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { FieldChatsOffice } = await import("@/components/site-access/field-chats-office");
const { OfficeFindPeople, mixBlock, personGroup, OFFICE_FIELD_CHATS_KEY } = await import(
  "@/components/site-access/field-chats-find"
);
const { OFFICE_CHAT_PROJECTS_KEY, getOfficeChatPeople, getOfficeChatProjects, startOfficeConversation } =
  await import("@/services/field-conversations.service");
const zh = (await import("@/messages/zh.json")).default;
const en = (await import("@/messages/en.json")).default;
const ms = (await import("@/messages/ms.json")).default;
const zhTW = (await import("@/messages/zh-TW.json")).default;

const PROJECTS = [
  { id: "p-bridge", code: "B", name: "Bridge" },
  { id: "p-tower", code: "T", name: "Tower" },
];
const TOWER_PEOPLE = [
  { id: "u-guard", full_name: "阿明", kind: "gate_guard", avatar: null },
  { id: "u-op", full_name: "阿里", kind: "equipment_operator", avatar: null },
  { id: "u-staff", full_name: "小陈", kind: "site_staff", avatar: null },
  { id: "u-pm", full_name: "项目经理", kind: "office", avatar: null },
  { id: "u-hq", full_name: "测试建筑商1", kind: "head_office", avatar: null },
];

function seeded(people: Record<string, unknown[]>, projects = PROJECTS) {
  return (client: import("@tanstack/react-query").QueryClient) => {
    client.setQueryData(OFFICE_CHAT_PROJECTS_KEY, projects);
    for (const [project, rows] of Object.entries(people)) {
      client.setQueryData(["field-chats", "people", project], rows);
    }
  };
}

const find = () => <OfficeFindPeople onBack={() => {}} onStarted={() => {}} />;

describe("沟通记录 · 找人沟通 for the office (JB158)", () => {
  afterEach(() => {
    nav.search = "";
    reader.user = { company_type: "CONTRACTOR", is_field_staff: false };
    api.get.mockReset();
    api.post.mockReset();
  });

  it("shows each person's kind, the phone first, then the project office, then head office", () => {
    const html = renderDetail(find(), seeded({ "p-bridge": TOWER_PEOPLE }));
    const kinds = [...html.matchAll(/data-kind="([^"]+)"/g)].map((m) => m[1]);
    expect(kinds).toEqual(["gate_guard", "equipment_operator", "site_staff", "office", "head_office"]);
    for (const word of ["现场人员", "门岗", "设备操作", "项目后台", "总部"]) {
      expect(html).toContain(word);
    }
    const groups = [...html.matchAll(/data-person-group="([^"]+)"/g)].map((m) => m[1]);
    expect(groups).toEqual(["phone", "office", "head_office"]);
    expect(html).toContain(zh.fieldChats.find.title);
    expect(html).toContain(zh.fieldChats.find.hint);
  });

  it("chooses from every project it is given - head office's whole company - starting with the page's", () => {
    const html = renderDetail(
      <OfficeFindPeople defaultProject="p-tower" onBack={() => {}} onStarted={() => {}} />,
      seeded({ "p-tower": [TOWER_PEOPLE[3]] }),
    );
    const projects = [...html.matchAll(/aria-pressed="(true|false)"[^>]*>(Bridge|Tower)</g)].map((m) => [m[2], m[1]]);
    expect(projects).toEqual([
      ["Bridge", "false"],
      ["Tower", "true"],
    ]);
    // The people of the project chosen, not the first one's.
    expect(html).toContain("项目经理");
    expect(html).not.toContain("测试建筑商1");
  });

  it("says so when there is no project to talk on", () => {
    const html = renderDetail(find(), seeded({}, []));
    expect(html).toContain(zh.fieldChats.find.noProject);
  });

  it("never puts a phone person and head office in one conversation", () => {
    const phone = { kind: "site_staff" as const };
    const office = { kind: "office" as const };
    const hq = { kind: "head_office" as const };
    expect(personGroup(phone)).toBe("phone");
    expect(personGroup({ kind: "gate_guard" })).toBe("phone");
    expect(mixBlock(hq, [phone])).toBe("phoneChosen");
    expect(mixBlock(phone, [office, hq])).toBe("headOfficeChosen");
    expect(mixBlock(office, [phone])).toBe("");
    expect(mixBlock(office, [hq])).toBe("");
    expect(mixBlock(hq, [office])).toBe("");
    expect(mixBlock(phone, [office])).toBe("");
  });

  it("asks the office's own endpoints, with the project", async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({ kind: "DIRECT", id: "c-1", created: true });
    await getOfficeChatProjects();
    expect(api.get).toHaveBeenLastCalledWith("/api/field-chats/projects/");
    await getOfficeChatPeople("p-tower");
    expect(api.get).toHaveBeenLastCalledWith("/api/field-chats/people/", { project: "p-tower" });
    await startOfficeConversation(["u-pm", "u-hq"], "水泥", "p-tower");
    expect(api.post).toHaveBeenLastCalledWith("/api/field-chats/start_conversation/", {
      people: ["u-pm", "u-hq"],
      project: "p-tower",
      title: "水泥",
    });
    await startOfficeConversation(["u-pm"], undefined, "p-tower");
    expect(api.post).toHaveBeenLastCalledWith("/api/field-chats/start_conversation/", {
      people: ["u-pm"],
      project: "p-tower",
    });
  });

  it("is 「沟通记录」 with 找人沟通 for a builder office account", () => {
    const html = renderDetail(<FieldChatsOffice />, (client) =>
      client.setQueryData([...OFFICE_FIELD_CHATS_KEY, "all"], { results: [], count: 0 }),
    );
    expect(zh.fieldChats.title).toBe("沟通记录");
    expect(zh.nav.submodule.fieldChats).toBe("沟通记录");
    expect(html).toContain(">沟通记录<");
    expect(html).toContain("data-office-find-open");
    expect(html).toContain(zh.fieldChats.find.title);
  });

  it("offers no 找人沟通 to anybody else", () => {
    for (const user of [null, { company_type: "RECYCLER", is_field_staff: false }, { company_type: "CONTRACTOR", is_field_staff: true }]) {
      reader.user = user;
      const html = renderDetail(<FieldChatsOffice />, (client) =>
        client.setQueryData([...OFFICE_FIELD_CHATS_KEY, "all"], { results: [], count: 0 }),
      );
      expect(html).not.toContain("data-office-find-open");
    }
  });

  it("opens a conversation that is not in the list yet - one just started, or a notice's link", () => {
    nav.search = "chat=c-new";
    const html = renderDetail(<FieldChatsOffice />, (client) =>
      client.setQueryData([...OFFICE_FIELD_CHATS_KEY, "all"], { results: [], count: 0 }),
    );
    expect(html).toContain('data-record="c-new"');
    expect(html).toContain('data-kind="DIRECT"');
    expect(html).toContain(`data-title="${zh.fieldChats.conversation}"`);
  });

  it("has its words in all four languages", () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        inner && typeof inner === "object" ? keys(inner).map((k) => `${key}.${k}`) : [key],
      );
    for (const messages of [zh, zhTW, ms]) {
      expect(keys(messages.fieldChats).sort()).toEqual(keys(en.fieldChats).sort());
      expect(messages.nav.submodule.fieldChats).toBe(messages.fieldChats.title);
    }
  });
});
