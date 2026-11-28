/**
 * JB277 (客户 11-26 事项 18) and JB278 (事项 19): 核对与结算.
 *
 * - 凭证编号 is its own required box, the voucher upload is required too,
 *   and 【确认核对】 says what is missing until both are there;
 * - 材料领用 has 「待核对｜已核对｜已结算」 and 【核对与结算】 (核对 / 结算);
 * - the original record shows 核对状态, 核对编号, 核对人及日期, 结算状态,
 *   结算编号 under 「已归档」, each number opening its window;
 * - a check shows its 凭证编号 (or says an old one keeps it in the remark)
 *   and its 结算; a settlement lists its checks;
 * - every word in the four catalogues, every server refusal worded.
 *
 * Rendered to static markup (no DOM); the page's wiring read from its source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/material-outgoing",
  useSearchParams: () => new URLSearchParams(),
}));
const reader = vi.hoisted(() => ({ phone: false }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Site Office", email: "office@x.test", is_field_staff: reader.phone },
    can: () => true,
  }),
}));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({
    active: false,
    projectId: "",
    projects: [],
    canChooseAll: true,
    loading: false,
    setProjectId: () => undefined,
  }),
}));

const {
  IssueRowsTable,
  ReconcileSettleButton,
  ReconciliationPanel,
  ReturnCheckButton,
  ReturnCheckForm,
  ReturnCheckTabs,
  ReturnCheckWindow,
  SettleButton,
  officeMay,
  returnTabOf,
} = await import("@/components/contractor-ops/return-checks");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["material-units", "all"], []);
  seed?.(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const ISSUE = {
  id: "i-1",
  reference_no: "MIN-PRJ-0003-007",
  project: "p-1",
  project_name: "PUTRA MAS",
  at: "2026-11-25T02:56:00Z",
  equipment_company: "best concrete supply",
  equipment_no: "EQ0001",
  recipient_name: "Asa",
  issuer_name: "mike",
  materials: [{ material: "Disel", quantity: "220", unit: "Liter" }],
  amount: "1496.00",
  status: "COMPLETED",
};

describe("JB277: 凭证编号 and 上传凭证 are required (事项 18)", () => {
  const source = read("src/components/contractor-ops/return-checks.tsx");

  it("has its own 凭证编号 box and a required voucher upload, separate from 备注", () => {
    const voucher = source.slice(source.indexOf("function VoucherFields("), source.indexOf("function TickHead("));
    expect(voucher).toMatch(/label=\{tj\("voucherNo"\)\} required/);
    expect(voucher).toMatch(/label=\{tj\("vouchersRequired"\)\}\s+required/);
    expect(voucher).toMatch(/accept: ATTACHMENT_ACCEPT/);
    expect(zh.jb278.voucherNoPlaceholder).toContain("CN No. 1232");
    expect(zh.jb278.voucherNoHint).toContain("不要写在备注里");
    expect(zh.jb278.vouchersRequired).toContain("照片或 PDF");
  });

  it("locks 【确认核对】 until both are there, and sends the number on its own", () => {
    const confirm = source.slice(source.indexOf("function CheckConfirmForm("), source.indexOf("function VoucherFields("));
    expect(confirm).toMatch(/requires=\{\[\s+\.\.\.\(extraRequires \? extraRequires\(picked\) : \[\]\),\s+\[voucherNo\.trim\(\), tj\("voucherNo"\)\],\s+\[files\.length > 0, tj\("vouchersRequired"\)\],/);
    expect(confirm).toMatch(/createReturnCheck\(\{\s+kind,\s+supplier: party\.id,\s+returns: picked,\s+voucherNo,\s+note,\s+files,/);
    const service = read("src/services/return-check.service.ts");
    expect(service).toMatch(/body\.append\("voucher_no", payload\.voucherNo\.trim\(\)\)/);
  });

  it("shows the form's 凭证编号 and the rule that nothing changes afterwards once a row is ticked", () => {
    // Nothing ticked: only the hint.
    const html = render(
      <ReturnCheckForm supplier={{ id: "s-1", name: "AAA" }} rows={[]} truncated={null} onSaved={() => undefined} />,
    );
    expect(text(html)).toContain("先勾选要核对的退货");
    expect(zh.jb278.voucherFixed).toContain("不能修改或删除");
    expect(zh.jb278.voucherFixed).toContain("操作人、日期及时间");
  });

  it("a check shows its 凭证编号 on its own line; an old one says the number is in the remark", () => {
    const check = (voucher: string) => ({
      id: "c-1",
      kind: "RETURN",
      check_no: "MO-RN006",
      supplier: "s-1",
      supplier_name: "AAA Supplier",
      return_count: 1,
      checked_at: "2026-11-26T02:27:00Z",
      checked_by_name: "mike",
      voucher_no: voucher,
      note: "CN No: 7127 26/11/2026",
      returns: [],
      hidden_count: 0,
      project: null,
      settlement: null,
    });
    const now = text(
      render(<ReturnCheckWindow id="c-1" onClose={() => undefined} />, (qc) =>
        qc.setQueryData(["return-checks", "detail", "RETURN", "c-1"], check("CN No. 1232")),
      ),
    );
    expect(now).toContain("凭证编号 CN No. 1232");
    expect(now).toContain("未结算");
    const old = text(
      render(<ReturnCheckWindow id="c-1" onClose={() => undefined} />, (qc) =>
        qc.setQueryData(["return-checks", "detail", "RETURN", "c-1"], check("")),
      ),
    );
    expect(old).toContain("旧的核对记录");
    expect(old).toContain("CN No: 7127 26/11/2026");
  });
});

describe("JB278: 材料领用 核对与结算 (事项 19)", () => {
  const page = read("src/components/contractor-ops/office-module-lists.tsx");
  const office = page.slice(page.indexOf("export function MaterialOutgoingOffice()"), page.indexOf("export function SiteEquipmentOffice()"));

  it("第 1 点: 【核对与结算】 on the 材料领用 page, the same check as the returns'", () => {
    const issue = office.slice(office.indexOf('if (view === "ISSUE")'), office.indexOf('if (tab === "settled")'));
    expect(issue).toMatch(/<ReconcileSettleButton\s+kind="ISSUE"/);
    expect(issue).toMatch(/permission="material_outgoing\.approve"/);
    expect(zh.jb278.issueButton).toBe("核对与结算");
    const source = read("src/components/contractor-ops/return-checks.tsx");
    // One confirmation for every kind: returns and issues share it.
    expect(source).toMatch(/kind="ISSUE"\s+party=\{company\}/);
    expect(source).toMatch(/kind="RETURN"\s+party=\{supplier\}/);
  });

  it("第 2 点: 待核对｜已核对｜已结算, the pending list without the checked issues", () => {
    const html = render(<ReturnCheckTabs value="settled" onChange={() => undefined} />);
    const tabs = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => text(m[2]));
    expect(tabs).toEqual(["待核对", "已核对", "已结算"]);
    expect(returnTabOf("settled")).toBe("settled");
    const issue = office.slice(office.indexOf('if (view === "ISSUE")'), office.indexOf('if (tab === "settled")'));
    expect(issue).toMatch(/<MaterialIssueList onOpen=\{\(id\) => setViewing\(id\)\} unchecked \/>/);
    expect(issue).toMatch(/<ReturnChecksList kind="ISSUE"/);
    expect(issue).toMatch(/<SettlementsList kind="ISSUE"/);
    const list = read("src/components/contractor-ops/material-issue.tsx");
    expect(list).toMatch(/const pending = unchecked \? \{ unchecked: "1" \} : \{\};/);
    expect(list).toMatch(/const selection = \{ \.\.\.issueSelection\(list\.filters, list\.search\), \.\.\.pending \};/);
  });

  it("第 3、4 点: under 「已归档」, the record's 核对 and 结算, each number opening its window", () => {
    const pending = text(render(<ReconciliationPanel links={null} />));
    for (const words of ["核对与结算", "核对状态", "待核对", "核对编号", "核对人及日期", "结算状态", "未结算", "结算编号"]) {
      expect(pending).toContain(words);
    }
    const settled = render(
      <ReconciliationPanel
        links={{
          state: "SETTLED",
          kind: "ISSUE",
          check_id: "c-1",
          check_no: "MO-IS001",
          checked_by_name: "mike",
          checked_at: "2026-11-26T02:27:00Z",
          settlement_id: "s-1",
          settlement_no: "MO-IS-ST001",
          settled_by_name: "mike",
          settled_at: "2026-11-26T03:00:00Z",
        }}
      />,
    );
    expect(settled).toContain('data-slot="reconciliation-check-link"');
    expect(settled).toContain('data-slot="reconciliation-settlement-link"');
    expect(text(settled)).toContain("MO-IS001");
    expect(text(settled)).toContain("MO-IS-ST001");
    expect(text(settled)).toContain("已结算");
    const detail = read("src/components/contractor-ops/operations-workspaces.tsx");
    // QA1 #23: the panel also says when a 领用 has no 所属公司.
    expect(detail).toMatch(/row\.status === "COMPLETED" \? \(\s*<ReconciliationPanel\s+links=\{row\.reconciliation\}/);
  });

  it("第 4 点: a check lists its issues, each opening the original record", () => {
    const html = render(<IssueRowsTable rows={[ISSUE]} />);
    expect(html).toContain('data-slot="issue-check-row"');
    for (const words of ["MIN-PRJ-0003-007", "best concrete supply", "EQ0001", "Disel 220 Liter", "1496.00"]) {
      expect(text(html)).toContain(words);
    }
    const source = read("src/components/contractor-ops/return-checks.tsx");
    expect(source).toMatch(/\{opened \? <OutgoingDecision id=\{opened\} onClose=\{\(\) => setOpened\(null\)\} \/> : null\}/);
  });

  it("第 5 点: 退场 and 领用 checks are their own kinds and titles", () => {
    expect(zh.jb278.issueWindowTitle).toBe("领用核对 {number}");
    expect(zh.returnChecks.windowTitle).toBe("退货核对 {number}");
    expect(read("src/services/return-check.service.ts")).toMatch(/body\.append\("kind", "ISSUE"\)/);
  });

  it("第 6 点: the server's refusals are worded for the reader", () => {
    expect(zh.errors.api.recon_already_checked).toContain("不能重复核对");
    expect(zh.errors.api.settlement_already_settled).toContain("不能重复结算");
    expect(zh.recordCorrection.blocked.record_settled).toContain("已经结算");
  });

  it("第 7 点 and 事项 21: only the result is recorded", () => {
    expect(zh.jb278.resultOnly).toBe("这里只记录核对及结算结果，不涉及实际付款及财务操作。");
    expect(zh.jb278.panelUnchanged).toContain("原始记录不会因此改变");
  });
});

describe("核对 / 结算 are office steps: the phone is never offered them (Lucas 11-26 「手机不应该出现审批才对」)", () => {
  const noop = () => undefined;
  const buttons = () => [
    render(<ReturnCheckButton onSaved={noop} />),
    render(<ReconcileSettleButton kind="ISSUE" step="check" permission="material_outgoing.approve" onChecked={noop} onSettled={noop} />),
    render(<ReconcileSettleButton kind="RENTAL" step="settle" permission="equipment.manage" onChecked={noop} onSettled={noop} />),
    render(<SettleButton kind="RETURN" permission="material_outgoing.approve" onSaved={noop} />),
  ];

  it("the office sees 【退货核对】, 【核对与结算】 and 【结算】", () => {
    reader.phone = false;
    expect(buttons().every((html) => html.length > 0)).toBe(true);
  });

  it("a phone account sees none of them, whatever its permissions", () => {
    reader.phone = true;
    try {
      expect(buttons()).toEqual(["", "", "", ""]);
      expect(officeMay({ is_field_staff: true }, () => true, "material_outgoing.approve")).toBe(false);
      // The status stays readable on the phone.
      expect(text(render(<ReconciliationPanel links={null} />))).toContain("待核对");
    } finally {
      reader.phone = false;
    }
  });

  it("the supplier-returns window the phone opens (「有退货资料」) offers no 【退货核对】 there", () => {
    const badge = read("src/components/suppliers/supplier-return-badge.tsx");
    expect(badge).toMatch(/\{officeMay\(user, can, "material_outgoing\.approve"\) \?/);
    const statements = read("src/components/equipment-hours/rental-statements.tsx");
    expect(statements).toMatch(/if \(!officeMay\(user, can, RENTAL_PERMISSION\)\) return null;/);
    expect(statements).toMatch(/data\.state === "PENDING" && officeMay\(user, can, RENTAL_PERMISSION\)/);
  });
});

describe("words", () => {
  const catalogues = { zh, "zh-TW": zhTW, en, ms } as const;

  it("every new key is in all four catalogues", () => {
    const keys = (node: unknown, prefix = ""): string[] =>
      node && typeof node === "object"
        ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => keys(value, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    for (const group of ["jb278", "jb280"] as const) {
      const expected = keys(zh[group]).sort();
      for (const [name, messages] of Object.entries(catalogues)) {
        expect(keys(messages[group]).sort(), `${name} ${group}`).toEqual(expected);
      }
    }
  });

  it("every new server code, PIN action and log operation has its words", () => {
    const codes = [
      "recon_voucher_no_required", "recon_voucher_file_required", "recon_none_chosen", "recon_record_not_found",
      "recon_already_checked", "issue_check_company_required", "issue_check_no_company", "issue_check_other_company",
      "issue_check_not_issued", "settlement_none_chosen", "settlement_check_not_found", "settlement_already_settled",
      "settlement_other_party", "rental_statement_filters", "rental_statement_empty", "rental_statement_not_confirmed",
      "rental_statement_no_terms", "rental_statement_overlap", "rental_statement_locked",
      "rental_check_supplier_required", "rental_check_other_supplier",
    ];
    for (const messages of Object.values(catalogues)) {
      for (const code of codes) expect((messages.errors.api as Record<string, string>)[code], code).toBeTruthy();
      for (const action of [
        "material_issue_check", "material_settlement_settle", "equipment_rental_statement",
        "equipment_rental_check", "equipment_rental_settle",
      ]) {
        expect((messages.signOff.action as Record<string, string>)[action], action).toBeTruthy();
      }
      expect((messages.recordCorrection.blocked as Record<string, string>).record_settled).toBeTruthy();
    }
    expect(zh.signOff.action.material_settlement_settle).toBe("结算核对记录");
  });
});
