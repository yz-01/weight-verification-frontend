/**
 * 设备退场 like 设备进场 (2026-10 Q27, F3) on screen.
 *
 * Lucas, 2026-10-08: 「设备退场也不用申请、不用 Return Note，跟设备进场一样」.
 * On the phone the worker picks 退场, then a machine on site, and gives the
 * entry's evidence - photos, DO No. (required), the supplier's QR, both
 * signatures, GPS - with an optional reason; nothing about classes, quantity,
 * units or applying. In the office the exit is accepted like an entry, with
 * 不通过 behind a switch.
 *
 * Rendered to static markup (the runner has no DOM), with the dialog and the
 * dropdown drawn inline so what they offer can be read.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EquipmentMovement, SiteEquipment } from "@/interfaces/contractor-ops";
import messages from "@/messages/zh.json";

const reader: { fieldStaff: boolean; codes: string[]; search: string } = {
  fieldStaff: true,
  codes: [],
  search: "",
};

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Ah Meng", is_field_staff: reader.fieldStaff },
    can: (code: string) => reader.codes.includes(code),
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(reader.search),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/field-staff",
}));
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
// The dropdown drawn open, so its choices can be read.
vi.mock("@/components/ui/select", async (importOriginal) => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ...(await importOriginal<typeof import("@/components/ui/select")>()),
    Select: Pass,
    SelectTrigger: ({ children, ...rest }: { children?: React.ReactNode; "data-testid"?: string }) => (
      <div data-testid={rest["data-testid"]}>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span data-placeholder>{placeholder}</span>,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <ul data-options>{children}</ul>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
      <li data-option={value}>{children}</li>
    ),
  };
});

const { SiteEquipmentWorkspace, EquipmentEntryDialog } = await import(
  "@/components/contractor-ops/operations-workspaces"
);
const { MovementAcceptance, EquipmentMovementActions } = await import(
  "@/components/contractor-ops/equipment-applications"
);

function machine(overrides: Partial<SiteEquipment> = {}): SiteEquipment {
  return {
    id: "m-1",
    project: "p-1",
    project_name: "Site",
    code: "EQ-SITE-001",
    name: "Excavator",
    serial_no: "",
    registration_no: "WXY 1234",
    supplier: null,
    supplier_name: null,
    category: "c-sub",
    category_name: "挖土机",
    category_parent: "c-major",
    category_parent_name: "重型机械",
    description: "",
    status: "ON_SITE",
    certificate_expires_on: null,
    insurance_expires_on: null,
    road_tax_expires_on: null,
    is_active: true,
    needs_profile: false,
    movement_count: 1,
    quantity_on_site: "1.000",
    awaiting_acceptance: null,
    created_at: "2026-10-07T01:00:00Z",
    updated_at: "2026-10-07T01:00:00Z",
    ...overrides,
  } as SiteEquipment;
}

function movement(overrides: Partial<EquipmentMovement> = {}): EquipmentMovement {
  return {
    id: "mv-9",
    project: "p-1",
    project_name: "Site",
    equipment: "m-1",
    equipment_code: "EQ-SITE-001",
    equipment_name: "Excavator",
    equipment_registration_no: "WXY 1234",
    equipment_needs_profile: false,
    equipment_profile_missing: [],
    direction: "EXIT",
    status: "SUBMITTED",
    occurred_at: "2026-10-08T01:00:00Z",
    original_occurred_at: "2026-10-08T01:00:00Z",
    uploaded_at: "2026-10-08T01:00:00Z",
    quantity: "1.000",
    unit: "UNIT",
    supplier_name: "Crane Hire",
    delivery_note_no: "DO-9",
    vehicle_plate: "WXY 1234",
    operator_name: "Ah Meng",
    latitude: "3.1390000",
    longitude: "101.6869000",
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
const words = messages.contractorOps;

/** The <li> choices the dropdown offers. */
function options(html: string) {
  return [...html.matchAll(/<li data-option="([^"]*)">([^<]*)<\/li>/g)].map((match) => ({
    value: match[1],
    label: match[2],
  }));
}

beforeEach(() => {
  reader.fieldStaff = true;
  reader.codes = ["equipment.capture", "equipment.view"];
  reader.search = "";
});

describe("the phone's 退场 offers the machines on site, and never says 申请 (Q27, F3)", () => {
  const rows = [
    machine(),
    machine({ id: "m-2", code: "EQ-SITE-002", name: "Crane", registration_no: "JKL 1", awaiting_acceptance: "EXIT" }),
    machine({ id: "m-3", code: "EQ-SITE-003", name: "Lorry", registration_no: "VBN 8", status: "OFF_SITE", quantity_on_site: "0" }),
  ];

  it("lists only what is on site, says which exit already waits, and offers no 新设备", () => {
    reader.search = "direction=EXIT";
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page(rows)],
    ]);
    expect(options(html)).toEqual([
      { value: "m-1", label: "Excavator · WXY 1234" },
      { value: "m-2", label: `Crane · JKL 1 · ${words.equipment.exitWaiting}` },
    ]);
    expect(html).toContain(words.equipment.chooseOnSiteMachine);
    expect(html).toContain('aria-pressed="true"');
    for (const absent of ["申请", "分类", words.equipment.newMachine, words.field.quantity]) {
      expect(html).not.toContain(absent);
    }
  });

  it("the 进场 side keeps 「新设备」 first and offers the machines not on site", () => {
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page(rows)],
    ]);
    expect(options(html).map((row) => row.value)).toEqual(["__new__", "m-3"]);
    expect(html).not.toContain("申请");
  });

  it("says so when nothing is on site", () => {
    reader.search = "direction=EXIT";
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page([rows[2]])],
    ]);
    expect(options(html)).toEqual([]);
    expect(html).toContain(words.equipment.noMachineOnSite);
  });
});

describe("the phone's exit form is the entry's (Q27, F3)", () => {
  it("asks for photos, the DO, the supplier's QR, both signatures, GPS and an optional reason", () => {
    const html = render(
      <EquipmentEntryDialog direction="EXIT" project="p-1" machine={machine()} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(html).toContain("记录 Excavator · WXY 1234 退场");
    expect(html).toContain(words.equipment.exitHelp);
    expect(html).toContain(words.field.deliveryNoteNo);
    expect(html).toContain(words.equipment.scanSupplier);
    expect(html).toContain(words.equipment.siteSignature);
    expect(html).toContain(words.equipment.supplierSignature);
    expect(html).toContain(words.field.location);
    expect(html).toContain(words.equipment.exitReason);
    expect(html).toContain(words.equipment.exitSubmit);
    for (const absent of [
      "分类", "类别", "小类", words.field.quantity, words.field.unit, "申请",
      words.equipment.newMachineName, words.equipment.entrySubmit,
    ]) {
      expect(html).not.toContain(absent);
    }
  });

  it("will not submit without the DO number", () => {
    const html = render(
      <EquipmentEntryDialog direction="EXIT" project="p-1" machine={machine()} onClose={() => {}} onSaved={() => {}} />,
    );
    // The submit button names what is still missing; the DO number is one.
    const submit = html.slice(0, html.indexOf(`${words.equipment.exitSubmit}</button>`));
    const reason = submit.slice(submit.lastIndexOf('title="'));
    expect(reason).toContain(words.field.deliveryNoteNo);
    expect(reason).not.toContain(words.equipment.exitReason);
  });
});

describe("the office accepts an exit like an entry (Q27)", () => {
  beforeEach(() => {
    reader.fieldStaff = false;
    reader.codes = ["equipment.manage", "equipment.view", "equipment.capture"];
  });

  it("offers 验收通过 and keeps 不通过 behind a switch", () => {
    const html = render(<MovementAcceptance movement={movement()} onDone={() => {}} />);
    const acceptance = words.equipment.acceptance;
    expect(html).toContain(acceptance.exitTitle);
    expect(html).toContain(acceptance.accept);
    expect(html).toContain(acceptance.exitHelp);
    expect(html).toContain('role="switch"');
    expect(html).toContain(acceptance.armRejectExit);
    expect(html).not.toContain(`>${acceptance.reject}<`);
    expect(html).not.toContain(acceptance.title);
  });

  it("asks no profile of a machine going out", () => {
    const html = render(
      <MovementAcceptance
        movement={movement({ equipment_needs_profile: true, equipment_profile_missing: ["category"] })}
        onDone={() => {}}
        onCompleteProfile={() => {}}
      />,
    );
    expect(html).not.toContain(words.equipment.acceptance.completeProfile);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*验收通过/);
  });

  it("shows nothing to decide once it is decided", () => {
    for (const status of ["COMPLETED", "REJECTED"] as const) {
      const html = render(<MovementAcceptance movement={movement({ status })} onDone={() => {}} />);
      expect(html).toBe("");
    }
  });

  it("an old approved exit application is handed over directly", () => {
    const html = render(
      <EquipmentMovementActions
        movement={movement({ status: "APPROVED" })}
        onDone={() => {}}
        onHandover={() => {}}
      />,
    );
    expect(html).toContain(words.equipment.directHandover);
    expect(html).toContain(words.equipment.directHandoverHelp);
  });
});
