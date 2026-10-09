/**
 * Material leaving site, the 2026-10 C9 flow, on screen.
 *
 * - The phone asks very little: the material (a category, whose unit fills
 *   itself in), the quantity, the plate, the reason, the photographs; the
 *   supplier is optional and can be scanned. No 「原进场记录」 (X20, 图 4).
 * - The office cannot approve until the Return Note is filled: the button is
 *   off and says why (the server refuses it too).
 * - The note reads back as one block with the approver's signature.
 * - The statuses read 已批准 / 等待退场 and 待后台确认 in all four languages.
 *
 * Rendered to static markup like the other screen tests - the runner has no
 * DOM - with the draft seeded the way choosing the material leaves it.
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
let permissions = new Set<string>(["material_outgoing.approve", "material_outgoing.submit"]);

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-site", full_name: "Ah Seng", is_field_staff: true },
    can: (code: string) => permissions.has(code),
  }),
}));

// Which surface the buttons are drawn on: 实际退场 is the phone's only.
let pathname = "/field-staff";
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => pathname,
}));

vi.mock("@/components/field-staff/field-draft", () => ({
  FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useClearDraft: () => () => {},
  useDraftState: (key: string, initial?: unknown) => [
    key in drafts ? drafts[key] : typeof initial === "function" ? (initial as () => unknown)() : initial,
    () => {},
  ],
}));

// A dialog's content goes through a portal, which a static render never
// mounts: drawn inline so the form itself is what is read.
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

const { OutgoingActions, OutgoingDialog } = await import(
  "@/components/contractor-ops/operations-workspaces"
);
const { ReturnNotePanel } = await import("@/components/contractor-ops/return-note");

const SUPPLIER = { id: "s-a", code: "SA", name: "Rebar Supply", is_active: true, completed_return_count: 2 };

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
};

function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const page = <T,>(results: T[]) => ({ results, count: results.length });
  qc.setQueryData(["projects", "options"], page([{ id: "p-1", code: "SITE", name: "Site" }]));
  qc.setQueryData(["project-categories", "outgoing", "p-1"], page([STEEL]));
  qc.setQueryData(["suppliers", "picker", ""], page([SUPPLIER]));
  qc.setQueryData(["material-units", "active"], [
    { id: "u-t", code: "TONNE", label: "Tonne", sort_order: 0, is_active: true, built_in: true },
  ]);
  qc.setQueryData(["material-units", "all"], []);
  qc.setQueryData(["manufacturers", "picker", ""], page([]));
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

function outgoing(overrides: Partial<MaterialOutgoing> = {}): MaterialOutgoing {
  return {
    id: "o-1",
    reference_no: "MO-SITE-261007-001",
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
    status: "PENDING",
    captured_at: "2026-10-07T02:00:00Z",
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

describe("the phone's application (C9, X20)", () => {
  beforeEach(() => {
    for (const key of Object.keys(drafts)) delete drafts[key];
    drafts.project = "p-1";
    drafts.form = {
      category: "c-steel",
      unit: "TONNE",
      supplier: "",
      quantity: "2",
      executor_name: "",
      vehicle_plate: "",
      reason: "",
      manufacturer: "",
    };
  });

  it("asks for no original delivery", () => {
    const html = render(<OutgoingDialog project="p-1" onClose={() => {}} onSaved={() => {}} />);
    expect(html).not.toContain("原进场记录");
    expect(html).not.toContain("剩 ");
  });

  it("shows the category's unit instead of asking for it", () => {
    const html = render(<OutgoingDialog project="p-1" onClose={() => {}} onSaved={() => {}} />);
    expect(html).toMatch(/<span class="text-sm font-medium">吨<\/span>/);
    expect(html).toContain("按材料分类自动带出");
  });

  it("makes the supplier optional, scannable, and flags one with returns", () => {
    const html = render(<OutgoingDialog project="p-1" onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain("知道就选或扫码，不知道可以不填。");
    expect(html).toContain("扫供应商二维码");
    // Not among what the submit button is still waiting for.
    expect(html).not.toMatch(/还差这些没填：[^<"]*供应商/);
  });
});

describe("approving needs the Return Note first (C9)", () => {
  beforeEach(() => {
    permissions = new Set(["material_outgoing.approve", "material_outgoing.submit"]);
  });

  it("keeps 批准 off and says why while there is no note", () => {
    const html = render(
      <OutgoingActions row={outgoing()} pending={false} onReview={() => {}} onReturn={() => {}} />,
    );
    expect(html).toContain("填写 Return Note");
    expect(html).toMatch(/title="先填写 Return Note"[^>]*>\s*<button[^>]*disabled=""/);
  });

  it("lets 批准 go once the note is filled", () => {
    const html = render(
      <OutgoingActions
        row={outgoing({ has_return_note: true, return_note_no: "RN-SITE-261007-001" })}
        pending={false}
        onReview={() => {}}
        onReturn={() => {}}
      />,
    );
    expect(html).toContain("修改 Return Note");
    expect(html).not.toContain("先填写 Return Note");
  });

  it("offers the exit to the site once approved, and the confirmation to the office after it", () => {
    pathname = "/field-staff";
    const approved = render(
      <OutgoingActions row={outgoing({ status: "APPROVED", has_return_note: true })} pending={false} onReview={() => {}} onReturn={() => {}} />,
    );
    expect(approved).toContain("实际退场（双方签名）");
    const processed = render(
      <OutgoingActions row={outgoing({ status: "PROCESSED", has_return_note: true })} pending={false} onReview={() => {}} onReturn={() => {}} />,
    );
    expect(processed).toContain("确认退场完成");
  });

  it("never offers the exit in the office console, which is told it waits for the site (2026-10-09)", () => {
    // 「后台是不应该显示实际退场的，只有手机端可以看得到而已」 - a placement
    // rule: this account may submit, and still the office does not offer it.
    pathname = "/material-outgoing";
    const office = render(
      <OutgoingActions row={outgoing({ status: "APPROVED", has_return_note: true })} pending={false} onReview={() => {}} />,
    );
    expect(office).not.toContain("实际退场（双方签名）");
    expect(office).toContain(zh.contractorOps.outgoing.waitingForSite);
    pathname = "/field-staff";
  });
});

describe("the note as filled", () => {
  it("reads back as one block with the approver", () => {
    const html = render(
      <ReturnNotePanel
        row={outgoing({
          has_return_note: true,
          return_note_no: "RN-SITE-261007-001",
          return_note_at: "2026-10-07T03:00:00Z",
          return_note_material: "钢筋 T12",
          return_note_delivery_note_no: "DO-778",
          return_note_supplier_name: "Rebar Supply",
          return_note_quantity: "2.000",
          return_note_unit: "TONNE",
          return_note_reason: "Surplus",
          approver_name: "Mr Tan",
        })}
      />,
    );
    for (const text of ["RN-SITE-261007-001", "钢筋 T12", "DO-778", "Rebar Supply", "Mr Tan"]) {
      expect(html).toContain(text);
    }
  });

  it("says when there is none yet", () => {
    expect(render(<ReturnNotePanel row={outgoing()} />)).toContain("还没有 Return Note");
  });
});

describe("the status words (C9)", () => {
  it.each([
    ["zh", zh, "已批准 / 等待退场", "待后台确认"],
    ["zh-TW", zhTW, "已批准 / 等待退場", "待後台確認"],
    ["en", en, "Approved / waiting to leave site", "Waiting for office confirmation"],
    ["ms", ms, "Diluluskan / menunggu keluar tapak", "Menunggu pengesahan pejabat"],
  ])("%s", (_, catalogue, approved, processed) => {
    expect(catalogue.contractorOps.outgoingStatus.APPROVED).toBe(approved);
    expect(catalogue.contractorOps.outgoingStatus.PROCESSED).toBe(processed);
  });
});
