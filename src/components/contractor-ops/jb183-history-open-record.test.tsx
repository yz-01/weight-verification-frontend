/**
 * JB183 (客户 11-13 事项 1、2) on the screen: 报表中心 › 报表历史记录 › 操作记录.
 *
 * 事项 1: 「打开完整记录后，没有「X」关闭按钮」「点击左上角「⬅️」返回箭头，会跳转到
 * 其他页面，无法返回原来的操作记录列表」「点击「X」或返回箭头，必须返回原来的
 * 「报表历史记录 → 操作记录」页面」「返回后保留原来的项目选择、筛选条件及列表位置」
 * 「总部及项目后台都必须检查并修复」.
 *
 * 事项 2: 「在报表历史记录点击「打开记录」，系统竟然直接跳到「仪表板」」「另一次
 * 点击「打开记录」，系统直接跳到 OIL & GAS 的「现场任务」页面，而且显示没有相关
 * 记录」「打开记录后，点击 X 关闭，无法返回原来的「报表历史记录 → 操作记录」页面」
 * 「请同时检查是否存在其他业务记录链接错误的问题」.
 *
 * Rendered to static markup (the runner has no DOM) and read from the source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/interfaces/api";
import type { FileActionRecord } from "@/interfaces/file-action";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => "/reports/contractor/history",
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

const { RowView, keptFile } = await import("@/components/contractor-ops/contractor-report-history");
const { RecordWindowFailure } = await import("@/components/shared/record-window-failure");

// CRLF on a Windows checkout reads as LF: the checks below are about the code, not its line endings.
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** 图1's rows: a send of a daily report, and a 完整证据 of an equipment entry. */
const row = (overrides: Partial<FileActionRecord> = {}): FileActionRecord => ({
  id: "r1",
  created_at: "2026-11-09T01:20:22Z",
  action: "SEND",
  actor_name: "steven ong 1",
  actor_account: "starvision8888@gmail.com",
  project: "p4",
  project_name: "OIL & GAS",
  subject: "2026-11-09 日报告",
  file_name: "2026-11-09 日报告.pdf",
  record_kind: "DAILY_REPORT",
  record_id: "d1",
  link: "",
  channel: "whatsapp",
  report_export: null,
  report_file_name: null,
  report_type: null,
  report_has_file: false,
  share: null,
  ...overrides,
});

const archive = { busy: null as string | null, open: () => {}, element: <></> };
const view = (record: FileActionRecord) => render(<RowView row={record} kept={keptFile(record)} archive={archive} />);
const h = zh.contractorReports.history;
const history = source("src/components/contractor-ops/contractor-report-history.tsx");

describe("JB183-1: 「打开记录」 opens the row's own record", () => {
  it("图1 「完整证据 · EQ0001-ENTRY」 (stored link \"/\", which went to 仪表板): a button that opens the record, no link", () => {
    const html = view(
      row({ subject: "完整证据 · EQ0001-ENTRY", file_name: "EQ0001.pdf", record_kind: "EQUIPMENT_MOVEMENT", record_id: "m1", link: "/" }),
    );
    expect(html).toContain(h.log.openRecord);
    expect(html).toContain('data-opens="window"');
    expect(html).not.toContain("href=");
  });

  it("图3: a field task's row (stored link /field-tasks) opens the task, not the list", () => {
    const html = view(row({ record_kind: "FIELD_TASK", record_id: "t1", link: "/field-tasks" }));
    expect(html).toContain('data-opens="window"');
    expect(html).not.toContain('href="/field-tasks"');
  });

  it("the old plain link (a full-page jump) is gone; the stored link is not what opens a record", () => {
    expect(history).not.toContain("<a href={row.link}");
    expect(history).toContain("const target = logRowTarget(row);");
  });

  it("a record with only a page says 「打开记录」 and goes to that page", () => {
    expect(view(row({ record_kind: "APPROVAL", record_id: "a1" }))).toContain('data-opens="page"');
  });
});

describe("JB183-6: 日报告 rows open the report; the sentence is only for a row with nothing", () => {
  it("图1's three daily-report sends: 「打开记录」, not 「这一份当时没有保存文件」", () => {
    const html = view(row());
    expect(html).toContain(h.log.openRecord);
    expect(html).not.toContain(h.log.noFile);
    expect(html).not.toContain("这一份当时没有保存文件");
  });

  it("做法 4: a row that names no record but kept its page: 「打开当时的页面」", () => {
    const html = view(row({ record_kind: "", record_id: "", link: "/site-access?tab=gate" }));
    expect(html).toContain(h.log.openPastPage);
    expect(html).toContain('data-opens="past-page"');
    expect(html).not.toContain(h.log.noFile);
  });

  it("做法 7: nothing to open says so in the new words", () => {
    const html = view(row({ record_kind: "", record_id: "", link: "" }));
    expect(html).toContain("这一行只记下了操作，没有可以打开的文件。");
    expect(html).not.toContain(h.log.openRecord);
    // A kept file is 「查看」 and needs no sentence.
    const kept = view(row({ record_kind: "", record_id: "", report_export: "h1", report_has_file: true, report_file_name: "x.pdf" }));
    expect(kept).toContain('data-slot="history-action-view"');
    expect(kept).not.toContain(h.log.noFile);
  });

  it("the words in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const words = messages.contractorReports.history;
      for (const key of ["openRecord", "openPastPage", "noFile"] as const) expect(words.log[key]).toBeTruthy();
      for (const key of ["record", "gone", "forbidden"] as const) expect(words.window[key]).toBeTruthy();
    }
    expect(zhTW.contractorReports.history.log.noFile).toBe("這一行只記下了操作，沒有可以打開的文件。");
  });
});

describe("JB183-2: a window with X over the list; closing comes back to the same list", () => {
  it("opening adds a history entry of its own; X goes back to it; the browser's back closes the window", () => {
    expect(history).toContain('window.history.pushState(null, "", `${home}?${query}`);');
    expect(history).toMatch(/if \(pushed\.current\) \{\n\s+pushed\.current = false;\n\s+window\.history\.back\(\);/);
    // The window is drawn from the address, so going back takes it away.
    expect(history).toContain("const namedHere = openRecordIn(search);");
    expect(history).toContain("const named = here ? namedHere : kept;");
    expect(history).toContain("onClose={close}");
  });

  it("JB187: the window stays under a form opened from inside it, so saving comes back to it", () => {
    // 更正 inside the window is an address of its own, over this page; this
    // page's address no longer names the window. Taken away then, the saved
    // form had no window to come back to and drew the record a second time:
    // one X closed that one and 操作记录's own window was there again.
    expect(history).toContain("const here = pathname === home;");
    expect(history).toContain("const [kept, setKept] = useState(namedHere);");
    expect(history).toMatch(
      /if \(here && \(kept\?\.kind !== namedHere\?\.kind \|\| kept\?\.id !== namedHere\?\.id\)\) setKept\(namedHere\);/,
    );
    // The delivery's window says it is on screen in place (`dialog-navigation`).
    expect(source("src/components/receipts/view-receipt.tsx")).toContain(
      "useRecordShownInPlace(presentation === \"dialog\" && onClose ? `/receipts/${id}` : null);",
    );
  });

  it("every window is the module's own Dialog (with its X), drawn over the page", () => {
    const windows = source("src/components/contractor-ops/log-record-window.tsx");
    expect(windows).toContain("<InPlaceRecord kind={kind} id={id} onClose={onClose} />");
    expect(windows).toContain("<DailyReportBook report={id} onClose={onClose} />");
    expect(windows).toContain('<ViewDispatch id={id} presentation="dialog" onClose={onClose} />');
    // A page in a window: its back bar becomes the window's title (no navigation).
    expect(windows).toContain('<FormSurfaceProvider value="dialog">');
    expect(windows).not.toMatch(/router\.(push|back|replace)/);
    // 考勤 / 设备工时 (no window of their own): the record frame with their
    // 完整证据 in it and the house's 预览 · 打印 · 导出 · 发送.
    expect(windows).toContain("exportRecord={{ kind: kind as RecordPdfKind, recordId: id, reference }}");
  });

  it("做法 8: the 「操作记录」 window of one report uses the same rows", () => {
    expect(history).toMatch(/function ReportActionsDialog[\s\S]*<ActionTable records=\{records\} compact \/>/);
    // Its rows reach the page's opener from inside the window.
    expect(history).toContain("<OpenLogRow.Provider value={opened.open}>");
  });
});

describe("JB183-3: back to the same tab, filters, project, page and place", () => {
  it("the state is read from the address when the page opens, and written back as it changes", () => {
    expect(history).toContain("readHistoryAddress(new URLSearchParams(search.toString()))");
    expect(history).toContain("const query = historyQuery(now, { tab, ...filters, page, logPage });");
    expect(history).toContain('window.history.replaceState(null, "", query ? `${home}?${query}` : home);');
  });

  it("the top bar settling is not a change of project (the page stays where it was)", () => {
    expect(history).toContain("if (current.active && current.loading) return;");
  });

  it("the scroll place is kept before a page opens and restored once the list has come", () => {
    expect(history).toMatch(
      /saveListScroll\(listRef\.current\);\n\s+router\.push\("page" in target \? target\.page : target\.pastPage\);/,
    );
    expect(history).toContain("const marker = useRestoredListScroll(records.isSuccess);");
    expect(history).toContain("const marker = useRestoredListScroll(history.isSuccess);");
  });
});

describe("JB183-3 做法 3: a record removed, or not this account's, says why in the window", () => {
  const failed = (error: unknown) =>
    render(<RecordWindowFailure query={{ isError: true, error, refetch: () => {} }} what="项目进度摘要" />);

  it("removed: 这一条记录已经删除，或者找不到了。", () => {
    expect(failed(new ApiError("Not found.", 404))).toContain(zh.contractorReports.history.window.gone);
  });

  it("not allowed: 你的账号没有权限看这一条记录。", () => {
    expect(failed(new ApiError("Forbidden.", 403))).toContain(zh.contractorReports.history.window.forbidden);
  });

  it("anything else: the house's 「…没有读到」 with 重试", () => {
    const html = failed(new Error("network"));
    expect(html).not.toContain(zh.contractorReports.history.window.gone);
    expect(html).toContain("项目进度摘要");
  });
});

describe("JB183-5: prints, downloads and sends inside a record's window name that record", () => {
  it("文件预览 (attachments, chat files, document versions): the file's record, else the window's", () => {
    const preview = source("src/components/shared/file-preview.tsx");
    expect(preview).toContain("const sendTarget = useRecordSendTarget();");
    expect(preview).toMatch(/signFileAction\(action, \{[\s\S]*?\.\.\.record,/);
    expect(source("src/components/shared/record-attachments.tsx")).toMatch(/recordKind=\{kind\}\n\s+recordId=\{recordId\}/);
    const documents = source("src/components/document-workflow/documents.tsx");
    expect(documents.match(/recordKind="DOCUMENT"\n\s+recordId=\{detail\.data\.id\}/g)).toHaveLength(2);
  });

  it("准证的文件: the permit (HAZARD + its id)", () => {
    const permit = source("src/components/permits/permit-parts.tsx");
    expect(permit).toContain('record_kind: "HAZARD",\n    record_id: permitId,');
    expect(permit.match(/recordKind="HAZARD"/g)).toHaveLength(2);
  });

  it("日报告 and 项目进度摘要: their photos name the report / the summary", () => {
    expect(source("src/components/progress/daily-reports.tsx")).toContain(
      '<RecordSendTargetProvider value={{ recordKind: "DAILY_REPORT", recordId: report.id }}>',
    );
    expect(
      source("src/components/progress/progress-summary.tsx").match(
        /<RecordSendTargetProvider value=\{\{ recordKind: "PROGRESS_SUMMARY", recordId: shown\.id \}\}>/g,
      ),
    ).toHaveLength(2);
  });

  it("现场记录中心 and 分类管理's record sheet: its photos name the record", () => {
    expect(source("src/components/contractor-ops/archive-queue.tsx")).toContain(
      "<RecordSendTargetProvider value={{ recordKind: recordPdfKindFor(row.kind) ?? row.kind, recordId: row.id }}>",
    );
  });

  it("地磅单, 最终审批报告 and a package's 「单独导出」: the one record each is", () => {
    expect(source("src/components/shared/export-button.tsx")).toContain("recordKind: record?.kind,");
    expect(source("src/components/weighing/print-ticket-button.tsx")).toContain(
      'record={{ kind: "WEIGH_SESSION", id: sessionId }}',
    );
    expect(
      source("src/components/consultant-workflow/application-detail.tsx").match(
        /record=\{\{ kind: "CONSULTANT_APPLICATION", id: application\.id \}\}/g,
      ),
    ).toHaveLength(2);
    expect(source("src/components/contractor-ops/multi-engine.tsx")).toContain(
      "record={{ kind: item.record_kind, id: item.record_id }}",
    );
  });
});

describe("JB183-7: 总部 and 项目 are the same page", () => {
  it("one route serves every account; the project follows the top bar", () => {
    const route = source("src/app/(dashboard)/reports/contractor/[reportType]/page.tsx");
    expect(route).toContain("ContractorReportHistoryWorkspace");
    expect(history).toContain("current.active ? current.projectId || \"all\" : \"all\"");
  });
});
