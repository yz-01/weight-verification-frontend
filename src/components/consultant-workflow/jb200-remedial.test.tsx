/**
 * JB200 (Lucas 11-16) - 整改事项 that can actually be used.
 *
 * > 好的你帮我修一下，确保每个功能都可以使用
 *
 * Before: 【开一条整改】 needed an unsent draft, so the consultant never saw
 * it; the 「批准并要求整改」 dialog had only a remarks box; an item without a
 * name said 「没有指派人」. Now the dialog lists the work line by line, the
 * button is the approving reviewer's, every item says who answers for it and
 * who raised it, and 下一步 tells the contractor what to do.
 *
 * Rendered to static markup like the other detail tests (the runner has no
 * DOM); the request body is checked on the service.
 */
import { describe, expect, it, vi } from "vitest";

import type { ConsultantApplication } from "@/interfaces/consultant-workflow";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn() }));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api,
  toastSuccess: vi.fn(),
}));
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
  RecordExportButton: () => <div data-stub="export" />,
}));
vi.mock("@/components/shared/record-closure", () => ({
  useRecordArchived: () => false,
  RecordClosurePanel: () => <div data-stub="closure" />,
}));

const { RECORDER, renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ConsultantApplicationDetail, DecisionDialog } = await import(
  "@/components/consultant-workflow/application-detail"
);
const { reviewConsultantApplication } = await import("@/services/consultant-workflow.service");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const BASE = {
  id: "a1",
  application_no: "CA-P1-261116-001",
  revision: 1,
  project: "p1",
  project_name: "Tower A",
  project_address: "Jalan 1",
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
  final_report: "/media/report.pdf",
  final_decision: "APPROVED_WITH_REMEDIAL",
  archived_at: "2026-11-16T09:00:00Z",
  verification_code: "v1",
  is_locked: true,
  attachments: [],
  evidence_links: [],
  related_record_groups: [],
  approval_actions: [],
  archive_entries: [],
  revision_chain: [],
  ...RECORDER,
};

const ITEM = {
  id: "i1",
  application: "a1",
  description: "Patch the slab edge",
  assigned_to: null,
  assigned_to_name: null,
  due_on: "2026-11-20",
  status: "OPEN",
  is_overdue: false,
  closure_note: "",
  evidence: [],
  closed_at: null,
  closed_by: null,
  closed_by_name: null,
  created_by_name: "Consultant Engineer",
  created_at: "2026-11-16T09:00:00Z",
  updated_at: "2026-11-16T09:00:00Z",
};

function approvedBy(decidedBy: string, overrides: Record<string, unknown> = {}) {
  return {
    ...BASE,
    status: "APPROVED_WITH_REMEDIAL",
    review_steps: [
      {
        id: "s1",
        sequence: 1,
        name: "Consultant Approval",
        status: "APPROVED_WITH_REMEDIAL",
        reviewer_kind: "CONSULTANT",
        reviewer_user: null,
        reviewer_user_name: null,
        reviewer_role: null,
        reviewer_role_name: null,
        decided_by: decidedBy,
        decided_by_name: "Consultant Engineer",
        decided_at: "2026-11-16T09:00:00Z",
      },
    ],
    remedial_items: [ITEM],
    ...overrides,
  } as unknown as ConsultantApplication;
}

function detail(application: ConsultantApplication) {
  return renderDetail(<ConsultantApplicationDetail id="a1" presentation="dialog" />, (client) => {
    client.setQueryData(["consultant-application", "a1"], application);
    client.setQueryData(["approval-credential"], { id: "cred", signature: "/media/s.png", is_active: true });
  });
}

describe("整改事项 (JB200)", () => {
  it("gives 【开一条整改】 to the reviewer who approved with remedial works", () => {
    const html = detail(approvedBy("u1"));
    expect(html).toContain("开一条整改");
    // Who answers for it - the applicant when nobody is named - and who raised it.
    expect(text(html)).toContain("负责：Lee（申请人）");
    expect(text(html)).toContain("由 Consultant Engineer 提出");
    expect(text(html)).not.toContain("没有指派人");
    // 下一步 says what the contractor has to do.
    expect(text(html)).toContain("还有 1 条整改没完成");
  });

  it("does not give it to anybody else, who still sees the items", () => {
    const html = detail(approvedBy("someone-else"));
    expect(html).not.toContain("开一条整改");
    expect(text(html)).toContain("Patch the slab edge");
  });

  it("no longer shows it on a draft, where it used to be the only place", () => {
    const html = detail({
      ...BASE,
      status: "DRAFT",
      is_locked: false,
      final_report: null,
      final_decision: "",
      archived_at: null,
      review_steps: [],
      remedial_items: [],
    } as unknown as ConsultantApplication);
    expect(html).not.toContain("开一条整改");
  });

  it("lists the work line by line in the 「批准并要求整改」 dialog, remarks optional", () => {
    const html = renderDetail(
      <DecisionDialog
        application={approvedBy("u1", { status: "SUBMITTED" })}
        decision="APPROVE_WITH_REMEDIAL"
        hasCredential
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    expect(html).toContain('data-slot="remedial-lines"');
    expect(text(html)).toContain("第 1 条：要整改什么");
    expect(text(html)).toContain("再加一条");
    expect(text(html)).toContain("到期前一天会提醒负责的人");
    // The confirm button names the list as what is still missing.
    expect(text(html)).toMatch(/整改事项/);
  });

  it("keeps the other decisions as they were", () => {
    const html = renderDetail(
      <DecisionDialog
        application={approvedBy("u1", { status: "SUBMITTED" })}
        decision="REJECT"
        hasCredential
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    expect(html).not.toContain('data-slot="remedial-lines"');
  });
});

describe("the decision request (JB200)", () => {
  it("sends the list as JSON", async () => {
    api.post.mockResolvedValueOnce({ id: "a1" });
    await reviewConsultantApplication("a1", {
      decision: "APPROVE_WITH_REMEDIAL",
      remarks: "",
      approval_pin: "123456",
      remedial_items: [{ description: "Patch the slab edge", due_on: "2026-11-20" }],
    });
    expect(api.post).toHaveBeenLastCalledWith("/api/consultant-applications/a1/act/", {
      decision: "APPROVE_WITH_REMEDIAL",
      remarks: "",
      approval_pin: "123456",
      remedial_items: [{ description: "Patch the slab edge", due_on: "2026-11-20" }],
    });
  });

  it("sends it as one JSON value when a signed form makes it a form post", async () => {
    api.post.mockResolvedValueOnce({ id: "a1" });
    await reviewConsultantApplication("a1", {
      decision: "APPROVE_WITH_REMEDIAL",
      remarks: "ok",
      signing: "SIGNED_FORM",
      signed_form: new File(["%PDF"], "signed.pdf", { type: "application/pdf" }),
      remedial_items: [{ description: "Seal the joint", due_on: null }],
    });
    const body = api.post.mock.lastCall?.[1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(body.get("remedial_items")))).toEqual([
      { description: "Seal the joint", due_on: null },
    ]);
  });
});
