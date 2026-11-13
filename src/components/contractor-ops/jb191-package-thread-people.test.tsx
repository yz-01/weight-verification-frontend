/**
 * JB191 (客户 11-13 晚上，追加 3): Multi Engine 资料包双向沟通的人员选择和通知.
 *
 * 「1. 项目联系总部：可以选择总部管理员、财务经理、总经理或其他指定人员。
 *   2. 总部联系项目：总部同样可以选择指定项目的项目经理或其他员工。
 *   3. 双方都可以选择接收人，不应固定某一个账号。
 *   4. 所有沟通必须关联原来的 PKG 资料包编号，保留完整历史记录。
 *   5. 指定接收人必须收到消息通知、红点及铃声提醒。」
 *
 * On the package's 总部（系统内） thread the box asks 「发给谁」: the project
 * ticks among head office, head office among the project's office people.
 * The ticked people are rung by the server; here: the box, what a message
 * says it was sent to, the red number on the row of 「沟通记录」, and a notice
 * opening another thread while the page is open.
 *
 * The runner has no DOM: rendered to static markup with the queries answered
 * from the cache, or read from the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { PackageMessage, PackageThreadPeople, PackageThreadRow } from "@/interfaces/contractor-ops";
import { keysForEvent } from "@/lib/live-refresh";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ codes: new Set<string>(["package.view", "package.manage", "project.view"]) }));
const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/field-chats",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-pm", company_type: "CONTRACTOR", is_field_staff: false },
    can: (code: string) => reader.codes.has(code),
  }),
}));
vi.mock("@/components/providers/current-project-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["all", () => {}],
  useCurrentProject: () => ({ active: true, projects: [] }),
  useFollowRecordProject: () => {},
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: ({ kind, recordId }: { kind: string; recordId: string }) => (
    <div data-stub="conversation" data-kind={kind} data-record={recordId} />
  ),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ThreadView, PACKAGE_THREADS_KEY, packageThreadKey, tickedAddressees, mustChooseAddressee } = await import(
  "@/components/contractor-ops/package-exchange"
);
type ThreadAddressing = import("@/components/contractor-ops/package-exchange").ThreadAddressing;
const { FieldChatsOffice } = await import("@/components/site-access/field-chats-office");
const { OFFICE_FIELD_CHATS_KEY } = await import("@/components/site-access/field-chats-find");

const SRC = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(SRC, relative), "utf8").replace(/\r\n/g, "\n");
const words = zh.multiEngine.exchange;

const HEAD_OFFICE: PackageThreadPeople["people"] = [
  { id: "u-admin", full_name: "Aini", role_code: "company_admin", role_name: "Company Administrator", kind: "head_office" },
  { id: "u-fin", full_name: "Bala", role_code: "headquarters", role_name: "Headquarters", kind: "head_office" },
  { id: "u-gm", full_name: "Chen", role_code: "gm_custom", role_name: "总经理", kind: "head_office" },
];

function addressing(extra: Partial<ThreadAddressing> = {}): ThreadAddressing {
  return {
    people: HEAD_OFFICE,
    suggested: [],
    fromHeadquarters: false,
    loading: false,
    failed: false,
    retry: () => undefined,
    ...extra,
  };
}

function message(id: string, author: string, name: string, body: string, to = "", ids: string[] = []): PackageMessage {
  return {
    id,
    recipient: "r-hq",
    item: null,
    side: "OFFICE",
    author_name: name,
    body,
    attachment_name: "",
    attachment_url: "",
    created_at: "2026-11-13T12:00:00Z",
    author,
    addressees: ids,
    addressee_names: to,
  };
}

function thread(asks: ThreadAddressing | undefined, messages: PackageMessage[] = [], canWrite = true) {
  return renderDetail(
    <ThreadView
      messages={messages}
      items={[]}
      ownSide="OFFICE"
      otherName="总部（系统内）"
      canWrite={canWrite}
      onSend={async () => undefined}
      openAttachment={async () => new File([], "x")}
      mineId="u-pm"
      addressing={asks}
    />,
  );
}

/** One person's chip in the box: its markup up to the next chip. */
function chip(html: string, id: string) {
  const start = html.indexOf(`data-thread-to-person="${id}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf("data-thread-to-person=", start + 10);
  // The last chip ends where the group does (its hint comes after it).
  const end = next === -1 ? html.indexOf("</label>", start) : next;
  return html.slice(start, end === -1 ? undefined : end);
}

describe("JB191-1, -2, -3: 「发给谁」 on head office's thread", () => {
  it("offers the project head office's people, each with what they are, none ticked the first time", () => {
    const html = thread(addressing());
    expect(html).toContain("data-thread-to");
    expect(html).toContain(words.to);
    expect(html).toContain(words.toHeadOffice);
    expect(html).not.toContain(words.toProject);
    for (const person of HEAD_OFFICE) expect(chip(html, person.id)).toContain(person.full_name);
    // A seeded role in the reader's language; a role the company named itself as it was named.
    expect(chip(html, "u-admin")).toContain(zh.roles.system_.company_admin);
    expect(chip(html, "u-fin")).toContain(zh.roles.system_.headquarters);
    expect(chip(html, "u-gm")).toContain("总经理");
    expect(html).not.toContain('aria-checked="true"');
    expect(html).toContain(words.toHint);
  });

  it("offers head office the project's people, and says so", () => {
    const html = thread(
      addressing({
        fromHeadquarters: true,
        people: [{ id: "u-pm2", full_name: "Chong", role_code: "project_manager", role_name: "Project Manager", kind: "office" }],
      }),
    );
    expect(html).toContain(words.toProject);
    expect(html).not.toContain(words.toHeadOffice);
    expect(chip(html, "u-pm2")).toContain(zh.roles.system_.project_manager);
  });

  it("ticks the conversation as it stands: the server's suggestion", () => {
    const html = thread(addressing({ suggested: ["u-fin"] }));
    expect(chip(html, "u-fin")).toContain('aria-checked="true"');
    expect(chip(html, "u-admin")).toContain('aria-checked="false"');
    expect(chip(html, "u-gm")).toContain('aria-checked="false"');
  });

  it("the writer's own ticks rule once touched; somebody no longer offered is dropped", () => {
    const asks = addressing({ suggested: ["u-fin"] });
    expect(tickedAddressees(null, asks)).toEqual(["u-fin"]);
    expect(tickedAddressees(["u-admin", "u-gm"], asks)).toEqual(["u-admin", "u-gm"]);
    expect(tickedAddressees([], asks)).toEqual([]);
    expect(tickedAddressees(["u-admin", "u-left"], asks)).toEqual(["u-admin"]);
    expect(tickedAddressees(null, addressing({ suggested: ["u-left"] }))).toEqual([]);
    expect(tickedAddressees(null, undefined)).toEqual([]);
  });

  it("holds the message until somebody is ticked - but not where there is nobody to choose", () => {
    expect(mustChooseAddressee(addressing(), [])).toBe(true);
    expect(mustChooseAddressee(addressing(), ["u-fin"])).toBe(false);
    expect(mustChooseAddressee(addressing({ loading: true }), ["u-fin"])).toBe(true);
    expect(mustChooseAddressee(addressing({ people: [] }), [])).toBe(false);
    // A consultant's or a link's thread does not ask.
    expect(mustChooseAddressee(undefined, [])).toBe(false);
    const source = read("components/contractor-ops/package-exchange.tsx");
    expect(source).toContain("disabled={busy || (!body.trim() && !attachment) || mustChoose}");
    expect(source).toContain("...(addressing ? { to: chosen } : {}),");
  });

  it("says so when there is nobody to choose, each end in its own words", () => {
    const project = thread(addressing({ people: [] }));
    expect(project).toContain(words.toNobodyHeadOffice);
    expect(project).not.toContain(words.toHint);
    expect(thread(addressing({ people: [], fromHeadquarters: true }))).toContain(words.toNobodyProject);
  });

  it("is not on a thread that does not ask, nor for a reader who cannot write", () => {
    expect(thread(undefined)).not.toContain("data-thread-to");
    expect(thread(addressing(), [], false)).not.toContain("data-thread-to");
  });
});

describe("JB191-4: one thread on the PKG number, each message saying whom it was sent to", () => {
  const messages = [
    message("m1", "u-pm", "Chong", "请看一下这一期的金额。", "Bala", ["u-fin"]),
    message("m2", "u-fin", "Bala", "收到，明天回复。", "Chong", ["u-pm"]),
    message("m0", "u-pm", "Chong", "以前的留言，没有选人。"),
  ];

  it("writes 「发给：…」 on a message that was sent to somebody, and nothing on one from before", () => {
    const html = thread(addressing(), messages);
    expect(html).toContain(`data-message-to="true">${words.sentTo.replace("{names}", "Bala")}<`);
    expect(html).toContain(`data-message-to="true">${words.sentTo.replace("{names}", "Chong")}<`);
    expect([...html.matchAll(/data-message-to=/g)]).toHaveLength(2);
    // Left-right as before (JB190): my own on the right, the other office's on the left.
    expect(html).toMatch(/justify-end[^]*请看一下这一期的金额。[^]*justify-start[^]*收到，明天回复。/);
  });

  it("asks in the package window's 往来聊天 too, and reads left-right there as on 「沟通记录」", () => {
    const source = read("components/contractor-ops/package-exchange.tsx");
    expect(source).toContain('const twoOffices = current?.kind === "HEADQUARTERS";');
    expect(source).toContain('useThreadAddressing(pkg.id, current?.id ?? "", twoOffices && can("package.manage"))');
    expect(source).toContain("mineId={twoOffices ? user?.id : undefined}");
    expect(source.match(/addressing=\{addressing\}/g)).toHaveLength(2);
    // Only head office's thread asks on 「沟通记录」.
    expect(source).toContain('row?.recipient_kind === "HEADQUARTERS" && can("package.manage"),');
  });
});

const THREADS: PackageThreadRow[] = [
  {
    id: "r-hq",
    package: "pk1",
    package_no: "PKG-PRJ-0003-007",
    package_name: "contractor claim",
    recipient_name: "",
    recipient_kind: "HEADQUARTERS",
    revoked: false,
    project: "p1",
    project_name: "PUTRA_MAS",
    message_count: 3,
    last: { author_name: "Bala", body: "收到，明天回复。", attachment_name: "", side: "OFFICE" },
    last_at: "2026-11-13T12:10:00Z",
    unread: 2,
  },
  {
    id: "r-hq2",
    package: "pk2",
    package_no: "PKG-PRJ-0003-006",
    package_name: "site2",
    recipient_name: "",
    recipient_kind: "HEADQUARTERS",
    revoked: false,
    project: "p1",
    project_name: "PUTRA_MAS",
    message_count: 1,
    last: { author_name: "Chong", body: "123", attachment_name: "", side: "OFFICE" },
    last_at: "2026-11-13T11:00:00Z",
    unread: 0,
  },
];

function page(search: string, opened?: PackageThreadRow, people?: PackageThreadPeople, messages: PackageMessage[] = []) {
  nav.search = search;
  return renderDetail(<FieldChatsOffice />, (client) => {
    client.setQueryData([...OFFICE_FIELD_CHATS_KEY, "all"], { results: [], count: 0 });
    client.setQueryData([...PACKAGE_THREADS_KEY, "all"], { results: THREADS });
    if (opened) {
      client.setQueryData(packageThreadKey(opened.id), { results: [opened] });
      client.setQueryData(["evidence-packages", "messages", opened.package, opened.id], messages);
      if (people) client.setQueryData(["evidence-packages", "messages", opened.package, opened.id, "people"], people);
    }
  });
}

describe("JB191-5: the red number, and the notice's thread", () => {
  it("shows how many messages sent to me are unread on that PKG's row, and nothing on a read one", () => {
    const html = page("");
    const first = html.slice(html.indexOf('data-package-chat-row="r-hq"'), html.indexOf('data-package-chat-row="r-hq2"'));
    expect(first).toContain('data-package-chat-unread="2"');
    expect(first).toMatch(/bg-destructive[^>]*>2</);
    expect(html.slice(html.indexOf('data-package-chat-row="r-hq2"'))).not.toContain("data-package-chat-unread");
  });

  it("opens the thread the notice names with 「发给谁」 in its box", () => {
    const people: PackageThreadPeople = { choose: true, from_headquarters: false, people: HEAD_OFFICE, suggested: ["u-fin"] };
    const html = page("package_chat=r-hq", THREADS[0], people, [message("m2", "u-fin", "Bala", "收到，明天回复。", "Chong", ["u-pm"])]);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-package-chat-row="r-hq"/);
    expect(html).toContain('data-package-thread="r-hq"');
    expect(html).toContain("data-thread-to");
    expect(chip(html, "u-fin")).toContain('aria-checked="true"');
  });

  it("does not ask on a thread the server says does not ask", () => {
    const html = page("package_chat=r-hq", THREADS[0], { choose: false, from_headquarters: false, people: [], suggested: [] });
    expect(html).toContain('data-package-thread="r-hq"');
    expect(html).not.toContain("data-thread-to");
  });

  it("follows a new address while the page is open (a notice clicked on 「沟通记录」), once", () => {
    const source = read("components/site-access/field-chats-office.tsx");
    expect(source).toContain("const [followedKey, setFollowedKey] = useState(namedKey);");
    expect(source).toMatch(/if \(namedKey !== followedKey\) \{\s+setFollowedKey\(namedKey\);\s+if \(named\) \{\s+setPicked\(named\);/);
    // Never a navigation from an effect (JB187).
    expect(source).not.toContain("router.push");
  });

  it("rings in the open thread for a message sent to this reader - the bell has nothing left to ring for there", () => {
    const source = read("components/contractor-ops/package-exchange.tsx");
    // Only what was sent to me, with the open conversation's own sounder (JB36).
    expect(source).toContain("messages.filter((message) => message.addressees?.includes(me))");
    expect(source).toContain("useNewMessageTone(mine, me);");
    // On 「沟通记录」 (one panel per thread) and in the package window (keyed by the thread picked).
    expect(source).toContain(
      '{row.recipient_kind === "HEADQUARTERS" && <AddressedTone messages={thread.data} me={user?.id} />}',
    );
    expect(source).toContain("{twoOffices && <AddressedTone key={current.id} messages={thread.data} me={user?.id} />}");
  });

  it("re-reads the row, the thread and the bell once the thread was read, and on every new notice", () => {
    const source = read("components/contractor-ops/package-exchange.tsx");
    expect(source).toContain('void queryClient.invalidateQueries({ queryKey: ["notifications"] });');
    expect(source).toContain("if (!readAt || unread <= 0) return;");
    const keys = (keysForEvent("notification.created") ?? []).map((key) => JSON.stringify(key));
    expect(keys).toContain(JSON.stringify(["evidence-packages", "threads"]));
    expect(keys).toContain(JSON.stringify(["evidence-packages", "thread"]));
    expect(keys).toContain(JSON.stringify(["evidence-packages", "messages"]));
    expect(keys).toContain(JSON.stringify(["notifications"]));
  });
});

describe("JB191 words", () => {
  const KEYS = [
    "to", "toHeadOffice", "toProject", "toHint", "toNobodyHeadOffice", "toNobodyProject", "toChooseFirst", "sentTo",
  ] as const;

  it("are in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      for (const key of KEYS) expect(catalogue.multiEngine.exchange[key], key).toBeTruthy();
      expect(catalogue.multiEngine.exchange.sentTo).toContain("{names}");
      expect(catalogue.errors.api.package_addressee_required).toBeTruthy();
      expect(catalogue.errors.api.package_addressee_invalid).toBeTruthy();
    }
    expect(zh.multiEngine.exchange.to).toBe("发给谁");
    expect(zh.multiEngine.exchange.toHint).toContain("通知");
    expect(zh.multiEngine.exchange.toHint).toContain("铃声");
    expect(zh.multiEngine.exchange.toHint).toContain("红点");
    // 你, never 您.
    for (const key of KEYS) expect(zh.multiEngine.exchange[key]).not.toContain("您");
  });
});
