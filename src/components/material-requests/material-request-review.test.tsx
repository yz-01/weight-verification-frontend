/**
 * D2 (Q14, Q15) on screen: what each person sees on a waiting material
 * request, and the 「提交给」 field on the form the phone and the office share.
 *
 * Rendered to static markup - the project has no DOM in its test runner -
 * with the record shell reduced to its facts and actions, and the query cache
 * filled the way the server would answer.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialRequest } from "@/interfaces/material-request";
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
  // 记录人 (E8) is not what these tests read.
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
const { MaterialRequestForm } = await import("@/components/material-requests/request-form");

const APPLICANT = "u-applicant";
const HQ_ONE = "u-hq-one";
const HQ_TWO = "u-hq-two";

function request(overrides: Partial<MaterialRequest> = {}): MaterialRequest {
  return {
    id: "mr-1",
    request_no: "MR-SITE-0001",
    request_type: "MATERIAL",
    status: "SUBMITTED",
    project: "p-1",
    project_name: "Site",
    project_code: "SITE",
    material_name: "Rebar",
    specification: "Y12",
    quantity: "10.00",
    unit: "TONNE",
    remark: "",
    submitted_by: APPLICANT,
    submitted_by_name: "Ah Seng",
    submitted_at: "2026-10-07T01:00:00Z",
    assigned_reviewer: HQ_ONE,
    assigned_reviewer_name: "Mei Ling",
    decided_by_name: null,
    decided_at: null,
    decision_note: "",
    attachments: [],
    attachment_count: 0,
    decisions: [],
    created_at: "2026-10-07T01:00:00Z",
    ...overrides,
  };
}

function render(node: React.ReactNode, cache: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of cache) client.setQueryData(key, data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function detail(row: MaterialRequest) {
  return render(<MaterialRequestDetail id={row.id} onClose={() => {}} onRaiseAgain={() => {}} />, [
    [["material-requests", "detail", row.id], row],
  ]);
}

const REVIEW = ["material_request.view", "material_request.review", "material_request.submit"];
const APPROVE = />批准<\/button>/;
const TAKE_OVER = />改派给我<\/button>/;

describe("who sees what on a waiting material request (D2)", () => {
  beforeEach(() => {
    reader.id = null;
    reader.codes = [];
  });

  it("the applicant reads 「等待 XXX 审批」 and gets no buttons, even holding the permission", () => {
    reader.id = APPLICANT;
    reader.codes = REVIEW;
    const html = detail(request());
    expect(html).toContain("等待 Mei Ling 审批。");
    expect(html).not.toMatch(APPROVE);
    expect(html).not.toMatch(TAKE_OVER);
    expect(html).not.toContain("退回此申请");
  });

  it("the person it was sent to approves or returns it", () => {
    reader.id = HQ_ONE;
    reader.codes = REVIEW;
    const html = detail(request());
    expect(html).toMatch(APPROVE);
    expect(html).toContain("退回此申请");
    expect(html).not.toMatch(TAKE_OVER);
  });

  it("another approver sees whose it is and 「改派给我」, not approve", () => {
    reader.id = HQ_TWO;
    reader.codes = REVIEW;
    const html = detail(request());
    expect(html).toContain("等待 Mei Ling 审批。");
    expect(html).toMatch(TAKE_OVER);
    expect(html).not.toMatch(APPROVE);
  });

  it("somebody without the permission only waits", () => {
    reader.id = "u-viewer";
    reader.codes = ["material_request.view"];
    const html = detail(request());
    expect(html).toContain("等待 Mei Ling 审批。");
    expect(html).not.toMatch(APPROVE);
    expect(html).not.toMatch(TAKE_OVER);
  });

  it("names who it was sent to and keeps the take-over record", () => {
    reader.id = HQ_TWO;
    reader.codes = REVIEW;
    const html = detail(
      request({
        assigned_reviewer: HQ_TWO,
        assigned_reviewer_name: "Kumar",
        decisions: [
          {
            id: "d-1",
            decision: "REASSIGNED",
            note: "",
            decided_by_name: "Kumar",
            decided_at: "2026-10-07T02:00:00Z",
            previous_reviewer_name: "Mei Ling",
          },
        ],
      }),
    );
    expect(html).toContain("<dt>提交给</dt><dd>Kumar</dd>");
    expect(html).toContain("<dt>改派记录</dt>");
    expect(html).toContain("Kumar 从 Mei Ling 改派给自己");
    // Now it is theirs: approve, not take over.
    expect(html).toMatch(APPROVE);
    expect(html).not.toMatch(TAKE_OVER);
  });
});

describe("「提交给」 on the request form (D2, Q15)", () => {
  beforeEach(() => {
    reader.id = APPLICANT;
    reader.codes = ["material_request.submit"];
  });

  const prefill = {
    project: "p-1",
    request_type: "MATERIAL" as const,
    material_name: "Rebar",
    specification: "Y12",
    quantity: "10",
    unit: "TONNE",
    remark: "",
  };
  const options = { options: [], built_in_units: ["TONNE"] };

  function form(reviewers: { id: string; full_name: string }[]) {
    return render(<MaterialRequestForm prefill={prefill} onSaved={() => {}} />, [
      [["material-request-options"], options],
      [["projects", "options"], { results: [{ id: "p-1", code: "SITE", name: "Site" }], count: 1 }],
      [["material-request-reviewers", "p-1"], reviewers],
    ]);
  }

  it("is a required field with the same name as everywhere else", () => {
    const html = form([{ id: HQ_ONE, full_name: "Mei Ling" }]);
    expect(html).toContain("提交给");
    expect(html).toContain("只列出这个项目能批准申请的人。");
  });

  it("is chosen for the applicant when only one person can approve", () => {
    const html = form([{ id: HQ_ONE, full_name: "Mei Ling" }]);
    // Nothing is missing, so 提交 is not held back.
    expect(html).not.toContain("还差这些没填");
  });

  it("holds the submit back until the applicant chooses among several", () => {
    const html = form([
      { id: HQ_ONE, full_name: "Mei Ling" },
      { id: HQ_TWO, full_name: "Kumar" },
    ]);
    expect(html).toMatch(/还差这些没填：[^<]*提交给/);
  });

  it("says who to ask when nobody on the project can approve", () => {
    const html = form([]);
    expect(html).toContain("这个项目还没有人能批准申请");
  });
});

describe("approving settles the supplier and the manufacturer (2026-10 D1, D2)", () => {
  beforeEach(() => {
    reader.id = HQ_ONE;
    reader.codes = REVIEW;
  });

  it("puts both pickers beside approve, and holds approve back until both are chosen", () => {
    const html = detail(request());
    expect(html).toContain("批准就是采购决定");
    expect(html).toMatch(/还差这些没填：[^<]*供应商[^<]*制造厂商/);
  });

  it("starts from what the applicant suggested, so nothing is missing", () => {
    const html = detail(
      request({
        supplier: "s-1",
        supplier_name: "Steel Trader",
        manufacturer: "m-1",
        manufacturer_name: "Southern Steel",
      }),
    );
    expect(html).toContain("Steel Trader");
    expect(html).toContain("Southern Steel");
    expect(html).not.toMatch(/还差这些没填：[^<]*供应商/);
  });

  it("asks for neither on an other request", () => {
    const html = detail(request({ request_type: "OTHER", material_name: "", quantity: null, unit: "" }));
    expect(html).not.toContain("批准就是采购决定");
    expect(html).toMatch(APPROVE);
  });
});
