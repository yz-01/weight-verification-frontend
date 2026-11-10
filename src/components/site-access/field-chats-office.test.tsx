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
const topBar = vi.hoisted(() => ({ projects: undefined as unknown[] | undefined }));
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
  useCurrentProject: () => ({ active: true, projects: topBar.projects }),
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
const { OfficeFindPeople, OfficePersonGroup, findProjectBlock, mixBlock, personGroup, OFFICE_FIELD_CHATS_KEY } = await import(
  "@/components/site-access/field-chats-find"
);
const { OFFICE_CHAT_PROJECTS_KEY, getOfficeChatPeople, getOfficeChatProjects, startOfficeConversation } =
  await import("@/services/field-conversations.service");
const zh = (await import("@/messages/zh.json")).default;
const { readFileSync } = await import("node:fs");
const read = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
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

const find = (project = "p-bridge") => <OfficeFindPeople project={project} onBack={() => {}} onStarted={() => {}} />;

describe("沟通记录 · 找人沟通 for the office (JB158)", () => {
  afterEach(() => {
    nav.search = "";
    reader.user = { company_type: "CONTRACTOR", is_field_staff: false };
    topBar.projects = undefined;
    api.get.mockReset();
    api.post.mockReset();
  });

  it("shows each person's kind, the phone first, then the project office, then head office", () => {
    const html = renderDetail(find(), seeded({ "p-bridge": TOWER_PEOPLE }));
    const kinds = [...html.matchAll(/data-kind="([^"]+)"/g)].map((m) => m[1]);
    expect(kinds).toEqual(["gate_guard", "equipment_operator", "site_staff", "office", "head_office"]);
    // The phone's own words for its people (JB159: the office said 门岗 /
    // 设备操作 where the phone's finder says 门岗保安 / 设备操作人员).
    for (const word of ["工地人员", "门岗保安", "设备操作人员", "项目后台", "总部"]) {
      expect(html).toContain(word);
    }
    expect(zh.roles.system_.gate_guard).toBe("门岗保安");
    expect(zh.roles.system_.equipment_operator).toBe("设备操作人员");
    const groups = [...html.matchAll(/data-person-group="([^"]+)"/g)].map((m) => m[1]);
    expect(groups).toEqual(["phone", "office", "head_office"]);
    expect(html).toContain(zh.fieldChats.find.title);
    expect(html).toContain(zh.fieldChats.find.hint);
  });

  it("follows the top bar's project, with no project chips of its own (JB159 K)", () => {
    // 客户 11-10: 「项目可以和其他项目沟通？」 - a project office on three teams,
    // top bar on OIL & GAS, chose project 1A's chip and was offered its office.
    const html = renderDetail(
      find("p-tower"),
      seeded({ "p-tower": [TOWER_PEOPLE[3]], "p-bridge": [TOWER_PEOPLE[4]] }),
    );
    expect(html).not.toMatch(/aria-pressed="(true|false)"[^>]*>(Bridge|Tower)</);
    expect(html).toContain("项目经理");
    expect(html).not.toContain("测试建筑商1");
  });

  it("on 全部项目 asks for a project at the top first, and lists nobody (JB159 K)", () => {
    for (const project of ["all", ""]) {
      const html = renderDetail(find(project), seeded({ "p-bridge": TOWER_PEOPLE }));
      expect(html).toContain('data-find-block="pickProject"');
      expect(html).toContain(zh.fieldChats.find.pickProject);
      expect(zh.fieldChats.find.pickProject).toBe("请先在最上面选一个项目，再找人沟通。");
      expect(html).not.toContain('data-testid="office-talk-person"');
    }
  });

  it("on a project it is not on says so, and lists nobody (JB159 K)", () => {
    const html = renderDetail(find("p-oil-gas"), seeded({ "p-oil-gas": TOWER_PEOPLE }));
    expect(html).toContain(zh.fieldChats.find.notOnTeam);
    expect(zh.fieldChats.find.notOnTeam).toBe("你不在这个项目的团队里，不能在这里开始沟通。");
    expect(html).not.toContain('data-testid="office-talk-person"');
    // A project that has ended is said as such, team or not.
    topBar.projects = [{ id: "p-oil-gas", status: "COMPLETED" }];
    expect(renderDetail(find("p-oil-gas"), seeded({}))).toContain(zh.fieldChats.find.projectClosed);
    expect(findProjectBlock({ project: "p-tower", mine: PROJECTS })).toBe("");
    expect(findProjectBlock({ project: "p-tower", mine: undefined })).toBe("");
    expect(findProjectBlock({ project: "p-x", mine: [] })).toBe("noProject");
    expect(findProjectBlock({ project: "p-x", mine: PROJECTS, status: "ACTIVE" })).toBe("notOnTeam");
  });

  it("the page hands it the top bar's project", () => {
    const office = read("field-chats-office.tsx");
    expect(office).toMatch(/<OfficeFindPeople\s+key=\{project \|\| "all"\}\s+project=\{project\}/);
    expect(office).not.toContain("defaultProject");
  });

  it("a project with nobody on it says so and what to do; a search that finds nobody says 找不到人 (JB159 J)", () => {
    const html = renderDetail(find(), seeded({ "p-bridge": [] }));
    expect(html).toContain(zh.fieldChats.find.noPeopleOnProject);
    expect(zh.fieldChats.find.noPeopleOnProject).toBe("这个项目还没有可以找的人：请先在「项目人员名单」加人。");
    expect(html).not.toContain(zh.fieldChats.find.noPeople);
    expect(zh.fieldChats.find.noPeople).toBe("找不到人。");
    const finder = read("field-chats-find.tsx");
    expect(finder).toMatch(/\{search\.trim\(\) \? t\("noPeople"\) : t\("noPeopleOnProject"\)\}/);
  });

  it("writes why a group is grey under its heading, where it can be read (JB159, shot c03)", () => {
    const [guard, , , pm, hq] = TOWER_PEOPLE as unknown as import("@/services/field-conversations.service").OfficeChatPerson[];
    // A phone person chosen: head office greys out and says why.
    const greyed = renderDetail(
      <OfficePersonGroup name="head_office" rows={[hq]} chosen={[guard.id]} chosenPeople={[guard]} onToggle={() => {}} />,
    );
    expect(greyed).toContain('data-mix-reason="phoneChosen"');
    expect(greyed).toContain(zh.fieldChats.find.mix.phoneChosen);
    expect(zh.fieldChats.find.mix.phoneChosen).toBe("已选了手机端人员，总部不能加入同一个对话。");
    // Head office chosen: the phone greys out and says why.
    const phones = renderDetail(
      <OfficePersonGroup name="phone" rows={[guard]} chosen={[hq.id]} chosenPeople={[hq]} onToggle={() => {}} />,
    );
    expect(phones).toContain(zh.fieldChats.find.mix.headOfficeChosen);
    // Nothing to say when nothing blocks it.
    const open = renderDetail(
      <OfficePersonGroup name="office" rows={[pm]} chosen={[guard.id]} chosenPeople={[guard]} onToggle={() => {}} />,
    );
    expect(open).not.toContain("data-mix-reason");
    const none = renderDetail(
      <OfficePersonGroup name="head_office" rows={[hq]} chosen={[]} chosenPeople={[]} onToggle={() => {}} />,
    );
    expect(none).not.toContain("data-mix-reason");
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
