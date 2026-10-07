/**
 * 2026-10 B2, A8, C8, F3 on screen: the office sets each machine up once; on
 * the phone the worker picks it, takes the photos, the DO, both signatures,
 * and submits - no applying, no categories.
 *
 * Rendered to static markup (the runner has no DOM), with the dialog
 * primitives drawn inline so what a dialog asks for can be read.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EquipmentMovement, ProjectCategory, SiteEquipment } from "@/interfaces/contractor-ops";
import messages from "@/messages/zh.json";

const reader: { fieldStaff: boolean; codes: string[] } = { fieldStaff: true, codes: [] };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Ah Meng", is_field_staff: reader.fieldStaff },
    can: (code: string) => reader.codes.includes(code),
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/field-staff",
}));
// Dialogs drawn inline (Radix portals need a DOM); a closed one draws nothing.
vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open = true, children }: { open?: boolean; children?: React.ReactNode }) =>
      open ? <div data-dialog>{children}</div> : null,
    DialogContent: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

const { SiteEquipmentWorkspace, EquipmentDialog, EquipmentEntryDialog, machineLabeller } = await import(
  "@/components/contractor-ops/operations-workspaces"
);
const { EntryAcceptance, EquipmentMovementActions } = await import(
  "@/components/contractor-ops/equipment-applications"
);
const { equipmentClassTree } = await import("@/components/contractor-ops/equipment-classes");

function machine(overrides: Partial<SiteEquipment> = {}): SiteEquipment {
  return {
    id: "m-1",
    project: "p-1",
    project_name: "Site",
    code: "EQ-SITE-001",
    name: "Excavator",
    serial_no: "SER-9",
    registration_no: "WXY 1234",
    supplier: null,
    supplier_name: null,
    category: "c-sub",
    category_name: "挖土机",
    category_parent: "c-major",
    category_parent_name: "重型机械",
    description: "",
    status: "OFF_SITE",
    certificate_expires_on: null,
    insurance_expires_on: null,
    road_tax_expires_on: null,
    is_active: true,
    needs_profile: false,
    movement_count: 0,
    quantity_on_site: "0",
    created_at: "2026-10-07T01:00:00Z",
    updated_at: "2026-10-07T01:00:00Z",
    ...overrides,
  } as SiteEquipment;
}

function movement(overrides: Partial<EquipmentMovement> = {}): EquipmentMovement {
  return {
    id: "mv-1",
    project: "p-1",
    project_name: "Site",
    equipment: "m-1",
    equipment_code: "EQ-SITE-001",
    equipment_name: "Excavator",
    equipment_registration_no: "WXY 1234",
    equipment_needs_profile: false,
    equipment_profile_missing: [],
    direction: "ENTRY",
    status: "SUBMITTED",
    occurred_at: "2026-10-07T01:00:00Z",
    original_occurred_at: "2026-10-07T01:00:00Z",
    uploaded_at: "2026-10-07T01:00:00Z",
    quantity: "1.000",
    unit: "UNIT",
    supplier_name: null,
    delivery_note_no: "DO-1",
    vehicle_plate: "WXY 1234",
    operator_name: "Ah Meng",
    latitude: null,
    longitude: null,
    accuracy_m: null,
    notes: "",
    ocr_status: "MANUAL",
    ocr_result: {},
    ocr_confirmed_by: null,
    ocr_confirmed_at: null,
    client_event_id: "",
    photos: [],
    ...overrides,
  };
}

function category(id: string, name: string, parent: string | null, order = 0): ProjectCategory {
  return { id, name, parent, parent_name: null, sort_order: order, is_active: true, code: id, kind: "EQUIPMENT" } as ProjectCategory;
}

function render(node: React.ReactNode, cache: [readonly unknown[], unknown][] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of cache) client.setQueryData(key, data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const page = <T,>(results: T[]) => ({ results, count: results.length, page: 1, page_size: 200, total_pages: 1 });

beforeEach(() => {
  reader.fieldStaff = true;
  reader.codes = ["equipment.capture", "equipment.view"];
});

describe("the phone's 设备进退场 is a dropdown, with no category and no application (A9, F3)", () => {
  it("labels each machine 「名称 · 车牌」, the code only to tell twins apart", () => {
    const rows = [
      machine(),
      machine({ id: "m-2", name: "Lorry", registration_no: "" }),
      machine({ id: "m-3", code: "EQ-SITE-003", name: "Crane", registration_no: "JKL 1" }),
      machine({ id: "m-4", code: "EQ-SITE-004", name: "Crane", registration_no: "JKL 1" }),
    ];
    const label = machineLabeller(rows);
    expect(label(rows[0])).toBe("Excavator · WXY 1234");
    expect(label(rows[1])).toBe("Lorry");
    expect(label(rows[2])).toBe("Crane · JKL 1 (EQ-SITE-003)");
  });

  it("shows the project locked and one machine dropdown, never 分类 or 申请", () => {
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page([machine()])],
      [["equipment-movements", "open", "p-1"], []],
    ]);
    expect(html).toContain('data-testid="field-equipment-select"');
    expect(html).toContain(messages.contractorOps.equipment.chooseMachinePlaceholder);
    // No long per-machine list any more (A9).
    expect(html).not.toContain("field-equipment-entry");
    expect(html).not.toContain("分类");
    expect(html).not.toContain("申请");
  });
});

describe("the phone's entry form is 材料进场's (C8, F3)", () => {
  it("asks for photos, the DO, the supplier's QR, both signatures and GPS - no category, quantity or unit", () => {
    const html = render(
      <EquipmentEntryDialog project="p-1" machine={machine()} onClose={() => {}} onSaved={() => {}} />,
    );
    const words = messages.contractorOps;
    expect(html).toContain("Excavator · WXY 1234");
    expect(html).toContain(words.field.deliveryNoteNo);
    expect(html).toContain(words.equipment.scanSupplier);
    expect(html).toContain(words.equipment.siteSignature);
    expect(html).toContain(words.equipment.supplierSignature);
    expect(html).toContain(words.field.location);
    expect(html).toContain(words.equipment.entrySubmit);
    for (const absent of ["分类", "类别", words.field.quantity, words.field.unit, "申请"]) {
      expect(html).not.toContain(absent);
    }
  });

  it("a 「新设备」 gives a name and, optionally, a plate - and still no category", () => {
    const html = render(<EquipmentEntryDialog project="p-1" machine={null} onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain(messages.contractorOps.equipment.newMachineName);
    expect(html).toContain(messages.contractorOps.equipment.newMachineHelp);
    // The plate is asked, not required (not every machine has one).
    expect(html).toMatch(/<label[^>]*>车牌号码<\/label>/);
    expect(html).toContain(messages.contractorOps.equipment.newMachinePlateHelp);
    // Same evidence as a known machine.
    expect(html).toContain(messages.contractorOps.field.deliveryNoteNo);
    expect(html).toContain(messages.contractorOps.equipment.supplierSignature);
    expect(html).not.toContain("分类");
    expect(html).not.toContain("小类");
  });
});

describe("the office registers the machine first (A8, X4)", () => {
  beforeEach(() => {
    reader.fieldStaff = false;
    reader.codes = ["equipment.manage", "equipment.view"];
  });

  it("chooses the project in the dialog and asks for it before the sub class", () => {
    const html = render(<EquipmentDialog project="" onClose={() => {}} onSaved={() => {}} />);
    expect(html).toContain(messages.contractorOps.field.chooseProjectFirst);
    expect(html).toContain(messages.contractorOps.field.plateNo);
    expect(html).toContain(messages.contractorOps.field.roadTaxExpiresOn);
    // The serial number is no longer asked (its data stays).
    expect(html).not.toContain(messages.contractorOps.field.serialNo);
    expect(html).not.toContain(`>${messages.contractorOps.field.registrationNo}<`);
  });

  it("lets the office make a class inline when filing a machine (2026-10-07)", () => {
    const html = render(
      <EquipmentDialog project="p-1" equipment={machine({ needs_profile: true, category: null })} onClose={() => {}} onSaved={() => {}} />,
      [[["project-categories", "equipment", "p-1"], page([])]],
    );
    expect(html).toContain(messages.contractorOps.field.noEquipmentSubClassYet);
    expect(html).toContain(messages.contractorOps.equipment.addClass);
    // No trip to Category Management.
    expect(html).not.toContain("/category-management");
  });

  it("links a machine's profile to its entries and exits (B2)", () => {
    const html = render(<EquipmentDialog project="p-1" equipment={machine()} onClose={() => {}} onSaved={() => {}} />, [
      [["project-categories", "equipment", "p-1"], page([category("c-major", "重型机械", null), category("c-sub", "挖土机", "c-major")])],
    ]);
    expect(html).toContain('href="/site-equipment?equipment=m-1"');
    expect(html).toContain(messages.contractorOps.equipment.movementsLink);
  });

  it("says a 「新设备」 from site needs its profile completed", () => {
    const html = render(
      <EquipmentDialog project="p-1" equipment={machine({ needs_profile: true, category: null })} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(html).toContain(messages.contractorOps.equipment.needsProfileHelp);
  });
});

describe("「新设备」 comes first on the phone (2026-10-07)", () => {
  it("is the first choice in the dropdown, before the machines on file", async () => {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync("src/components/contractor-ops/operations-workspaces.tsx", "utf8");
    const body = code.slice(code.indexOf("export function SiteEquipmentWorkspace("));
    const content = body.slice(body.indexOf("<SelectContent>"), body.indexOf("</SelectContent>"));
    expect(content.indexOf("NEW_MACHINE")).toBeGreaterThan(-1);
    expect(content.indexOf("NEW_MACHINE")).toBeLessThan(content.indexOf("equipment.map"));
  });
});

describe("the sub classes are grouped under their major class (X1)", () => {
  it("orders each major class's sub classes after it", () => {
    const tree = equipmentClassTree([
      category("sub-crane", "吊车", "heavy", 0),
      category("heavy", "重型机械", null, 1),
      category("car", "汽车", "vehicle", 0),
      category("vehicle", "车类", null, 0),
    ]);
    expect(tree.majors.map((row) => row.id)).toEqual(["vehicle", "heavy"]);
    expect(tree.allSubClasses.map((row) => row.id)).toEqual(["car", "sub-crane"]);
  });
});

describe("the office accepts the entry like a delivery (C8)", () => {
  beforeEach(() => {
    reader.fieldStaff = false;
    reader.codes = ["equipment.manage", "equipment.view", "equipment.capture"];
  });

  it("offers 验收通过 and keeps 不通过 behind a switch", () => {
    const html = render(<EntryAcceptance movement={movement()} onDone={() => {}} />);
    const words = messages.contractorOps.equipment.acceptance;
    expect(html).toContain(words.accept);
    expect(html).toContain('role="switch"');
    expect(html).toContain(words.armReject);
    // Not armed: no reject button yet.
    expect(html).not.toContain(`>${words.reject}<`);
  });

  it("blocks acceptance of a 「新设备」 until its profile is complete, and offers to complete it", () => {
    const html = render(
      <EntryAcceptance
        movement={movement({ equipment_needs_profile: true, equipment_profile_missing: ["registration_no", "category", "expiry"] })}
        onDone={() => {}}
        onCompleteProfile={() => {}}
      />,
    );
    const words = messages.contractorOps.equipment.acceptance;
    expect(html).toContain("先补齐档案：车牌号码 / 小类 / 到期日");
    expect(html).toContain(words.completeProfile);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*验收通过/);
  });

  it("an old entry application is handed over directly, not approved", () => {
    const html = render(
      <EquipmentMovementActions movement={movement({ status: "PENDING" })} onDone={() => {}} onHandover={() => {}} />,
    );
    expect(html).toContain(messages.contractorOps.equipment.directHandover);
    expect(html).not.toContain(`>${messages.contractorOps.action.approve}</button>`);
  });

  it("an exit application is still approved or returned (B13, until C9)", () => {
    const html = render(
      <EquipmentMovementActions movement={movement({ direction: "EXIT", status: "PENDING" })} onDone={() => {}} />,
    );
    expect(html).toContain(`${messages.contractorOps.action.approve}</button>`);
    expect(html).not.toContain(messages.contractorOps.equipment.directHandover);
  });
});
