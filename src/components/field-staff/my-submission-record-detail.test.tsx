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
