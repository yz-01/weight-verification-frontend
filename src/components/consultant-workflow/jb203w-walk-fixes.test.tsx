/**
 * JB203W - what the consultant module's browser walk of 11-17 found.
 *
 * > 这些功能的流程确保都是顺畅并且真的可以使用的 / 要站在老人家的角度去思考
 *
 * Each block is one walk finding; each test fails on the code before it.
 * Rendered to static markup like the other detail tests (the runner has no
 * DOM). The reader's buttons are switched per test (`auth.perms`).
 */
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
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
  /** The reader's permission codes; null holds every one. */
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
const { ConsultantApplicationDetail, newestRevisionOf } = await import(
  "@/components/consultant-workflow/application-detail"
);
const { ConsultantDashboard } = await import("@/components/consultant-workflow/consultant-dashboard");
const { ConsultantApplicationsList } = await import(
  "@/components/consultant-workflow/applications-list"
);

const OFFICE = { id: "u1", role: "r1", account_type: "TENANT" };
const CONSULTANT = {
  id: "c1",
  role: null,
  account_type: "CONSULTANT",
  active_project: { project_id: "p1" },
  consultant_projects: [{ project_id: "p1", project_code: "P1", project_name: "Tower A", is_current: true }],
};
/** What a consultant's project grant holds - no consultant.submit. */
const CONSULTANT_PERMS = ["approval.view", "approval.review", "project.view", "notification.view"];

const zh = messages.consultantWorkflow;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

const APPLICATION = {
  id: "a1",
  application_no: "CA-P1-0001",
  revision: 0,
  project: "p1",
  project_name: "Tower A",
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
  workflow_name: "Standard",
  template_name: null,
  template_version_number: null,
  template_field_schema: [],
  template_required_attachment_codes: [],
  schedule_task_wbs: null,
  schedule_task_name: null,
  inspection_category: "",
  location: "Level 3",
  component: "Beam B12",
  description: "Rebar",
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
  received_at: "2026-11-16T09:00:00Z",
  received_by_name: "Consultant Engineer",
  acknowledged_at: "2026-11-16T09:00:00Z",
  acknowledged_by_name: "Consultant Engineer",
  final_report: null,
  final_decision: "",
  archived_at: null,
  verification_code: "",
  is_locked: true,
  attachments: [],
  evidence_links: [],
  related_record_groups: [],
  approval_actions: [],
  archive_entries: [],
  remedial_items: [],
  review_steps: [],
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
  evidence_files: [],
  closed_at: null,
  closed_by: null,
  closed_by_name: null,
  created_by_name: "Consultant Engineer",
  created_at: "2026-11-16T09:00:00Z",
  updated_at: "2026-11-16T09:00:00Z",
};

const DECIDED_STEP = {
  id: "s1",
  sequence: 1,
  name: "Consultant review",
  status: "APPROVED_WITH_REMEDIAL",
  reviewer_kind: "CONSULTANT",
  reviewer_user: null,
  reviewer_user_name: null,
  reviewer_role: null,
  reviewer_role_name: null,
  decided_by: "c1",
  decided_by_name: "Consultant Engineer",
  decided_at: "2026-11-16T09:00:00Z",
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

/** The 下一步 sentence, as shown. */
function nextStep(html: string) {
  const found = new RegExp(String.raw`>${zh.detail.nextAction}</h3>\s*<p[^>]*>([\s\S]*?)</p>`).exec(html);
  expect(found, "no 下一步 on the page").toBeTruthy();
  return text(found![1]);
}

describe("F-4 / NOTE 32 下一步 for the reader it is shown to", () => {
  const remedial = {
    status: "APPROVED_WITH_REMEDIAL",
    final_decision: "APPROVED_WITH_REMEDIAL",
    final_report: "/media/report.pdf",
    archived_at: "2026-11-16T09:00:00Z",
    review_steps: [DECIDED_STEP],
    remedial_items: [ITEM],
  };

  it("tells the consultant who raised the work that the contractor closes it", () => {
    as(CONSULTANT, CONSULTANT_PERMS);
    const said = nextStep(detail(remedial));
    expect(said).toContain("还有 1 条整改等建筑商完成");
    expect(said).toContain("【开一条整改】");
    expect(said).not.toContain(zh.action.submitRemedial);
  });

  it("tells a reviewer who cannot raise more only that it is waiting", () => {
    as({ ...CONSULTANT, id: "c9" }, CONSULTANT_PERMS);
    const said = nextStep(detail(remedial));
    expect(said).toContain("还有 1 条整改等建筑商完成。");
    expect(said).not.toContain("【开一条整改】");
  });

  it("keeps the contractor's instruction for the contractor", () => {
    as(OFFICE, null);
    expect(nextStep(detail(remedial))).toContain(`按「${zh.action.submitRemedial}」`);
  });

  it("tells the contractor a rejected application can be sent again as a new one", () => {
    as(OFFICE, null);
    const said = nextStep(
      detail({
        status: "REJECTED",
        final_decision: "REJECTED",
        final_report: "/media/report.pdf",
        archived_at: "2026-11-16T09:00:00Z",
      }),
    );
    expect(said).toContain(`【${zh.applications.create}】`);
    expect(said).toContain(zh.detail.section.decisions);
  });

  it("tells the consultant on a version sent back that the contractor remakes it", () => {
    as(CONSULTANT, CONSULTANT_PERMS);
    const said = nextStep(detail({ status: "REVISE_RESUBMIT", final_decision: "REVISE_RESUBMIT" }));
    expect(said).toContain(zh.detail.next.reviseReviewer);
    // Not told to press the contractor's 【建立新版本】.
    expect(said).not.toContain(`【${zh.action.createRevision}】`);
  });
});

describe("F-10 an old version follows the newest one", () => {
  const returned = { status: "REVISE_RESUBMIT", final_decision: "REVISE_RESUBMIT" };
  const chain = (status: string) => [
    { id: "a1", application_no: "CA-P1-0001", revision: 0, status: "REVISE_RESUBMIT", is_current: true },
    { id: "a2", application_no: "CA-P1-0001/R1", revision: 1, status, is_current: false },
  ];

  it("says the new version was sent, once it was", () => {
    as(OFFICE, null);
    const said = nextStep(detail({ ...returned, revision_chain: chain("SUBMITTED") }));
    expect(said).toContain("新版本（版本 1）已经发送给顾问");
    expect(said).not.toContain("改好后再发送");
  });

  it("says the consultant decided on it, once they did", () => {
    as(OFFICE, null);
    expect(nextStep(detail({ ...returned, revision_chain: chain("APPROVED") }))).toContain(
      "顾问已经对新版本（版本 1）作出决定",
    );
  });

  it("still says to change and send a new version still in draft", () => {
    as(OFFICE, null);
    expect(nextStep(detail({ ...returned, revision_chain: chain("DRAFT") }))).toContain("已经建立了新版本（版本 1）");
  });

  it("follows the newest of several", () => {
    const rows = [...chain("REVISE_RESUBMIT"), { id: "a3", revision: 2, status: "SUBMITTED", is_current: false }];
    expect(newestRevisionOf({ revision: 0, revision_chain: rows as never })?.id).toBe("a3");
  });

  it("marks the version on screen and the newest one in 版本记录", () => {
    as(OFFICE, null);
    const html = detail({ ...returned, revision_chain: chain("SUBMITTED") });
    const rows = html.split('href="/consultant-applications/');
    const old = rows.find((row) => row.startsWith('a1"')) ?? "";
    const newest = rows.find((row) => row.startsWith('a2"')) ?? "";
    expect(text(old)).toContain(zh.detail.revisionCurrent);
    expect(text(old)).not.toContain(zh.detail.revisionLatest);
    expect(text(newest)).toContain(zh.detail.revisionLatest);
    expect(zh.detail.revisionCurrent).toBe("正在看的版本");
  });
});

describe("F-2 / F-8 the detail's boxes", () => {
  it("says there are no linked site records in its own words", () => {
    as(OFFICE, null);
    const html = detail({ status: "SUBMITTED" });
    expect(text(html)).toContain(zh.detail.noRelatedRecords);
    expect(text(html)).not.toContain(zh.state.noApplications);
  });

  it("shows the photo a closed item was closed with, and how many", () => {
    as(CONSULTANT, CONSULTANT_PERMS);
    const closed = {
      ...ITEM,
      status: "CLOSED",
      closure_note: "Patched and cured.",
      evidence: ["e1", "e2"],
      evidence_files: [
        {
          id: "e1",
          kind: "PHOTO",
          file: "/media/evidence/edge.jpg",
          watermarked_file: "/media/evidence/edge-stamped.jpg",
          original_filename: "edge.jpg",
          content_type: "image/jpeg",
          captured_at: "2026-11-17T05:49:46Z",
        },
        {
          id: "e2",
          kind: "DOCUMENT",
          file: "/media/evidence/test-report.pdf",
          watermarked_file: null,
          original_filename: "test-report.pdf",
          content_type: "application/pdf",
          captured_at: null,
        },
      ],
      closed_at: "2026-11-17T05:49:46Z",
      closed_by_name: "示范 项目经理",
    };
    const html = detail({
      status: "APPROVED_WITH_REMEDIAL",
      final_decision: "APPROVED_WITH_REMEDIAL",
      review_steps: [DECIDED_STEP],
      remedial_items: [closed],
    });
    const proof = html.slice(html.indexOf('data-slot="remedial-proof"'));
    expect(proof).toContain('href="/media/evidence/edge-stamped.jpg"');
    expect(proof).toContain('src="/media/evidence/edge-stamped.jpg"');
    expect(proof).toContain('href="/media/evidence/test-report.pdf"');
    expect(text(html)).toContain("附证据 2 份");
  });
});

describe("F-7 the remedial list's hint names the 最终报告", () => {
  it("in every language", () => {
    expect(zh.review.remedialList.hint).toContain("最终报告");
    expect(zhTW.consultantWorkflow.review.remedialList.hint).toContain("最終報告");
    expect(en.consultantWorkflow.review.remedialList.hint).toContain("final report");
    expect(ms.consultantWorkflow.review.remedialList.hint).toContain("laporan akhir");
    for (const catalogue of [messages, zhTW, en, ms]) {
      expect(catalogue.consultantWorkflow.review.remedialList.hint).not.toMatch(/PDF/);
    }
  });
});

describe("F-1 / F-11 顾问首页", () => {
  function dashboard() {
    return renderDetail(<ConsultantDashboard />, (client) => {
      client.setQueryData(["consultant-dashboard", "p1"], {
        generated_at: "2026-11-16T09:00:00Z",
        summary: { pending: 0, draft: 0, in_approval: 0, final_reports: 0, archived: 0, today: 0, approved: 0, returned: 0, due_soon: 0 },
        pending: [],
        due_soon: [],
        recent_decisions: [],
      });
      client.setQueryData(["consultant-dashboard", "notifications"], page([]));
    });
  }

  it("names no number of steps over the cards a consultant sees", () => {
    as(CONSULTANT, CONSULTANT_PERMS);
    const html = dashboard();
    expect(text(html)).toContain(messages.consultantDashboard.flow.title);
    expect(text(html)).not.toContain("四个");
    for (const catalogue of [messages, zhTW, en, ms]) {
      expect(catalogue.consultantDashboard.flow.title).not.toMatch(/四|Four|Empat/);
    }
  });

  /** The header's two buttons: their order and their icons. */
  function headerButtons(html: string) {
    const credential = html.indexOf('href="/approval-credential"');
    const settings = html.indexOf('href="/consultant-settings"');
    const icon = (at: number) => html.slice(at, html.indexOf("</a>", at));
    return { credential, settings, credentialIcon: icon(credential), settingsIcon: icon(settings) };
  }

  it("shows 签名与签核密码 then 顾问设定, with the 顾问申请 header's icons", () => {
    as(OFFICE, null);
    const home = headerButtons(dashboard());
    const list = headerButtons(renderDetail(<ConsultantApplicationsList />));
    for (const header of [home, list]) {
      expect(header.credential).toBeGreaterThan(-1);
      expect(header.credential).toBeLessThan(header.settings);
      expect(header.credentialIcon).toContain("lucide-key-round");
      expect(header.settingsIcon).toContain("lucide-settings-2");
    }
  });
});
