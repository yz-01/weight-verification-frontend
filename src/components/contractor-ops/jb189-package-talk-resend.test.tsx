/**
 * JB189 (客户 11-13，追加 2): Multi Engine 资料包的「沟通」和【重新发送】.
 *
 * 「1. 资料包沟通按钮：在 Multi Engine 资料包事项内增加「沟通」按钮，绑定对应的 PKG
 * 编号。总部、项目经理、顾问及业主点击后，直接跳到现有「沟通记录」页面，进入该资料包
 * 对应的沟通事项。日后再次点击同一资料包的「沟通」，仍可直接查看完整的聊天、照片及
 * 文件历史，不需要人工寻找。不同接收方的沟通记录必须正确隔离。」
 * 「2. 已发送资料包重新发送：……允许重新发送原有资料包，不需要重新建立资料。每次
 * 重新发送自动生成新的 PKG 编号，并关联原有资料包，方便分别查看每次发送的资料及对应
 * 沟通记录。」
 *
 * Lucas chose A: the office's 「沟通」 goes to 「沟通记录」 with the package and
 * recipient's own thread open; a consultant and a link go to their own side
 * of the same thread where they read the package.
 *
 * The runner has no DOM: rendered to static markup with the queries answered
 * from the cache, or read from the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type {
  EvidencePackageDetail,
  PackageMessage,
  PackageRecipient,
  PackageThreadRow,
} from "@/interfaces/contractor-ops";
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
const { PackageSheet } = await import("@/components/contractor-ops/multi-engine");
const { ThreadView, PACKAGE_THREADS_KEY, packageThreadKey, packageChatHref } = await import(
  "@/components/contractor-ops/package-exchange"
);
const { FieldChatsOffice } = await import("@/components/site-access/field-chats-office");
const { OFFICE_FIELD_CHATS_KEY } = await import("@/components/site-access/field-chats-find");

const SRC = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(SRC, relative), "utf8").replace(/\r\n/g, "\n");
const words = zh.multiEngine.exchange;

function recipient(id: string, kind: PackageRecipient["kind"], name: string, extra: Partial<PackageRecipient> = {}): PackageRecipient {
  return {
    id,
    kind,
    consultant: kind === "CONSULTANT" ? "c1" : null,
    display_name: name,
    name: "",
    organization: "",
    contact: "",
    status: "SENT",
    is_expired: false,
    is_live: true,
    token_hint: "",
    expires_at: null,
    revoked_at: null,
    open_count: 0,
    first_opened_at: null,
    last_opened_at: null,
    seen_round: 0,
    signed_name: "",
    signed_at: null,
    accepted_count: 0,
    returned_count: 0,
    pending_count: 1,
    created_at: "2026-11-13T02:00:00Z",
    created_by_name: "Ong",
    ...extra,
  };
}

function pkg(extra: Partial<EvidencePackageDetail> = {}): EvidencePackageDetail {
  return {
    id: "pk1",
    package_no: "PKG-T-001",
    name: "Progress claim March",
    remarks: "For the March claim.",
    state: "CONFIRMED",
    project: "p1",
    project_name: "Tower",
    created_at: "2026-11-13T01:00:00Z",
    created_by_name: "Ong",
    confirmed_at: "2026-11-13T01:30:00Z",
    pdf_sha256: "a".repeat(64),
    pdf_bytes: 1024,
    merge_report: [],
    review_state: "SENT",
    sent_at: null,
    sent_to: null,
    sent_to_name: "",
    exported_at: null,
    item_count: 0,
    returned_count: 0,
    can_delete: false,
    can_return: true,
    items: [],
    recipients: [],
    rounds: [],
    returned_item_ids: [],
    can_resubmit: false,
    resent_from: null,
    resends: [],
    ...extra,
  } as EvidencePackageDetail;
}

const TWO = [recipient("r-hq", "HEADQUARTERS", ""), recipient("r-con", "CONSULTANT", "Reviewing Consultant")];

function sheet(data: EvidencePackageDetail) {
  return renderDetail(<PackageSheet id={data.id} onClose={() => undefined} />, (client) => {
    client.setQueryData(["evidence-packages", "detail", data.id], data);
  });
}

describe("JB189-1: the package window's 「沟通」", () => {
  it("is greyed out with the reason before the package went to anybody", () => {
    reader.codes = new Set(["package.view", "package.manage"]);
    const html = sheet(pkg());
    const top = html.slice(html.indexOf("data-package-talk-row"));
    expect(top).toContain(words.talk);
    expect(top).toContain(`title="${words.talkAfterSend}"`);
    expect(words.talkAfterSend).toBe("发送以后才能沟通。");
    expect(top.slice(0, 2000)).not.toContain("/field-chats");
  });

  it("goes straight to the one recipient's thread on 「沟通记录」", () => {
    const html = sheet(pkg({ recipients: [TWO[1]] }));
    const top = html.slice(html.indexOf("data-package-talk-row"), html.indexOf("data-package-talk-row") + 1500);
    expect(top).toContain('href="/field-chats?package_chat=r-con"');
  });

  it("has one 「沟通」 per recipient row, each to that recipient's own thread", () => {
    const html = sheet(pkg({ recipients: TWO }));
    expect(html).toContain('href="/field-chats?package_chat=r-hq"');
    expect(html).toContain('href="/field-chats?package_chat=r-con"');
    expect(html.match(/data-package-talk="true"/g)?.length).toBe(2);
    // Several recipients: the top one asks which first (no address of its own).
    const top = html.slice(html.indexOf("data-package-talk-row"), html.indexOf("data-package-talk-row") + 1500);
    expect(top).not.toContain("/field-chats");
    expect(packageChatHref("r-con")).toBe("/field-chats?package_chat=r-con");
  });

  it("chooses between several recipients in the window, by PKG number and recipient", () => {
    const source = read("components/contractor-ops/package-exchange.tsx");
    const block = source.slice(source.indexOf("export function PackageTalkButton"), source.indexOf("export function packageLinkAddress"));
    expect(block).toContain('t("exchange.talkPick")');
    expect(block).toContain("packageNo ? `${packageNo} · ` : \"\"");
    expect(block).toContain("<Link href={packageChatHref(row.id)}>");
    // Opened on the click, never from an effect (JB187).
    expect(block).not.toContain("useEffect");
    expect(block).not.toContain("router.push");
  });
});

describe("JB189-7, -8, -12: 【重新发送】", () => {
  it("is on every recipient row of whoever builds packages, and asks once", () => {
    reader.codes = new Set(["package.view", "package.manage"]);
    const html = sheet(pkg({ recipients: TWO }));
    expect(html.match(/data-package-resend="true"/g)?.length).toBe(2);
    expect(html).toContain(words.resend);
    const source = read("components/contractor-ops/package-exchange.tsx");
    expect(source).toContain('t("exchange.resendAsk", { name: recipientLabel(t, row) })');
    expect(source).toContain("resendPackage(pkg.id, recipient.id)");
    expect(words.resendAsk).toBe("会生成一个新的资料包编号，内容和原来一样，发给 {name}。");
  });

  it("is not there without 「管理资料包」; 「沟通」 still is", () => {
    reader.codes = new Set(["package.view"]);
    const html = sheet(pkg({ recipients: TWO }));
    expect(html).not.toContain("data-package-resend");
    expect(html).toContain('href="/field-chats?package_chat=r-con"');
    reader.codes = new Set(["package.view", "package.manage"]);
  });

  it("is not on the consultant's page nor on the link page", () => {
    for (const file of ["components/contractor-ops/package-review.tsx", "components/package-link/package-link.tsx"]) {
      const source = read(file);
      expect(source).not.toContain("resendPackage");
      expect(source).not.toContain("exchange.resend");
    }
  });

  it("says 「重新发送自 PKG-…」 on the new one and lists 「已重新发送：PKG-…（日期）」 on the original", () => {
    const resent = sheet(pkg({ id: "pk2", package_no: "PKG-T-002", resent_from: { id: "pk1", package_no: "PKG-T-001", name: "x", confirmed_at: null } }));
    expect(resent).toContain("重新发送自 PKG-T-001");
    expect(resent).toContain("data-resent-from");
    const original = sheet(
      pkg({
        resends: [
          { id: "pk3", package_no: "PKG-T-003", name: "x", confirmed_at: "2026-11-14T02:00:00Z", recipient_name: "Reviewing Consultant", recipient_kind: "CONSULTANT" },
          { id: "pk2", package_no: "PKG-T-002", name: "x", confirmed_at: "2026-11-13T02:00:00Z", recipient_name: "", recipient_kind: "HEADQUARTERS" },
        ],
      }),
    );
    expect(original).toContain("已重新发送：PKG-T-003（2026年11月14日）· Reviewing Consultant");
    expect(original).toContain(`已重新发送：PKG-T-002（2026年11月13日）· ${words.kind.HEADQUARTERS}`);
    expect(original.indexOf("PKG-T-003")).toBeLessThan(original.indexOf("PKG-T-002"));
    // Each opens the other in the same window.
    const source = read("components/contractor-ops/multi-engine.tsx");
    expect(source).toContain("onClick={() => onOpenPackage(data.resent_from!.id)}");
    expect(source).toContain("onClick={() => onOpenPackage(row.id)}");
  });

  it("shows a link resend's new link once, with the new package's number for WhatsApp", () => {
    const source = read("components/contractor-ops/package-exchange.tsx");
    expect(source).toContain("setRevealedFor({ package_no: made.package_no, name: made.name })");
    expect(source).toContain("<LinkReady recipient={revealed} pkg={revealedFor ?? pkg}");
  });
});

const THREADS: PackageThreadRow[] = [
  {
    id: "r-con",
    package: "pk1",
    package_no: "PKG-T-001",
    package_name: "Progress claim March",
    recipient_name: "Reviewing Consultant",
    recipient_kind: "CONSULTANT",
    revoked: false,
    project: "p1",
    project_name: "Tower",
    message_count: 2,
    last: { author_name: "Reviewing Consultant", body: "Checked.", attachment_name: "", side: "RECIPIENT" },
    last_at: "2026-11-13T05:00:00Z",
  },
  {
    id: "r-hq",
    package: "pk1",
    package_no: "PKG-T-001",
    package_name: "Progress claim March",
    recipient_name: "",
    recipient_kind: "HEADQUARTERS",
    revoked: false,
    project: "p1",
    project_name: "Tower",
    message_count: 0,
    last: null,
    last_at: "2026-11-13T02:00:00Z",
  },
];

const DIRECT = {
  id: "d1",
  title: "阿明",
  project: "p1",
  project_name: "Tower",
  people: [{ id: "u-a", name: "阿明", phone_role: "gate_guard" }],
  member: true,
  message_count: 1,
  last: { author_name: "阿明", body: "到了", kind: "text" },
  last_at: "2026-11-13T03:00:00Z",
  unread: 0,
};

function message(id: string, side: PackageMessage["side"], author: string | null, body: string): PackageMessage {
  return {
    id,
    recipient: "r-con",
    item: null,
    side,
    author_name: side === "OFFICE" ? "Ong" : "Reviewing Consultant",
    body,
    attachment_name: "",
    attachment_url: "",
    created_at: "2026-11-13T04:00:00Z",
    author,
  };
}

function page(search: string, opened?: PackageThreadRow & { items?: PackageThreadRow["items"] }, messages: PackageMessage[] = []) {
  nav.search = search;
  return renderDetail(<FieldChatsOffice />, (client) => {
    client.setQueryData([...OFFICE_FIELD_CHATS_KEY, "all"], { results: [DIRECT], count: 1 });
    client.setQueryData([...PACKAGE_THREADS_KEY, "all"], { results: THREADS });
    if (opened) {
      client.setQueryData(packageThreadKey(opened.id), { results: [opened] });
      client.setQueryData(["evidence-packages", "messages", opened.package, opened.id], messages);
    }
  });
}

describe("JB189-2..-5: the package threads on 「沟通记录」", () => {
  it("lists one row per package and recipient - PKG number, name, recipient, project, last words - newest first", () => {
    const html = page("");
    const rows = [...html.matchAll(/data-package-chat-row="([^"]+)"/g)].map((match) => match[1]);
    expect(rows).toEqual(["r-con", "r-hq"]);
    expect(html).toContain("PKG-T-001 · Reviewing Consultant");
    expect(html).toContain(`PKG-T-001 · ${words.kind.HEADQUARTERS}`);
    expect(html).toContain("资料包 · Progress claim March · Tower");
    expect(html).toContain("Reviewing Consultant：Checked.");
    // Mixed with the conversations between people, by time.
    const order = [html.indexOf('data-package-chat-row="r-con"'), html.indexOf("阿明：到了"), html.indexOf('data-package-chat-row="r-hq"')];
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it("opens the thread a 「沟通」 named: selected on the left, the whole thread and the reply box on the right", () => {
    const opened = { ...THREADS[0], items: [{ id: "i1", record_kind: "MATERIAL_RECEIPT" as const, reference: "GRN-001" }] };
    const html = page("package_chat=r-con", opened, [
      message("m1", "OFFICE", "u-pm", "Please check the DO."),
      message("m2", "RECIPIENT", null, "Checked."),
    ]);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-package-chat-row="r-con"/);
    expect(html).toContain('data-package-thread="r-con"');
    expect(html).toContain("Please check the DO.");
    expect(html).toContain("GRN-001");
    expect(html).toContain(words.chatPlaceholder);
    // Left-right: the office's own on the right, the consultant's on the left.
    expect(html).toMatch(/justify-end[^]*Please check the DO\.[^]*justify-start[^]*Checked\./);
    expect(html).not.toContain('data-stub="conversation"');
  });

  it("reads but does not answer without 「管理资料包」 (the existing rule of the package chat)", () => {
    reader.codes = new Set(["package.view"]);
    const html = page("package_chat=r-con", THREADS[0], [message("m1", "OFFICE", "u-pm", "Hello")]);
    expect(html).toContain("Hello");
    expect(html).not.toContain(words.chatPlaceholder);
    reader.codes = new Set(["package.view", "package.manage"]);
  });

  it("says so when the thread is not one this account may read", () => {
    nav.search = "package_chat=r-gone";
    const html = renderDetail(<FieldChatsOffice />, (client) => {
      client.setQueryData([...OFFICE_FIELD_CHATS_KEY, "all"], { results: [], count: 0 });
      client.setQueryData([...PACKAGE_THREADS_KEY, "all"], { results: [] });
      client.setQueryData(packageThreadKey("r-gone"), { results: [] });
    });
    expect(html).toContain(zh.fieldChats.packageGone);
  });

  it("a person conversation still opens as before", () => {
    const html = page("chat=d1");
    expect(html).toContain('data-stub="conversation"');
    expect(html).toContain('data-record="d1"');
  });

  it("does not ask for package threads without a package or claim permission", () => {
    const source = read("components/site-access/field-chats-office.tsx");
    expect(source).toContain('const readsPackages = can("package.view") || can("claim.view");');
    expect(source).toContain("enabled: readsPackages,");
  });
});

describe("JB189 + JB190: head office's thread reads as two sides", () => {
  const thread = [
    message("m1", "OFFICE", "u-pm", "For your approval."),
    message("m2", "OFFICE", "u-hq", "Approved."),
  ];
  const render = (mineId?: string) =>
    renderDetail(
      <ThreadView
        messages={thread}
        items={[]}
        ownSide="OFFICE"
        otherName="HQ"
        canWrite={false}
        onSend={async () => undefined}
        openAttachment={async () => new File([], "x")}
        mineId={mineId}
      />,
    );

  it("puts the reader's own on the right and the other office's on the left", () => {
    expect(render("u-pm")).toMatch(/justify-end[^]*For your approval\.[^]*justify-start[^]*Approved\./);
    expect(render("u-hq")).toMatch(/justify-start[^]*For your approval\.[^]*justify-end[^]*Approved\./);
  });

  it("keeps the package window's way without it: a side is a side", () => {
    expect(render()).not.toContain("justify-start");
    const source = read("components/contractor-ops/package-exchange.tsx");
    expect(source).toContain('mineId={row.recipient_kind === "HEADQUARTERS" ? user?.id : undefined}');
  });
});

describe("JB189-6: the consultant's and the link's 「沟通」 go to their own thread", () => {
  it("is on the consultant's package, and goes to their own conversation below", () => {
    const source = read("components/contractor-ops/package-review.tsx");
    expect(source).toContain('t("exchange.talk")');
    expect(source).toContain("chat.current?.scrollIntoView(");
    expect(source).toContain("<section ref={chat}");
    expect(source).not.toContain("/field-chats");
  });

  it("is on the link page, and goes to the link's own conversation below", () => {
    const source = read("components/package-link/package-link.tsx");
    expect(source).toContain('t("talk")');
    expect(source).toContain("chat.current?.scrollIntoView(");
    expect(source).toContain("<section ref={chat}");
    expect(source).not.toContain("/field-chats");
  });
});

describe("JB189 words", () => {
  const catalogues = { zh, "zh-TW": zhTW, en, ms };

  it("are in all four languages", () => {
    for (const [lang, messages] of Object.entries(catalogues)) {
      const exchange = messages.multiEngine.exchange as Record<string, unknown>;
      for (const key of ["talk", "talkAfterSend", "talkPick", "resend", "resendAsk", "resendConfirm", "resentFrom", "resentTo"]) {
        expect(typeof exchange[key], `${lang} ${key}`).toBe("string");
      }
      expect(typeof (messages.multiEngine.exchange.toast as Record<string, unknown>).resent, lang).toBe("string");
      expect(typeof (messages.packageLink as Record<string, unknown>).talk, lang).toBe("string");
      for (const key of ["packageThread", "packageKind", "packageGone"]) {
        expect(typeof (messages.fieldChats as Record<string, unknown>)[key], `${lang} ${key}`).toBe("string");
      }
    }
  });

  it("「发送」 to the same one again still refused, and the words say to use 【重新发送】 (JB189-9)", () => {
    expect(zh.errors.api.package_already_sent).toBe("这个资料包已经发给他了。要再发一次，请按那一行的【重新发送】。");
    expect(zhTW.errors.api.package_already_sent).toContain("【重新發送】");
    expect(en.errors.api.package_already_sent).toContain("Resend");
    expect(ms.errors.api.package_already_sent).toContain("Hantar lagi");
    // The words a reader sees say 你, never 您.
    for (const text of Object.values(zh.multiEngine.exchange).filter((value) => typeof value === "string")) {
      if ((text as string).includes("重新发送") || (text as string).includes("沟通")) expect(text).not.toContain("您");
    }
  });
});
