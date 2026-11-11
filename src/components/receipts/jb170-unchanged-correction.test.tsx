/**
 * JB170 (客户 11-11 第四批 事项 1): a delivery's 「更正」 that changes nothing.
 *
 * The client, on MI-PRJ-0003-008: 「也已经填写更正原因，但点击「保存」后无法成功
 * 修改。右上角出现错误提示：「请检查标红的字段后重试。」」 Only the reason had
 * been filled in. The server said 「The correction changes nothing.」 in English
 * under the reason, which went red. Now:
 *
 * - the refusal is `correction_unchanged`, worded in the reader's language,
 *   the same sentence in the corner and beside 「保存」;
 * - nothing is placed under the reason;
 * - the sentence sits in the dialog's footer, beside the button - not at the
 *   bottom of the fields;
 * - a reader with 「金额查看」 off is not offered 单价 / 送货单金额, which the
 *   server would not take (the other road to the same refusal).
 *
 * Rendered to static markup (the runner has no DOM), dialogs drawn inline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MaterialReceiptDetail } from "@/interfaces/contractor";
import { ApiError } from "@/interfaces/api";
import { publishTranslator } from "@/lib/i18n-runtime";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const reader: { user: Record<string, unknown> | null; codes: string[] } = { user: null, codes: [] };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: reader.user, can: (code: string) => reader.codes.includes(code) }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/receipts/r1/edit",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/dialog", async () => {
  const { inlineDialogModule } = await import("@/components/shared/record-detail-test-kit");
  return {
    ...inlineDialogModule(),
    // The footer marked, so a test can tell what sits beside the buttons.
    DialogFooter: ({ children }: { children?: React.ReactNode }) => <div data-dialog-footer>{children}</div>,
  };
});

const { api } = await import("@/services/api-client");
const { applyServerErrors, FormShell } = await import("@/components/shared/form-shell");
const { FormSurfaceProvider } = await import("@/components/shared/form-surface");
const { renderDetail } = await import("@/components/shared/record-detail-test-kit");
const { EditReceipt } = await import("@/components/receipts/create-receipt");
const { ReceiptLinesDialog } = await import("@/components/receipts/receipt-lines-dialog");
const { linesRefusal, unchangedRefusal } = await import("@/lib/correction-refusal");

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;

/** What the server answers now (receiving/views.py, record_corrections). */
const UNCHANGED = {
  success: false,
  message: "Nothing was changed, so nothing was saved.",
  code: "correction_unchanged",
  errors: {
    non_field_errors: [{ code: "correction_unchanged", message: "Nothing was changed, so nothing was saved." }],
  },
};

async function refusedWith(body: unknown): Promise<ApiError> {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 400, headers: { "Content-Type": "application/json" } }),
  ) as unknown as typeof fetch;
  try {
    await api.post("/api/receipts/r1/correct_receipt/", {}, { silent: true });
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("The request was expected to fail and did not.");
}

const receipt = {
  id: "r1",
  receipt_no: "MI-PRJ-0003-008",
  movement_type: "ENTRY",
  unit: "TONNE",
  project: "p1",
  project_name: "PRJ-0003 - PUTRA MAS",
  material_name: "砂石",
  material_specification: "碎石",
  quantity: "33.000",
  unit_price: "650.00",
  document_amount: null,
  received_by_name: "Gate",
  acceptance_status: "ACCEPTED",
  photos: [],
  lines: [
    {
      id: "l1",
      position: 1,
      category: "c1",
      spec_category: "s1",
      material_name: "砂石",
      material_specification: "碎石",
      quantity: "33.000",
      unit: "TONNE",
      unit_price: "650.00",
      amount: null,
    },
  ],
  line_count: 1,
  correction_trail: null,
} as unknown as MaterialReceiptDetail;

/** A field's label as drawn (the notes above the form may name 单价 too). */
function labelled(text: string): RegExp {
  return new RegExp(`<label[^>]*>${text.replace(/[()]/g, "\\$&")}`);
}

function seeded(client: import("@tanstack/react-query").QueryClient) {
  client.setQueryData(["receipts", "detail", "r1"], receipt);
}

/** A builder's office account, with 「金额查看」 on or off. */
function officeReader(seesAmounts: boolean) {
  reader.user = {
    id: "u1",
    account_type: "TENANT",
    company_type: "CONTRACTOR",
    is_field_staff: false,
    is_superuser: false,
  };
  reader.codes = ["receipt.update", ...(seesAmounts ? ["finance.view_amounts"] : [])];
}

describe("the refusal of a correction that changes nothing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
    it(`is one sentence in ${locale}, in the corner and beside 保存, with nothing under the reason`, async () => {
      publishTranslator(locale as keyof typeof CATALOGUES, catalogue as unknown as Record<string, unknown>);

      const failure = await refusedWith(UNCHANGED);

      expect(failure.message).toBe(catalogue.errors.api.correction_unchanged);
      expect(failure.message).not.toBe(catalogue.errors.api.validation_failed);
      expect(failure.errors.non_field_errors).toBe(catalogue.errors.api.correction_unchanged);
      expect(failure.errors.reason).toBeUndefined();
      expect(unchangedRefusal(failure)).toBe(catalogue.errors.api.correction_unchanged);
    });
  }

  it("says what to do next, in the client's words", () => {
    expect(zh.errors.api.correction_unchanged).toBe(
      "没有任何改动，所以没有保存。请先把要更正的栏位改好（例如数量、单价），再按「保存」。",
    );
  });

  it("marks no field red: the form has nothing to place it under", async () => {
    publishTranslator("zh", zh as unknown as Record<string, unknown>);
    const failure = await refusedWith(UNCHANGED);
    const marked: string[] = [];
    const form = {
      getFieldMeta: (field: string) => (["reason", "quantity", "unit_price"].includes(field) ? {} : undefined),
      setFieldMeta: (field: string) => {
        marked.push(field);
      },
    };

    const leftover = applyServerErrors(failure.errors, form);

    expect(marked).toEqual([]);
    expect(leftover).toEqual([zh.errors.api.correction_unchanged]);
  });

  it("is said by 「增加材料」 too, and its other refusals name what is wrong", async () => {
    publishTranslator("zh", zh as unknown as Record<string, unknown>);
    expect(linesRefusal(await refusedWith(UNCHANGED), "x")).toBe(zh.errors.api.correction_unchanged);

    const firstGone = await refusedWith({
      success: false,
      message: "The first material is the delivery's own.",
      code: "validation_failed",
      errors: { lines: [{ code: "first_line_kept", message: "The first material cannot be removed." }] },
    });
    expect(linesRefusal(firstGone, "x")).toBe(zh.errors.field.first_line_kept);

    const stale = await refusedWith({
      success: false,
      message: "Check the materials before saving.",
      code: "validation_failed",
      errors: { "lines.2.id": [{ code: "line_not_on_receipt", message: "That material is not on this delivery." }] },
    });
    expect(linesRefusal(stale, "x")).toBe(zh.errors.field.line_not_on_receipt);

    const noReason = await refusedWith({
      success: false,
      message: "Explain why this correction is required.",
      code: "validation_failed",
      errors: { reason: [{ code: "required", message: "A correction reason is required." }] },
    });
    expect(noReason.errors.reason).toBe(zh.errors.field.required);
  });

  it("is only the unchanged refusal that goes beside the button in 改正", () => {
    expect(unchangedRefusal(new ApiError("其他", 400, {}, "validation_failed"))).toBeNull();
    expect(unchangedRefusal(new Error("offline"))).toBeNull();
  });
});

describe("where the sentence sits", () => {
  beforeEach(() => {
    officeReader(true);
  });

  const sentence = zh.errors.api.correction_unchanged;

  function shell(surface: "page" | "dialog", footerError: string | null) {
    return renderDetail(
      <FormSurfaceProvider value={surface}>
        <FormShell
          backHref="/receipts"
          backLabel="材料进场记录"
          title="更正材料进场记录"
          isSubmitting={false}
          submitLabel="保存"
          onSubmit={() => {}}
          footerError={footerError}
        >
          <div data-fields>更正原因</div>
        </FormShell>
      </FormSurfaceProvider>,
    );
  }

  it("in a dialog: in the footer, with 保存, after the fields", () => {
    const html = shell("dialog", sentence);
    const footer = html.slice(html.indexOf("data-dialog-footer"));
    expect(footer).toContain(sentence);
    expect(footer).toContain("保存");
    expect(html.indexOf(sentence)).toBeGreaterThan(html.indexOf("data-fields"));
    expect(html).toContain('role="alert"');
  });

  it("on the page: just under the buttons at the top, above the fields", () => {
    const html = shell("page", sentence);
    expect(html.indexOf(sentence)).toBeGreaterThan(html.indexOf("保存"));
    expect(html.indexOf(sentence)).toBeLessThan(html.indexOf("data-fields"));
  });

  it("says nothing when nothing was refused", () => {
    expect(shell("dialog", null)).not.toContain("data-form-footer-error");
  });
});

describe("「金额查看」 off: no money to type on the correction", () => {
  it("draws 单价 and 送货单金额 for a reader who sees amounts", () => {
    officeReader(true);
    const html = renderDetail(<EditReceipt id="r1" />, seeded);
    expect(html).toContain("<form");
    expect(html).toMatch(labelled(zh.receipts.field.unitPrice));
    expect(html).toMatch(labelled(zh.receipts.field.documentAmount));
  });

  it("leaves both out for a reader who does not", () => {
    officeReader(false);
    const html = renderDetail(<EditReceipt id="r1" />, seeded);
    expect(html).toContain("<form");
    expect(html).toMatch(labelled(zh.receipts.correction.reason));
    expect(html).toMatch(labelled(zh.receipts.field.quantity));
    expect(html).not.toMatch(labelled(zh.receipts.field.unitPrice));
    expect(html).not.toMatch(labelled(zh.receipts.field.documentAmount));
  });

  it("「增加材料」 offers 单价 and 金额 only to a reader who sees amounts", () => {
    officeReader(true);
    const shown = renderDetail(<ReceiptLinesDialog receipt={receipt} onClose={() => {}} />);
    expect(shown).toMatch(labelled(zh.materialLines.unitPrice));
    expect(shown).toMatch(labelled(zh.materialLines.amount));

    officeReader(false);
    const hidden = renderDetail(<ReceiptLinesDialog receipt={receipt} onClose={() => {}} />);
    expect(hidden).toMatch(labelled(zh.materialLines.reason));
    expect(hidden).not.toMatch(labelled(zh.materialLines.unitPrice));
    expect(hidden).not.toMatch(labelled(zh.materialLines.amount));
  });

  it("everybody who is not a builder's office account sees what it always saw", () => {
    reader.user = { id: "p1", account_type: "PLATFORM", company_type: null, is_field_staff: false, is_superuser: false };
    reader.codes = [];
    const html = renderDetail(<EditReceipt id="r1" />, seeded);
    expect(html).toMatch(labelled(zh.receipts.field.unitPrice));
  });
});
