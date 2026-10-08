/**
 * The consultant application opens in the record-detail popup (E8, Q31).
 *
 * Lucas, 2026-10-08: 「以弹窗显示（跟改设计前一样）」 with the canvas's header
 * (number, status, 预览/打印 · 导出 PDF · 分享) and 记录人 with a number to tap
 * and call - 「只是改 design 和 layout，不要动到任何功能」, so the A4 form card,
 * the 下一步 decision buttons and the archive's 确认归档 are all still there.
 */
import { describe, expect, it, vi } from "vitest";

import type { ConsultantApplication } from "@/interfaces/consultant-workflow";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/consultant-applications",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", role: "r1" }, can: () => true }),
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
  RecordClosurePanel: ({ kind }: { kind: string }) => <div data-stub="closure" data-kind={kind} />,
}));

const { RECORDER, renderDetail, expectRecordPopup } = await import(
  "@/components/shared/record-detail-test-kit"
);
const { ConsultantApplicationDetail } = await import(
  "@/components/consultant-workflow/application-detail"
);

const application = {
  id: "a1",
  application_no: "CA-P1-261008-001",
  revision: 1,
  project: "p1",
  project_name: "Tower A",
  project_address: "Jalan 1",
  status: "SUBMITTED",
  application_type_label: "Inspection request",
  application_type_custom: "",
  application_type_code: "INSPECTION",
  discipline_label: null,
  discipline_custom: "",
  work_type_label: null,
  work_type_custom: "",
  priority_label: null,
  priority_custom: "",
  workflow_name: "Standard",
  template_name: null,
  template_version_number: null,
  template_field_schema: [],
  template_required_attachment_codes: [],
  schedule_task_wbs: null,
  schedule_task_name: null,
  inspection_category: "",
  location: "Level 3 slab",
  component: "Beam B12",
  description: "Rebar before casting",
  remarks: "",
  drawing_no: "",
  drawing_revision: "",
  itp_no: "",
  additional_discipline_labels: [],
  additional_work_type_labels: [],
  checklist_reference: "",
  required_at: null,
  inspection_start_at: null,
  inspection_end_at: null,
  inspection_timezone: "Asia/Kuala_Lumpur",
  custom_fields: {},
  applicant_name: "Lee",
  consultant: "c1",
  consultant_name: "Consultant Engineer",
  consultant_organization_name: "Acme Consult",
  received_at: null,
  received_by_name: null,
  acknowledged_at: null,
  acknowledged_by_name: null,
  final_report: null,
  final_decision: "",
  archived_at: null,
  verification_code: "",
  is_locked: true,
  attachments: [],
  evidence_links: [],
  related_record_groups: [],
  review_steps: [
    {
      id: "s1",
      sequence: 1,
      name: "Resident engineer",
      status: "CURRENT",
      reviewer_kind: "USER",
      reviewer_user: "u1",
      reviewer_user_name: "Tan",
      reviewer_role: null,
      reviewer_role_name: null,
      decided_at: null,
    },
  ],
  approval_actions: [],
  archive_entries: [],
  revision_chain: [],
  remedial_items: [],
  ...RECORDER,
} as unknown as ConsultantApplication;

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["consultant-application", "a1"], application);
  client.setQueryData(["approval-credential"], { id: "cred" });
}

describe("the consultant application detail (E8)", () => {
  it("opens as the record popup, with 记录人, the A4 form and the decision buttons", () => {
    const html = renderDetail(
      <ConsultantApplicationDetail id="a1" presentation="dialog" />,
      seeded,
    );
    expectRecordPopup(html, expect);
    expect(html).toContain("CA-P1-261008-001");
    // 预览 / 导出 PDF / 分享 once, in the header - not again on the A4 card.
    expect(html.match(/data-stub="export"/g) ?? []).toHaveLength(1);
    expect(html).toContain('data-kind="CONSULTANT_APPLICATION"');
    expect(html).toContain('data-testid="application-form-card"');
    expect(html).toContain('data-slot="application-form-print"');
    // The application's own facts, in the information grid.
    expect(html).toContain("data-shell-facts");
    expect(html).toContain("Beam B12");
    // 下一步 with the reviewer's decisions, in the action panel.
    expect(html).toContain("data-shell-actions");
    expect(html).toContain("下一步要做什么");
    expect(html).toMatch(/data-shell-actions[\s\S]*批准并要求整改/);
    // The office's 确认归档, not the shell's ungated one.
    expect(html).toContain('data-stub="closure"');
    // No back link in the popup: the list is still behind it.
    expect(html).not.toContain('href="/consultant-applications"');
    // No conversation panel: the application has none.
    expect(html).not.toContain('data-stub="conversation"');
  });

  it("renders the same frame on its own page for a typed or notified address", () => {
    const html = renderDetail(<ConsultantApplicationDetail id="a1" />, seeded);
    expect(html).toContain('data-record-detail="page"');
    expect(html).toContain("data-record-detail-header");
    expect(html).toContain('href="/consultant-applications"');
    expect(html).toContain("data-shell-recorder");
    expect(html).toContain('href="tel:+60123456789"');
  });

  it("keeps the 确认归档 from the consultant it was sent to", () => {
    const html = renderDetail(
      <ConsultantApplicationDetail id="a1" presentation="dialog" />,
      (client) => {
        client.setQueryData(["consultant-application", "a1"], { ...application, consultant: "u1" });
        client.setQueryData(["approval-credential"], { id: "cred" });
      },
    );
    expect(html).not.toContain('data-stub="closure"');
  });
});
