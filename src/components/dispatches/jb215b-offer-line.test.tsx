/**
 * JB215B-5 (Lucas 11-17; walk 11-17 observation in portals-findings.md): the
 * recycler's order page for an order still waiting for the recycler
 * (PENDING_ACCEPTANCE) was reported with no line saying why it cannot be
 * changed. The line for that state was already in JB207W
 * (`dispatches.lockedBy.PENDING_ACCEPTANCE`) and `is_editable` is false for
 * it on the server (`WasteDispatch.is_editable`: DRAFT only), so the page
 * draws it for the recycler too - this pins that, for the recycler's portal
 * and the contractor's. (The walk's first order was likely read before the
 * page had loaded; see wt/review/jb215b.md.)
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { describe, expect, it, vi } from "vitest";

import type { WasteDispatchDetail } from "@/interfaces/contractor";
import messages from "@/messages/zh.json";

const reader = vi.hoisted(() => ({ portal: "MSE_SCRAP" }));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dispatches/d1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", portal: reader.portal }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ViewDispatch } = await import("@/components/dispatches/view-dispatch");

const offer = {
  id: "d1",
  dispatch_no: "DS-P-E2E-000001-001",
  state: "PENDING_ACCEPTANCE",
  waste_type: "GENERAL",
  is_editable: false,
  project: "p1",
  project_code: "P1",
  project_name: "E2E Tower",
  recycler_name: "E2E Recycling",
  estimated_weight_kg: "8000",
  description: "",
  vehicle_plate: "WBB 5001",
  driver_name: "",
  driver_phone: "",
  driver_ic: "",
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

function render(portal: string) {
  reader.portal = portal;
  return renderDetail(<ViewDispatch id="d1" />, (client) =>
    client.setQueryData(["dispatches", "detail", "d1"], offer),
  );
}

describe("JB215B-5 an order waiting for the recycler says why it cannot be changed", () => {
  it("on the recycler's order page", () => {
    const html = render("MSE_SCRAP");
    expect(html).toContain(messages.dispatches.state.PENDING_ACCEPTANCE);
    expect(html).toContain(messages.dispatches.lockedBy.PENDING_ACCEPTANCE);
  });

  it("on the contractor's", () => {
    expect(render("MSE_TRACE")).toContain(messages.dispatches.lockedBy.PENDING_ACCEPTANCE);
  });
});
