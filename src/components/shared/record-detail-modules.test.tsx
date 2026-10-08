/**
 * The modules that were already on the shared shell now show 记录人 too (E8).
 *
 * Rendered in their popup, each with a record the server sends with its
 * recorder: the block is there, with the name and a `tel:` link to call.
 * (Hazards, gate records, tasks, applications, threads, machine-days and the
 * record sheet have their own `*-record-detail.test.tsx`; the inline office
 * details of equipment, progress and recyclables are asserted by source in
 * `record-detail-guard.test.ts`.)
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u-office" }, can: () => true }),
}));
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
  recordConversationKey: (kind: string, id: string) => ["record-conversation", kind, id],
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));
vi.mock("@/components/shared/record-closure", () => ({
  RecordClosurePanel: () => <div data-stub="closure" />,
  useRecordArchived: () => false,
  recordClosureKey: (kind: string, id: string) => ["record-closure", kind, id],
}));

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { SundryClaimDetail } = await import("@/components/sundry-claims/sundry-claims-office");
const { MaterialRequestDetail } = await import(
  "@/components/material-requests/material-requests-office"
);

describe("记录人 on the modules already on the shell (E8)", () => {
  it("a sundry claim", () => {
    const html = renderDetail(<SundryClaimDetail id="c1" onClose={() => {}} />, (client) =>
      client.setQueryData(["sundry-claims", "detail", "c1"], {
        id: "c1",
        claim_no: "CLM-P1-2610-001",
        project: "p1",
        project_name: "Tower A",
        project_code: "P1",
        amount: "12.00",
        description: "Cable ties",
        state: "SUBMITTED",
        payment_state: "UNPAID",
        is_paid: false,
        captured_at: "2026-10-08T02:00:00Z",
        latitude: null,
        longitude: null,
        submitted_by: "u1",
        submitted_by_name: RECORDER.created_by_name,
        review_note: "",
        reviewed_by_name: null,
        reviewed_by_user_id: null,
        reviewed_at: null,
        paid_by_name: null,
        paid_by_user_id: null,
        paid_at: null,
        payment_note: "",
        attachments: [],
        payment_proofs: [],
        category: null,
        category_name: null,
        created_at: "2026-10-08T02:00:00Z",
        ...RECORDER,
      }),
    );
    expectRecordPopup(html, expect);
    expect(html).toContain("CLM-P1-2610-001");
  });

  it("a material request", () => {
    const html = renderDetail(
      <MaterialRequestDetail id="m1" onClose={() => {}} onRaiseAgain={() => {}} />,
      (client) =>
        client.setQueryData(["material-requests", "detail", "m1"], {
          id: "m1",
          request_no: "MR-P1-261008-001",
          request_type: "MATERIAL",
          status: "PENDING",
          project: "p1",
          project_name: "Tower A",
          project_code: "P1",
          material_name: "Rebar",
          specification: "Y12",
          quantity: "2.000",
          unit: "TONNE",
          remark: "",
          supplier: null,
          supplier_name: null,
          manufacturer: null,
          manufacturer_name: null,
          manufacturer_off_list: false,
          submitted_by: "u1",
          submitted_by_name: RECORDER.created_by_name,
          submitted_at: "2026-10-08T02:00:00Z",
          assigned_reviewer: null,
          assigned_reviewer_name: null,
          decided_by_name: null,
          decided_at: null,
          decision_note: "",
          attachments: [],
          attachment_count: 0,
          decisions: [],
          created_at: "2026-10-08T02:00:00Z",
          ...RECORDER,
        }),
    );
    expectRecordPopup(html, expect);
    expect(html).toContain("MR-P1-261008-001");
  });
});
