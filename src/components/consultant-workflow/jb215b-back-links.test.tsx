/**
 * JB215B-4 (Lucas 11-17, jb201-names §4.3): the back links on 顾问审批流程
 * (/consultant-workflows) and 签名与签核密码 (/approval-credential) said
 * 「返回顾问申请」 and went to the applications list, whoever came from where.
 *
 * - /consultant-workflows is opened from 顾问设定 → 「返回顾问设定」.
 * - /approval-credential: a consultant opens it from 顾问首页 → 「返回顾问首页」;
 *   a contractor from 顾问申请 → 「返回顾问申请」, as before.
 *
 * Rendered to static markup (the runner has no DOM), as in jb203-fixes.
 */
import { describe, expect, it, vi } from "vitest";

import zh from "@/messages/zh.json";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), list: vi.fn(), patch: vi.fn() }));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api,
  toastSuccess: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/approval-credential",
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

const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { ApprovalCredentialSettings } = await import("@/components/consultant-workflow/approval-credential");
const { ConsultantWorkflowSettings } = await import("@/components/consultant-workflow/workflow-settings");

const OFFICE = { id: "u1", role: "r1", account_type: "TENANT" };
const CONSULTANT = {
  id: "u2",
  role: null,
  account_type: "CONSULTANT",
  active_project: { project_id: "p1" },
  consultant_projects: [{ project_id: "p1", project_code: "P1", project_name: "Tower A", is_current: true }],
};
const CREDENTIAL = { signature: "/media/s.png", stamp: null, is_active: true, has_pin: true };
const words = zh.consultantWorkflow;

function credentialPage(user: Record<string, unknown>) {
  auth.user = user;
  return renderDetail(<ApprovalCredentialSettings />, (client) =>
    client.setQueryData(["approval-credential"], CREDENTIAL),
  );
}

describe("JB215B-4 签名与签核密码's back link", () => {
  it("takes a consultant back to 顾问首页", () => {
    const html = credentialPage(CONSULTANT);
    expect(html).toContain('href="/consultant-dashboard"');
    expect(html).toContain(words.backToDashboard);
    expect(html).not.toContain(words.applications.back);
  });

  it("takes a contractor back to 顾问申请, as before", () => {
    const html = credentialPage(OFFICE);
    expect(html).toContain('href="/consultant-applications"');
    expect(html).toContain(words.applications.back);
    expect(html).not.toContain('href="/consultant-dashboard"');
  });

  it("uses the page names JB201 settled", () => {
    expect(words.backToDashboard).toBe("返回顾问首页");
    expect(words.backToSettings).toBe("返回顾问设定");
  });
});

describe("JB215B-4 顾问审批流程's back link", () => {
  it("goes back to 顾问设定", () => {
    auth.user = OFFICE;
    const html = renderDetail(<ConsultantWorkflowSettings />);
    expect(html).toContain('href="/consultant-settings"');
    expect(html).toContain(words.backToSettings);
    expect(html).not.toContain(words.applications.back);
  });
});
