/**
 * JB209 (Lucas 11-16 audit) on the customer-service screens.
 *
 * C-F2  an enquiry's 处理人员 can be chosen in its 处理 dialog;
 * C-F3  its 内容 / 需求 / 处理结果 / 流失原因 are shown again and exported;
 * C-F7  the 已解决 switch, once on, is locked and says why;
 * X-2   lists read a hundred at a time with 「加载更多」, pickers read every page;
 * Part C usability: export codes worded, company status worded, buttons gated,
 * the 下次跟进日期 can be changed after creation.
 *
 * Rendered to static markup (the runner has no DOM) and read from the source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CustomerEnquiry } from "@/interfaces/crm";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/customer-service/enquiries",
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { company_preferences: { date_format: "DD/MM/YYYY", time_format: "24H" } },
    can: () => true,
    refresh: async () => {},
    isLoading: false,
  }),
  CURRENT_USER_KEY: ["auth", "me"],
}));

const { EnquiryReadBack, AssigneeSelect } = await import("@/components/crm/customer-service-workspace");

// CRLF on a Windows checkout reads as LF: the checks below are about the code, not its line endings.
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const workspace = source("src/components/crm/customer-service-workspace.tsx");

function render(node: React.ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const enquiry: CustomerEnquiry = {
  id: "e1", enquiry_code: "ENQ-2026-0001", status: "LOST", source: "DIRECT",
  company_name: "Syarikat Maju", contact_person: "Ah Seng", contact_phone: "012", contact_email: "a@b.my",
  subject: "地磅报价", message: "想了解两台地磅的价钱", requirements: "需要 60 吨",
  assigned_to: "u1", assigned_to_name: "Mei Ling", follow_up_date: "2026-11-20", last_contacted: null,
  converted_to_company: null, converted_company_name: null, won_on: null,
  lost_reason: "客户选了别家", notes: "11-10 打电话，客户说再考虑\n11-14 报价已发",
  created_at: "2026-11-01T09:00:00+08:00", updated_at: "2026-11-14T09:00:00+08:00",
};

describe("C-F3: what the enquiry said is shown again", () => {
  it("shows content, requirements, every past result and the lost reason", () => {
    const html = render(<EnquiryReadBack row={enquiry} />);
    for (const text of ["想了解两台地磅的价钱", "需要 60 吨", "11-10 打电话，客户说再考虑", "11-14 报价已发", "客户选了别家"]) {
      expect(html).toContain(text);
    }
    for (const label of ["内容", "客户需求", "以前的处理结果", "流失原因"]) expect(html).toContain(label);
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("leaves the lost reason out when there is none", () => {
    const html = render(<EnquiryReadBack row={{ ...enquiry, status: "IN_PROGRESS", lost_reason: "" }} />);
    expect(html).not.toContain("流失原因");
    expect(html).toContain("以前的处理结果");
  });

  it("is in the 处理 dialog, and the 咨询报表 carries the same four columns", () => {
    expect(workspace).toMatch(/<EnquiryReadBack row=\{row\} \/>/);
    const enquiries = workspace.match(/\["enquiries", \[([^\]]*)\]\]/)?.[1] ?? "";
    for (const key of ["message", "requirements", "notes", "lost_reason"]) expect(enquiries).toContain(`"${key}"`);
    for (const key of ["message", "requirements", "notes", "lost_reason"]) {
      expect((zh.adminCustomerService.exportColumn as Record<string, string>)[key]).toBeTruthy();
    }
  });
});

describe("C-F2: an enquiry's 处理人员 can be chosen", () => {
  it("lists the staff the server offers, with 未指定 first", () => {
    const html = render(<AssigneeSelect value="" onChange={() => {}} />, (client) =>
      client.setQueryData(["crm-assignee-options"], [{ id: "u2", full_name: "Kumar", email: "k@mse.my" }]),
    );
    expect(html).toMatch(/<option value="" selected="">未指定<\/option>/);
    expect(html).toContain(">Kumar</option>");
  });

  it("keeps the current handler listed even when no longer offered", () => {
    const html = render(<AssigneeSelect value="u1" onChange={() => {}} currentName="Mei Ling" />, (client) =>
      client.setQueryData(["crm-assignee-options"], [{ id: "u2", full_name: "Kumar", email: "k@mse.my" }]),
    );
    expect(html).toMatch(/<option value="u1" selected="">Mei Ling<\/option>/);
  });

  it("sends the handler and the follow-up date with the status, only when changed", () => {
    expect(workspace).toContain("<AssigneeSelect value={assignee} onChange={setAssignee} currentName={row.assigned_to_name} />");
    expect(workspace).toContain('<Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />');
    expect(workspace).toContain("updateEnquiryStatus(row.id, status, result, lostReason, also)");
    expect(workspace).toMatch(/assignee !== \(row\.assigned_to \?\? ""\) \? \{ assigned_to: assignee \|\| null \}/);
    expect(workspace).toMatch(/followUp !== \(row\.follow_up_date \?\? ""\) \? \{ follow_up_date: followUp \|\| null \}/);
  });
});

describe("C-F7: a resolved feedback's switch is locked and says why", () => {
  it("disables the switch on a resolved row and shows the reason", () => {
    expect(workspace).toContain("<Switch checked={resolved} disabled={row.is_resolved} onCheckedChange={setResolved} />");
    expect(workspace).toContain('{row.is_resolved && <p data-resolved-locked className="text-xs text-muted-foreground">{t("status.resolvedLocked")}</p>}');
    expect(zh.adminCustomerService.status.resolvedLocked).toBe("已解决的反馈不能改回未解决。");
  });
});

describe("X-2: no list stops at 100 rows", () => {
  it("asks for no page larger than the server gives", () => {
    expect(workspace).not.toMatch(/page_size: \d/);
  });

  it("reads every table a hundred at a time with 加载更多 under it", () => {
    for (const key of ["companies\", \"customer-service", "customer-enquiries", "customer-training", "customer-visits", "customer-feedback", "customer-service-records"]) {
      expect(workspace).toContain(`usePagedList({ queryKey: ["${key}"]`);
    }
    expect(workspace.match(/<LoadMoreRow list=\{rows\} \/>/g)?.length).toBe(6);
  });

  it("reads every company for the pickers", () => {
    expect(workspace).toContain('readAllPages((paging) => getCompanies({ ...paging, sort_by: "name" }))');
  });
});

describe("Part C usability", () => {
  it("words the codes in every export", () => {
    expect(workspace).toContain('customers: { type: words("companyType"), status: company.raw("status") as Record<string, string> }');
    expect(workspace).toContain('enquiries: { status: words("enquiryStatus") }');
    expect(workspace).toContain('is_resolved: { true: t("status.resolved"), false: t("status.open") }');
    expect(workspace).toContain('customer_satisfied: { true: t("status.satisfied"), false: t("status.unsatisfied") }');
    expect(workspace).toContain("...(values[dataset]?.[key] ? { values: values[dataset][key] } : {})");
  });

  it("shows 正常, not ACTIVE, in 客户管理", () => {
    expect(workspace).toContain("company.has(`status.${row.status}`) ? company(`status.${row.status}`) : row.status");
  });

  it("offers 新增 and 处理 only to crm.manage", () => {
    expect(workspace.match(/const manage = can\("crm\.manage"\)/g)?.length).toBe(5);
    expect(workspace).toContain('header(manage && !rows.isLoading && !rows.isError ? <Button onClick={() => setCreating(true)}><Plus />{t("action.addEnquiry")}');
    expect(workspace).toContain('{manage && <Button size="sm" variant="outline" onClick={() => setResponding(row)}>');
  });
});
