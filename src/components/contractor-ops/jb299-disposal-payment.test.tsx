/**
 * JB299 + JB301 (客户 11-28d 事项 2, 4, 5): 垃圾清运 - 清运费用 per 项目＋供应商,
 * the 付款凭证 + 付款编号 before 确认结算完毕, the 结算单 with its vouchers as one
 * file sent to the supplier, and only settled money in 项目现场费用总览.
 *
 * > 事项 2: 2. 财务付款后，上传付款凭证及填写付款编号。3. 确认结算完毕，系统自动
 * > 记录确认人及时间，并锁定归档。4. 结算单与付款凭证必须支持一起预览、打印、导出
 * > 及通过 WhatsApp 或 Email 发送给供应商。5. 保留现有结算单的签名栏……6. 未上传
 * > 付款凭证，不允许确认结算完毕。
 * > 事项 5: 3. 清运费用必须按照「项目＋供应商」分别设定。2. 未核对的清运费用只能
 * > 作为参考金额，正式确认结算后才能计入项目现场费用总览。
 *
 * Rendered to static markup (no DOM); the wiring read from the source.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/waste-clearance",
  useSearchParams: () => new URLSearchParams("kind=settlement"),
}));
const reader = vi.hoisted(() => ({ phone: false, perms: new Set<string>(["disposal.view", "disposal.manage"]) }));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Site Office", email: "office@x.test", is_field_staff: reader.phone },
    can: (code: string) => reader.perms.has(code),
  }),
}));
const top = vi.hoisted(() => ({ projectId: "p-3" }));
vi.mock("@/components/providers/current-project-provider", () => ({
  useCurrentProject: () => ({
    active: true,
    projectId: top.projectId,
    projects: [
      { id: "p-3", name: "PUTRA_MAS" },
      { id: "p-1", name: "project 1A" },
    ],
    canChooseAll: true,
    loading: false,
    setProjectId: () => undefined,
  }),
}));
type Call = (...args: unknown[]) => Promise<unknown>;
const api = vi.hoisted(() => ({
  get: vi.fn<Call>(async () => ({})),
  post: vi.fn<Call>(async () => ({ number: "CS-PRJ-0003-001" })),
  fetchAsFile: vi.fn<Call>(async () => new File([""], "x.pdf")),
  fetchObjectUrl: vi.fn<Call>(async () => "blob:x"),
  toastSuccess: vi.fn(),
}));
vi.mock("@/services/api-client", async (original) => ({
  ...(await original<typeof import("@/services/api-client")>()),
  api: { get: api.get, post: api.post, list: api.get },
  fetchAsFile: api.fetchAsFile,
  fetchObjectUrl: api.fetchObjectUrl,
  toastSuccess: api.toastSuccess,
}));

const lib = await import("@/lib/disposal-payment");
const service = await import("@/services/disposal-settlement.service");
const { FeeProjectLine } = await import("@/components/contractor-ops/disposal-fees");
const { PaymentCell, PaymentDialog, PaymentFacts, PaymentMissingDialog, PaymentButton } = await import(
  "@/components/contractor-ops/disposal-payment"
);
const { SettlementRowsTable, SettleDialog } = await import("@/components/contractor-ops/disposal-settlements");
const { DisposalFeePanel, DisposalFeeTotal } = await import("@/components/contractor-ops/disposal-fee-panel");
const { SendRecipientDialog, suggestedContact } = await import("@/components/shared/send-recipient");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), template);

function render(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reader.phone = false;
  reader.perms = new Set(["disposal.view", "disposal.manage"]);
  top.projectId = "p-3";
  api.get.mockClear();
  api.post.mockClear();
});

const READY = {
  id: "st-1",
  number: "CS-PRJ-0003-002",
  project: { id: "p-3", name: "PUTRA_MAS" },
  supplier: { id: "s-1", name: "AAA Supplier" },
  date_from: "2026-11-08",
  date_to: "2026-11-27",
  trip_total: 2,
  amount_total: "700.00",
  line_count: 1,
  status: "READY" as const,
  checked_by_name: "mike",
  checked_at: "2026-11-28T02:00:00Z",
  settled_by_name: null,
  settled_at: null,
  payment_no: "",
  payment_recorded_by_name: "",
  payment_recorded_at: null,
  voucher_count: 0,
  has_payment: false,
  old_without_voucher: false,
  supplier_contact: { person: "Ah Kow", phone: "+60 12-345 6789", email: "billing@aaa.test" },
};
const PAID = { ...READY, payment_no: "PV-77", voucher_count: 2, has_payment: true, payment_recorded_by_name: "mike", payment_recorded_at: "2026-11-28T03:00:00Z" };
const OLD = {
  ...READY,
  id: "st-0",
  number: "CS-PRJ-0003-001",
  status: "SETTLED" as const,
  settled_by_name: "mike",
  settled_at: "2026-11-28T02:25:00Z",
  old_without_voucher: true,
};

describe("the plain checks before anything is sent (lib/disposal-payment)", () => {
  it("takes photos and PDFs only, 10 at most, 50 MB each", () => {
    expect(lib.voucherProblem([{ name: "slip.PDF", size: 10 }, { name: "photo.jpg", size: 10 }])).toBeNull();
    expect(lib.voucherProblem([{ name: "receipt.docx", size: 10 }])).toEqual({ key: "wrongType", name: "receipt.docx" });
    expect(lib.voucherProblem([{ name: "big.jpg", size: 51 * 1024 * 1024 }])).toEqual({ key: "tooLarge", name: "big.jpg" });
    expect(lib.voucherProblem(Array.from({ length: 11 }, (_, n) => ({ name: `${n}.png`, size: 1 })))).toEqual({
      key: "tooMany",
      limit: 10,
    });
    // A big phone photo under the ceiling is fine.
    expect(lib.voucherProblem([{ name: "IMG_2041.HEIC", size: 18 * 1024 * 1024 }])).toBeNull();
  });

  it("needs a 付款编号 and a file (unless the settlement already has one)", () => {
    expect(lib.paymentReady("", [{ name: "a.png", size: 1 }], false)).toBe(false);
    expect(lib.paymentReady("PV-1", [], false)).toBe(false);
    expect(lib.paymentReady("PV-1", [], true)).toBe(true);
    expect(lib.paymentReady("PV-1", [{ name: "a.png", size: 1 }], false)).toBe(true);
    expect(lib.paymentReady("PV-1", [{ name: "a.xlsx", size: 1 }], false)).toBe(false);
    expect(lib.hasPayment(READY)).toBe(false);
    expect(lib.hasPayment(PAID)).toBe(true);
    expect(lib.fileSizeText(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("sends to the supplier: its own phone / email, its name when no contact person", () => {
    expect(lib.supplierRecipient(READY)).toEqual({
      name: "Ah Kow",
      company: "AAA Supplier",
      phone: "+60 12-345 6789",
      email: "billing@aaa.test",
    });
    expect(lib.supplierRecipient({ supplier: { name: "Bare Lorry" } })).toEqual({
      name: "Bare Lorry",
      company: "Bare Lorry",
      phone: "",
      email: "",
    });
    const suggested = lib.supplierRecipient(READY);
    expect(suggestedContact(suggested, "WHATSAPP")).toBe("+60 12-345 6789");
    expect(suggestedContact(suggested, "EMAIL")).toBe("billing@aaa.test");
  });
});

describe("the calls", () => {
  it("fees: one project at a time; the old company-wide list (JB301)", async () => {
    await service.getDisposalFees("p-3");
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-fees/", { project: "p-3" });
    await service.getDisposalLegacyFees();
    expect(api.get).toHaveBeenLastCalledWith("/api/disposal-fees/legacy/");
  });

  it("【上传付款凭证】 sends 付款编号 and the files as one form", async () => {
    const photo = new File(["x"], "slip.png", { type: "image/png" });
    await service.recordDisposalPayment("st-1", { paymentNo: " PV-77 ", files: [photo] });
    const [url, body] = api.post.mock.calls.at(-1) as [string, FormData];
    expect(url).toBe("/api/disposal-settlements/st-1/payment/");
    expect(body.get("payment_no")).toBe("PV-77");
    expect((body.getAll("files")[0] as File).name).toBe("slip.png");
    await service.disposalVoucherUrl("st-1", "a-1");
    expect(api.fetchObjectUrl).toHaveBeenLastCalledWith("/api/disposal-settlements/st-1/voucher/", {
      query: { attachment: "a-1" },
    });
  });
});

describe("清运费用设定 for one project (事项 5.3 / 5.4)", () => {
  it("names the project plainly; on 全部项目 it asks for one first", () => {
    const fixed = text(render(<FeeProjectLine project="p-3" name="PUTRA_MAS" fixed projects={[]} onChoose={() => undefined} />));
    expect(fixed).toBe(fill(zh.jb299.fee.thisProject, { name: "PUTRA_MAS" }));
    expect(fixed).toBe("这个项目：PUTRA_MAS");
    const asking = text(
      render(<FeeProjectLine project="" name="" fixed={false} projects={[{ id: "p-1", name: "project 1A" }]} onChoose={() => undefined} />),
    );
    expect(asking).toContain(zh.jb299.fee.chooseProject);
    expect(zh.jb299.fee.keepsOld).toContain("其他项目和已经结算的记录都不变");
    expect(zh.jb299.fee.legacyTitle).toBe("以前的统一价格（没有指定项目），请为每个项目重新设定");
  });

  it("the window reads and saves with the project", () => {
    const source = read("src/components/contractor-ops/disposal-fees.tsx");
    expect(source).toContain("queryFn: () => getDisposalFees(project)");
    expect(source).toContain("enabled: Boolean(project)");
    expect(source).toContain("getDisposalFeeHistory(row.supplier.id, project)");
    expect(source).toMatch(/setDisposalFee\(\{\s*project,/);
    expect(source).toContain("<LegacyFees />");
  });
});

describe("准备结算: 付款凭证 + 付款编号 first (事项 2.2 / 2.3 / 2.6)", () => {
  it("a 准备结算 row: 付款编号 column, 【上传付款凭证】 and 【准备结算】", () => {
    const html = render(<SettlementRowsTable rows={[READY]} status="READY" onOpen={() => undefined} />);
    const words = text(html);
    expect(words).toContain(zh.jb299.col.payment);
    expect(words).toContain(zh.jb299.notUploaded);
    expect(html).toContain('data-slot="settlement-upload"');
    expect(words).toContain(zh.jb299.upload.button);
    expect(html).toContain('data-slot="settlement-prepare"');
  });

  it("【准备结算】 without the voucher says why plainly, before any PIN, and offers the upload", () => {
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    const prepare = source.slice(source.indexOf("const prepare = async"), source.indexOf("signOffBeforeEditing(DISPOSAL_SETTLE_PIN_ACTION)"));
    expect(prepare).toContain("if (!hasPayment(row))");
    expect(prepare).toContain("setMissing(true)");
    const words = text(render(<PaymentMissingDialog row={READY} onClose={() => undefined} />));
    expect(words).toContain(zh.jb299.missing.title);
    expect(words).toContain(fill(zh.jb299.missing.body, { number: "CS-PRJ-0003-002" }));
    expect(words).toContain(zh.jb299.upload.button);
  });

  it("the upload window: 付款编号 (required), photos / PDFs, cancel, and that nothing is transferred", () => {
    const html = render(<PaymentDialog row={READY} onClose={() => undefined} />);
    const words = text(html);
    expect(words).toContain(fill(zh.jb299.upload.title, { number: "CS-PRJ-0003-002" }));
    expect(words).toContain(zh.jb299.upload.paymentNo);
    expect(words).toContain(zh.jb299.upload.files);
    expect(words).toContain(zh.jb299.upload.choose);
    expect(words).toContain(zh.jb299.evidenceOnly);
    expect(words).toContain(zh.jb299.upload.cancel);
    expect(html).toContain(`accept="${lib.VOUCHER_ACCEPT}"`);
    expect(html).toContain('data-slot="settlement-upload-save"');
    const source = read("src/components/contractor-ops/disposal-payment.tsx");
    // A double click sends once; a missing 付款编号 / file is said in the field.
    expect(source).toContain("if (!paymentReady(paymentNo, files, hasVouchers) || sending.current) return;");
    expect(source).toContain('t("upload.paymentNoMissing")');
    expect(source).toContain('t("upload.fileMissing")');
    expect(source).toContain("t(`upload.${problem.key}`, { name: problem.name })");
  });

  it("【确认结算完毕】 after the PIN names the 付款编号; the double click guard stays", () => {
    const words = text(render(<SettleDialog row={PAID} pin="123456" onClose={() => undefined} />));
    expect(words).toContain(zh.jb299.settle.go);
    expect(words).toContain("PV-77");
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(source).toContain("if (sending.current) return;");
  });

  it("the phone sees no upload; an office reader without the right sees it locked, saying why", () => {
    reader.phone = true;
    expect(render(<PaymentButton row={READY} />)).toBe("");
    reader.phone = false;
    reader.perms = new Set(["disposal.view"]);
    const html = render(<PaymentButton row={READY} />);
    expect(html).toContain("disabled");
    expect(text(html)).toContain(zh.jb299.upload.noRight);
  });
});

describe("结算完毕: who / when, locked; an old record takes its voucher once (D4.4)", () => {
  it("the old CS reads 「旧记录：没有付款凭证」 and offers 【补上传付款凭证】", () => {
    const html = render(<SettlementRowsTable rows={[OLD]} status="SETTLED" onOpen={() => undefined} />);
    const words = text(html);
    expect(words).toContain(zh.jb299.oldNoVoucher);
    expect(words).toContain(zh.jb299.upload.again);
    expect(words).toContain("mike");
    expect(text(render(<PaymentDialog row={OLD} onClose={() => undefined} />))).toContain(zh.jb299.upload.againPin);
  });

  it("a settled row with vouchers: the number, no upload, and 发送 beside 预览 / 打印 / 导出", () => {
    const settled = { ...PAID, status: "SETTLED" as const, settled_by_name: "mike", settled_at: "2026-11-28T04:00:00Z" };
    const html = render(<SettlementRowsTable rows={[settled]} status="SETTLED" onOpen={() => undefined} />);
    const words = text(html);
    expect(words).toContain("PV-77");
    expect(html).not.toContain('data-slot="settlement-upload"');
    for (const action of ["preview", "print", "save", "share"] as const) expect(words).toContain(zh.fileActions[action]);
  });

  it("the window shows the payment block with each voucher to open", () => {
    const words = text(
      render(
        <PaymentFacts
          settlement={{
            ...PAID,
            lines: [],
            vouchers: [
              { id: "a-1", name: "slip.png", preview_type: "image/png", byte_size: 10, uploaded_by_name: "mike", uploaded_at: "2026-11-28T03:00:00Z" },
            ],
          }}
        />,
      ),
    );
    expect(words).toContain(zh.jb299.voucherTitle);
    expect(words).toContain("PV-77");
    expect(words).toContain("slip.png");
    expect(words).toContain(zh.jb299.openVoucher);
    expect(words).toContain(zh.jb299.inPdf);
    expect(text(render(<PaymentCell row={PAID} />))).toContain(fill(zh.jb299.voucherCount, { count: 2 }));
  });
});

describe("发送 to the supplier through the existing send (事项 2.4)", () => {
  it("the file buttons carry the supplier as the recipient; 「发给谁？」 opens filled in", () => {
    const source = read("src/components/contractor-ops/disposal-settlements.tsx");
    expect(source).toContain('omit={row.status === "SETTLED" ? [] : ["save", "share"]}');
    expect(source).toContain("recipient: supplierRecipient(row)");
    const actions = read("src/components/shared/file-actions.tsx");
    expect(actions).toContain("askRecipient(source.title || source.subject || \"\", source.recipient)");
    const html = render(
      <SendRecipientDialog fileTitle="清运结算单 CS-PRJ-0003-001" onDone={() => undefined} suggested={lib.supplierRecipient(READY)} />,
    );
    expect(html).toContain('value="Ah Kow"');
    expect(html).toContain('value="AAA Supplier"');
    expect(html).toContain('value="+60 12-345 6789"');
    expect(text(html)).toContain(fill(zh.jb299.send.filled, { name: "AAA Supplier" }));
  });

  it("no phone or email on file: a plain line, and the fields are left to type", () => {
    const html = render(
      <SendRecipientDialog fileTitle="x" onDone={() => undefined} suggested={lib.supplierRecipient({ supplier: { name: "Bare Lorry" } })} />,
    );
    expect(text(html)).toContain(fill(zh.jb299.send.noContact, { name: "Bare Lorry" }));
    expect(html).toContain('data-slot="send-recipient-contact"');
  });

  it("other sends are unchanged: no suggestion, no line", () => {
    const html = render(<SendRecipientDialog fileTitle="x" onDone={() => undefined} />);
    expect(html).not.toContain('data-slot="send-recipient-suggested"');
  });
});

describe("参考 vs 已结算 (事项 4 / 5.1 / 5.2)", () => {
  it("the job panel reads 参考金额 until settled, and names the 付款编号", () => {
    const base = {
      cleared_on: "2026-11-08",
      fee_per_trip: "350.00",
      fee_amount: "350.00",
      amounts_hidden: false,
      trip_count: 1,
      actual_weight_kg: "1000",
    };
    const unchecked = text(render(<DisposalFeePanel row={{ ...base, fee_state: "unchecked", settlement: null }} />));
    expect(unchecked).toContain(zh.jb299.panel.referenceAmount);
    expect(unchecked).toContain(zh.jb299.panel.referenceHelp);
    const settled = text(
      render(
        <DisposalFeePanel
          row={{ ...base, fee_state: "settled", settlement: { id: "st-0", number: "CS-PRJ-0003-001", status: "SETTLED", payment_no: "PV-9" } }}
        />,
      ),
    );
    expect(settled).toContain(zh.jb287.panel.feeAmount);
    expect(settled).not.toContain(zh.jb299.panel.referenceAmount);
    expect(settled).toContain("PV-9");
    expect(settled).toContain("CS-PRJ-0003-001");
  });

  it("the report 合计 shows 已结算 apart from 参考", () => {
    const words = text(
      render(
        <DisposalFeeTotal
          fees={{ amount_total: "4000.00", settled_amount: "1750.00", reference_amount: "2250.00", no_fee_count: 0 }}
        />,
      ),
    );
    expect(words).toContain(fill(zh.jb299.report.settled, { amount: "RM 1,750.00" }));
    expect(words).toContain(fill(zh.jb299.report.reference, { amount: "RM 2,250.00" }));
  });

  it("the overview's 垃圾清运 card: the reference line beside the no-fee line", () => {
    const source = read("src/components/reports/site-cost-overview.tsx");
    expect(source).toContain('key === "disposal" ? (');
    expect(source).toContain('t299("cost.notCounted", { amount: rm(row.not_counted_amount) })');
    expect(zh.jb299.cost.notCounted).toBe("还有 {amount} 未结算（参考），不算在内");
  });
});

describe("words: four languages, 你 never 您, every refusal worded", () => {
  const files = { zh, "zh-TW": zhTW, en, ms } as const;
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => keys(inner, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];

  it("the jb299 group has the same keys in all four files and never says 您", () => {
    const expected = keys(zh.jb299).sort();
    for (const [name, messages] of Object.entries(files)) {
      expect(keys((messages as typeof zh).jb299).sort(), name).toEqual(expected);
      expect(JSON.stringify((messages as typeof zh).jb299), name).not.toContain("您");
    }
  });

  it("the new refusals, the PIN step and the audit rows have words", () => {
    for (const [name, messages] of Object.entries(files)) {
      const m = messages as typeof zh;
      for (const code of [
        "disposal_settlement_payment_missing",
        "disposal_payment_no_required",
        "disposal_payment_file_required",
        "disposal_settlement_payment_locked",
        "disposal_fee_project_required",
      ] as const) {
        expect(m.errors.api[code], `${name} ${code}`).toBeTruthy();
      }
      expect(m.signOff.action.disposal_settlement_voucher, name).toBeTruthy();
      expect(m.audit.operation.disposal_settlement_payment_recorded, name).toBeTruthy();
      expect(m.audit.operation.disposal_settlement_voucher_added, name).toBeTruthy();
    }
  });
});
