/**
 * JB188 (客户 11-13 下午) - 材料管理 › 材料出场: 退货核对.
 *
 * > 1. 退货核对：在现有材料出场页面设置「待核对／已核对」两个页签。点击「退货核对」，
 * >    可以勾选同一家供应商的一笔或多笔退货资料。
 * > 2. 核对确认：勾选完成后：自动显示核对人姓名、日期及时间。支持上传文件、照片或
 * >    PDF。备注选填。输入六位数签核密码确认。无需重新填写原有退货资料，也不涉及
 * >    价格或财务结算。
 * > 3. 已核对记录：确认后，勾选的资料自动显示在「已核对」页面，并生成 MO-RN001、
 * >    MO-RN002……编号。列表显示：核对编号｜供应商｜笔数｜日期｜核对人｜查看。……
 * > 4. ……已核对的退货不再显示黄色待核对提醒；新退货仍正常提醒。
 *
 * Rendered to static markup like the other screen tests (the runner has no
 * DOM); the page's wiring is checked in its source.
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

const reader = vi.hoisted(() => ({ approves: true }));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/material-outgoing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Site Office", email: "office@x.test" },
    can: (code: string) => code !== "material_outgoing.approve" || reader.approves,
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
  ReturnCheckButton,
  ReturnCheckForm,
  ReturnCheckTabs,
  ReturnCheckWindow,
  ReturnChecksList,
  returnTabOf,
} = await import("@/components/contractor-ops/return-checks");
const { SupplierReturnsTable, SupplierReturnBadge } = await import("@/components/suppliers/supplier-return-badge");
const { logRowTarget, WINDOW_OPENERS } = await import("@/lib/log-record-open");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function render(node: React.ReactNode, seed?: (qc: QueryClient) => void, messages: typeof zh = zh) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["material-units", "all"], []);
  seed?.(qc);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function aReturn(id: string, reference: string) {
  return {
    id,
    reference_no: reference,
    kind: "RETURN",
    status: "COMPLETED",
    material_name: "钢筋",
    category_name: "钢筋",
    quantity: "2.000",
    returned_quantity: "2.000",
    unit: "TONNE",
    vehicle_plate: "WXY 9999",
    reason: "Surplus",
    return_note_no: `RN-${reference}`,
    photos: [],
    photo_count: 0,
    captured_at: "2026-11-11T02:00:00Z",
    completed_at: "2026-11-11T03:00:00Z",
    processed_at: "2026-11-11T03:00:00Z",
    approved_by_name: "mike",
    approved_at: "2026-11-11T01:00:00Z",
  } as never;
}

const RETURNS = [aReturn("r-1", "MO-PRJ-0003-005"), aReturn("r-2", "MO-PRJ-0003-004")];

describe("「待核对｜已核对」 (JB188-1)", () => {
  it("has the two tabs in the client's words, the chosen one marked", () => {
    const html = render(<ReturnCheckTabs value="pending" onChange={() => undefined} />);
    const tabs = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
      text: text(m[2]),
      selected: m[1].includes('aria-selected="true"'),
    }));
    expect(tabs).toEqual([
      { text: "待核对", selected: true },
      { text: "已核对", selected: false },
    ]);
  });

  it("is kept in the address: ?tab=checked, anything else is 待核对", () => {
    expect(returnTabOf("checked")).toBe("checked");
    expect(returnTabOf(null)).toBe("pending");
    expect(returnTabOf("ISSUE")).toBe("pending");
  });

  it("sits on the returns' side only, and 待核对 asks for the unchecked ones (JB188-2)", () => {
    const page = read("src/components/contractor-ops/office-module-lists.tsx");
    const office = page.slice(page.indexOf("export function MaterialOutgoingOffice()"), page.indexOf("export function SiteEquipmentOffice()"));
    // 材料领用's view returns before the tabs are drawn.
    const issue = office.slice(office.indexOf('if (view === "ISSUE")'), office.indexOf('if (tab === "checked")'));
    expect(issue).not.toContain("ReturnCheckTabs");
    expect(office).toMatch(/const returnsQuery = \{ \.\.\.list\.query, kind: "RETURN", unchecked: "1" \};/);
    expect(office).toMatch(/enabled: view === "RETURN" && tab === "pending"/);
    // The export is the same query: the checked ones are left out of it too.
    expect(office).toMatch(/exportMaterialOutgoing\(\{[\s\S]{0,200}query: returnsQuery/);
    expect(office).toMatch(/if \(next === "checked"\) params\.set\("tab", "checked"\)/);
    expect(office).toMatch(/headerAction=\{<ReturnCheckButton onSaved=\{\(\) => switchTab\("checked"\)\} \/>\}/);
    // The check window is opened and closed by state, never by an effect (JB187).
    expect(office).toMatch(/const \[checkOpen, setCheckOpen\] = useState<string \| null>\(null\)/);
    expect(office).toMatch(/<ReturnCheckWindow id=\{checkOpen\} onClose=\{\(\) => setCheckOpen\(null\)\} \/>/);
  });
});

describe("【退货核对】 (JB188-3, -4)", () => {
  it("is offered only to whoever may approve 材料出场", () => {
    reader.approves = false;
    expect(render(<ReturnCheckButton onSaved={() => undefined} />)).toBe("");
    reader.approves = true;
    const html = render(<ReturnCheckButton onSaved={() => undefined} />);
    expect(text(html)).toBe("退货核对");
    expect(html).toContain('data-slot="return-check-button"');
  });

  it("picks from the badge's own table with a tick on each row and 全选", () => {
    const html = render(
      <SupplierReturnsTable
        rows={RETURNS}
        selection={{ chosen: new Set(["r-2"]), onToggle: () => undefined, onToggleAll: () => undefined }}
      />,
    );
    expect(html.match(/data-slot="return-select-row"/g)).toHaveLength(2);
    expect(html).toContain('data-slot="return-select-all"');
    expect(html).toContain("全选");
    expect(html).toContain('aria-label="勾选 MO-PRJ-0003-004"');
    // 图 2's columns stay as they were.
    for (const column of ["日期", "材料", "数量", "车牌", "退回原因", "Return Note", "照片", "双方签名", "批准资料"]) {
      expect(text(html)).toContain(column);
    }
  });

  it("draws no ticks where nothing is being checked (图 2 as before)", () => {
    const html = render(<SupplierReturnsTable rows={RETURNS} />);
    expect(html).not.toContain("return-select-row");
    expect(html).not.toContain("全选");
  });

  it("asks for a tick first; the confirmation comes once one is ticked", () => {
    const html = render(
      <ReturnCheckForm supplier={{ id: "s-1", name: "AAA Supplier" }} rows={RETURNS} truncated={null} onSaved={() => undefined} />,
    );
    expect(text(html)).toContain("先勾选要核对的退货，下面才会出现核对确认。");
    expect(html).not.toContain('data-slot="return-check-confirm"');
  });

  it("confirms with 核对人 and the time shown, files and a remark optional, then the PIN", () => {
    const form = read("src/components/contractor-ops/return-checks.tsx");
    const confirm = form.slice(form.indexOf('data-slot="return-check-confirm"'), form.indexOf("export function ReturnChecksList"));
    expect(confirm).toMatch(/\{user\?\.full_name \|\| user\?\.email \|\| "—"\}/);
    expect(confirm).toMatch(/\{df\.dateTime\(now\)\}/);
    expect(confirm).toMatch(/label=\{t\("files"\)\}\s+optional=\{common\("optional"\)\}/);
    expect(confirm).toMatch(/<AttachmentPicker[\s\S]{0,300}accept: ATTACHMENT_ACCEPT/);
    expect(confirm).toMatch(/label=\{t\("note"\)\} optional=\{common\("optional"\)\}/);
    expect(confirm).not.toMatch(/unit_price|amount|单价|金额|RM/);
    // One request, signed by the server's PIN answer (the API client's dialog).
    expect(form).toMatch(/createReturnCheck\(\{ supplier: supplier\.id, returns: picked, note, files \}\)/);
    expect(zh.returnChecks.confirmPin).toContain("六位数签核密码");
    expect(zh.signOff.action.material_return_check).toBe("退货核对");
  });

  it("can start from the yellow badge's window (图 2), for an approver only", () => {
    const badge = read("src/components/suppliers/supplier-return-badge.tsx");
    expect(badge).toMatch(/\{can\("material_outgoing\.approve"\) \?/);
    expect(badge).toMatch(/<ReturnCheckForm\s+supplier=\{supplier\}\s+rows=\{rows\}/);
    // Saved: the window closes and 「已核对」 shows the new check on top.
    expect(badge).toMatch(/onClose\(\);\s+router\.push\("\/material-outgoing\?tab=checked"\);/);
    // The window lists only what is not checked, and its export too.
    expect(badge).toMatch(/query: \{ supplier: supplier\.id, status: "COMPLETED", unchecked: "1", \.\.\.narrow \}/);
    expect(zh.supplierReturns.help).toContain("已经核对的在「材料出场 › 已核对」");
  });
});

describe("「已核对」 (JB188-5, -6)", () => {
  const LIST = {
    count: 2,
    next: null,
    previous: null,
    results: [
      { id: "c-2", check_no: "MO-RN002", supplier: "s-1", supplier_name: "AAA Supplier", return_count: 1, checked_at: "2026-11-13T07:00:00Z", checked_by_name: "mike" },
      { id: "c-1", check_no: "MO-RN001", supplier: "s-1", supplier_name: "AAA Supplier", return_count: 2, checked_at: "2026-11-13T06:00:00Z", checked_by_name: "mike" },
    ],
  };

  it("lists 核对编号｜供应商｜笔数｜日期｜核对人｜查看, as the server orders them (newest first)", () => {
    const html = render(<ReturnChecksList title="材料出场" onOpen={() => undefined} />, (qc) =>
      qc.setQueryData(["return-checks", "list", { page: 1, page_size: 25 }], LIST),
    );
    const flat = text(html);
    for (const column of ["核对编号", "供应商", "笔数", "日期", "核对人", "查看"]) expect(flat).toContain(column);
    expect(flat.indexOf("MO-RN002")).toBeLessThan(flat.indexOf("MO-RN001"));
    expect(flat).toContain("2 笔");
    expect(flat).toContain("2 次核对");
    expect(html.match(/data-slot="return-check-view"/g)).toHaveLength(2);
  });
});

describe("查看 one check (JB188-7, -8, -9)", () => {
  const CHECK = {
    id: "c-1",
    check_no: "MO-RN001",
    supplier: "s-1",
    supplier_name: "AAA Supplier",
    return_count: 3,
    checked_at: "2026-11-13T06:00:00Z",
    checked_by_name: "mike",
    note: "两车都对过了",
    returns: RETURNS,
    hidden_count: 1,
    project: null,
  };

  function window(messages: typeof zh = zh) {
    return render(
      <ReturnCheckWindow id="c-1" onClose={() => undefined} />,
      (qc) => qc.setQueryData(["return-checks", "detail", "c-1"], CHECK),
      messages,
    );
  }

  it("shows the returns on top, the shared details below, and how many more elsewhere", () => {
    const html = window();
    const flat = text(html);
    expect(flat).toContain("退货核对 MO-RN001");
    expect(flat).toContain("这次勾选的退货（3 笔）");
    expect(flat).toContain("MO-PRJ-0003-005");
    expect(flat).toContain("MO-PRJ-0003-004");
    expect(flat).toContain("另有 1 笔在别的项目。");
    expect(flat.indexOf("MO-PRJ-0003-005")).toBeLessThan(flat.indexOf("核对资料"));
    for (const words of ["核对人", "mike", "日期及时间", "备注", "两车都对过了", "上传凭证"]) expect(flat).toContain(words);
    // Each return opens its own record over this one (the badge's table).
    expect(html.match(/data-slot="supplier-return-row"/g)).toHaveLength(2);
  });

  it("has the four file buttons on 退货核对单, and nothing to change or delete", () => {
    const html = window();
    for (const action of ["preview", "print", "save", "share"]) expect(html).toContain(`data-slot="file-action-${action}"`);
    expect(text(html)).toContain("退货核对单 PDF");
    const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]));
    expect(buttons.filter((label) => /删除|修改|取消|编辑/.test(label))).toEqual([]);
    expect(text(html)).toContain("核对记录不能修改或删除");
    const source = read("src/components/contractor-ops/return-checks.tsx");
    expect(source).toMatch(/exportedOnServer: true,\s+recordKind: "MATERIAL_RETURN_CHECK",\s+recordId: data\.id/);
    expect(source).toMatch(/<RecordAttachmentsPanel\s+kind="MATERIAL_RETURN_CHECK"\s+recordId=\{data\.id\}\s+readOnly/);
  });

  it("reads in all four languages", () => {
    expect(text(window(en))).toContain("Return check MO-RN001");
    expect(text(window(ms))).toContain("Semakan pemulangan MO-RN001");
    expect(text(window(zhTW))).toContain("退貨核對 MO-RN001");
  });

  it("opens from an 操作记录 row's 「打开记录」 (JB188-8)", () => {
    expect(WINDOW_OPENERS.MATERIAL_RETURN_CHECK).toEqual({ opener: "returnCheck" });
    expect(logRowTarget({ record_kind: "MATERIAL_RETURN_CHECK", record_id: "c-1" })).toEqual({
      window: "returnCheck",
      kind: "MATERIAL_RETURN_CHECK",
      id: "c-1",
    });
    expect(read("src/components/contractor-ops/log-record-window.tsx")).toMatch(
      /case "returnCheck":\s+return <ReturnCheckWindow id=\{id\} onClose=\{onClose\} \/>;/,
    );
  });
});

describe("the yellow 「有退货资料」 (JB188-10)", () => {
  it("says it counts the returns not checked yet", () => {
    const html = render(<SupplierReturnBadge supplier={{ id: "s-1", name: "AAA", completed_return_count: 2 }} />);
    expect(html).toContain("这家供应商有 2 笔还没核对的退货，点开查看");
    expect(render(<SupplierReturnBadge supplier={{ id: "s-1", name: "AAA", completed_return_count: 0 }} />)).toBe("");
  });

  it("marks a 按供应商看总数 line by its unchecked returns, not by every return", () => {
    const tabs = read("src/components/receipts/material-tabs.tsx");
    expect(tabs).toMatch(/\(row\.unchecked_return_count \?\? 0\) > 0 \? \(\s+<button[\s\S]{0,80}data-slot="net-return-tag"/);
    expect(zh.receipts.net.returnTagHint).toBe("这一行有 {count} 笔还没核对的退货，点开查看");
  });

  it("has every refusal in the reader's words (JB188-11)", () => {
    const codes = [
      "return_check_supplier_required",
      "return_check_none_chosen",
      "return_check_return_not_found",
      "return_check_no_supplier",
      "return_check_other_supplier",
      "return_check_not_completed",
      "return_check_already_checked",
      "return_check_final",
    ] as const;
    for (const messages of [zh, zhTW, en, ms]) {
      for (const code of codes) expect(messages.errors.api[code], code).toBeTruthy();
    }
    expect(zh.errors.api.return_check_other_supplier).toContain("一次只能核对同一家供应商的退货");
    expect(zh.errors.api.return_check_already_checked).toContain("{check_no}");
  });
});
