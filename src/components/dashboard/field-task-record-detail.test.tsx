/**
 * A field task opens in the record-detail popup (E8, Q31).
 *
 * Lucas, 2026-10-08: every record detail is the same popup, with 记录人 and
 * a number to tap and call. The 现场任务 list used to unfold a site task in a
 * strip under its row; that strip's information - the work location, the
 * reference material, the photo count with its GPS link - is in the popup
 * now, so nothing was lost by opening the popup instead.
 */
import { describe, expect, it, vi } from "vitest";

import type { FieldTask } from "@/interfaces/contractor-ops";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/field-tasks",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "manager" }, can: () => true }),
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
const { FieldTaskSheet } = await import("@/components/dashboard/field-task-sheet");

const task = {
  id: "t1",
  origin: "SITE",
  project: "p1",
  project_name: "Tower A",
  title: "Check rebar at grid C",
  task_type: "INSPECTION",
  instructions: "Photograph every bay",
  work_location: "Grid C1-D1",
  submission_category: "",
  assigned_to: "worker",
  assigned_to_name: "Mei Ling",
  created_by: "publisher",
  category: null,
  category_name: null,
  priority: "NORMAL",
  due_at: "2026-10-09T02:00:00Z",
  status: "SUBMITTED",
  evidence_required: 2,
  started_at: null,
  start_latitude: null,
  start_longitude: null,
  start_accuracy_m: null,
  submitted_at: "2026-10-08T03:00:00Z",
  reviewed_at: null,
  review_note: "",
  result_note: "",
  client_event_id: "e1",
  linked_record_type: "",
  linked_record_id: null,
  linked_record_reference: "",
  linked_at: null,
  photos: [
    {
      id: "ph1",
      image: "https://cdn.example/t1/1.jpg",
      watermarked: "https://cdn.example/t1/1-wm.jpg",
      caption: "Bay 1",
      captured_at: "2026-10-08T02:30:00Z",
      uploaded_at: "2026-10-08T02:31:00Z",
      latitude: "3.1",
      longitude: "101.6",
      accuracy_m: "5",
      device_id: "d1",
      client_event_id: "c1",
    },
  ],
  references: [
    {
      id: "ref1",
      kind: "FILE",
      file: "https://cdn.example/t1/drawing.pdf",
      label: "Drawing S-12",
      original_filename: "s12.pdf",
      content_type: "application/pdf",
      size_bytes: 100,
      created_at: "2026-10-08T01:00:00Z",
    },
  ],
  photo_count: 1,
  consultant_application: null,
  is_overdue: false,
  created_at: "2026-10-08T01:00:00Z",
  updated_at: "2026-10-08T03:00:00Z",
  ...RECORDER,
} as unknown as FieldTask;

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["field-tasks", "detail", "t1"], task);
}

describe("the field task detail (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const html = renderDetail(<FieldTaskSheet id="t1" onClose={() => {}} />, seeded);
    expectRecordPopup(html, expect);
    expect(html).toContain("Check rebar at grid C");
    expect(html).toContain('data-field-task-sheet="SITE"');
    // FIELD_TASK is not an exportable kind: no export button.
    expect(html).not.toContain('data-stub="export"');
    // Its own conversation and attachments, as before.
    expect(html).toContain('data-stub="conversation"');
    expect(html).toContain('data-stub="attachments"');
  });

  it("keeps what the list's strip used to show, and the confirm buttons", () => {
    const html = renderDetail(<FieldTaskSheet id="t1" onClose={() => {}} />, seeded);
    // The facts and the strip's work location.
    expect(html).toContain("Mei Ling");
    expect(html).toContain("Photograph every bay");
    expect(html).toContain("Grid C1-D1");
    // The reference material, the photo count and the GPS link.
    expect(html).toContain("参考资料（1）");
    expect(html).toContain("Drawing S-12");
    expect(html).toContain("照片：1/2");
    expect(html).toContain('href="https://www.google.com/maps?q=3.1,101.6"');
    expect(html).toContain("https://cdn.example/t1/1-wm.jpg");
    // A submitted site task, opened by a task manager who is not its
    // assignee: 【退回】 and 【确认完成】 in the action panel.
    expect(html).toContain("data-shell-actions");
    expect(html).toContain("data-task-decide");
    expect(html).toContain("确认完成");
  });

  it("draws the loading state in the same popup frame", () => {
    const html = renderDetail(<FieldTaskSheet id="missing" onClose={() => {}} />);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain("载入中");
  });
});
