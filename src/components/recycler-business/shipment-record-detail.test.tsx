/**
 * A recycler's outbound shipment opens in the record-detail popup (E8, Q31).
 *
 * Entered in the office, not submitted from a phone, so it has the shared
 * frame and arrangement but no 记录人 block.
 */
import { describe, expect, it, vi } from "vitest";

import type { OutboundShipment } from "@/interfaces/recycler-business";
import messages from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/recycler-outbound",
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
const { ShipmentDetailDialog } = await import(
  "@/components/recycler-business/recycler-outbound-workspace"
);

const shipment = {
  id: "s1",
  shipment_no: "OB-261008-001",
  buyer: "b1",
  buyer_no: "BY-001",
  buyer_name: "Steel Buyer Sdn Bhd",
  material_type: "METAL",
  business_source: "PLATFORM",
  weight_kg: "850.000",
  outbound_date: "2026-10-08",
  vehicle_plate: "WXY 1234",
  driver_name: "",
  e_invoice_no: "",
  notes: "",
  state: "DRAFT",
  confirmed_at: null,
  confirmed_by_name: null,
  cancelled_at: null,
  cancellation_reason: "",
  balance_after_kg: null,
  attachments: [],
  created_at: "2026-10-08T02:00:00Z",
  updated_at: "2026-10-08T02:00:00Z",
} as unknown as OutboundShipment;

describe("the outbound shipment detail (E8)", () => {
  it("opens as the record popup with its facts and documents", () => {
    const html = renderDetail(<ShipmentDetailDialog shipment={shipment} onClose={() => {}} />);
    expect(html).toContain('data-record-detail="dialog"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain("OB-261008-001");
    expect(html).toContain(messages.recyclerBusiness.outboundState.DRAFT);
    expect(html).toContain("data-shell-facts");
    expect(html).toContain("Steel Buyer Sdn Bhd");
    expect(html).toContain("850.000 kg");
    expect(html).toContain(messages.recyclerBusiness.outbound.attachments);
    expect(html).toContain(messages.recyclerBusiness.outbound.noAttachments);
    expect(html).toContain(messages.recyclerBusiness.action.upload);
    expect(html).not.toContain("data-shell-recorder");
  });
});
