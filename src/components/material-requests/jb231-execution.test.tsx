/**
 * JB231 (客户 11-20 事项 3): MR / 其他申请 - 审批与事项完成分开.
 *
 * 「审批状态：待审批／已批准／已退回。执行状态：待执行／处理中／已完成。」
 * 「总部批准不等于事项完成…每24小时持续提醒，直到项目经理确认完成」
 * 「请根据实际操作分别显示『批准人』或『退回人』，并记录对应时间」
 *
 * Rendered to static markup with the record shell reduced to its facts and
 * actions, as material-request-review.test.tsx does.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialRequest } from "@/interfaces/material-request";
import { MATERIAL_REQUEST_EXECUTION_FILTERS } from "@/interfaces/material-request";
import { LIST_FITS } from "@/lib/list-fits";
import { conversationClosedLine } from "@/lib/record-chat";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import messages from "@/messages/zh.json";

const reader: { id: string | null; codes: string[] } = { id: null, codes: [] };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: reader.id ? { id: reader.id, is_field_staff: false } : null,
    can: (code: string) => reader.codes.includes(code),
  }),
}));

vi.mock("@/components/shared/record-detail-shell", () => ({
  RecordDetailDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RecordRecorder: () => null,
  RecordDetailShell: ({
    facts,
    actions,
  }: {
    facts: { label: string; value: React.ReactNode }[];
    actions: React.ReactNode;
  }) => (
    <div>
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div data-actions>{actions}</div>
    </div>
  ),
}));

const { MaterialRequestDetail } = await import("@/components/material-requests/material-requests-office");

const PM = "u-pm";
const HQ = "u-hq";

function approved(overrides: Partial<MaterialRequest> = {}): MaterialRequest {
  return {
    id: "mr-1",
    request_no: "OR-PRJ-0003-001",
    request_type: "OTHER",
    request_kind: "t-other",
    request_kind_name: "其他申请",
    request_kind_form_style: "GENERAL",
    subject: "Cabin",
    content: "5 worker ikat bath orang baru",
    category: null,
    spec_category: null,
    status: "APPROVED",
    project: "p-3",
    project_name: "PUTRA_MAS",
    project_code: "PRJ-0003",
    material_name: "",
    specification: "",
    quantity: null,
    unit: "",
    remark: "",
    submitted_by: "u-ong",
    submitted_by_name: "ong",
    submitted_at: "2026-11-19T23:30:00Z",
    assigned_reviewer: HQ,
    assigned_reviewer_name: "测试建筑商 1",
    decided_by_name: "测试建筑商 1",
    decided_at: "2026-11-19T23:35:00Z",
    decision_note: "",
    attachments: [],
    attachment_count: 0,
    decisions: [],
    created_at: "2026-11-19T23:30:00Z",
    execution_status: "PENDING",
    reminder_count: 0,
    reminder_hours: 24,
    execution_manager_names: ["mike"],
    can_execute: false,
    ...overrides,
  };
}

function detail(row: MaterialRequest) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-requests", "detail", row.id], row);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <MaterialRequestDetail id={row.id} onClose={() => {}} onRaiseAgain={() => {}} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const COMPLETE = />确认完成<\/button>/;
const START = />开始处理<\/button>/;

describe("an approved request on the office detail (JB231)", () => {
  beforeEach(() => {
    reader.id = null;
    reader.codes = ["material_request.view"];
  });

  it("shows 审批状态 and 执行状态 apart, and 批准人 with the time - never 「批准 / 退回人」", () => {
    reader.id = HQ;
    const html = detail(approved());
    expect(html).toContain("<dt>审批状态</dt>");
    expect(html).toContain("<dt>执行状态</dt>");
    expect(html).toContain("待执行");
    expect(html).toContain("<dt>批准人</dt>");
    expect(html).toContain("测试建筑商 1 · ");
    expect(html).not.toContain("批准人 / 退回人");
  });

  it("explains approved is not done, and whom it waits for", () => {
    reader.id = HQ;
    const html = detail(approved());
    expect(html).toContain("已批准不等于已完成");
    expect(html).toContain("每 24 小时提醒");
    expect(html).toContain("等待项目经理 mike 确认完成。");
  });

  it("head office sees it but has no 确认完成", () => {
    reader.id = HQ;
    const html = detail(approved());
    expect(html).not.toMatch(COMPLETE);
    expect(html).not.toMatch(START);
    expect(html).toContain("总部可以在这里查看，但由项目经理确认完成。");
  });

  it("the project manager has 开始处理 and 确认完成 with an optional note", () => {
    reader.id = PM;
    const html = detail(approved({ can_execute: true }));
    expect(html).toMatch(START);
    expect(html).toMatch(COMPLETE);
    expect(html).toContain("完成说明（选填）");
    // In progress: only 确认完成 is left.
    const going = detail(approved({ can_execute: true, execution_status: "IN_PROGRESS", execution_started_by_name: "mike", execution_started_at: "2026-11-20T01:00:00Z" }));
    expect(going).not.toMatch(START);
    expect(going).toMatch(COMPLETE);
    expect(going).toContain("处理中");
    expect(going).toContain("<dt>开始处理</dt>");
  });

  it("completed: who and when, the note, no buttons", () => {
    reader.id = PM;
    const html = detail(
      approved({
        execution_status: "COMPLETED",
        completed_by_name: "mike",
        completed_at: "2026-11-21T02:00:00Z",
        completion_note: "Cabin delivered",
        can_execute: false,
      }),
    );
    expect(html).toContain("<dt>确认完成人</dt>");
    expect(html).toContain("mike · ");
    expect(html).toContain("<dt>完成说明</dt>");
    expect(html).toContain("Cabin delivered");
    expect(html).toContain("提醒已停止，事项沟通已关闭。");
    expect(html).not.toMatch(COMPLETE);
    expect(html).not.toContain("已批准不等于已完成");
  });

  it("a returned request says 退回人 and has no execution", () => {
    reader.id = HQ;
    const html = detail(approved({ status: "RETURNED", execution_status: "", decision_note: "No" }));
    expect(html).toContain("<dt>退回人</dt>");
    expect(html).not.toContain("<dt>执行状态</dt>");
    expect(html).not.toContain("<dt>审批状态</dt>");
    expect(html).not.toContain("批准人 / 退回人");
  });
});

describe("the list, the chat and the words (JB231)", () => {
  const source = readFileSync(join(process.cwd(), "src/components/material-requests/material-requests-office.tsx"), "utf8");

  it("has an 执行状态 column, filter and export columns", () => {
    expect(source).toMatch(/id: "execution_status"[\s\S]*?<ExecutionBadge status=\{row\.original\.execution_status\} \/>/);
    expect(source).toMatch(/param="execution_status"/);
    expect(source).toContain('{ key: "completed_by_name", label: t("field.completedBy") }');
    expect(source).toContain('{ key: "completed_at", label: t("field.completedAt") }');
    expect(MATERIAL_REQUEST_EXECUTION_FILTERS).toEqual(["OPEN", "PENDING", "IN_PROGRESS", "COMPLETED"]);
    expect(LIST_FITS.materialRequests.storageKey).toBe("material-requests.v8");
    expect(LIST_FITS.materialRequests.columns).toHaveProperty("execution_status");
    // Under 状态 by default (the 1366 px fit), its own column under 「字段」.
    expect(LIST_FITS.materialRequests.hidden).toContain("execution_status");
    expect(source).toMatch(/row\.original\.status === "APPROVED" && row\.original\.execution_status \? \(\s*<ExecutionBadge/);
  });

  it("a completed request's chat says so", () => {
    expect(conversationClosedLine("completed", "MATERIAL_REQUEST")).toBe("recordChat.closedCompleted");
    expect(messages.recordChat.closedCompleted).toBe("事项已确认完成，聊天室已关闭。记录仍可查看。");
    // Returned still closes as decided.
    expect(conversationClosedLine("decided", "MATERIAL_REQUEST")).toBe("recordChat.closedDecided");
  });

  it("says the statuses in all four languages", () => {
    expect(messages.materialRequest.execution.PENDING).toBe("待执行");
    expect(messages.materialRequest.execution.IN_PROGRESS).toBe("处理中");
    expect(messages.materialRequest.execution.COMPLETED).toBe("已完成");
    expect(messages.mySubmissions.field.request_approved_by).toBe("批准人");
    expect(messages.mySubmissions.field.request_returned_by).toBe("退回人");
    for (const catalogue of [en, zhTW, ms]) {
      expect(catalogue.materialRequest.execution.OPEN).toBeTruthy();
      expect(catalogue.recordChat.closedCompleted).toBeTruthy();
      expect(catalogue.headquarters.approvals.openRequests).toContain("{count}");
    }
    expect(zhTW.materialRequest.execution.PENDING).toBe("待執行");
  });

  it("head office's approvals panel links to the approved, unfinished requests", () => {
    const panel = readFileSync(join(process.cwd(), "src/components/dashboard/headquarters-approvals.tsx"), "utf8");
    expect(panel).toContain("<ApprovedOpenRequests project={project} />");
    expect(panel).toMatch(/getMaterialRequests\(\{ execution_status: "OPEN", page_size: 1/);
    expect(panel).toContain('new URLSearchParams({ execution_status: "OPEN" })');
  });

  it("the phone badge reads 「已批准 · 待执行」", () => {
    const phone = readFileSync(join(process.cwd(), "src/components/field-staff/my-submissions.tsx"), "utf8");
    expect(phone).toMatch(/row\.kind === "MATERIAL_REQUEST" && row\.status === "APPROVED" && row\.execution_status/);
    expect(phone).toContain("materialRequest.execution.${row.execution_status}");
  });
});
