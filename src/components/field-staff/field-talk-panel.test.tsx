/**
 * 「沟通」 on the phone (JB104, 客户 11-05 事项 9 第 4 点): every conversation I
 * am in, newest first, with what is unread; 「找人沟通」; a notice's
 * `?chat=DIRECT:<id>` opens that conversation in the chat every record uses.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "tab=talk" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: ({ kind, recordId, labels }: { kind: string; recordId: string; labels?: { title?: string } }) => (
    <div data-stub="conversation" data-kind={kind} data-record={recordId} data-title={labels?.title ?? ""} />
  ),
}));
vi.mock("@/components/site-operations/hazard-conversation", () => ({
  HazardConversationPanel: ({ incidentId }: { incidentId: string }) => (
    <div data-stub="hazard" data-incident={incidentId} />
  ),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { FieldTalkPanel } = await import("@/components/field-staff/field-talk-panel");
const { parseTalkParam, previewKey } = await import("@/lib/field-talk");
const { FIELD_CONVERSATIONS_KEY } = await import("@/services/field-conversations.service");
const zh = (await import("@/messages/zh.json")).default;
const en = (await import("@/messages/en.json")).default;
const ms = (await import("@/messages/ms.json")).default;
const zhTW = (await import("@/messages/zh-TW.json")).default;

const preview = (over: Record<string, unknown> = {}) => ({
  author: "u-2",
  author_name: "阿里",
  body: "",
  photo: false,
  audio: false,
  attachment: false,
  sent_at: "2026-11-05T02:00:00Z",
  ...over,
});

const rows = [
  {
    kind: "DIRECT",
    id: "c-1",
    title: "阿里",
    people: [{ id: "u-2", name: "阿里", phone_role: "equipment_operator" }],
    project_name: "Tower",
    last: preview({ body: "塔吊几点到？" }),
    last_at: "2026-11-05T03:00:00Z",
    unread: 2,
  },
  {
    kind: "GATE_INCIDENT",
    id: "g-1",
    title: "GI-0007",
    people: [],
    project_name: "Tower",
    last: preview({ author_name: "门岗", audio: true }),
    last_at: "2026-11-05T01:00:00Z",
    unread: 0,
  },
];

function seeded(results = rows) {
  return (client: import("@tanstack/react-query").QueryClient) => {
    client.setQueryData(FIELD_CONVERSATIONS_KEY, {
      results,
      unread: results.reduce((sum, row) => sum + row.unread, 0),
    });
  };
}

describe("沟通 (JB104)", () => {
  afterEach(() => {
    nav.search = "tab=talk";
  });

  it("lists my conversations in the server's order, newest first, with what is unread", () => {
    const html = renderDetail(<FieldTalkPanel />, seeded());
    const titles = [...html.matchAll(/data-testid="talk-row"[\s\S]*?truncate text-sm font-semibold">([^<]*)</g)].map(
      (match) => match[1],
    );
    expect(titles).toEqual(["阿里", "GI-0007"]);
    expect(html.match(/data-testid="talk-unread"[^>]*>2</g)).toHaveLength(1);
    expect(html).toContain("塔吊几点到？");
    // A voice note is said as one, not as an empty line.
    expect(html).toContain(`门岗: ${zh.fieldStaffPwa.talk.preview.voice}`);
    expect(html).toContain(zh.fieldStaffPwa.talk.kind.record);
    expect(html).toContain(zh.fieldStaffPwa.talk.find);
  });

  it("says there is nothing yet, and still offers 找人沟通", () => {
    const html = renderDetail(<FieldTalkPanel />, seeded([]));
    expect(html).toContain(zh.fieldStaffPwa.talk.empty);
    expect(html).toContain(zh.fieldStaffPwa.talk.find);
  });

  it("opens the conversation a notice names, in the record chat, kind DIRECT", () => {
    nav.search = "tab=talk&chat=DIRECT:c-1";
    const html = renderDetail(<FieldTalkPanel />, seeded());
    expect(html).toContain('data-stub="conversation"');
    expect(html).toContain('data-kind="DIRECT"');
    expect(html).toContain('data-record="c-1"');
    expect(html).not.toContain('data-testid="talk-row"');
  });

  it("opens a record's and a hazard's conversation the same way", () => {
    nav.search = "tab=talk&chat=GATE_INCIDENT:g-1";
    expect(renderDetail(<FieldTalkPanel />, seeded())).toContain('data-kind="GATE_INCIDENT"');
    nav.search = "tab=talk&chat=HAZARD:h-1";
    expect(renderDetail(<FieldTalkPanel />, seeded())).toContain('data-incident="h-1"');
  });

  it("reads only the links it can open", () => {
    expect(parseTalkParam("DIRECT:c-1")).toEqual({ kind: "DIRECT", id: "c-1" });
    expect(parseTalkParam("HAZARD:h-1")).toEqual({ kind: "HAZARD", id: "h-1" });
    expect(parseTalkParam("MATERIAL_RECEIPT:r-1")).toEqual({ kind: "MATERIAL_RECEIPT", id: "r-1" });
    expect(parseTalkParam("SOMETHING:x")).toBeNull();
    expect(parseTalkParam("DIRECT:")).toBeNull();
    expect(parseTalkParam(null)).toBeNull();
  });

  it("names what was sent when nothing was typed", () => {
    expect(previewKey(null)).toBe("none");
    expect(previewKey(preview({ body: "hi" }))).toBe("text");
    expect(previewKey(preview({ photo: true }))).toBe("photo");
    expect(previewKey(preview({ audio: true }))).toBe("voice");
    expect(previewKey(preview({ attachment: true }))).toBe("file");
  });

  it("has its words in all four languages", () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        inner && typeof inner === "object" ? keys(inner).map((k) => `${key}.${k}`) : [key],
      );
    for (const messages of [zh, zhTW, ms]) {
      expect(keys(messages.fieldStaffPwa.talk).sort()).toEqual(keys(en.fieldStaffPwa.talk).sort());
      expect(keys(messages.fieldStaffPwa.operate).sort()).toEqual(keys(en.fieldStaffPwa.operate).sort());
      for (const key of ["talk", "operate", "gatePhoto"] as const) {
        expect(messages.fieldStaffPwa.nav[key]).toBeTruthy();
      }
      expect(messages.roles.system_.equipment_operator).toBeTruthy();
    }
  });
});
