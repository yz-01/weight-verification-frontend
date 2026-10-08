/**
 * A record under 我提交过的 opens in the record-detail popup (E8, Q31).
 *
 * The same frame as every module's record, one column on the phone. No
 * 记录人: the worker opening it is the one who recorded it.
 */
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-staff",
  // The office's notice about a movement opens it here (Fable B4 #15).
  useSearchParams: () => new URLSearchParams("movement=mv-7"),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-1" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: ({ kind }: { kind: string }) => <div data-stub="export" data-kind={kind} />,
}));

const { RECORDER, renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { MySubmissions } = await import("@/components/field-staff/my-submissions");

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
    expect(html).not.toContain('data-stub="attachments"');
    expect(html).not.toContain('data-stub="export"');
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

  it("draws the record's photos from their thumbnails, not the full photos", () => {
    const html = renderDetail(<MySubmissions />, (client) => withThumbnails(client));
    expect(html).toContain(THUMB);
    expect(html).not.toContain(FULL);
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
