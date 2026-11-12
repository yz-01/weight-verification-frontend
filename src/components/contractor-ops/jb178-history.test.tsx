/**
 * JB178 / JB180 (客户 11-12 追加 1、3) on the screen.
 *
 * 追加 1: 「所有报表的打印、下载、导出、发送／分享操作，都必须正确记录」「WhatsApp
 * 分享必须保留操作人员、日期时间、报表名称、接收方及发送方式」「点击分享不等于
 * 发送成功，必须正确区分分享链接已生成、已打开 WhatsApp 和实际发送状态」「总部
 * 必须能够查看所有项目的报表操作历史」.
 *
 * 追加 3: 「今天测试了大约3次报表操作，历史记录却只显示1条」「历史记录没有明确的
 * 「查看」按钮，必须能够重新打开原来的报表，支持预览、打印、下载及发送／分享」
 * 「总部必须能够统一查看所有项目的报表历史记录，包括操作人员、日期时间、操作
 * 类型、报表名称及发送记录」.
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
import type { FileActionRecord, FileShare } from "@/interfaces/file-action";
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

const { SendStates, openedVia, actualSendKeys } = await import("@/components/shared/send-states");
const { SentToCell, RowView, keptFile, ShowingOnly, EmptyNote } = await import(
  "@/components/contractor-ops/contractor-report-history"
);
const { exportBody } = await import("@/services/contractor.service");

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

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

const share = (overrides: Partial<FileShare> = {}): FileShare => ({
  id: "s1",
  created_at: "2026-11-12T07:08:00Z",
  sent_by_name: "mike",
  method: "WHATSAPP",
  recipient_name: "steven9885 Ong",
  recipient_company: "Owner Sdn Bhd",
  recipient_contact: "012-988 5000",
  subject: "材料成本报表",
  file_name: "材料成本报表 20261112-1508.xlsx",
  record_kind: "",
  record_id: "",
  part: "",
  status: "OPENED",
  confirmed_at: null,
  confirmed_by_name: "",
  has_link: true,
  link_created_at: "2026-11-12T07:08:02Z",
  opened_at: null,
  open_count: 0,
  opened_via: "whatsapp",
  ...overrides,
});

const row = (overrides: Partial<FileActionRecord> = {}): FileActionRecord => ({
  id: "r1",
  created_at: "2026-11-12T07:24:54Z",
  action: "DOWNLOAD",
  actor_name: "mike",
  actor_account: "starvision8888+4@gmail.com",
  project: "p3",
  project_name: "PUTRA_MAS",
  subject: "材料成本报表",
  file_name: "材料成本报表 20261112-1524.pdf",
  record_kind: "",
  record_id: "",
  link: "",
  channel: "",
  report_export: "h1",
  report_file_name: "材料成本报表 20261112-1524.pdf",
  report_type: "material_cost",
  report_has_file: true,
  share: null,
  ...overrides,
});

const archive = { busy: null as string | null, open: () => {}, element: <></> };

describe("JB178-4: 分享链接已生成 · 已打开 WhatsApp · 实际发送, each with its time", () => {
  it("a WhatsApp send just pressed: the link, the chat opened, and not yet confirmed", () => {
    const html = render(<SendStates share={share()} />);
    expect(html).toContain("分享链接已生成 · 12/11/2026 15:08");
    expect(html).toContain("已打开 WhatsApp · 12/11/2026 15:08");
    expect(html).toContain("实际发送：");
    expect(html).toContain("还没有确认发出");
    // Pressing a button never reads as sent.
    expect(html).not.toContain("已确认发送");
    expect(html).not.toMatch(/(^|[^标记为])已发送/);
  });

  it("each button pressed has its own words; an older send goes by its method", () => {
    const words = (via: FileShare["opened_via"], method: FileShare["method"] = "OTHER") =>
      render(<SendStates share={share({ opened_via: via, method, has_link: false, link_created_at: null })} />);
    expect(words("email")).toContain("已打开电邮 · ");
    expect(words("share_sheet")).toContain("已打开分享窗口 · ");
    expect(words("link")).toContain("已复制链接 · ");
    expect(words("download")).toContain("已下载文件 · ");
    expect(words(undefined, "EMAIL")).toContain("已打开电邮 · ");
    expect(openedVia({ opened_via: undefined, method: "OTHER" })).toBe("share_sheet");
    // No link: no link line.
    expect(words("email")).not.toContain("分享链接已生成");
  });

  it("实际发送 says who confirmed and when, and when the recipient opened the link", () => {
    const confirmed = render(
      <SendStates share={share({ status: "CONFIRMED", confirmed_by_name: "Boss", confirmed_at: "2026-11-12T08:00:00Z" })} />,
    );
    expect(confirmed).toContain("已确认发送 · Boss · 12/11/2026 16:00");
    const opened = render(
      <SendStates
        share={share({ status: "CONFIRMED", confirmed_at: "2026-11-12T09:00:00Z", opened_at: "2026-11-12T09:00:00Z", open_count: 2 })}
      />,
    );
    expect(opened).toContain("对方已打开链接 · 12/11/2026 17:00（2 次）");
    expect(actualSendKeys({ status: "OPENED", confirmed_by_name: "", opened_at: null })).toEqual(["notYet"]);
    expect(actualSendKeys({ status: "CONFIRMED", confirmed_by_name: "Boss", opened_at: "x" })).toEqual([
      "confirmed",
      "openedLink",
    ]);
  });

  it("the same words in the operation log, a record's 发送记录 and the send window", () => {
    expect(source("src/components/contractor-ops/contractor-report-history.tsx")).toContain("<SendStates share={share} />");
    expect(source("src/components/shared/record-send-log.tsx")).toContain("<SendStates share={share} />");
    const actions = source("src/components/shared/file-actions.tsx");
    expect(actions).toContain('{handed && share ? <SendStates share={share} className="rounded-md border p-2" /> : null}');
    expect(source("src/components/shared/send-recipient.tsx")).toContain(
      '<SendStates share={share} className="rounded-md border p-2" />',
    );
  });

  it("the button pressed is written with the send", () => {
    const actions = source("src/components/shared/file-actions.tsx");
    expect(actions).toContain('writeLog ? () => writeLog(via === "whatsapp" ? "whatsapp" : "email") : undefined');
    expect(actions).toContain('await handOver("download")');
    expect(actions).toContain('await handOver("email")');
    expect(actions).toContain('await handOver("whatsapp")');
    expect(actions).toContain('action === "share" ? { ...details, channel: "share_sheet" } : details');
    expect(actions).toContain("recordFileAction(type, { ...details, channel }, grant, recipient)");
  });
});

describe("JB178-3 / JB180-3: what a send row keeps, in the 操作记录 columns", () => {
  it("发送记录: to whom (name, company, phone), how, and the three states", () => {
    const html = render(<SentToCell share={share()} />);
    expect(html).toContain("steven9885 Ong · Owner Sdn Bhd");
    expect(html).toContain("WhatsApp · 012-988 5000");
    expect(html).toContain("已打开 WhatsApp · ");
  });

  it("the columns: 日期时间｜操作员｜操作类型｜项目｜报表名称｜发送记录｜查看", () => {
    const history = source("src/components/contractor-ops/contractor-report-history.tsx");
    const table = history.slice(history.indexOf("function ActionTable("), history.indexOf("export function keptFile"));
    const order = [
      'h("log.at")',
      'h("log.operator")',
      'h("log.action")',
      'h("project")',
      'h("log.reportName")',
      'h("log.sendRecord")',
      'h("log.view")',
    ].map((key) => table.indexOf(key));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(table).toContain("{row.actor_account}");
    expect(table).toContain("dateTime24(row.created_at)");
    expect(zh.contractorReports.history.log.reportName).toBe("报表名称");
    expect(zh.contractorReports.history.log.sendRecord).toBe("发送记录");
  });
});

describe("JB180-2: every row has 「查看」", () => {
  it("a kept report: a 查看 button that opens the file as it was kept", () => {
    const kept = keptFile(row());
    expect(kept).toMatchObject({ id: "h1", export_format: "PDF", has_file: true });
    const html = render(<RowView row={row()} kept={kept} archive={archive} />);
    expect(html).toContain('data-slot="history-action-view"');
    expect(html).toContain("查看");
    expect(html).toContain("<button");
    // Opened in the archive viewer: 预览｜打印｜导出｜发送 on the stored file.
    const history = source("src/components/contractor-ops/contractor-report-history.tsx");
    expect(history).toContain('onClick={() => archive.open(kept, "preview", rowTitle(row))}');
  });

  it("a single record keeps 「打开记录」; a row with no kept file says so", () => {
    const record = row({ report_export: null, report_has_file: false, link: "/receipts/1" });
    const linked = render(<RowView row={record} kept={keptFile(record)} archive={archive} />);
    expect(linked).toContain(zh.contractorReports.history.log.openRecord);
    expect(linked).toContain('href="/receipts/1"');
    expect(linked).not.toContain("history-action-view");
    const old = row({ report_has_file: false });
    expect(keptFile(old)).toBeNull();
    expect(render(<RowView row={old} kept={null} archive={archive} />)).toContain("这一份当时没有保存文件");
  });
});

describe("JB180-1 / JB178-5: the page says what it shows", () => {
  const scope = (overrides = {}) => ({
    projectLabel: "PRJ-0003 - PUTRA_MAS",
    parts: ["PRJ-0003 - PUTRA_MAS", "12/11/2026", "下载 / 导出"],
    narrowed: true,
    clearable: true,
    allProjectsHint: zh.contractorReports.history.allProjectsTopBar,
    onClear: () => {},
    ...overrides,
  });

  it("现在只显示：…，共 N 笔。 with 清除筛选", () => {
    const html = render(<ShowingOnly scope={scope()} count={1} />);
    expect(html).toContain("现在只显示：PRJ-0003 - PUTRA_MAS · 12/11/2026 · 下载 / 导出，共 1 笔。");
    expect(html).toContain(zh.contractorReports.history.filter.clear);
    expect(render(<ShowingOnly scope={scope({ clearable: false })} count={1} />)).not.toContain(
      zh.contractorReports.history.filter.clear,
    );
    expect(render(<ShowingOnly scope={scope({ parts: [] })} count={1} />)).toBe("");
  });

  it("a project with nothing says which project and where 全部项目 is", () => {
    const empty = (overrides = {}) =>
      render(
        <EmptyNote
          scope={scope({ narrowed: false, parts: ["PRJ-0003 - PUTRA_MAS"], ...overrides })}
          plain={zh.contractorReports.history.logEmpty}
          noMatch={zh.contractorReports.history.logNoMatch}
          projectEmpty={"这个项目（PRJ-0003 - PUTRA_MAS）还没有打印、下载或发送的记录。"}
        />,
      );
    const html = empty();
    expect(html).toContain("这个项目（PRJ-0003 - PUTRA_MAS）还没有打印、下载或发送的记录。");
    expect(html).toContain("要看所有项目的，请在右上角选「全部项目」。");
    expect(empty({ narrowed: true })).toContain("没有符合筛选条件的记录。");
    expect(empty({ projectLabel: "" })).toContain(zh.contractorReports.history.logEmpty);
    expect(zh.contractorReports.history.logEmptyProject).toBe("这个项目（{project}）还没有打印、下载或发送的记录。");
    expect(zh.contractorReports.history.emptyProject).toBe("这个项目（{project}）还没有导出的报表。");
  });

  it("both tabs follow the project; the hint says each operation is one row", () => {
    const history = source("src/components/contractor-ops/contractor-report-history.tsx");
    expect(history).not.toContain('tab === "log" ? (\n            projectBoxShown');
    const reports = history.slice(history.indexOf("function ReportRows("), history.indexOf("export function savedConditions"));
    expect(reports).toContain('project: filters.project === "all" ? undefined : filters.project');
    expect(zh.contractorReports.history.logHint).toContain("各记一行");
    expect(zh.contractorReports.history.logHint).toContain("预览不记录");
  });
});

describe("JB178-2: the material reports are kept as reports", () => {
  it("the report page names its report; the module's own list does not", () => {
    expect(exportBody({ format: "xlsx", title: "t", columns: [], query: {}, reportType: "material_cost" })).toMatchObject({
      report_type: "material_cost",
    });
    expect(exportBody({ format: "xlsx", title: "t", columns: [], query: {} })).not.toHaveProperty("report_type");
    const page = source("src/components/reports/material-report.tsx");
    expect(page).toContain('const reportType = mode === "cost" ? "material_cost" : "material_quantity";');
    expect(page.match(/\n\s+reportType,\n/g)).toHaveLength(2);
    expect(zh.contractorReports.type.material_cost).toBe("材料成本报表");
    expect(zh.contractorReports.type.material_quantity).toBe("材料数量报表");
  });
});

describe("every new word in four languages", () => {
  it("has them all", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const states = messages.fileActions.send.states;
      for (const key of ["linkMade", "actual", "confirmed", "confirmedNoName", "openedLink", "sender"] as const) {
        expect(states[key]).toBeTruthy();
      }
      for (const key of ["whatsapp", "email", "share_sheet", "link", "download"] as const) {
        expect(states.opened[key]).toContain("{when}");
      }
      const h = messages.contractorReports.history;
      for (const key of [
        "showingOnly", "logEmptyProject", "emptyProject", "allProjectsTopBar", "allProjectsFilter", "logNoMatch",
      ] as const) {
        expect(h[key]).toBeTruthy();
      }
      for (const key of ["reportName", "sendRecord", "view", "noFile"] as const) {
        expect(h.log[key]).toBeTruthy();
      }
      expect(messages.contractorReports.type.material_cost).toBeTruthy();
    }
    expect(zh.fileActions.send.states.opened.whatsapp).toBe("已打开 WhatsApp · {when}");
    expect(zh.fileActions.send.states.linkMade).toBe("分享链接已生成 · {when}");
    expect(zh.fileActions.send.status.OPENED).toBe("还没有确认发出");
    // Client-facing words say 你, never 您.
    expect(JSON.stringify(zh.contractorReports.history)).not.toContain("您");
  });
});

describe("JB178-6: the gaps the audit found, filled", () => {
  it("a permit file's 打印 / 下载 and a document version's 下载 ask the PIN and are logged with their project", () => {
    const permit = source("src/components/permits/permit-parts.tsx");
    expect(permit).toContain('if (!(await signFileAction("PRINT", details))) return;');
    expect(permit).toContain('if (await signFileAction("DOWNLOAD", details)) await downloadPermitFile(permitId, file);');
    expect(permit).toContain("project={permit.project}");
    const documents = source("src/components/document-workflow/documents.tsx");
    const download = documents.slice(documents.indexOf("const handleDownload = async"), documents.indexOf("const systemFiles"));
    expect(download).toContain('signFileAction("DOWNLOAD", {');
    expect(download).toContain('record_kind: "DOCUMENT"');
    expect(download.indexOf("signFileAction")).toBeLessThan(download.indexOf("downloadDocumentVersion(version)"));
  });

  it("sign-first QR downloads and a photo's print / download name their project or record", () => {
    expect(source("src/components/projects/project-dockets.tsx")).toContain("project: note.project");
    expect(source("src/components/site-access/site-access-workspace.tsx")).toContain("project: row.project");
    expect(source("src/components/suppliers/supplier-site-codes.tsx")).toContain("project: code.project");
    expect(source("src/components/qrcodes/admin-qr-workspace.tsx").match(/project: code\.project \?\? undefined/g)).toHaveLength(2);
    const photo = source("src/components/shared/evidence-file-actions.tsx");
    expect(photo.match(/record_kind: target\?\.recordKind/g)).toHaveLength(2);
  });
});

describe("JB178-6: two more direct downloads now signed and logged", () => {
  it("a consultant application's form file row and a machine's QR picture", () => {
    const own = source("src/components/consultant-workflow/consultant-own-form.tsx");
    const download = own.slice(own.indexOf("const download = async (ref"), own.indexOf("const fileRow ="));
    expect(download).toContain('signFileAction("DOWNLOAD", {');
    expect(download).toContain("project: application.project");
    expect(own).not.toContain("onDownload={() => downloadApplicationFormFile(");
    const qr = source("src/components/contractor-ops/equipment-qr.tsx");
    expect(qr).toContain("if (signed) await downloadEquipmentQr(machine.id, stickerNumber(machine));");
  });
});
