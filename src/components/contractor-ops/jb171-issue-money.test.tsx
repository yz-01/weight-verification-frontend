/**
 * JB171 (客户 11-11 晚上「第四批」事项 2) on screen:
 *
 * 1. 材料成本报表「按材料统计成本」: exactly 材料名称｜规格｜单位｜累计进场数量｜
 *    采购单价｜采购成本 - no issue column or figure.
 * 2. Each issue line's 单价 and 金额 on the detail at every status; 「没有单价」
 *    with 「填写单价」; the 改正 window's 单价 per line with 数量 × 单价 = 金额.
 * 3. The 材料领用 list: 日期｜领用编号｜材料名称｜规格｜所属公司｜设备编号｜领用人｜
 *    领用数量｜单位｜单价｜金额 + 查看, and its 自动汇总.
 * 4/5. 「批量预览 / 打印」: every line, both signatures, no photographs, 总领用数量
 *    and 应收总金额（RM）; 打印 and 导出 PDF on the server's one PDF.
 * 6. No 累计进场 / 累计领用 / 结余 on the issue's detail.
 *
 * Rendered to static markup like the other screen tests - the runner has no DOM.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  MaterialIssueLine,
  MaterialIssueListRow,
  MaterialIssueStatement,
  MaterialIssueTotals,
  MaterialOutgoing,
} from "@/interfaces/contractor-ops";
import type { CorrectionForm } from "@/interfaces/record-correction";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const auth = vi.hoisted(() => ({ fieldStaff: false }));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-office", full_name: "Office", is_field_staff: auth.fieldStaff },
    can: () => true,
  }),
}));

vi.mock("@/hooks/use-list-query", () => ({
  useListQuery: () => ({
    page: 1,
    pageSize: 25,
    search: "",
    filters: { company: "HH Machinery Sdn. Bhd." },
    query: { page: 1, page_size: 25, company: "HH Machinery Sdn. Bhd." },
    setFilter: () => {},
    setPage: () => {},
  }),
}));

vi.mock("@/components/shared/module-records-table", () => ({
  ProjectListFilter: () => null,
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

const { IssueLinesPanel, MaterialIssueList, issueSelection, linePriceField } = await import(
  "@/components/contractor-ops/material-issue"
);
const { IssueStatementButton, IssueStatementDialog, IssueTotalsPanel, StatementSheet } = await import(
  "@/components/contractor-ops/issue-statement"
);
const { RecordCorrectionDialog } = await import("@/components/shared/record-correction");

const words = zh.contractorOps.issue;
const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["material-units", "active"], []);
  client.setQueryData(["material-units", "all"], []);
  seed?.(client);
  // Money reads 「MYR 3.50」 with a non-breaking space; compared with a plain one.
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  ).replace(/ /g, " ");
}

/** The opening tag of the button whose words include `text`. */
function buttonWith(html: string, text: string): string {
  const match = [...html.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].find((m) =>
    m[2].includes(text),
  );
  expect(match, `a button reading ${text}`).toBeTruthy();
  return match![1];
}

/** The header cells of the first table in `html`, as text. */
function headers(html: string): string[] {
  const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
  return [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
}

/* ------------------------------------------------------------------ */

describe("材料成本报表「按材料统计成本」 (第 1 点)", () => {
  const source = read("src/components/reports/material-report.tsx");
  const cost = source.slice(source.indexOf("function CostReport("), source.indexOf("function MetricRow("));

  it("has exactly the client's six columns, in his order", () => {
    const table = cost.slice(cost.indexOf('t("materialReports.cost.byMaterial")'));
    const head = table.slice(table.indexOf("<TableHeader>"), table.indexOf("</TableHeader>"));
    const keys = [...head.matchAll(/<TableHead[^>]*>\{t\("([\w.]+)"\)\}/g)].map((m) => m[1]);
    const word = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], zh);
    expect(keys.map(word)).toEqual(["材料名称", "规格", "单位", "累计进场数量", "采购单价", "采购成本"]);
  });

  it("no longer shows 累计领用数量, 领用金额, their tile or their warning", () => {
    for (const gone of ["issue_amount", "issued_quantity", "unpriced_issue_lines", "issue_lines", "issueAmount", "issuedQuantity", "PackageMinus"]) {
      expect(cost, gone).not.toContain(gone);
    }
    // 「缺少价格」 is a small line under 采购成本, not a column of its own.
    expect(cost).toContain('t("materialReports.cost.rowUnpriced"');
    expect(cost).toContain("{row.quantity}</TableCell>");
  });

  it("is worded in all four languages", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      const words = catalogue.materialReports.cost as Record<string, string>;
      for (const key of ["materialName", "purchaseUnitPrice", "average", "rowUnpriced", "cumulativeReceived", "unpriced"]) {
        expect(words[key], key).toBeTruthy();
      }
      expect("issueAmount" in words).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */

function line(overrides: Partial<MaterialIssueLine> = {}): MaterialIssueLine {
  return {
    id: "l-1",
    position: 1,
    category: "c-diesel",
    category_name: "Diesel",
    spec_category: null,
    spec_category_name: null,
    material_name: "Diesel",
    material_specification: "",
    unit: "Liter",
    quantity: "200.000",
    issued_quantity: "180.000",
    unit_price: "3.50",
    issue_amount: "630.00",
    priced: true,
    amount: "630.00",
    amount_basis: "ISSUED",
    unit_price_source: "PRICE_LIST",
    ...overrides,
  };
}

function issue(overrides: Partial<MaterialOutgoing> = {}): MaterialOutgoing {
  return {
    id: "o-1",
    kind: "ISSUE",
    reference_no: "MIN-PRJ-0003-001",
    project: "p-1",
    project_name: "PUTRA_MAS",
    category: null,
    category_name: null,
    supplier: null,
    supplier_name: null,
    material_name: "Diesel",
    quantity: "200.000",
    unit: "Liter",
    destination: "",
    executor_name: "",
    vehicle_plate: "",
    delivery_note_no: "",
    reason: "",
    status: "COMPLETED",
    captured_at: "2026-11-11T02:00:00Z",
    latitude: null,
    longitude: null,
    submitted_by_name: "Ah Seng",
    approved_by_name: null,
    approved_at: null,
    review_note: "",
    photos: [],
    lines: [line()],
    ...overrides,
  } as MaterialOutgoing;
}

describe("the issue's detail (第 2 点、第 6 点)", () => {
  it("shows 单价, where it came from and 金额 - and no 结余", () => {
    const html = render(<IssueLinesPanel row={issue()} />);
    expect(html).toContain(words.unitPrice);
    expect(html).toContain("MYR 3.50");
    expect(html).toContain(words.priceAuto);
    expect(html).toContain("MYR 630.00");
    expect(html).toContain(words.openReceipts);
    for (const gone of ["结余", "累计进场", "累计领用"]) expect(html).not.toContain(gone);
  });

  it("shows it before the handover too, by the quantity applied for", () => {
    const html = render(
      <IssueLinesPanel
        row={issue({
          status: "PENDING",
          lines: [line({ issued_quantity: null, amount: "700.00", issue_amount: null, amount_basis: "REQUESTED" })],
        })}
      />,
    );
    expect(html).toContain("MYR 3.50");
    expect(html).toContain("MYR 700.00");
    expect(html).toContain(words.amountByRequested);
  });

  it("says 后台填写 for a price the office typed", () => {
    const html = render(<IssueLinesPanel row={issue({ lines: [line({ unit_price_source: "MANUAL" })] })} />);
    expect(html).toContain(words.priceManual);
  });

  it("says 「没有单价」 in orange with 「填写单价」 beside it", () => {
    const html = render(
      <IssueLinesPanel
        row={issue({ lines: [line({ unit_price: null, issue_amount: null, amount: null, priced: false, unit_price_source: "" })] })}
      />,
    );
    expect(html).toMatch(new RegExp(`text-warning[^>]*>${words.unpriced}<`));
    expect(buttonWith(html, words.fillPrice)).toContain('data-fill-issue-price="l-1"');
    expect(html).not.toContain("MYR 0.00");
  });

  it("offers no 「填写单价」 on a rejected issue", () => {
    const html = render(
      <IssueLinesPanel
        row={issue({ status: "REJECTED", lines: [line({ unit_price: null, amount: null, issue_amount: null, priced: false })] })}
      />,
    );
    expect(html).toContain(words.unpriced);
    expect(html).not.toContain(words.fillPrice);
  });

  it("shows no money without 金额查看", () => {
    const html = render(
      <IssueLinesPanel row={issue({ lines: [line({ unit_price: null, amount: null, issue_amount: null, priced: null })] })} />,
    );
    expect(html).not.toContain(words.unitPrice);
    expect(html).not.toContain("MYR");
  });

  it("fills a line's price in the record's own 改正 window", () => {
    expect(linePriceField("l-1")).toBe("line_price:l-1");
  });
});

/* ------------------------------------------------------------------ */

const PRICE_FORM: CorrectionForm = {
  kind: "MATERIAL_OUTGOING",
  record: "o-1",
  reference: "MIN-PRJ-0003-001",
  blocked: null,
  archived: false,
  fields: [
    {
      name: "reason",
      type: "textarea",
      required: false,
      max_length: null,
      value: "",
      display: "",
      options: null,
    },
    {
      name: "line_price:l-1",
      type: "decimal",
      required: false,
      max_length: null,
      value: "3.50",
      display: "3.50",
      options: null,
      places: 2,
      line: {
        id: "l-1",
        position: 1,
        material_name: "Diesel",
        material_specification: "",
        unit: "Liter",
        quantity: "200.000",
        issued_quantity: "180.000",
      },
    },
    {
      name: "line_price:l-2",
      type: "decimal",
      required: false,
      max_length: null,
      value: "",
      display: "",
      options: null,
      places: 2,
      line: {
        id: "l-2",
        position: 2,
        material_name: "钢筋",
        material_specification: "Y16",
        unit: "TONNE",
        quantity: "2.000",
        issued_quantity: null,
      },
    },
  ],
};

describe("the 改正 window's 单价 (第 2 点: 后台修改页面)", () => {
  const dialog = (only?: string[]) =>
    render(
      <RecordCorrectionDialog kind="MATERIAL_OUTGOING" recordId="o-1" only={only} onClose={() => {}} />,
      (client) => client.setQueryData(["record-correction-form", "MATERIAL_OUTGOING", "o-1"], PRICE_FORM),
    );
  const rc = zh.recordCorrection;

  it("names each line 「1. Diesel 单价（RM / Liter）」 with 数量 × 单价 = 金额 beside it", () => {
    const html = dialog();
    expect(html).toContain("1. Diesel 单价（RM / Liter）");
    expect(html).toContain("金额：180.000 Liter × RM 3.50 = RM 630.00");
    expect(html).toContain(`2. 钢筋 Y16 单价（RM / ${zh.receipts.unit.TONNE}）`);
    // A blank line: the amount follows once a price is typed.
    expect(html).toContain(rc.lineAmountEmpty);
    expect(html).toContain('step="0.01"');
    expect(html).toContain(rc.was.replace("{value}", "3.50"));
  });

  it("「填写单价」 opens it on that line alone", () => {
    const html = dialog(["line_price:l-2"]);
    expect(html).toContain("2. 钢筋 Y16");
    expect(html).not.toContain("1. Diesel");
    expect(html).not.toContain(rc.field.reason);
  });

  it("words the history row of a price as 「单价」 in every language", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.recordCorrection.field.unit_price).toBeTruthy();
      for (const key of ["linePrice", "lineAmount", "lineAmountEmpty", "lineAmountRequested", "tooManyPlaces", "priceNeedsPin"]) {
        expect((catalogue.recordCorrection as Record<string, unknown>)[key], key).toBeTruthy();
      }
    }
    expect(zh.recordCorrection.field.unit_price).toBe("单价");
  });
});

/* ------------------------------------------------------------------ */

function listRow(overrides: Partial<MaterialIssueListRow> = {}): MaterialIssueListRow {
  return {
    id: "l-1",
    record: "o-1",
    reference_no: "MIN-PRJ-0003-001",
    project: "p-1",
    project_name: "PUTRA_MAS",
    status: "COMPLETED",
    at: "2026-11-11T02:00:00Z",
    captured_at: "2026-11-11T01:00:00Z",
    processed_at: "2026-11-11T02:00:00Z",
    material_name: "Diesel",
    material_specification: "",
    quantity: "200.000",
    issued_quantity: "180.000",
    unit: "Liter",
    equipment_company: "HH Machinery Sdn. Bhd.",
    equipment_no: "EQ0007",
    recipient_name: "Ali",
    issuer_name: "Ah Seng",
    issuer_signature: "https://cdn.example/sign-a.png",
    recipient_signature: "https://cdn.example/sign-b.png",
    photo_count: 3,
    cover_photo_url: "https://cdn.example/photo.jpg",
    unit_price: "3.50",
    amount: "630.00",
    priced: true,
    handed_over: true,
    ...overrides,
  };
}

function totals(overrides: Partial<MaterialIssueTotals> = {}): MaterialIssueTotals {
  return {
    lines: 52,
    records: 50,
    counted_lines: 50,
    waiting_lines: 2,
    quantities: [
      { unit: "Liter", quantity: "9000.000" },
      { unit: "TONNE", quantity: "2.000" },
    ],
    amount_total: "31500.00",
    unpriced_lines: 1,
    ...overrides,
  };
}

const SELECTION = { company: "HH Machinery Sdn. Bhd." };

describe("the 材料领用 list (第 3 点)", () => {
  const list = (rows: MaterialIssueListRow[], sums: MaterialIssueTotals) =>
    render(<MaterialIssueList onOpen={() => {}} />, (client) => {
      client.setQueryData(["material-outgoing", "issues", { page: 1, page_size: 25, company: "HH Machinery Sdn. Bhd." }], {
        results: rows,
        count: rows.length,
      });
      client.setQueryData(["material-outgoing", "issue-options", ""], { materials: [], companies: [], equipment_nos: [], recipients: [] });
      client.setQueryData(["material-outgoing", "issue-totals", SELECTION], sums);
    });

  it("heads it exactly with the client's eleven words, in his order, then 查看", () => {
    const html = list([listRow()], totals());
    expect(headers(html)).toEqual([
      "日期", "领用编号", "材料名称", "规格", "所属公司", "设备编号", "领用人", "领用数量", "单位", "单价", "金额", "查看",
    ]);
  });

  it("shows one row per material with its 单价 and 金额, its status still on the row", () => {
    const html = list([listRow()], totals());
    expect(html).toContain("MIN-PRJ-0003-001");
    expect(html).toContain("MYR 3.50");
    expect(html).toContain("MYR 630.00");
    expect(html).toContain(words.status.COMPLETED);
    // 发料负责人, the signatures and the photographs are in the record, not the list.
    expect(html).not.toContain("sign-a.png");
    expect(html).not.toContain("photo.jpg");
  });

  it("says 「没有单价」 for a line with none", () => {
    const html = list([listRow({ unit_price: null, amount: null, priced: false })], totals());
    expect(html).toContain(words.unpriced);
  });

  it("sums every line the filters select, under the list", () => {
    const html = list([listRow()], totals());
    expect(html).toContain('data-testid="issue-totals"');
    expect(html).toContain(words.totalsTitle.replace("{count}", "50"));
    expect(html).toContain("9000.000 Liter");
    expect(html).toContain(`2.000 ${zh.receipts.unit.TONNE}`);
    expect(html).toContain("MYR 31,500.00");
    expect(html).toContain(words.totalsWaiting.replace("{count}", "2"));
    expect(html).toContain(words.totalsUnpriced.replace("{count}", "1"));
  });

  it("offers 「批量预览 / 打印」 above it to whoever sees money", () => {
    const html = list([listRow()], totals());
    expect(html.indexOf("data-issue-statement-open")).toBeGreaterThan(-1);
    expect(html.indexOf("data-issue-statement-open")).toBeLessThan(html.indexOf("<table"));
  });

  it("without 金额查看: dashes for 单价 and 金额, quantities only, and no 批量预览", () => {
    const html = list(
      [listRow({ unit_price: null, amount: null, priced: null })],
      totals({ amount_total: null }),
    );
    expect(html).not.toContain("MYR");
    expect(html).not.toContain(words.statementButton);
    expect(html).not.toContain(words.totalsAmount);
    expect(html).not.toContain(words.totalsUnpriced.replace("{count}", "1"));
    expect(html).toContain("9000.000 Liter");
  });

  it("makes the 汇总 and the 结账单 of the filters, not the page", () => {
    expect(issueSelection({ company: "HH", date_from: "2026-10-01", needs_action: "1" }, "")).toEqual({
      company: "HH",
      date_from: "2026-10-01",
    });
    expect(issueSelection({}, "Diesel")).toEqual({ search: "Diesel" });
  });
});

/* ------------------------------------------------------------------ */

const STATEMENT: MaterialIssueStatement = {
  company: {
    company_name: "测试建筑商 1",
    company_lines: ["No. 1, Jalan Putra, Kuala Lumpur"],
    company_logo_url: null,
    project_code: "PRJ-0003",
    project_name: "PUTRA_MAS",
  },
  project: null,
  filters: { company: "HH Machinery Sdn. Bhd.", date_from: "2026-10-01", date_to: "2026-10-31" },
  rows: [
    {
      id: "l-1",
      record: "o-1",
      reference_no: "MIN-PRJ-0003-002",
      at: "2026-10-31T02:00:00Z",
      material_name: "Diesel",
      material_specification: "",
      equipment_company: "HH Machinery Sdn. Bhd.",
      equipment_no: "EQ0007",
      recipient_name: "Ali",
      issuer_name: "Ah Seng",
      issued_quantity: "180.000",
      unit: "Liter",
      unit_price: "3.50",
      amount: "630.00",
      priced: true,
      issuer_signature: "https://cdn.example/sign-a.png",
      recipient_signature: "https://cdn.example/sign-b.png",
    },
    {
      id: "l-2",
      record: "o-2",
      reference_no: "MIN-PRJ-0003-001",
      at: "2026-10-01T02:00:00Z",
      material_name: "Diesel",
      material_specification: "",
      equipment_company: "HH Machinery Sdn. Bhd.",
      equipment_no: "EQ0007",
      recipient_name: "Ali",
      issuer_name: "Ah Seng",
      issued_quantity: "20.000",
      unit: "Liter",
      unit_price: null,
      amount: null,
      priced: false,
      issuer_signature: "https://cdn.example/sign-c.png",
      recipient_signature: null,
    },
  ],
  totals: {
    lines: 2,
    records: 2,
    quantities: [{ unit: "Liter", quantity: "200.000" }],
    amount_total: "630.00",
    unpriced_lines: 1,
  },
  limit: 500,
  generated_at: "2026-11-11T10:00:00Z",
};

describe("「批量预览 / 打印」 (第 4、5 点)", () => {
  it("does not press with nothing handed over, and says why beside it", () => {
    const html = render(<IssueStatementButton filters={SELECTION} totals={totals({ counted_lines: 0 })} />);
    expect(html).toMatch(new RegExp(`<p[^>]*role="status"[^>]*>${words.statementNone}</p>`));
    expect(buttonWith(html, words.statementButton)).toMatch(/\sdisabled=""/);

    const ready = render(<IssueStatementButton filters={SELECTION} totals={totals()} />);
    expect(ready).not.toContain(words.statementNone);
    expect(buttonWith(ready, words.statementButton)).not.toMatch(/\sdisabled=""/);
  });

  it("previews every line as it prints: letterhead, title, filters, both signatures, no photographs", () => {
    const html = render(<StatementSheet statement={STATEMENT} filters={SELECTION} />);
    expect(html).toContain("测试建筑商 1");
    expect(html).toContain("No. 1, Jalan Putra, Kuala Lumpur");
    expect(html).toContain("PRJ-0003 - PUTRA_MAS");
    expect(html).toContain("材料领用结账单 / Material Issue Statement");
    expect(html).toContain("HH Machinery Sdn. Bhd.");
    // The date range chosen, in the company's date format.
    expect(html).toContain("2026年10月1日 至 2026年10月31日");
    expect(headers(html)).toEqual([
      "日期", "领用编号", "材料名称", "规格", "所属公司", "设备编号", "领用人", "领用数量", "单位", "单价", "金额",
      "发料负责人签名", "领用人签名",
    ]);
    expect(html.match(/data-issue-statement-row/g)).toHaveLength(2);
    expect(html).toContain("sign-a.png");
    expect(html).toContain("sign-b.png");
    expect(html).toContain("sign-c.png");
    expect(html).not.toContain("photo");
    expect(html).toContain(words.unpriced);
  });

  it("ends with 总领用数量 per unit and 应收总金额（RM）, and the lines left out", () => {
    const html = render(<StatementSheet statement={STATEMENT} filters={SELECTION} />);
    const foot = html.slice(html.indexOf("data-issue-statement-totals"));
    expect(foot).toContain(words.statementTotalQuantity);
    expect(foot).toContain("200.000 Liter");
    expect(foot).toContain(words.statementTotalAmount);
    expect(foot).toContain("MYR 630.00");
    expect(foot).toContain(words.statementUnpriced.replace("{count}", "1"));
  });

  it("prints and exports the same one PDF from the preview", () => {
    const html = render(<IssueStatementDialog filters={SELECTION} onClose={() => {}} />, (client) =>
      client.setQueryData(["material-outgoing", "issue-statement", SELECTION], STATEMENT),
    );
    expect(buttonWith(html, words.statementPrint)).not.toMatch(/\sdisabled=""/);
    expect(buttonWith(html, words.statementExport)).not.toMatch(/\sdisabled=""/);
    const source = read("src/components/contractor-ops/issue-statement.tsx");
    // Both buttons run on `source`, whose file is the server's export.
    expect(source).toContain("load: () => exportMaterialIssueStatement(filters)");
    expect(source).toContain('files.run("print", source');
    expect(source).toContain('files.run("save", source');
  });

  it("says plainly when the selection is too long for one statement", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      const message = (catalogue.errors.api as Record<string, string>).issue_statement_too_long;
      expect(message).toContain("{count}");
      expect(message).toContain("{limit}");
    }
    expect(zh.errors.api.issue_statement_too_long).toBe("这次筛选出来有 {count} 项，一份最多 {limit} 项。请把日期范围缩小一点再试。");
  });
});

describe("the 汇总 on its own", () => {
  it("gives quantities only without money", () => {
    const html = render(<IssueTotalsPanel totals={totals({ amount_total: null })} seesMoney={false} />);
    expect(html).toContain("9000.000 Liter");
    expect(html).not.toContain("MYR");
  });

  it("is 0.00 with money when no counted line has a price, and says why", () => {
    const html = render(
      <IssueTotalsPanel totals={totals({ amount_total: null, unpriced_lines: 50 })} seesMoney />,
    );
    expect(html).toContain("MYR 0.00");
    expect(html).toContain(words.totalsUnpriced.replace("{count}", "50"));
  });
});

describe("every word in all four catalogues", () => {
  it("has the list's, the 汇总's and the 结账单's words", () => {
    const keys = [
      "colDate", "colAmount", "priceAuto", "priceManual", "fillPrice", "amountByRequested",
      "totalsTitle", "totalsAmount", "totalsWaiting", "totalsUnpriced", "totalsWhat",
      "statementButton", "statementNone", "statementLoading", "statementHelp", "statementTitle",
      "statementWhat", "statementProject", "statementAll", "statementRange", "statementFrom",
      "statementUntil", "statementCount", "statementTotalQuantity", "statementTotalAmount",
      "statementUnpriced", "statementPrint", "statementExport", "unsigned",
    ];
    for (const catalogue of [zh, zhTW, en, ms]) {
      const issueWords = catalogue.contractorOps.issue as Record<string, unknown>;
      for (const key of keys) expect(issueWords[key], key).toBeTruthy();
      for (const gone of ["stockTitle", "stockBalance", "colSignatures", "colPhotos"]) {
        expect(gone in issueWords, gone).toBe(false);
      }
      expect((catalogue.materialPrices.toast as Record<string, string>).filledWithIssues).toContain("{issues}");
    }
    expect(words.colDate).toBe("日期");
    expect(words.colAmount).toBe("金额");
    expect(words.statementTotalAmount).toBe("应收总金额（RM）");
  });
});
