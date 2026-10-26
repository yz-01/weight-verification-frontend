/**
 * A record under 我提交过的 opens in the record-detail popup (E8, Q31).
 *
 * The same frame as every module's record, one column on the phone. No
 * 记录人: the worker opening it is the one who recorded it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

// Which record the address opens; a material exit opens by its chat link.
const nav = vi.hoisted(() => ({ search: "movement=mv-7" }));

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  // The office's notice about a movement opens it here (Fable B4 #15).
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shared/record-attachments")>()),
  RecordAttachmentsPanel: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-stub="attachments" data-read-only={String(Boolean(readOnly))} />
  ),
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: ({ kind }: { kind: string }) => <div data-stub="export" data-kind={kind} />,
}));

const { RECORDER, renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { MySubmissions } = await import("@/components/field-staff/my-submissions");
const { RecordDetailShell } = await import("@/components/shared/record-detail-shell");

const row = {
  id: "mv-7",
  kind: "EQUIPMENT_MOVEMENT" as const,
  reference: "EQ-SITE-007",
  detail: "Excavator",
  project_id: "p-1",
  project_name: "Site",
  submitted_at: "2026-10-08T01:00:00Z",
  status: "EXIT",
  status_label: "Exit",
  photo: null,
};

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["my-submissions"], { results: [row], count: 1 });
  client.setQueryData(["my-submissions", "detail", "EQUIPMENT_MOVEMENT", "mv-7"], {
    ...row,
    fields: [{ key: "delivery_note_no", value: "DO-OUT-7" }],
    photos: [{ url: "https://cdn.example/mv-7.jpg", caption: "Exit gate" }],
    // The server sends it; the worker's own sheet does not show it.
    ...RECORDER,
  });
}

describe("the phone's submitted record (E8)", () => {
  it("opens as the record popup, without 记录人", () => {
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain("EQ-SITE-007");
    // The status pill beside the number.
    expect(html).toContain(messages.contractorOps.direction.EXIT);
    expect(html).not.toContain("data-shell-recorder");
    expect(html).not.toContain(RECORDER.created_by_name);
  });

  it("keeps the record's fields, photograph and conversation, and adds no export", () => {
    const html = renderDetail(<MySubmissions />, seeded);
    expect(html).toContain("DO-OUT-7");
    expect(html).toContain("https://cdn.example/mv-7.jpg");
    expect(html).toContain('data-stub="conversation"');
    // The attachments only inside 「后台发来的文件」, read only (JB33).
    expect(html).toContain('data-stub="attachments" data-read-only="true"');
    expect(html.indexOf('data-stub="attachments"')).toBeGreaterThan(html.indexOf('data-testid="office-sent-files"'));
    expect(html).not.toContain('data-stub="export"');
  });
});

/**
 * 「后台发来的文件」 (JB33). 客户 10-26 事项 9: 「这个文件接收框是用来接收后台发过来
 * 的gatepass和文件，请检查现场人员手机端材料和设备退场，文件接收框。」
 */
describe("an exit under 我提交过的 shows what the office sent (JB33)", () => {
  const OFFICE = "https://cdn.example/office/gate-pass.jpg";
  const words = messages.fieldStaffPwa.officeFiles;

  afterEach(() => {
    nav.search = "movement=mv-7";
  });

  function exitSent(
    client: import("@tanstack/react-query").QueryClient,
    kind: "EQUIPMENT_MOVEMENT" | "MATERIAL_OUTGOING",
    { sent = true, attachments = [] as unknown[] } = {},
  ) {
    nav.search = kind === "EQUIPMENT_MOVEMENT" ? "movement=mv-7" : `chat=${kind}:mv-7`;
    const opened = { ...row, kind };
    client.setQueryData(["my-submissions"], { results: [opened], count: 1 });
    const office = { id: "o1", url: OFFICE, thumbnail_url: null, caption: "Gate Pass" };
    client.setQueryData(["my-submissions", "detail", kind, "mv-7"], {
      ...opened,
      fields: [
        { key: "delivery_note_no", value: "DO-OUT-7" },
        ...(sent ? [{ key: "return_note_no", value: "RN-0042" }, { key: "approver_name", value: "Mr Tan" }] : []),
      ],
      photos: [{ id: "s1", url: "https://cdn.example/site.jpg", caption: "Exit gate" }, ...(sent ? [office] : [])],
      office_files: sent ? [office] : [],
    });
    client.setQueryData(["record-attachments", kind, "mv-7"], { attachments, closed: "", can_add: false });
  }

  /** The markup from the box on (it is the last block before the conversation). */
  const box = (html: string) => {
    const start = html.indexOf('data-testid="office-sent-files"');
    expect(start, "the box is drawn").toBeGreaterThan(-1);
    return html.slice(start);
  };

  for (const kind of ["EQUIPMENT_MOVEMENT", "MATERIAL_OUTGOING"] as const) {
    it(`${kind}: the office's file and the Return Note are in the box, not among the record's own`, () => {
      const html = renderDetail(<MySubmissions />, (client) => exitSent(client, kind));
      expect(html).toContain(words.title);
      const inBox = box(html);
      expect(inBox).toContain(OFFICE);
      expect(inBox).toContain("Gate Pass");
      expect(inBox).toContain(`download=""`);
      expect(inBox).toContain("RN-0042");
      expect(inBox).toContain("Mr Tan");
      // Said once: not also in the facts or the photo strip above it.
      expect(html.split("RN-0042")).toHaveLength(2);
      expect(html.slice(0, html.indexOf('data-testid="office-sent-files"'))).not.toContain(OFFICE);
      expect(html).toContain("https://cdn.example/site.jpg");
      expect(inBox).not.toContain(words.empty);
    });
  }

  it("says so when the office has sent nothing yet", () => {
    const html = renderDetail(<MySubmissions />, (client) => exitSent(client, "EQUIPMENT_MOVEMENT", { sent: false }));
    expect(html).toContain(words.empty);
    expect(html).not.toContain('data-stub="attachments"');
  });

  it("an attachment alone is not 'nothing sent'", () => {
    const html = renderDetail(<MySubmissions />, (client) =>
      exitSent(client, "MATERIAL_OUTGOING", { sent: false, attachments: [{ id: "a1" }] }),
    );
    expect(html).not.toContain(words.empty);
    expect(html).toContain('data-stub="attachments" data-read-only="true"');
  });

  it("other kinds have no such box", () => {
    const html = renderDetail(<MySubmissions />, (client) => {
      const opened = { ...row, kind: "PROGRESS" as const, status: "SUBMITTED" };
      client.setQueryData(["my-submissions"], { results: [opened], count: 1 });
      client.setQueryData(["my-submissions", "detail", "PROGRESS", "mv-7"], { ...opened, fields: [], photos: [] });
    });
    expect(html).not.toContain('data-testid="office-sent-files"');
  });
});

/**
 * Client 2026-10-09 二.4 / 五.3: opening a record draws its photos from their
 * thumbnails; the full photo is fetched only when one is opened. 五.2: the
 * list is read a page at a time.
 */
describe("the phone's history saves data (2026-10-09)", () => {
  const THUMB = "https://cdn.example/evidence/thumbnails/v2/w400/mv-7.webp";
  const FULL = "https://cdn.example/evidence/watermarked/v2/mv-7.jpg";

  function withThumbnails(client: import("@tanstack/react-query").QueryClient, next_before: string | null = null) {
    client.setQueryData(["my-submissions"], { results: [row], count: 30, truncated: Boolean(next_before), next_before });
    client.setQueryData(["my-submissions", "detail", "EQUIPMENT_MOVEMENT", "mv-7"], {
      ...row,
      fields: [{ key: "delivery_note_no", value: "DO-OUT-7" }],
      photos: [
        { id: "p1", url: FULL, thumbnail_url: THUMB, caption: "Exit gate" },
        { id: "p2", url: `${FULL}?2`, thumbnail_url: `${THUMB}?2`, caption: "Plate" },
      ],
    });
  }

  /** The `src` of the large first photo. */
  const heroSrc = (html: string) =>
    /data-shell-hero[^>]*>(?:(?!<\/button>)[\s\S])*?<img[^>]*src="([^"]+)"/.exec(html)?.[1] ?? null;

  it("on the phone, names the thumbnail first and offers the large photo for the square (J44)", () => {
    const html = renderDetail(<MySubmissions />, (client) => withThumbnails(client));
    expect(heroSrc(html)).toBe(THUMB);
    // A sharp screen takes the large one for the big square.
    expect(html).toContain(`srcSet="${THUMB} 400w, ${FULL} 1600w"`);
    expect(html).toContain(`${THUMB}?2`);
    // The strip stays small: never the second full photo.
    expect(html).not.toContain(`${FULL}?2`);
  });

  it("in the office, keeps the large first photo full size; only the strip uses thumbnails", () => {
    const html = renderDetail(
      <RecordDetailShell
        reference="EQ-SITE-007"
        facts={[]}
        photos={[
          { id: "p1", url: FULL, thumbnailUrl: THUMB, label: "Exit gate" },
          { id: "p2", url: `${FULL}?2`, thumbnailUrl: `${THUMB}?2`, label: "Plate" },
        ]}
      />,
    );
    expect(heroSrc(html)).toBe(FULL);
    // The 80 px strip: the thumbnail, never the second full photo.
    expect(html).toContain(`${THUMB}?2`);
    expect(html).not.toContain(`${FULL}?2`);
  });

  it("offers the next page only when the server says there is one", () => {
    const more = renderDetail(<MySubmissions />, (client) => withThumbnails(client, "2026-10-01T00:00:00Z"));
    expect(more).toContain("data-load-older");
    expect(more).toContain(messages.mySubmissions.loadOlder);
    // And says how much is left: 显示 1 条，共 30 条.
    expect(more).toContain("共 30 条");

    const last = renderDetail(<MySubmissions />, (client) => withThumbnails(client, null));
    expect(last).not.toContain("data-load-older");
  });
});
