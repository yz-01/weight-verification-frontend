/**
 * JB236 (客户 11-20 事项 8) - 整改复核: the result and photos go back to the
 * consultant who raised the item; 「整改合格」 or 「退回继续整改」; only then
 * 「整改验收通过」. Before he accepts, nothing reads finished or archived
 * (图10 showed 申请 / 审批 / 最终报告 / 归档 all 「已完成」).
 *
 * Rendered to static markup like the other detail tests (the runner has no
 * DOM). The reader's buttons are switched per test (`auth.perms`).
 */
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/zh.json";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn(), patch: vi.fn() }));
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
const auth = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
  perms: null as string[] | null,
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: auth.user,
    can: (code: string) => auth.perms === null || auth.perms.includes(code),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/providers/current-project-provider", async (original) => ({
  ...(await original<typeof import("@/components/providers/current-project-provider")>()),
  usePageProject: () => ["p1", () => undefined],
  useProjectBoxShown: () => false,
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

const { renderDetail, RECORDER } = await import("@/components/shared/record-detail-test-kit");
const { ConsultantApplicationDetail, lifecycleStages, remedialBadge, remedialNextText } = await import(
  "@/components/consultant-workflow/application-detail"
);

const zh = messages.consultantWorkflow;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const OFFICE = { id: "u1", role: "r1", account_type: "TENANT" };
const CONSULTANT = {
  id: "c1",
  role: null,
  account_type: "CONSULTANT",
  active_project: { project_id: "p1" },
  consultant_projects: [{ project_id: "p1", project_code: "P1", project_name: "Tower A", is_current: true }],
};
const CONSULTANT_PERMS = ["approval.view", "approval.review", "project.view", "notification.view"];
const OFFICE_PERMS = ["approval.view", "consultant.submit", "project.view"];

const PHOTO = {
  id: "e1",
  kind: "PHOTO",
  file: "/media/e1.png",
  watermarked_file: "/media/e1-w.png",
  original_filename: "slab.png",
  content_type: "image/png",
  captured_at: "2026-11-20T09:00:00Z",
};

const ITEM = {
  id: "i1",
  application: "a1",
  description: "Patch the slab edge",
  assigned_to: null,
  assigned_to_name: null,
  due_on: null,
  status: "OPEN",
  is_overdue: false,
  closure_note: "",
  evidence: [],
  evidence_files: [],
  closed_at: null,
  closed_by: null,
  closed_by_name: null,
  created_by_name: "lily",
  created_by: "c1",
  rounds: [],
  can_review: false,
  reviewer_names: [],
  created_at: "2026-11-20T09:00:00Z",
  updated_at: "2026-11-20T09:00:00Z",
};

const SUBMITTED = {
  ...ITEM,
  status: "SUBMITTED",
  reviewer_names: ["lily"],
  rounds: [
    { id: "r1", number: 1, event: "SUBMITTED", note: "pls check TQ", evidence_files: [PHOTO], actor: "u1", actor_name: "测试建筑商 1", acted_at: "2026-11-20T15:23:42Z" },
  ],
};

const RETURNED_THEN_SUBMITTED = {
  ...SUBMITTED,
  rounds: [
    ...SUBMITTED.rounds,
    { id: "r2", number: 1, event: "RETURNED", note: "Edge still rough", evidence_files: [], actor: "c1", actor_name: "lily", acted_at: "2026-11-21T09:00:00Z" },
    { id: "r3", number: 2, event: "SUBMITTED", note: "Ground smooth now", evidence_files: [PHOTO], actor: "u1", actor_name: "测试建筑商 1", acted_at: "2026-11-22T09:00:00Z" },
  ],
};

const DECIDED_STEP = {
  id: "s1",
  sequence: 1,
  name: "顾问审批 / Consultant review",
  status: "APPROVED_WITH_REMEDIAL",
  reviewer_kind: "CONSULTANT",
  reviewer_user: null,
  reviewer_user_name: null,
  reviewer_role: null,
  reviewer_role_name: null,
  decided_by: "c1",
  decided_by_name: "lily",
  decided_at: "2026-11-20T15:19:59Z",
};

const APPLICATION = {
  id: "a1",
  application_no: "PRJ-0003-RFI-0002",
  revision: 0,
  project: "p1",
  project_name: "PUTRA_MAS",
  project_address: "Jalan 1",
  application_type_label: "RFI",
  application_type_custom: "",
  application_type_code: "RFI",
  discipline_label: null,
  discipline_custom: "",
  work_type_label: null,
  work_type_custom: "",
  priority_label: null,
  priority_custom: "",
  workflow_name: "顾问审批 / Consultant review",
  template_name: null,
  template_version_number: null,
  template_field_schema: [],
  template_required_attachment_codes: [],
  schedule_task_wbs: null,
  schedule_task_name: null,
  inspection_category: "",
  location: "",
  component: "",
  description: "123",
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
  applicant_name: "测试建筑商 1",
  consultant: "c1",
  consultant_name: "lily",
  consultant_organization_name: "ABC",
  received_at: "2026-11-20T09:00:00Z",
  received_by_name: "lily",
  acknowledged_at: "2026-11-20T09:00:00Z",
  acknowledged_by_name: "lily",
  status: "APPROVED_WITH_REMEDIAL",
  final_decision: "APPROVED_WITH_REMEDIAL",
  final_report: null,
  archived_at: null,
  verification_code: "",
  is_locked: true,
  attachments: [],
  evidence_links: [],
  related_record_groups: [],
  approval_actions: [],
  archive_entries: [],
  remedial_items: [ITEM],
  review_steps: [DECIDED_STEP],
  revision_chain: [],
  ...RECORDER,
};

function as(user: Record<string, unknown>, perms: string[] | null) {
  auth.user = user;
  auth.perms = perms;
}

function detail(application: Record<string, unknown>) {
  return renderDetail(<ConsultantApplicationDetail id="a1" presentation="dialog" />, (client) => {
    client.setQueryData(["consultant-application", "a1"], { ...APPLICATION, ...application });
    client.setQueryData(["approval-credential"], { id: "cred", signature: "/media/s.png", is_active: true });
  });
}

function nextStep(html: string) {
  const found = new RegExp(String.raw`>${zh.detail.nextAction}</h3>\s*<p[^>]*>([\s\S]*?)</p>`).exec(html);
  expect(found, "no 下一步 on the page").toBeTruthy();
  return text(found![1]);
}

const t = (key: string, values?: Record<string, string | number>) => {
  let sentence = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], zh) as string;
  for (const [name, value] of Object.entries(values ?? {})) sentence = sentence.replace(`{${name}}`, String(value));
  return sentence;
};

describe("the stepper (图10)", () => {
  const keys = (stages: ReturnType<typeof lifecycleStages>) =>
    stages.map((stage) => `${stage.key}:${stage.complete ? "done" : stage.current ? "now" : "-"}`);

  it("shows 整改复核 for a remedial approval and nothing after it done before acceptance", () => {
    expect(
      keys(lifecycleStages({ status: "APPROVED_WITH_REMEDIAL", final_decision: "APPROVED_WITH_REMEDIAL", final_report: null, archived_at: null })),
    ).toEqual(["application:done", "approval:done", "remedial:now", "final:-", "archive:-"]);
  });

  it("does not count an old report made at signing as done", () => {
    expect(
      keys(
        lifecycleStages({
          status: "APPROVED_WITH_REMEDIAL",
          final_decision: "APPROVED_WITH_REMEDIAL",
          final_report: "/media/old.pdf",
          archived_at: "2026-11-20T15:20:00Z",
        }),
      ),
    ).toEqual(["application:done", "approval:done", "remedial:now", "final:-", "archive:-"]);
  });

  it("is all done once the remedial works are accepted", () => {
    expect(
      keys(
        lifecycleStages({
          status: "REMEDIAL_ACCEPTED",
          final_decision: "APPROVED_WITH_REMEDIAL",
          final_report: "/media/final.pdf",
          archived_at: "2026-11-22T09:00:00Z",
        }),
      ),
    ).toEqual(["application:done", "approval:done", "remedial:done", "final:done", "archive:done"]);
  });

  it("keeps four steps for a plain approval", () => {
    expect(
      keys(lifecycleStages({ status: "APPROVED", final_decision: "APPROVED", final_report: "/r.pdf", archived_at: "2026-11-22T09:00:00Z" })),
    ).toEqual(["application:done", "approval:done", "final:done", "archive:done"]);
  });

  it("draws 整改复核 on the page and no 「已完成」 on the archive step", () => {
    as(OFFICE, OFFICE_PERMS);
    const html = detail({ final_report: "/media/old.pdf", archived_at: "2026-11-20T15:20:00Z" });
    expect(html).toContain(zh.detail.lifecycle.remedial);
    expect(text(html)).not.toContain(zh.detail.next.archived);
  });
});

describe("下一步 per reader", () => {
  it("tells the contractor to finish and submit for review, and that nothing is finished yet", () => {
    as(OFFICE, OFFICE_PERMS);
    const said = nextStep(detail({}));
    expect(said).toContain("请完成整改并提交顾问复核");
    expect(said).toContain("顾问确认整改合格前，这份申请不会完成，也不会归档。");
  });

  it("tells the consultant how many wait for his review", () => {
    as(CONSULTANT, CONSULTANT_PERMS);
    const said = nextStep(detail({ remedial_items: [{ ...SUBMITTED, can_review: true }, { ...SUBMITTED, id: "i2", can_review: true }] }));
    expect(said).toContain("有 2 条整改等您复核");
    expect(said).toContain("顾问确认整改合格前");
  });

  it("tells the contractor a submitted item waits for the consultant", () => {
    expect(remedialNextText({ remedial_items: [SUBMITTED] as never }, t, { canSubmit: true, canRaise: false })).toBe(
      "有 1 条整改已经提交，正在等顾问复核。 顾问确认整改合格前，这份申请不会完成，也不会归档。",
    );
  });

  it("says 整改验收通过 once accepted and archived", () => {
    as(OFFICE, OFFICE_PERMS);
    const said = nextStep(
      detail({
        status: "REMEDIAL_ACCEPTED",
        final_report: "/media/final.pdf",
        archived_at: "2026-11-22T09:00:00Z",
        remedial_items: [{ ...ITEM, status: "ACCEPTED" }],
      }),
    );
    expect(said).toBe(zh.detail.next.remedialAccepted);
  });
});

describe("整改事项 badges, history and buttons", () => {
  it("names every state", () => {
    expect(remedialBadge({ status: "OPEN", is_overdue: false }).key).toBe("remedial.open");
    expect(remedialBadge({ status: "SUBMITTED", is_overdue: false }).key).toBe("remedial.submitted");
    expect(remedialBadge({ status: "RETURNED", is_overdue: false }).key).toBe("remedial.returned");
    expect(remedialBadge({ status: "RETURNED", is_overdue: true }).key).toBe("remedial.overdue");
    expect(remedialBadge({ status: "ACCEPTED", is_overdue: false }).key).toBe("remedial.accepted");
    expect(zh.remedial.submitted).toBe("待顾问复核");
    expect(zh.remedial.returned).toBe("退回继续整改");
    expect(zh.remedial.accepted).toBe("整改合格");
    expect(zh.status.REMEDIAL_ACCEPTED).toBe("整改验收通过");
    expect(messages.consultantDashboard.status.REMEDIAL_ACCEPTED).toBe("整改验收通过");
  });

  it("gives the reviewing consultant 整改合格 and 退回继续整改, with every round shown", () => {
    as(CONSULTANT, CONSULTANT_PERMS);
    const html = detail({ remedial_items: [{ ...RETURNED_THEN_SUBMITTED, can_review: true }] });
    const said = text(html);
    expect(html).toContain(`${zh.action.acceptRemedial}</button>`);
    expect(html).toContain(`${zh.action.returnRemedial}</button>`);
    expect(html).not.toContain(`${zh.action.submitRemedial}</button>`);
    expect(said).toContain("第 1 次提交 · 测试建筑商 1");
    expect(said).toContain("pls check TQ");
    expect(said).toContain("退回继续整改 · lily");
    expect(said).toContain("Edge still rough");
    expect(said).toContain("第 2 次提交");
    expect(html).toContain("/media/e1-w.png");
  });

  it("gives the contractor 提交顾问复核 on an open or returned item, never the review buttons", () => {
    as(OFFICE, OFFICE_PERMS);
    const html = detail({ remedial_items: [{ ...ITEM, status: "RETURNED" }] });
    expect(html).toContain(`${zh.action.submitRemedial}</button>`);
    // The words also stand in 下一步's 「顾问确认整改合格前」: the button is what counts.
    expect(html).not.toContain(`${zh.action.acceptRemedial}</button>`);
  });

  it("tells the contractor whose review a submitted item waits for", () => {
    as(OFFICE, OFFICE_PERMS);
    const html = detail({ remedial_items: [SUBMITTED] });
    expect(text(html)).toContain("等 lily 复核");
    expect(html).not.toContain(`${zh.action.submitRemedial}</button>`);
    expect(html).not.toContain(`${zh.action.acceptRemedial}</button>`);
  });

  it("shows the archive card's pending items and labels an old report", () => {
    as(OFFICE, OFFICE_PERMS);
    const html = text(
      detail({
        final_report: "/media/old.pdf",
        remedial_items: [SUBMITTED],
        archive_entries: [
          { id: "x1", kind: "FINAL_REPORT", title: "r", snapshot: {}, file: "/media/old.pdf", sha256: "a".repeat(64), archived_at: "2026-11-20T15:20:00Z" },
        ],
      }),
    );
    expect(html).toContain("还有 1 条整改未经顾问确认合格");
    expect(html).toContain(zh.remedial.oldReport);
    expect(html).toContain(zh.archive.kind.REMEDIAL_ACCEPTANCE);
  });
});
