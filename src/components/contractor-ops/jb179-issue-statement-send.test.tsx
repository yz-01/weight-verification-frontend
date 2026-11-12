/**
 * JB179 (客户 11-12 下午追加 2) on screen:
 *
 *   「截图中的「材料领用结账单」目前只有关闭、打印、导出 PDF，缺少独立的预览及
 *    发送／分享功能。
 *    * 预览：可以打开完整结账单，检查正式 PDF 内容。
 *    * 打印：保留现有功能。
 *    * 下载：保留导出 PDF 功能。
 *    * 发送／分享：支持通过 WhatsApp、Email 分享结账单。
 *    * 操作记录：打印、下载及发送／分享必须关联到报表中心的操作历史。
 *    请同时检查其他业务模块的报表及结账单，确保预览、打印、下载、发送功能一致。」
 *
 * The window keeps its web table and gets the back office's own four buttons
 * (预览｜打印｜导出 PDF｜发送, `useFileActions`), each on the server's one PDF;
 * the 报表导出历史 and its 操作记录 name it 「材料领用结账单」.
 *
 * Rendered to static markup like the other screen tests - the runner has no DOM.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { exportedReportName } from "@/components/reports/exported-report-name";
import type { MaterialIssueStatement } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-office", full_name: "Office", is_field_staff: false },
    can: () => true,
  }),
}));

vi.mock("@/components/ui/dialog", () => {
  const Inline = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Inline,
    DialogContent: Inline,
    DialogDescription: Inline,
    DialogFooter: Inline,
    DialogHeader: Inline,
    DialogTitle: Inline,
  };
});

const { IssueStatementDialog } = await import("@/components/contractor-ops/issue-statement");

const words = zh.contractorOps.issue;
const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const SELECTION = { project: "p-3", company: "HH Machinery Sdn. Bhd." };

const STATEMENT: MaterialIssueStatement = {
  company: {
    company_name: "测试建筑商 1",
    company_lines: [],
    company_logo_url: null,
    project_code: "PRJ-0003",
    project_name: "PUTRA_MAS",
  },
  project: null,
  filters: { project: "p-3", company: "HH Machinery Sdn. Bhd." },
  rows: [
    {
      id: "l-1",
      record: "o-1",
      reference_no: "MIN-PRJ-0003-002",
      at: "2026-11-12T07:23:00Z",
      material_name: "Disel",
      material_specification: "",
      equipment_company: "best concrete supply",
      equipment_no: "EQ0001",
      recipient_name: "Ali Mohan",
      issuer_name: "Ah Seng",
      issued_quantity: "250.000",
      unit: "Liter",
      unit_price: "6.80",
      amount: "1700.00",
      priced: true,
      issuer_signature: "https://cdn.example/sign-a.png",
      recipient_signature: "https://cdn.example/sign-b.png",
    },
  ],
  totals: {
    lines: 1,
    records: 1,
    quantities: [{ unit: "Liter", quantity: "250.000" }],
    amount_total: "1700.00",
    unpriced_lines: 0,
  },
  limit: 500,
  generated_at: "2026-11-12T08:00:00Z",
};

function render(statement: MaterialIssueStatement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-units", "active"], []);
  client.setQueryData(["material-units", "all"], []);
  client.setQueryData(["material-outgoing", "issue-statement", SELECTION], statement);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <IssueStatementDialog filters={SELECTION} onClose={() => {}} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Every button in `html`: its opening tag's attributes and its words. */
function buttons(html: string): Array<{ attrs: string; text: string }> {
  return [...html.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].map((m) => ({
    attrs: m[1],
    text: m[2].replace(/<[^>]+>/g, "").trim(),
  }));
}

const component = read("src/components/contractor-ops/issue-statement.tsx");

describe("the window's buttons are the house's four (JB179-1, -2, -3)", () => {
  it("reads 关闭｜预览｜打印｜导出 PDF｜发送, all ready on a statement with lines", () => {
    const html = render(STATEMENT);
    const footer = buttons(html).filter((b) => /data-issue-statement-action|关闭/.test(b.attrs + b.text));
    expect(footer.map((b) => b.text)).toEqual(["关闭", "预览", "打印", "导出 PDF", "发送"]);
    for (const action of ["preview", "print", "save", "share"]) {
      const button = footer.find((b) => b.attrs.includes(`data-issue-statement-action="${action}"`));
      expect(button, action).toBeTruthy();
      expect(button!.attrs, action).not.toMatch(/\sdisabled=""/);
    }
    // 发送 says, on hover, that it only shares a copy (as everywhere).
    const send = footer.find((b) => b.attrs.includes('data-issue-statement-action="share"'))!;
    expect(send.attrs).toContain(zh.fileActions.shareHint);
  });

  it("keeps the web table on top, exactly as JB171 drew it (第 3 点)", () => {
    const html = render(STATEMENT);
    expect(html).toContain('data-testid="issue-statement-sheet"');
    expect(html.match(/data-issue-statement-row/g)).toHaveLength(1);
    expect(html).toContain("MIN-PRJ-0003-002");
    expect(html).toContain(words.statementTotalAmount);
  });

  it("runs every button through useFileActions on the server's one PDF", () => {
    expect(component).toContain("const files = useFileActions();");
    expect(component).toContain('fileActionsFor("pdf").map((action)');
    expect(component).toContain("files.run(action, source, { key: action })");
    // One file for all four: preview, print, export and send fetch the same export.
    expect(component).toContain("load: () => exportMaterialIssueStatement(filters)");
    // 打印 and 导出 PDF keep their own words (「字照旧」).
    expect(component).toContain('t("issue.statementPrint")');
    expect(component).toContain('t("issue.statementExport")');
    // No second send flow of its own.
    expect(component).not.toMatch(/whatsappLink|mailtoLink|SendRecipientDialog|recordFileAction/);
  });
});

describe("操作记录 and 报表导出历史 name it 「材料领用结账单」 (JB179-4)", () => {
  it("names the subject and has the server keep each print, export and send", () => {
    expect(component).toContain('subject: tRoot("contractorReports.type.material_issue_statement")');
    expect(component).toContain("exportedOnServer: true");
    expect(component).toContain('project: typeof filters.project === "string" ? filters.project : undefined');
  });

  it("is worded in all four catalogues, in the history and in the audit log", () => {
    const expected = { zh: "材料领用结账单", "zh-TW": "材料領用結帳單", en: "Material issue statement", ms: "Penyata pengeluaran bahan" };
    for (const [locale, catalogue] of Object.entries({ zh, "zh-TW": zhTW, en, ms })) {
      const types = catalogue.contractorReports.type as Record<string, string>;
      expect(types.material_issue_statement, locale).toBe(expected[locale as keyof typeof expected]);
      const operations = catalogue.audit.operation as Record<string, string>;
      expect(operations.material_issue_statement_previewed, locale).toBeTruthy();
    }
  });

  it("is found by its name in 报表导出历史, and named in MSE Admin's history", () => {
    const history = read("src/components/contractor-ops/contractor-report-history.tsx");
    const list = history.slice(history.indexOf("const REPORT_TYPES"), history.indexOf("];", history.indexOf("const REPORT_TYPES")));
    expect(list).toContain('"material_issue_statement"');
    const t = createTranslator({ locale: "zh", messages: zh }) as unknown as Parameters<typeof exportedReportName>[0];
    expect(exportedReportName(t, "material_issue_statement")).toBe("建筑商 · 材料领用结账单");
  });
});

describe("the sentence under the title says what the four buttons do (第 3 点)", () => {
  it("names 预览, 打印, 导出 PDF and 发送 in every language", () => {
    expect(words.statementHelp).toBe(
      "下面就是印出来的内容：筛选出来的全部已领用记录，不分页，没有照片，有双方签名。按「预览」看正式的 PDF；「打印」把它印出来；「导出 PDF」存到电脑；「发送」用 WhatsApp 或 Email 发给别人。四个用的都是同一份 PDF。",
    );
    for (const catalogue of [zh, zhTW, en, ms]) {
      const issue = catalogue.contractorOps.issue;
      const files = catalogue.fileActions;
      for (const word of [files.preview, issue.statementPrint, issue.statementExport, files.share, "WhatsApp"]) {
        expect(issue.statementHelp, word).toContain(word);
      }
      expect(issue.statementHelp).not.toContain("您");
    }
  });
});

describe("JB171's rules stay (JB179 第 4 点)", () => {
  it("no line handed over: none of the four press, with JB171's words", () => {
    const html = render({ ...STATEMENT, rows: [], totals: { ...STATEMENT.totals, lines: 0, records: 0, quantities: [], amount_total: null } });
    const four = buttons(html).filter((b) => b.attrs.includes("data-issue-statement-action"));
    expect(four).toHaveLength(4);
    for (const button of four) expect(button.attrs).toMatch(/\sdisabled=""/);
    expect(html).toContain(words.statementNone);
  });

  it("only for 金额查看, and at most 500 lines, as before", () => {
    const list = read("src/components/contractor-ops/material-issue.tsx");
    expect(list).toContain("{money && totals.data && <IssueStatementButton filters={selection} totals={totals.data} />}");
    expect(component).toContain('const tooLong = failure?.code === "issue_statement_too_long";');
    expect(zh.errors.api.issue_statement_too_long).toBe("这次筛选出来有 {count} 项，一份最多 {limit} 项。请把日期范围缩小一点再试。");
  });
});
