/**
 * JB209 (Lucas 11-16 audit) on the technical-support screens.
 *
 * C-F1  推进状态 offers only the states the server accepts; 已关闭 says it is final;
 * C-F2  a ticket's and a Bug's 负责人 can be chosen;
 * C-F4  API 对接 / 地磅安装 / 设备维护 load for a role without integration.view;
 * C-F6  the reply checkbox no longer suggests the customer sees other replies;
 * X-2   lists read a hundred at a time with 「加载更多」, pickers read every page;
 * Part C usability: fresh ticket row, LIVE remote button, operation names,
 * export codes worded, Bug dialog labels, buttons gated, 系统集成 links gated.
 *
 * Rendered to static markup (the runner has no DOM) and read from the source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/support-tickets/tickets",
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

const { TICKET_TRANSITIONS, ticketStateOptions, SupportAssigneeSelect } = await import(
  "@/components/support/technical-support-workspace"
);

// CRLF on a Windows checkout reads as LF: the checks below are about the code, not its line endings.
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const workspace = source("src/components/support/technical-support-workspace.tsx");
/** The body of one top-level function of the workspace. */
const body = (name: string) => {
  const start = workspace.indexOf(`function ${name}(`);
  const next = workspace.indexOf("\nfunction ", start + 1);
  return workspace.slice(start, next === -1 ? undefined : next);
};

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

describe("C-F1: 推进状态 offers only what the server accepts", () => {
  it("mirrors the server's TICKET_TRANSITIONS", () => {
    expect(TICKET_TRANSITIONS).toEqual({
      PENDING: ["IN_PROGRESS", "CLOSED"],
      IN_PROGRESS: ["TESTING", "COMPLETED", "CLOSED"],
      TESTING: ["IN_PROGRESS", "COMPLETED"],
      COMPLETED: ["IN_PROGRESS", "CLOSED"],
      CLOSED: [],
    });
  });

  it("lists the current state, then where it may go - never 待处理 → 已完成", () => {
    expect(ticketStateOptions("PENDING")).toEqual(["PENDING", "IN_PROGRESS", "CLOSED"]);
    expect(ticketStateOptions("PENDING")).not.toContain("COMPLETED");
    expect(ticketStateOptions("CLOSED")).toEqual(["CLOSED"]);
  });

  it("builds the dropdown from them and says plainly that a closed ticket is final", () => {
    const dialog = body("TicketStateDialog");
    expect(dialog).toContain("ticketStateOptions(row.state).map((x) => (");
    expect(dialog).not.toMatch(/TICKET_STATES\.map/);
    expect(dialog).toContain('{t("ticketEdit.closedFinal")}');
    expect(dialog).toMatch(/\{nextStates\.length > 0 && \(\s*<Button/);
    expect(zh.adminTechnicalSupport.ticketEdit.closedFinal).toContain("请新增一张工单");
  });
});

describe("C-F2: 负责人 can be chosen for tickets and Bugs", () => {
  it("lists the staff the server offers, with 未指定 first", () => {
    const html = render(<SupportAssigneeSelect value="" onChange={() => {}} />, (client) =>
      client.setQueryData(["support-assignee-options"], [{ id: "u2", full_name: "Kumar", email: "k@mse.my" }]),
    );
    expect(html).toMatch(/<option value="" selected="">未指定<\/option>/);
    expect(html).toContain(">Kumar</option>");
  });

  it("keeps the current handler listed even when no longer offered", () => {
    const html = render(<SupportAssigneeSelect value="u1" onChange={() => {}} currentName="Mei Ling" />, (client) =>
      client.setQueryData(["support-assignee-options"], []),
    );
    expect(html).toMatch(/<option value="u1" selected="">Mei Ling<\/option>/);
  });

  it("is in the ticket correction and in the Bug 处理 dialog", () => {
    const ticket = body("TicketStateDialog");
    expect(ticket).toContain("assigned_to: assignee || null,");
    expect(ticket).toContain('assignee !== (row.assigned_to ?? "") ||');
    expect(ticket).toContain("<SupportAssigneeSelect");
    const bug = body("BugUpdateDialog");
    expect(bug).toContain("<SupportAssigneeSelect");
    expect(bug).toMatch(/assignee !== \(row\.assigned_to \?\? ""\)\s*\? \{ assigned_to: assignee \|\| null \}/);
  });
});

describe("C-F4: the integration lookups no longer blank the page", () => {
  for (const [panel, lookup] of [["APIIntegrationPanel", "liveConnections"], ["DevicePanel", "registeredDevices"]] as const) {
    it(`${panel}: asks only with integration.view, and fails as a note`, () => {
      const code = body(panel);
      expect(code).toContain("enabled: mayOpenIntegrations,");
      expect(code).toContain('const mayOpenIntegrations = can("integration.view");');
      expect(code).toContain("const ready = !rows.isLoading && !rows.isError;");
      expect(code).toMatch(/<Panel\s+loading=\{rows\.isLoading\}\s+error=\{rows\.isError\}\s*>/);
      expect(code).not.toContain(`${lookup}.isError`);
      expect(code).toContain(`<QueryFailedNote query={${lookup}}`);
    });
  }
});

describe("C-F6: replies are staff-only records", () => {
  it("says nothing is sent to the customer, in all four languages", () => {
    expect(zh.adminTechnicalSupport.ticketComment.internalHelp).toContain("不会发给客户");
    expect(zh.adminTechnicalSupport.ticketComment.internalHelp).not.toContain("客户看不到");
    expect(zhTW.adminTechnicalSupport.ticketComment.internalHelp).toContain("不會發給客戶");
    expect(en.adminTechnicalSupport.ticketComment.internalHelp).toContain("nothing is sent to the customer");
    expect(ms.adminTechnicalSupport.ticketComment.internalHelp).toContain("tiada apa-apa dihantar kepada pelanggan");
  });
});

describe("X-2: no list stops at 100 rows", () => {
  it("asks for no page larger than the server gives", () => {
    expect(workspace).not.toMatch(/page_size: \d/);
  });

  it("reads every table a hundred at a time with 加载更多 under it", () => {
    for (const panel of ["TicketPanel", "BugPanel", "APIIntegrationPanel", "DevicePanel"]) {
      expect(body(panel)).toContain("usePagedList({");
      expect(body(panel)).toContain("<LoadMoreRow list={rows} />");
    }
    expect(body("RemoteSessionHistory")).toContain("<LoadMoreRow list={sessions} />");
  });

  it("reads every company and every lookup row for the pickers", () => {
    expect(body("useCompanies")).toContain('readAllPages((paging) => getCompanies({ ...paging, sort_by: "name" }))');
    expect(workspace).toContain("readAllPages((paging) => getIntegrations({ ...paging }))");
    expect(workspace).toContain("readAllPages((paging) => getIntegrationDevices({ ...paging }))");
  });
});

describe("Part C usability", () => {
  it("the ticket dialog reads the refreshed row, so a reply just sent shows", () => {
    expect(body("TicketPanel")).toContain("rows.data?.results.find((row) => row.id === processing.id) ?? processing");
    expect(body("TicketPanel")).toContain("row={processingRow}");
  });

  it("a LIVE record's 远端操作 is greyed with its reason", () => {
    const code = body("DevicePanel");
    expect(code).toContain('row.operation_mode === "LIVE" ? t("mode.live") : undefined');
    expect(code).toContain('disabled={row.operation_mode === "LIVE"}');
  });

  it("the remote history names the operation", () => {
    expect(body("RemoteSessionHistory")).toContain("ts(`remoteOperation.${row.session_type}`)");
  });

  it("words the codes in every export", () => {
    const code = body("ReportPanel");
    expect(code).toContain('tickets: { type: words("ticketType"), state: words("ticketState"), priority: words("priority") }');
    expect(code).toContain('is_online: { true: t("status.online"), false: t("status.offline") }');
    expect(code).toContain("...(values[dataset]?.[key] ? { values: values[dataset][key] } : {}),");
  });

  it("the Bug 处理 dialog labels every box and calls the version 修复版本", () => {
    const bug = body("BugUpdateDialog");
    for (const label of ['t("column.status")', 't("field.rootCause")', 't("field.fix")', 't("field.fixedInVersion")']) {
      expect(bug).toContain(`<FieldWrapper label={${label}}>`);
    }
    expect(bug).not.toContain("placeholder=");
    expect(bug).not.toContain('t("field.firmware")');
    expect(zh.adminTechnicalSupport.field.fixedInVersion).toBe("修复版本");
  });

  it("offers 新增 and 处理 only to support.manage", () => {
    for (const panel of ["TicketPanel", "BugPanel", "APIIntegrationPanel", "DevicePanel"]) {
      expect(body(panel)).toContain('const manage = can("support.manage");');
    }
  });

  it("shows 系统集成 links only to those who can open that page", () => {
    expect(body("Overview")).toContain('href === "/integrations" && !mayOpenIntegrations');
    expect(body("TechnicalSetupGuide")).toContain('.filter(([href]) => href !== "/integrations" || mayOpenIntegrations)');
    for (const panel of ["APIIntegrationPanel", "DevicePanel"]) {
      expect(body(panel)).toMatch(/\{mayOpenIntegrations && \(\s*<Button size="sm" variant="outline" asChild>/);
    }
  });
});
