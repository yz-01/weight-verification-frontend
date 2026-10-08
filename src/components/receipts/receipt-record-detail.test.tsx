/**
 * The material receipt opens in the record-detail popup (E8, Q31).
 *
 * Lucas, 2026-10-08: 「以弹窗显示（跟改设计前一样）」, with the canvas's
 * header (number, status, 预览/打印 · 导出 PDF · 分享) and 记录人 with a
 * number to tap and call. From inside the app `/receipts/<id>` is that popup;
 * typed or opened from a notification it is the same frame on a page.
 */
import { describe, expect, it, vi } from "vitest";

import type { MaterialReceiptDetail } from "@/interfaces/contractor";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/receipts",
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

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { ViewReceipt } = await import("@/components/receipts/view-receipt");

const receipt = {
  id: "r1",
  receipt_no: "RC-P1-261008-001",
  movement_type: "ENTRY",
  unit: "TONNE",
  unit_label: "",
  project: "p1",
  project_name: "Tower A",
  material_name: "C30 concrete",
  quantity: "6.000",
  business_at: "2026-10-08T02:00:00Z",
  captured_at: "2026-10-08T02:00:00Z",
  acceptance_status: "PENDING",
  ocr_status: "DONE",
  photos: [],
  signature: null,
  supplier_signature: null,
  supersedes: null,
  superseded_by: null,
  correction_trail: null,
  correction_reason: "",
  notes: "",
  received_by_name: "",
  ...RECORDER,
} as unknown as MaterialReceiptDetail;

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["receipts", "detail", "r1"], receipt);
}

describe("the receipt detail (E8)", () => {
  it("opens as the record popup, with 记录人 and a tap-to-call number", () => {
    const html = renderDetail(<ViewReceipt id="r1" presentation="dialog" />, seeded);
    expectRecordPopup(html, expect);
    expect(html).toContain("RC-P1-261008-001");
    expect(html).toContain('data-kind="MATERIAL_RECEIPT"');
    // No back link in the popup: the list is still behind it.
    expect(html).not.toContain('href="/receipts"');
  });

  it("renders the same frame on its own page for a typed or notified address", () => {
    const html = renderDetail(<ViewReceipt id="r1" />, seeded);
    expect(html).toContain('data-record-detail="page"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain('href="/receipts"');
    expect(html).toContain("data-shell-recorder");
    expect(html).toContain('href="tel:+60123456789"');
  });
});
