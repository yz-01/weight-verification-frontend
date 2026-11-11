/**
 * JB169 (客户 11-11) on screen: 「供应商应该属于必填项目，未选择供应商不能确认归档」
 * and 「已归档的退货记录如需更正，必须通过六位数密码验证，同时保留完整修改历史」.
 *
 * - A return with no supplier reads 「待补供应商」 on the list and the detail.
 * - Its 确认 is off, the reason is written beside it (not only a tooltip),
 *   and 「补供应商」 sits next to it - on the 后台确认 and on 确认归档 alike.
 * - The handover asks for the supplier when the record has none.
 * - An archived return's 改正 always asks why, says the change is kept in
 *   修改记录, and saves as 「保存改正」 - a blank filled in too.
 *
 * Rendered to static markup like the other screen tests - the runner has no DOM.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import type { CorrectionField, CorrectionForm } from "@/interfaces/record-correction";
import { isCorrecting } from "@/lib/record-correction";
import { returnNeedsSupplier } from "@/lib/return-supplier";
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

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/material-outgoing",
}));

vi.mock("@/components/field-staff/field-draft", () => ({
  FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useClearDraft: () => () => {},
  useDraftState: (_key: string, initial?: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    () => {},
  ],
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

const { OutgoingActions, ReturnProcessingDialog } = await import(
  "@/components/contractor-ops/operations-workspaces"
);
const { ReturnSupplierCell, SupplierPendingTag } = await import(
  "@/components/contractor-ops/return-supplier"
);
const { RecordClosurePanel, recordClosureKey } = await import("@/components/shared/record-closure");
const { RecordCorrectionDialog } = await import("@/components/shared/record-correction");

const words = zh.contractorOps.outgoing;

function outgoing(overrides: Partial<MaterialOutgoing> = {}): MaterialOutgoing {
  return {
    id: "o-1",
    reference_no: "MO-SITE-261111-001",
    project: "p-1",
    project_name: "Site",
    category: "c-diesel",
    category_name: "Disel",
    supplier: null,
    supplier_name: null,
    material_name: "Disel",
    quantity: "20.000",
    unit: "LITRE",
    destination: "",
    executor_name: "Ah Seng",
    vehicle_plate: "",
    delivery_note_no: "",
    reason: "Surplus",
    status: "PROCESSED",
    captured_at: "2026-11-11T02:00:00Z",
    latitude: null,
    longitude: null,
    submitted_by_name: "Ah Seng",
    approved_by_name: null,
    approved_at: null,
    review_note: "",
    photos: [],
    has_return_note: true,
    needs_supplier: true,
    ...overrides,
  };
}

function render(node: React.ReactNode, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const page = <T,>(results: T[]) => ({ results, count: results.length });
  client.setQueryData(["suppliers", "picker", ""], page([]));
  client.setQueryData(["project-categories", "outgoing", "p-1"], page([]));
  client.setQueryData(["material-units", "active"], []);
  client.setQueryData(["material-units", "all"], []);
  seed?.(client);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The opening tag of the button whose words include `text`. */
function buttonWith(html: string, text: string): string {
  const match = [...html.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)].find((m) =>
    m[2].includes(text),
  );
  expect(match, `a button reading ${text}`).toBeTruthy();
  return match![1];
}

describe("returnNeedsSupplier", () => {
  it("follows the server's flag, and reads an older answer by the same rule", () => {
    expect(returnNeedsSupplier({ supplier: null, status: "PROCESSED", needs_supplier: true })).toBe(true);
    expect(returnNeedsSupplier({ supplier: "s-1", status: "PROCESSED", needs_supplier: false })).toBe(false);
    expect(returnNeedsSupplier({ supplier: null, status: "COMPLETED" })).toBe(true);
    // A 材料领用 never names one; a rejected application never left site.
    expect(returnNeedsSupplier({ supplier: null, status: "COMPLETED", kind: "ISSUE" })).toBe(false);
    expect(returnNeedsSupplier({ supplier: null, status: "REJECTED" })).toBe(false);
  });
});

describe("「待补供应商」 on the list and the detail", () => {
  it("tags a return with no supplier, and only that one", () => {
    const waiting = render(<ReturnSupplierCell row={outgoing()} />);
    expect(waiting).toContain(words.supplierPending);
    expect(waiting).toContain('data-slot="supplier-pending-tag"');

    const named = render(
      <ReturnSupplierCell row={outgoing({ supplier: "s-1", supplier_name: "Petron", needs_supplier: false })} />,
    );
    expect(named).toContain("Petron");
    expect(named).not.toContain(words.supplierPending);

    const issue = render(<ReturnSupplierCell row={outgoing({ kind: "ISSUE", needs_supplier: false })} />);
    expect(issue).not.toContain(words.supplierPending);
  });

  it("looks like 「待补规格」", () => {
    const tag = render(<SupplierPendingTag />);
    expect(tag).toContain("bg-tone-amber/12");
    expect(tag).toContain(words.supplierPendingHint);
  });
});

describe("后台确认 waits for the supplier", () => {
  it("keeps 确认 off, says why on screen and offers 「补供应商」 beside it", () => {
    const html = render(<OutgoingActions row={outgoing()} pending={false} onReview={() => {}} />);
    expect(html).toContain("data-return-needs-supplier");
    // Written out, not only in the button's tooltip.
    expect(html).toMatch(new RegExp(`<p[^>]*role="status"[^>]*>${words.needSupplierFirst}</p>`));
    expect(buttonWith(html, words.fillSupplier)).not.toMatch(/\sdisabled=""/);
    expect(buttonWith(html, words.finalConfirm)).toMatch(/\sdisabled=""/);
  });

  it("is pressed as before once the supplier is there", () => {
    const html = render(
      <OutgoingActions
        row={outgoing({ supplier: "s-1", supplier_name: "Petron", needs_supplier: false })}
        pending={false}
        onReview={() => {}}
      />,
    );
    expect(html).not.toContain(words.needSupplierFirst);
    expect(html).not.toContain(words.fillSupplier);
    expect(buttonWith(html, words.finalConfirm)).not.toMatch(/\sdisabled=""/);
  });
});

describe("确认归档 waits for the supplier", () => {
  const ready = (client: QueryClient) =>
    client.setQueryData(recordClosureKey("MATERIAL_OUTGOING", "o-1"), {
      kind: "MATERIAL_OUTGOING",
      record: "o-1",
      ready: true,
      closed: false,
      closure: null,
    });

  it("keeps the button off with the reason and the action beside it", () => {
    const html = render(
      <RecordClosurePanel
        kind="MATERIAL_OUTGOING"
        recordId="o-1"
        blocked={{ reason: words.needSupplierFirst, action: <button type="button">{words.fillSupplier}</button> }}
      />,
      ready,
    );
    expect(html).toContain("data-record-closure-blocked");
    expect(html).toContain(words.needSupplierFirst);
    expect(html).toContain(words.fillSupplier);
    expect(buttonWith(html, zh.recordClosure.action)).toMatch(/\sdisabled=""/);
  });

  it("is pressed as before with nothing missing", () => {
    const html = render(<RecordClosurePanel kind="MATERIAL_OUTGOING" recordId="o-1" />, ready);
    expect(html).not.toContain("data-record-closure-blocked");
    expect(buttonWith(html, zh.recordClosure.action)).not.toMatch(/\sdisabled=""/);
  });
});

describe("the handover asks for the supplier when the record has none", () => {
  const exit = (record: MaterialOutgoing) =>
    render(
      <ReturnProcessingDialog row={{ id: "o-1", reference_no: record.reference_no }} onClose={() => {}} onSaved={() => {}} />,
      (client) => {
        client.setQueryData(["material-outgoing", "detail", "o-1"], record);
        client.setQueryData(["material-outgoing", "exit-queued", "o-1"], null);
      },
    );
  const stillMissing = (html: string) =>
    ([...html.matchAll(/还差这些没填：([^"<]*)/g)].at(-1)?.[1] ?? "").split("、");

  it("waits for it on a return that names none", () => {
    const html = exit(outgoing({ status: "APPROVED" }));
    expect(html).not.toContain(words.supplierOptional);
    expect(stillMissing(html)).toContain(words.supplier);
  });

  it("stays optional when the record already names one", () => {
    const html = exit(outgoing({ status: "APPROVED", supplier: "s-1", supplier_name: "Petron", needs_supplier: false }));
    expect(html).toContain(words.supplierOptional);
    expect(stillMissing(html)).not.toContain(words.supplier);
  });
});

const SUPPLIER: CorrectionField = {
  name: "supplier",
  type: "choice",
  required: false,
  max_length: null,
  value: "",
  display: "",
  options: [{ value: "s-1", label: "Petron" }],
};
const QUANTITY: CorrectionField = {
  name: "quantity",
  type: "decimal",
  required: true,
  max_length: null,
  value: "20.000",
  display: "20.000",
  options: null,
};

function correctionForm(overrides: Partial<CorrectionForm> = {}): CorrectionForm {
  return {
    kind: "MATERIAL_OUTGOING",
    record: "o-1",
    reference: "MO-SITE-261111-001",
    blocked: null,
    archived: false,
    every_change_signed: true,
    fields: [SUPPLIER, QUANTITY],
    ...overrides,
  };
}

describe("改正 of an archived return", () => {
  const dialog = (form: CorrectionForm, only?: string[]) =>
    render(
      <RecordCorrectionDialog kind="MATERIAL_OUTGOING" recordId="o-1" only={only} onClose={() => {}} />,
      (client) => client.setQueryData(["record-correction-form", "MATERIAL_OUTGOING", "o-1"], form),
    );
  const rc = zh.recordCorrection;

  it("always asks why, says it is kept in 修改记录 and saves as 「保存改正」", () => {
    const html = dialog(correctionForm());
    expect(html).toContain(rc.reason);
    expect(html).toContain(rc.signedNote);
    expect(html).toContain(rc.save);
    expect(html).not.toContain(`>${rc.fillSave}<`);
  });

  it("before the archive a blank is still only filled in", () => {
    const html = dialog(correctionForm({ every_change_signed: false }));
    expect(html).not.toContain(rc.signedNote);
    expect(html).not.toContain(rc.reasonPlaceholder);
  });

  it("「补供应商」 shows the supplier alone", () => {
    const html = dialog(correctionForm(), ["supplier"]);
    expect(html).toContain(rc.field.supplier);
    expect(html).not.toContain(rc.field.quantity);
  });

  it("counts a blank filled in as a correction only on an archived return", () => {
    const fields = [SUPPLIER, QUANTITY];
    expect(isCorrecting(fields, { supplier: "s-1" })).toBe(false);
    expect(isCorrecting(fields, { supplier: "s-1" }, true)).toBe(true);
    expect(isCorrecting(fields, { quantity: "3" })).toBe(true);
    expect(isCorrecting(fields, {}, true)).toBe(false);
  });
});

describe("the words", () => {
  it("are in every language", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      const out = catalogue.contractorOps.outgoing;
      expect(out.supplierPending).toBeTruthy();
      expect(out.supplierPendingHint).toBeTruthy();
      expect(out.fillSupplier).toBeTruthy();
      expect(out.needSupplierFirst).toBeTruthy();
      expect(catalogue.recordCorrection.signedNote).toBeTruthy();
      expect(catalogue.errors.api.return_needs_supplier).toContain("{reference}");
    }
    expect(zh.contractorOps.outgoing.supplierPending).toBe("待补供应商");
    expect(zh.contractorOps.outgoing.needSupplierFirst).toBe("先补上供应商，才能确认归档");
  });
});
