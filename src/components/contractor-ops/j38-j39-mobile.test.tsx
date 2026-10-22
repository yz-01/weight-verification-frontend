/**
 * J38 / J39 (the client and Lucas, 2026-10-22) on screen.
 *
 * - 材料退货 goes on its RN: the Return Note dialog and the actual exit ask
 *   no DO; an old note that has one still shows it (J38-2).
 * - 材料出场's application offers 规格 / 规格名称 but never waits for them
 *   (J39-2); everything else it asked for it still asks for.
 * - The office's lists tag a record sent without its specification
 *   「待补规格」, and the totals name its line 「未填规格」 (J39-3).
 *
 * Rendered to static markup like the other screen tests - the runner has no
 * DOM - with the drafts seeded the way choosing the material leaves them.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { MaterialOutgoing } from "@/interfaces/contractor-ops";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const drafts: Record<string, unknown> = {};

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-site", full_name: "Ah Seng", is_field_staff: true },
    can: () => true,
  }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/field-staff",
}));

vi.mock("@/components/field-staff/field-draft", () => ({
  FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useClearDraft: () => () => {},
  useDraftState: (key: string, initial?: unknown) => [
    key in drafts ? drafts[key] : typeof initial === "function" ? (initial as () => unknown)() : initial,
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

const { OutgoingDialog, ReturnProcessingDialog } = await import(
  "@/components/contractor-ops/operations-workspaces"
);
const { ReturnNoteDialog, ReturnNotePanel } = await import("@/components/contractor-ops/return-note");
const { SpecCell } = await import("@/components/receipts/spec-pending-tag");

const SPEC = (id: string, name: string, other = false) => ({
  id, code: id, name, default_unit: other ? "" : "TONNE", default_unit_label: null,
  is_active: true, is_other: other, is_fixed: other, sort_order: other ? 9999 : 0,
});

const STEEL = {
  id: "c-steel",
  project: "p-1",
  name: "钢筋",
  code: "STEEL",
  kind: "MATERIAL",
  is_active: true,
  can_upload: true,
  default_unit: "TONNE",
  default_unit_label: null,
  suppliers: [],
  supplier_options: [],
  manufacturers: [],
  manufacturer_options: [],
  specs: [SPEC("y12", "Y12"), SPEC("other", "其他", true)],
};

function outgoing(overrides: Partial<MaterialOutgoing> = {}): MaterialOutgoing {
  return {
    id: "o-1",
    reference_no: "MO-SITE-261022-001",
    project: "p-1",
    project_name: "Site",
    category: "c-steel",
    category_name: "钢筋",
    supplier: null,
    supplier_name: null,
    material_name: "钢筋",
    quantity: "2.000",
    unit: "TONNE",
    destination: "",
    executor_name: "Ah Seng",
    vehicle_plate: "WXY 1",
    delivery_note_no: "",
    reason: "Surplus",
    status: "APPROVED",
    captured_at: "2026-10-22T02:00:00Z",
    latitude: null,
    longitude: null,
    submitted_by_name: "Ah Seng",
    approved_by_name: null,
    approved_at: null,
    review_note: "",
    photos: [],
    has_return_note: false,
    ...overrides,
  };
}

function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const page = <T,>(results: T[]) => ({ results, count: results.length });
  qc.setQueryData(["projects", "options"], page([{ id: "p-1", code: "SITE", name: "Site" }]));
  qc.setQueryData(["project-categories", "outgoing", "p-1"], page([STEEL]));
  qc.setQueryData(["suppliers", "picker", ""], page([]));
  qc.setQueryData(["material-units", "active"], [
    { id: "u-t", code: "TONNE", label: "Tonne", sort_order: 0, is_active: true, built_in: true },
  ]);
  qc.setQueryData(["material-units", "all"], []);
  qc.setQueryData(["manufacturers", "picker", ""], page([]));
  qc.setQueryData(["material-outgoing", "detail", "o-1"], outgoing({ return_note_delivery_note_no: "DO-OLD-1" }));
  qc.setQueryData(["material-outgoing", "exit-queued", "o-1"], null);
  return qc;
}

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client()}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** What the last button with a 「还差这些没填」 is still waiting for. */
function missing(html: string): string[] {
  return ([...html.matchAll(/还差这些没填：([^"<]*)/g)].at(-1)?.[1] ?? "").split("、");
}

const words = zh.contractorOps;

describe("a material return has no DO (J38-2)", () => {
  it("the Return Note dialog asks no DO", () => {
    const html = render(
      <ReturnNoteDialog row={outgoing({ status: "PENDING", delivery_note_no: "DO-SITE" })} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(html).not.toContain(words.returnNote.deliveryNoteNo);
    expect(html).not.toContain("DO-SITE");
  });

  it("an old note still shows the DO it had; a new one shows no DO row", () => {
    const filled = { has_return_note: true, return_note_no: "RN-1", return_note_material: "钢筋" };
    const old = render(<ReturnNotePanel row={outgoing({ ...filled, return_note_delivery_note_no: "DO-778" })} />);
    expect(old).toContain(words.returnNote.deliveryNoteNo);
    expect(old).toContain("DO-778");
    const fresh = render(<ReturnNotePanel row={outgoing({ ...filled, return_note_delivery_note_no: "" })} />);
    expect(fresh).not.toContain(words.returnNote.deliveryNoteNo);
  });

  it("the actual exit asks no DO and takes none from the note", () => {
    const html = render(
      <ReturnProcessingDialog row={{ id: "o-1", reference_no: "MO-SITE-261022-001" }} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(html).toContain(words.outgoing.sendReturn);
    expect(html).not.toMatch(new RegExp(`<label[^>]*>${words.field.deliveryNote}`));
    expect(html).not.toContain("DO-OLD-1");
  });
});

describe("material out: the specification never holds the phone back (J39-2)", () => {
  beforeEach(() => {
    for (const key of Object.keys(drafts)) delete drafts[key];
    drafts.project = "p-1";
    drafts.form = {
      category: "c-steel",
      spec_category: "",
      material_specification: "",
      material_name: "",
      unit: "TONNE",
      supplier: "",
      quantity: "2",
      executor_name: "",
      vehicle_plate: "",
      reason: "",
      manufacturer: "",
    };
  });

  it("offers 规格 with a hint and does not wait for it", () => {
    const html = render(<OutgoingDialog project="p-1" onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain(words.outgoing.chooseSpec);
    expect(html).toContain(words.outgoing.specOptionalHint);
    expect(missing(html)).not.toContain(words.outgoing.spec);
    // What it asked for before it still asks for.
    expect(missing(html)).toContain(words.field.reason);
  });

  it("「其他」 with nothing typed does not wait either", () => {
    drafts.form = { ...(drafts.form as object), spec_category: "other" };
    const html = render(<OutgoingDialog project="p-1" onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain(words.outgoing.specName);
    expect(missing(html)).not.toContain(words.outgoing.specName);
  });
});

describe("the office sees what is still to fill (J39-3)", () => {
  it("tags a record with no specification 「待补规格」, and only one whose material has them", () => {
    expect(render(<SpecCell spec="" needsSpec />)).toContain("待补规格");
    expect(render(<SpecCell spec="" />)).toContain("—");
    const named = render(<SpecCell spec="Y12" needsSpec />);
    expect(named).toContain("Y12");
    expect(named).not.toContain("待补规格");
  });

  it("has the words in every language", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      expect(catalogue.receipts.specPending).toBeTruthy();
      expect(catalogue.receipts.specPendingHint).toBeTruthy();
      expect(catalogue.receipts.net.noSpec).toBeTruthy();
      expect(catalogue.contractorOps.outgoing.specOptionalHint).toBeTruthy();
      expect(catalogue.contractorOps.equipmentExit.supplierFromMachine).toBeTruthy();
      expect(catalogue.fieldStaffPwa.material.specOptionalHint).toBeTruthy();
      expect(catalogue.fieldStaffPwa.material.supplierRequiredHint).toBeTruthy();
    }
    expect(zh.receipts.net.noSpec).toBe("未填规格");
  });
});
