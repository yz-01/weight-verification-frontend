/**
 * The record sheet (现场记录中心, a category's records, the 总部 approval
 * list, a dashboard photo) opens in the record-detail popup (E8, Q31).
 *
 * Lucas, 2026-10-08: one popup for every module's record, with the canvas's
 * header and 记录人 with a number to tap and call - 「只是改 design 和
 * layout，不要动到任何功能」, so the sheet's own parts are still there.
 */
import { describe, expect, it, vi } from "vitest";

import type { ArchiveQueueRow, RecordSheetKind } from "@/interfaces/contractor-ops";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/archive-queue",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
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
vi.mock("@/components/shared/record-closure", () => ({
  RecordClosurePanel: () => <div data-stub="closure" />,
}));

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { RecordSheet } = await import("@/components/contractor-ops/archive-queue");

function row(kind: RecordSheetKind, overrides: Partial<ArchiveQueueRow<RecordSheetKind>> = {}) {
  return {
    id: "r1",
    kind,
    reference: "PG-P1-261008-001",
    detail: "",
    project_id: "p1",
    project_name: "Tower A",
    submitted_at: "2026-10-08T02:00:00Z",
    status: "SUBMITTED",
    status_label: "",
    photo: null,
    seen_at: null,
    archivable: true,
    archived: null,
    ...overrides,
  } as ArchiveQueueRow<RecordSheetKind>;
}

function seeded(r: ArchiveQueueRow<RecordSheetKind>, door: "queue" | "column" = "queue") {
  return (client: import("@tanstack/react-query").QueryClient) =>
    client.setQueryData(["archive-queue", "detail", door, r.kind, r.id], {
      ...r,
      fields: [{ key: "delivery_note_no", value: "DO-7781" }],
      photos: [{ url: "https://cdn.example/p1.jpg", caption: "Slab pour" }],
      is_seen: false,
      ...RECORDER,
    });
}

describe("the record sheet (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const r = row("PROGRESS");
    const html = renderDetail(<RecordSheet row={r} onClose={() => {}} />, seeded(r));
    expectRecordPopup(html, expect);
    expect(html).toContain("PG-P1-261008-001");
    // The status pill beside the number, in the list's words.
    expect(html).toContain(messages.contractorOps.progressStatus.SUBMITTED);
    // Its own parts: the fields, the photograph, the export, the conversation.
    expect(html).toContain("DO-7781");
    expect(html).toContain("https://cdn.example/p1.jpg");
    expect(html).toContain('data-kind="PROGRESS"');
    expect(html).toContain('data-stub="conversation"');
    // The conversation alone, as the sheet always had it.
    expect(html).not.toContain('data-stub="attachments"');
    // Read-only unless asked to confirm (C4).
    expect(html).not.toContain('data-stub="closure"');
  });

  it("reads a column's record through its own door and shows the caller's buttons", () => {
    const r = row("DOCUMENT", { status: "ACTIVE" });
    const html = renderDetail(
      <RecordSheet
        row={r}
        fetchRecord={() => new Promise<never>(() => {})}
        actions={<button type="button" data-stub="decision" />}
        onClose={() => {}}
      />,
      seeded(r, "column"),
    );
    expectRecordPopup(html, expect);
    expect(html).toContain("data-shell-actions");
    expect(html).toContain('data-stub="decision"');
    // Not a kind the export endpoint prints, nor one with a conversation.
    expect(html).not.toContain('data-stub="export"');
    expect(html).not.toContain('data-stub="conversation"');
  });

  it("sends a pending delivery to its own page, and offers the confirm only when asked", () => {
    const receipt = row("MATERIAL_RECEIPT", { status: "PENDING" });
    const pending = renderDetail(<RecordSheet row={receipt} onClose={() => {}} />, seeded(receipt));
    expect(pending).toContain('href="/receipts/r1"');
    expect(pending).toContain(messages.archiveQueue.goToReceipt);

    const progress = row("PROGRESS");
    const asked = renderDetail(<RecordSheet row={progress} confirm onClose={() => {}} />, seeded(progress));
    expect(asked).toContain('data-stub="closure"');
  });

  it("has no 记录人 for a day of attendance, which nobody in particular recorded", () => {
    const r = row("ATTENDANCE_DAY", { status: "", status_label: "3" });
    const html = renderDetail(<RecordSheet row={r} onClose={() => {}} />, seeded(r));
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).not.toContain("data-shell-recorder");
    expect(html).not.toContain('data-stub="export"');
  });

  it("keeps the same popup while the record loads", () => {
    const r = row("PROGRESS");
    const html = renderDetail(<RecordSheet row={r} onClose={() => {}} />);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain(messages.archiveQueue.loading);
    expect(html).not.toContain("data-shell-recorder");
  });
});
