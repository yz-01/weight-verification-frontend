/**
 * The material-outgoing application opens in the record-detail popup with
 * 记录人 (E8, Q31): avatar, name and a number to tap and call.
 */
import { describe, expect, it, vi } from "vitest";

import type { MaterialOutgoing } from "@/interfaces/contractor-ops";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/material-outgoing",
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
vi.mock("@/components/contractor-ops/add-to-package", () => ({
  AddToPackageButton: () => <div data-stub="package" />,
}));

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { OutgoingDetailDialog } = await import(
  "@/components/contractor-ops/operations-workspaces"
);

const outgoing = {
  id: "o1",
  reference_no: "MO-P1-261008-001",
  project: "p1",
  project_name: "Tower A",
  supplier_name: "Steel Bhd",
  material_name: "Rebar",
  material_specification: "T12",
  quantity: "2.000",
  unit: "TONNE",
  unit_label: "",
  destination: "Supplier yard",
  executor_name: "Ah Kow",
  vehicle_plate: "WXY 1234",
  delivery_note_no: "",
  reason: "Wrong size delivered",
  status: "PENDING",
  captured_at: "2026-10-08T02:00:00Z",
  latitude: null,
  longitude: null,
  submitted_by_name: "Ah Seng",
  approved_by_name: null,
  approved_at: null,
  review_note: "",
  photos: [],
  has_return_note: false,
  ...RECORDER,
} as unknown as MaterialOutgoing;

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["material-outgoing", "detail", "o1"], outgoing);
}

describe("the material outgoing detail (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const html = renderDetail(<OutgoingDetailDialog id="o1" onClose={() => {}} />, seeded);
    expectRecordPopup(html, expect);
    expect(html).toContain("MO-P1-261008-001");
    expect(html).toContain('data-kind="MATERIAL_OUTGOING"');
    // Its own facts and buttons, unchanged.
    expect(html).toContain("Wrong size delivered");
    expect(html).toContain("WXY 1234");
    expect(html).toContain('data-stub="package"');
  });
});
