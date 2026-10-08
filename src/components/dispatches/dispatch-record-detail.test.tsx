/**
 * The dispatch opens in the record-detail popup (E8, Q31).
 *
 * Raised in the office, not submitted from a phone, so it has the shared
 * frame and arrangement but no 记录人 block. From inside the app
 * `/dispatches/<id>` is that popup; typed or opened from a notification it is
 * the same frame on a page.
 */
import { describe, expect, it, vi } from "vitest";

import type { WasteDispatchDetail } from "@/interfaces/contractor";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/waste-clearance",
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
const { ViewDispatch } = await import("@/components/dispatches/view-dispatch");

const dispatch = {
  id: "d1",
  dispatch_no: "DS-P1-261008-001",
  state: "DRAFT",
  waste_type: "GENERAL",
  is_editable: true,
  project: "p1",
  project_code: "P1",
  project_name: "Tower A",
  recycler_name: "Green Metal Sdn Bhd",
  estimated_weight_kg: "1200",
  description: "Mixed site waste",
  vehicle_plate: "WXY 1234",
  driver_name: "Kumar",
  driver_phone: "012-3334444",
  driver_ic: "800101-14-5555",
  released_at: null,
  released_by_name: "",
  latitude: null,
  longitude: null,
  source_record_id: null,
  source_record: null,
  photos: [],
  events: [],
  tasks: [],
  weighing: null,
  settlement: null,
} as unknown as WasteDispatchDetail;

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["dispatches", "detail", "d1"], dispatch);
}

describe("the dispatch detail (E8)", () => {
  it("opens as the record popup with its number, status and buttons", () => {
    const html = renderDetail(<ViewDispatch id="d1" presentation="dialog" />, seeded);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain("DS-P1-261008-001");
    expect(html).toContain(messages.dispatches.state.DRAFT);
    // Its own facts and the decision buttons, in the shell's places.
    expect(html).toContain("data-shell-facts");
    expect(html).toContain("Green Metal Sdn Bhd");
    expect(html).toContain("800101-14-5555");
    expect(html).toContain("data-shell-actions");
    expect(html).toContain(messages.dispatches.release.confirm);
    expect(html).toContain(messages.dispatches.cancel.confirm);
    // Raised in the office: no recorder block, and no back link in the popup.
    expect(html).not.toContain("data-shell-recorder");
    expect(html).not.toContain('href="/waste-clearance?kind=dispatch"');
  });

  it("renders the same frame on its own page for a typed or notified address", () => {
    const html = renderDetail(<ViewDispatch id="d1" />, seeded);
    expect(html).toContain('data-record-detail="page"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain('href="/waste-clearance?kind=dispatch"');
    expect(html).toContain("DS-P1-261008-001");
  });
});
