/**
 * The recycler's trip opens in the record-detail popup (E8, Q31).
 *
 * Assigned in the office, not submitted from a phone, so it has the shared
 * frame and arrangement but no 记录人 block. From inside the app
 * `/tasks/<id>` is that popup; typed or opened from a notification it is the
 * same frame on a page.
 */
import { describe, expect, it, vi } from "vitest";

import type { DriverTaskDetail } from "@/interfaces/recycler";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/tasks",
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

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ViewTask } = await import("@/components/tasks/view-task");

const task = {
  id: "t1",
  task_no: "TK-261008-001",
  state: "ASSIGNED",
  dispatch_no: "DS-P1-261008-001",
  contractor_name: "Acme Builders",
  project_name: "Tower A",
  site_name: "Main yard",
  driver_name: "Kumar",
  vehicle_plate: "WXY 1234",
  scheduled_for: "2026-10-08T02:00:00Z",
  accepted_at: null,
  arrived_at: null,
  loaded_at: null,
  delivered_at: null,
  completed_at: null,
  arrival_latitude: null,
  arrival_longitude: null,
  notes: "",
  failure_reason: "",
  photos: [],
} as unknown as DriverTaskDetail;

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["tasks", "detail", "t1"], task);
}

describe("the trip detail (E8)", () => {
  it("opens as the record popup with its number, status and buttons", () => {
    const html = renderDetail(<ViewTask id="t1" presentation="dialog" />, seeded);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain("TK-261008-001");
    // Reassign and cancel sit in the header, the next steps in the actions.
    expect(html).toContain('href="/tasks/t1/edit"');
    expect(html).toContain(messages.tasks.cancel.action);
    expect(html).toContain("data-shell-actions");
    expect(html).toContain(messages.tasks.state.ACCEPTED);
    // Its own facts and its progress panel.
    expect(html).toContain("Acme Builders");
    expect(html).toContain(messages.tasks.section.progress);
    expect(html).not.toContain("data-shell-recorder");
    expect(html).not.toContain('href="/tasks"');
  });

  it("renders the same frame on its own page for a typed or notified address", () => {
    const html = renderDetail(<ViewTask id="t1" />, seeded);
    expect(html).toContain('data-record-detail="page"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("TK-261008-001");
  });
});
