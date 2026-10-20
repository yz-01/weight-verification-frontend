/**
 * An already-corrected receipt does not open the correction form (JB1-2).
 *
 * Correcting a copy that a correction had already replaced - from 「上一页」,
 * an old link or the 「补供应商」 link - forked the delivery and both branches
 * counted (客户事项 6: 52t + 81t = 133t). The page now says where to make the
 * change and links to the latest copy instead.
 */
import { describe, expect, it, vi } from "vitest";

import type { MaterialReceiptDetail } from "@/interfaces/contractor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/receipts/r1/edit",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { EditReceipt } = await import("@/components/receipts/create-receipt");

const base = {
  id: "r1",
  receipt_no: "MI-P1-001",
  movement_type: "ENTRY",
  unit: "TONNE",
  project: "p1",
  project_name: "Tower A",
  material_name: "Rebar",
  quantity: "41.000",
  acceptance_status: "ACCEPTED",
  photos: [],
  correction_trail: null,
} as unknown as MaterialReceiptDetail;

function seeded(receipt: MaterialReceiptDetail) {
  return (client: import("@tanstack/react-query").QueryClient) =>
    client.setQueryData(["receipts", "detail", "r1"], receipt);
}

describe("EditReceipt on a copy already corrected (JB1-2)", () => {
  it("names the latest copy and links to its correction, with no form", () => {
    const html = renderDetail(
      <EditReceipt id="r1" />,
      seeded({
        ...base,
        superseded_by: {
          id: "r2",
          receipt_no: "MI-P1-002",
          latest: { id: "r3", receipt_no: "MI-P1-003" },
        },
      }),
    );
    expect(html).toContain("这张收货单已经更正过");
    expect(html).toContain("请到最新那张（MI-P1-003）再改");
    expect(html).toContain('href="/receipts/r3/edit"');
    expect(html).not.toContain("<form");
  });

  it("keeps 「补供应商」 on the way to the latest copy", () => {
    const html = renderDetail(
      <EditReceipt id="r1" fillSupplier />,
      seeded({ ...base, superseded_by: { id: "r2", receipt_no: "MI-P1-002" } }),
    );
    expect(html).toContain('href="/receipts/r2/edit?fill=supplier"');
  });
});
