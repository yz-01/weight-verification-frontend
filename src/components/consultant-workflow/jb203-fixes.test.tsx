/**
 * JB203 (Lucas 11-16 audit) - the consultant module, usable by older users.
 *
 * > 已经弄好的功能不要改到 / 要站在老人家的角度去思考
 *
 * Each block is one audit item; each test fails on the code before it. The
 * runner has no DOM, so screens are rendered to static markup (as in
 * `jb200-remedial.test.tsx`), and a screen's request is checked by running
 * the query function it registered against the mocked API client.
 */
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { ConsultantWorkflow, ConsultantWorkflowStep } from "@/interfaces/consultant-workflow";
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
const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, can: () => true, refresh: vi.fn() }),
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
const { ConsultantApplicationDetail, laterRevisionOf } = await import(
  "@/components/consultant-workflow/application-detail"
);
const { ConsultantWorkflowSettings, StepDialog } = await import(
  "@/components/consultant-workflow/workflow-settings"
);
const { ConsultantOptionManager } = await import("@/components/consultant-workflow/option-manager");
const { preferWorkflow } = await import("@/components/consultant-workflow/application-form");
const { startingGrant } = await import(
  "@/components/consultant-workflow/consultant-access-management"
);
const { ApplicationVerification } = await import(
  "@/components/consultant-workflow/application-verification"
);
const { ApprovalCredentialSettings } = await import(
  "@/components/consultant-workflow/approval-credential"
);
const { ConsultantHowTo } = await import("@/components/consultant-workflow/consultant-how-to");
const { ConsultantDashboard } = await import("@/components/consultant-workflow/consultant-dashboard");
const { ConsultantApplicationsList } = await import(
  "@/components/consultant-workflow/applications-list"
);
const { getApplicationOptions, verifyConsultantApplication } = await import(
  "@/services/consultant-workflow.service"
);

const OFFICE = { id: "u1", role: "r1", account_type: "TENANT" };
const CONSULTANT = {
  id: "u1",
  role: null,
  account_type: "CONSULTANT",
  active_project: { project_id: "p1" },
  consultant_projects: [
    { project_id: "p1", project_code: "P1", project_name: "Tower A", is_current: true },
    { project_id: "p2", project_code: "P2", project_name: "Tower B", is_current: true },
  ],
};

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

/** Render, keeping the query client so its registered queries can be run. */
function render(node: React.ReactNode, seed: (client: QueryClient) => void = () => {}) {
  let client: QueryClient | undefined;
  const html = renderDetail(node, (c) => {
    client = c;
    seed(c);
  });
  return { html, client: client! };
}

/** Run the query function a screen registered under `key`; return the request. */
async function requestOf(client: QueryClient, key: unknown[]) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  expect(query, `no query under ${JSON.stringify(key)}`).toBeTruthy();
  const fn = query!.options.queryFn as unknown as (context: unknown) => Promise<unknown>;
  api.list.mockResolvedValueOnce(page([]));
  await fn({ queryKey: key, signal: new AbortController().signal, meta: undefined });
  return api.list.mock.lastCall;
}

function step(overrides: Partial<ConsultantWorkflowStep> = {}): ConsultantWorkflowStep {
  return {
    id: "s1",
    sequence: 1,
    name: "Consultant review",
    reviewer_kind: "CONSULTANT",
    reviewer_user: null,
    reviewer_user_name: null,
    reviewer_role: null,
    reviewer_role_name: null,
    requires_signature: true,
    requires_stamp: false,
    ...overrides,
  } as ConsultantWorkflowStep;
}

function workflow(overrides: Partial<ConsultantWorkflow> = {}): ConsultantWorkflow {
  return {
    id: "w1",
    project: "p1",
    project_name: "Tower A",
    name: "顾问审批 / Consultant review",
    application_type: null,
    application_type_label: null,
    description: "",
    is_default: true,
    is_active: true,
    steps: [step()],
    has_applications: false,
    steps_locked: false,
    created_at: "2026-11-16T09:00:00Z",
    updated_at: "2026-11-16T09:00:00Z",
    ...overrides,
  };
}

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
  consultant: "u1",
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

function detail(application: Record<string, unknown>, credential: unknown = null) {
  return render(<ConsultantApplicationDetail id="a1" presentation="dialog" />, (client) => {
    client.setQueryData(["consultant-application", "a1"], { ...APPLICATION, ...application });
    client.setQueryData(["approval-credential"], credential);
  }).html;
}

const zh = messages.consultantWorkflow;

describe("JB203-1 a switched-off workflow", () => {
  it("is listed on the settings page, marked 已停用, asked for with active=false", async () => {
    auth.user = OFFICE;
    const { html } = render(<ConsultantWorkflowSettings />, (c) => {
      c.setQueryData(["consultant-workflows", "p1", "manage"], page([
        workflow(),
        workflow({ id: "w2", name: "Two-step route", is_default: false, is_active: false }),
      ]));
      c.setQueryData(["consultant-options", "p1", "APPLICATION_TYPE", "manage"], page([]));
    });
    expect(text(html)).toContain("Two-step route");
    expect(text(html)).toContain(zh.workflow.inactive);
    expect(html.match(/data-inactive/g) ?? []).toHaveLength(1);
    // A seeded query keeps no request, so the list is asked for unseeded.
    const { client } = render(<ConsultantWorkflowSettings />);
    const request = await requestOf(client, ["consultant-workflows", "p1", "manage"]);
    expect(request?.[1]).toMatchObject({ project: "p1", active: "false" });
  });
});

describe("JB203-2 【建立新版本】 once the new version exists", () => {
  const returned = { status: "REVISE_RESUBMIT", is_locked: true };

  it("is offered on a returned version with no newer one", () => {
    auth.user = OFFICE;
    const html = detail({ ...returned, revision_chain: [{ id: "a1", revision: 0, status: "REVISE_RESUBMIT", is_current: true }] });
    expect(html).toContain(`${zh.action.createRevision}</button>`);
  });

  it("is gone once the newer one exists, and 下一步 points at it", () => {
    auth.user = OFFICE;
    const chain = [
      { id: "a1", revision: 0, status: "REVISE_RESUBMIT", is_current: true },
      { id: "a2", revision: 1, status: "DRAFT", is_current: false },
    ];
    const html = detail({ ...returned, revision_chain: chain });
    expect(html).not.toContain(`${zh.action.createRevision}</button>`);
    expect(text(html)).toContain("已经建立了新版本（版本 1）");
    expect(laterRevisionOf({ revision: 0, revision_chain: chain as never })?.id).toBe("a2");
  });
});

describe("JB203-3 the option manager", () => {
  it("asks for the switched-off options, so 可选 can be turned back on", async () => {
    const { client } = render(<ConsultantOptionManager project="p1" />);
    const request = await requestOf(client, ["consultant-options", "p1", "APPLICATION_TYPE", "manage"]);
    expect(request?.[1]).toMatchObject({ active: "false" });
  });

  it("leaves every picker on the active ones", async () => {
    api.list.mockResolvedValueOnce(page([]));
    await getApplicationOptions("p1", "PRIORITY");
    expect(api.list.mock.lastCall?.[1]).not.toHaveProperty("active");
  });
});

describe("JB203-6 the workflow a new application starts on", () => {
  const rows = [
    workflow({ id: "default", is_default: true }),
    workflow({ id: "material", is_default: false, application_type: "type-material" }),
  ];
  it("is the route for its application type first", () => {
    expect(preferWorkflow(rows, "type-material")?.id).toBe("material");
  });
  it("then the default", () => {
    expect(preferWorkflow(rows, "type-rfi")?.id).toBe("default");
    expect(preferWorkflow(rows, "")?.id).toBe("default");
  });
});

describe("JB203-7 the step dialog", () => {
  it("says every decision is signed, instead of a switch that did nothing", () => {
    const { html } = render(
      <StepDialog workflow={workflow()} onClose={() => undefined} onSaved={() => undefined} />,
      (c) => c.setQueryData(["consultant-reviewer-choices", "p1"], { users: [], roles: [] }),
    );
    expect(html).toContain('data-slot="always-signed"');
    expect(text(html)).toContain(zh.workflow.alwaysSigned);
    expect(text(html)).not.toContain("必须电子签名");
  });
});

// JB210 (客户 11-16) keeps JB203-9's rule with the module ticks: the company's
// default is its ticks + options, and one still saved as codes counts as ticks.
describe("JB203-9 a new consultant grant", () => {
  it("starts from the company's 顾问项目默认权限", () => {
    expect(startingGrant(["projects", "reports"], ["report.export"])).toEqual({
      modules: ["projects", "reports"],
      options: ["report.export"],
      items: [],
    });
    expect(startingGrant([], ["project.view", "report.view", "document.view"])).toEqual({
      modules: ["projects", "reports"],
      options: [],
      items: [],
    });
  });
  it("falls back to the usual default when the company has none", () => {
    expect(startingGrant([], []).options).toContain("approval.review");
    expect(startingGrant(undefined, undefined).modules).toEqual(["dashboard", "projects", "safety", "notifications"]);
  });
});

describe("JB203-11 usability", () => {
  it("the how-to names 【确认归档】 and 【发送给顾问】, not a 【提交】 that does not exist", () => {
    const { html } = render(<ConsultantHowTo defaultOpen canConfigure />);
    expect(text(html)).toContain("【确认归档】");
    expect(text(html)).toContain("【发送给顾问】");
    expect(text(html)).not.toContain("【提交】");
  });

  it("a draft's 下一步 says 确认归档 before sending", () => {
    auth.user = OFFICE;
    const html = detail({ status: "DRAFT", is_locked: false, is_confirmed: false });
    expect(text(html)).toContain("先按【确认归档】");
  });

  it("a step that needs a stamp says so before the PIN, when there is none", () => {
    auth.user = CONSULTANT;
    const waiting = {
      status: "SUBMITTED",
      review_steps: [{ ...step({ requires_stamp: true }), status: "CURRENT", decided_by: null, decided_by_name: null, decided_at: null }],
    };
    const signed = { signature: "/media/s.png", stamp: null, is_active: true, has_pin: true };
    const html = detail(waiting, signed);
    expect(html).toContain('data-slot="stamp-missing"');
    expect(text(html)).not.toContain(zh.decision.APPROVE_WITH_REMEDIAL);
    // With a stamp on file the four decisions are there as before.
    const stamped = detail(waiting, { ...signed, stamp: "/media/stamp.png" });
    expect(stamped).not.toContain('data-slot="stamp-missing"');
    expect(text(stamped)).toContain(zh.decision.APPROVE_WITH_REMEDIAL);
  });

  it("the credential page keeps the PIN unless a new one is typed", () => {
    const { html } = render(<ApprovalCredentialSettings />, (c) =>
      c.setQueryData(["approval-credential"], { signature: "/media/s.png", stamp: null, is_active: true, has_pin: true }),
    );
    expect(html).toContain('data-slot="pin-keep"');
    expect(text(html)).toContain(zh.credential.pinKeep);
  });

  it("the public check shows the decision in words, asked for without the session", async () => {
    const { html } = render(<ApplicationVerification code="v1" />, (c) =>
      c.setQueryData(["public-application-verification", "v1"], {
        application_no: "CA-P1-0001",
        revision: 0,
        company_name: "Builder",
        project_name: "Tower A",
        application_type: "RFI",
        consultant_company: "Acme Consult",
        consultant_name: "Consultant Engineer",
        decision: "APPROVED_WITH_REMEDIAL",
        finalized_at: "2026-11-16T09:00:00Z",
        sha256: "a".repeat(64),
        verification_code: "v1",
      }),
    );
    expect(text(html)).toContain(zh.status.APPROVED_WITH_REMEDIAL);
    expect(html).not.toContain("APPROVED_WITH_REMEDIAL");

    // Field audit F5: a stale office session must not send the visitor to log in.
    api.get.mockResolvedValueOnce({});
    await verifyConsultantApplication("v1");
    expect(api.get.mock.lastCall?.[2]).toEqual({ auth: false, silent: true });
  });

  it("a consultant's dashboard notices open their link, and there is no 申请 card", () => {
    auth.user = CONSULTANT;
    const { html } = render(<ConsultantDashboard />, (c) => {
      c.setQueryData(["consultant-dashboard", "p1"], {
        generated_at: "2026-11-16T09:00:00Z",
        summary: { pending: 0, draft: 0, in_approval: 2, final_reports: 0, archived: 0, today: 0, approved: 0, returned: 0, due_soon: 0 },
        pending: [],
        due_soon: [],
        recent_decisions: [],
      });
      c.setQueryData(["consultant-dashboard", "notifications"], page([{
        id: "n1",
        kind: "CONSULTANT_SUBMITTED",
        kind_label: "",
        title: "New application",
        message: "CA-P1-0001",
        data: { href: "/consultant-applications/a9" },
        event: null,
        subject_kind: "",
        subject_id: null,
        state: "UNREAD",
        resolved_at: null,
        is_outstanding: true,
        created_at: "2026-11-16T09:00:00Z",
      }]));
    });
    expect(html).toContain('href="/consultant-applications/a9"');
    expect(html).not.toContain("stage=draft");
  });

  it("a consultant's list has no 草稿 tab; the office's still has", () => {
    auth.user = CONSULTANT;
    expect(render(<ConsultantApplicationsList />).html).not.toContain("stage=draft");
    auth.user = OFFICE;
    expect(render(<ConsultantApplicationsList />).html).toContain("stage=draft");
  });
});

describe("JB203-12 a consultant's notice about their other project", () => {
  function failed(user: Record<string, unknown>) {
    auth.user = user;
    return render(<ConsultantApplicationDetail id="a1" presentation="dialog" />, (client) => {
      // The failed read stays failed on mount instead of loading again.
      client.setQueryDefaults(["consultant-application", "a1"], { retryOnMount: false });
      client
        .getQueryCache()
        .build(client, { queryKey: ["consultant-application", "a1"] })
        // Merged into the query's state (`setState` spreads it).
        .setState({ status: "error", error: new Error("not found"), fetchStatus: "idle", data: undefined } as never);
    }).html;
  }

  it("offers the project picker instead of 「检查项目权限」", () => {
    const html = failed(CONSULTANT);
    expect(html).toContain('data-slot="other-project"');
    expect(text(html)).toContain(zh.state.otherProject);
    expect(text(html)).not.toContain(zh.state.loadError);
  });

  it("keeps the old sentence for everybody else", () => {
    const html = failed(OFFICE);
    expect(text(html)).toContain(zh.state.loadError);
  });
});
