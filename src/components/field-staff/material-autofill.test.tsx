/**
 * The phone fills itself in from the category (2026-10 A4, D1, Q1, Q13).
 *
 * The office sets 「钢筋」 up once: unit 吨, supplier A, designated
 * manufacturer A. On the phone the unit is shown and not asked, the only
 * supplier and the only manufacturer are filled in and say so, a category with
 * two suppliers offers only those two, and a manufacturer the category does
 * not designate is marked 「非指定厂商」 without stopping the submission.
 *
 * Rendered to static markup like the other screen tests - the runner has no
 * DOM - with the draft seeded the way choosing the category leaves it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/zh.json";

const drafts: Record<string, unknown> = {};

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-site", full_name: "Ah Seng", is_field_staff: true },
    can: () => true,
  }),
}));

vi.mock("@/components/field-staff/field-draft", () => ({
  FieldDraft: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useClearDraft: () => () => {},
  useDraftState: (key: string, initial?: unknown) => [
    key in drafts ? drafts[key] : typeof initial === "function" ? (initial as () => unknown)() : initial,
    () => {},
  ],
}));

const { MaterialCapturePanel } = await import("@/components/field-staff/field-records-panel");

const SUPPLIER_A = { id: "s-a", code: "SA", name: "Supplier A", is_active: true };
const SUPPLIER_B = { id: "s-b", code: "SB", name: "Supplier B", is_active: true };
const MAKER_A = { id: "m-a", name: "Maker A", is_active: true };
const MAKER_B = { id: "m-b", name: "Maker B", is_active: true };

function steel(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-steel",
    project: "p-1",
    name: "钢筋",
    code: "STEEL",
    kind: "MATERIAL",
    is_active: true,
    can_upload: true,
    default_unit: "TONNE",
    default_unit_label: null,
    suppliers: [SUPPLIER_A.id],
    supplier_options: [SUPPLIER_A],
    manufacturers: [MAKER_A.id],
    manufacturer_options: [MAKER_A],
    ...overrides,
  };
}

function render(column: Record<string, unknown>, draft: Record<string, unknown>) {
  drafts.material = {
    project: "p-1",
    supplier: "",
    category: column.id,
    movementType: "ENTRY",
    returnReason: "",
    returnReasonOther: "",
    materialName: "Rebar",
    materialSpecification: "",
    quantity: "12",
    unit: "M3",
    totalWeightKg: "",
    vehiclePlate: "",
    deliveryNoteNo: "",
    documentAmount: "",
    notes: "",
    manufacturer: "",
    ...draft,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const page = <T,>(results: T[]) => ({ results, count: results.length });
  client.setQueryData(["projects", "options"], page([{ id: "p-1", code: "SITE", name: "Site" }]));
  client.setQueryData(["project-categories", "field-material", "p-1"], page([column]));
  client.setQueryData(["suppliers", "field-material"], page([SUPPLIER_A, SUPPLIER_B]));
  client.setQueryData(["qr-codes", "field-material"], page([]));
  client.setQueryData(["material-units", "active"], [
    { id: "u-t", code: "TONNE", label: "Tonne", sort_order: 0, is_active: true, built_in: true },
    { id: "u-m", code: "M3", label: "Cubic metre", sort_order: 2, is_active: true, built_in: true },
  ]);
  client.setQueryData(["material-units", "all"], []);
  client.setQueryData(["manufacturers", "picker", ""], page([MAKER_A, MAKER_B]));
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>
          <MaterialCapturePanel initialProject="p-1" onSaved={() => {}} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("choosing 钢筋 on the phone (A4, D1, Q1)", () => {
  beforeEach(() => {
    for (const key of Object.keys(drafts)) delete drafts[key];
  });

  it("shows the category's unit instead of asking, whatever the draft had", () => {
    const html = render(steel(), { supplier: SUPPLIER_A.id, manufacturer: MAKER_A.id });
    // 吨 is shown in a read-only box, with where it came from.
    expect(html).toMatch(/<span class="text-sm font-medium">吨<\/span>/);
    expect(html).toContain("按分类自动带出");
    // No unit picker: the draft's 立方米 is not what is shown or sent.
    expect(html).not.toContain(">立方米<");
  });

  it("names the only supplier and the only manufacturer as filled in from the category", () => {
    const html = render(steel(), { supplier: SUPPLIER_A.id, manufacturer: MAKER_A.id });
    expect(html.match(/按分类自动带出/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Maker A");
    expect(html).not.toContain("非指定厂商");
  });

  it("says only this category's suppliers are offered when it names two", () => {
    const html = render(
      steel({ suppliers: [SUPPLIER_A.id, SUPPLIER_B.id], supplier_options: [SUPPLIER_A, SUPPLIER_B] }),
      {},
    );
    expect(html).toContain("只列这个分类设定的供应商");
  });

  it("flags a manufacturer the category does not designate, and still lets it be submitted", () => {
    const html = render(steel(), { supplier: SUPPLIER_A.id, manufacturer: MAKER_B.id });
    expect(html).toContain("Maker B");
    expect(html).toContain("非指定厂商");
    expect(html).toContain("这个分类指定了其他厂商，仍然可以提交。");
    // Not a missing field: the manufacturer is never what holds 提交 back.
    expect(html).not.toMatch(/还差这些没填：[^<]*制造厂商/);
  });

  it("leaves the unit to the worker on a category the office has not set up", () => {
    const html = render(
      steel({ default_unit: "", supplier_options: [], suppliers: [], manufacturer_options: [], manufacturers: [] }),
      { unit: "M3" },
    );
    expect(html).not.toContain("按分类自动带出");
    expect(html).not.toContain("只列这个分类设定的供应商");
  });
});
