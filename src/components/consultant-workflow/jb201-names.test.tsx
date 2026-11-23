/**
 * JB201 (Lucas 11-16) - one feature, one name, in the consultant module.
 *
 * > 确保每个功能的名称都是一样的
 *
 * Pinned on the catalogue the screens read, in all four languages where a
 * name is shared, and on the contractor dashboard's consultant rows, which
 * printed 已提交 and raw codes.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1" }, can: () => true }),
}));

const { useRecordStatus } = await import("@/components/dashboard/contractor-dashboard");

const LOCALES = { zh, "zh-TW": zhTW, en, ms } as const;

function at(messages: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>(
    (node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined),
    messages,
  );
}

/** Every key names the feature the same way, in each language. */
function sameName(keys: string[]) {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    const names = new Set(keys.map((key) => at(messages, key)));
    expect(names.size, `${locale}: ${keys.join(", ")}`).toBe(1);
  }
}

describe("pages (JB201)", () => {
  it("/approval-credential is 签名与签核密码 in the sidebar, the title and both buttons", () => {
    sameName([
      "nav.submodule.approvalCredentials",
      "consultantWorkflow.credential.title",
      "consultantWorkflow.credential.shortTitle",
      "consultantDashboard.credential",
    ]);
    expect(zh.consultantWorkflow.credential.title).toBe("签名与签核密码");
    expect(zh.consultantWorkflow.credential.save).toBe("保存签名与签核密码");
    expect(zh.consultantWorkflow.toast.credentialSaved).toBe("签名与签核密码已保存");
  });

  it("/consultant-workflows is 顾问审批流程 in the top bar, the hub and the page", () => {
    sameName([
      "nav.submodule.consultantWorkflows",
      "consultantWorkflow.settingsHub.workflows.title",
      "consultantWorkflow.workflow.title",
    ]);
  });

  it("/consultant-settings is 顾问设定, also on the dashboard button", () => {
    sameName(["consultantDashboard.workflowSettings", "consultantWorkflow.settingsHub.title"]);
  });

  it("/consultant-templates is RFI 表格模板 on the hub", () => {
    sameName(["consultantWorkflow.settingsHub.templates.title", "consultantWorkflow.templateManager.title"]);
  });

  it("新建申请 on both buttons", () => {
    expect(zh.consultantWorkflow.applications.create).toBe(zh.consultantDashboard.newApplication);
    expect(zh.consultantWorkflow.form.title).toBe("新建顾问申请");
  });
});

describe("decisions and statuses (JB201)", () => {
  it("the 修改后重提 dialog is titled as its button", () => {
    sameName([
      "consultantWorkflow.decision.REVISE_RESUBMIT",
      "consultantWorkflow.review.dialog.REVISE_RESUBMIT.title",
      "consultantWorkflow.status.REVISE_RESUBMIT",
      "consultantWorkflow.stepStatus.REVISE_RESUBMIT",
    ]);
  });

  it("APPROVED_WITH_REMEDIAL is the short 已批准（需整改） everywhere", () => {
    sameName([
      "consultantWorkflow.status.APPROVED_WITH_REMEDIAL",
      "consultantWorkflow.stepStatus.APPROVED_WITH_REMEDIAL",
      "consultantDashboard.status.APPROVED_WITH_REMEDIAL",
    ]);
    expect(zh.consultantWorkflow.status.APPROVED_WITH_REMEDIAL).toBe("已批准（需整改）");
  });

  it("SUBMITTED is 待审批 on the list and the dashboard", () => {
    sameName(["consultantWorkflow.status.SUBMITTED", "consultantDashboard.status.SUBMITTED"]);
    expect(zh.consultantWorkflow.status.SUBMITTED).toBe("待审批");
  });

  it("the final report is 最终报告, the stage tab too", () => {
    sameName([
      "consultantWorkflow.applications.stage.final",
      "consultantWorkflow.detail.lifecycle.final",
      "consultantDashboard.flow.final",
    ]);
    expect(zh.consultantWorkflow.applications.stage.final).toBe("最终报告");
  });

  it("the remedial button is 提交顾问复核, as its dialog (JB236)", () => {
    sameName(["consultantWorkflow.action.submitRemedial", "consultantWorkflow.remedial.submitTitle"]);
    expect(zh.consultantWorkflow.action.submitRemedial).toBe("提交顾问复核");
  });

  it("sending is 发送给顾问, the PIN prompt too", () => {
    expect(zh.signOff.action.consultant_submit).toBe("发送给顾问");
    expect(zh.consultantWorkflow.howTo.submit.title).toBe("发送给顾问");
  });
});

describe("the contractor dashboard's consultant rows (JB201)", () => {
  function Statuses({ rows }: { rows: Array<[string, string]> }) {
    const status = useRecordStatus();
    return <ul>{rows.map(([kind, code]) => <li key={kind + code}>{status(code, kind)}</li>)}</ul>;
  }

  it("read in the consultant module's words, never a raw code", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <Statuses
          rows={[
            ["CONSULTANT_APPLICATION", "SUBMITTED"],
            ["CONSULTANT_APPLICATION", "APPROVED_WITH_REMEDIAL"],
            ["CONSULTANT_APPLICATION", "REVISE_RESUBMIT"],
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("待审批");
    expect(html).toContain("已批准（需整改）");
    expect(html).toContain("修改后重提");
    expect(html).not.toContain("_");
  });
});
