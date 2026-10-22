/**
 * 设备退场 like 材料退场 on screen (2026-10 I13, ID30; I22, ID56; I24, ID60).
 *
 * The client, 2026-10-13: 「手机端的设备退场流程是和材料出场是一样的流程，现有出场
 * 流程倒反了」, and 10-15: 「先拍照申请，批准了再安排球场拍照扫二维码双方签名
 * 提交」. On the phone the worker picks 退场 and a machine on site and applies
 * (why, a photo); once the office has approved it on its Return Note the phone
 * offers 实际退场 - this machine's QR scanned, photos, DO, both signatures, GPS.
 * In the office the application is decided on the Return Note (approve waits
 * for it; 退回 sits behind a switch), and the exit recorded on site is
 * confirmed like an entry. No red stars on the phone (I22).
 *
 * Rendered to static markup (the runner has no DOM), with the dialog and the
 * dropdown drawn inline so what they offer can be read.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/interfaces/api";
import type { EquipmentMovement, SiteEquipment } from "@/interfaces/contractor-ops";
import { EXIT_STATUSES, exitStep, movementStatusKey, offersEquipmentExit } from "@/lib/equipment-exit";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import messages from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

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
const { EquipmentExitApplyDialog, EquipmentExitHandoverForm, errorText } = await import(
  "@/components/contractor-ops/equipment-exit"
);
const { MovementAcceptance, EquipmentMovementActions, ExitApplicationActions } = await import(
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
    open_exit: null,
    site_no: "",
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
    notes: "Hire ended",
    ocr_status: "MANUAL",
    ocr_result: {},
    ocr_confirmed_by: null,
    ocr_confirmed_at: null,
    client_event_id: "",
    photos: [],
    has_return_note: false,
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
const exitWords = words.equipmentExit;

/** The <li> choices the dropdown offers. */
function options(html: string) {
  return [...html.matchAll(/<li data-option="([^"]*)">([^<]*)<\/li>/g)].map((match) => ({
    value: match[1],
    label: match[2],
  }));
}

/** A red star: FieldWrapper's and the signature pad's. */
const RED_STAR = /text-destructive[^"]*">\*<\/span>/;

/** What the submit button with `label` says is still missing. */
function missingFor(html: string, label: string) {
  const before = html.slice(0, html.indexOf(`${label}</button>`));
  return before.slice(before.lastIndexOf('title="'));
}

beforeEach(() => {
  reader.fieldStaff = true;
  reader.codes = ["equipment.capture", "equipment.view"];
  reader.search = "";
});

describe("an exit's states read like material leaving site (I13)", () => {
  it("names every exit state, in all four languages", () => {
    for (const catalogue of [messages, zhTW, en, ms]) {
      for (const status of EXIT_STATUSES) {
        const key = movementStatusKey("EXIT", status);
        expect(key).toBe(`equipmentExit.status.${status}`);
        expect(catalogue.contractorOps.equipmentExit.status[status]).toBeTruthy();
      }
    }
    expect(exitWords.status.APPROVED).toBe("已批准，等待退场");
    expect(exitWords.status.SUBMITTED).toBe("已退场，待后台确认");
  });

  it("an entry keeps its own words", () => {
    expect(movementStatusKey("ENTRY", "SUBMITTED")).toBe("equipmentMovementStatus.SUBMITTED");
    expect(movementStatusKey("ENTRY", undefined)).toBe("equipmentMovementStatus.COMPLETED");
    expect(movementStatusKey("EXIT", "UNKNOWN")).toBe("equipmentMovementStatus.UNKNOWN");
  });

  it("offers the next step only", () => {
    expect(exitStep(null)).toBe("apply");
    expect(exitStep({ status: "PENDING" })).toBe("awaitingApproval");
    expect(exitStep({ status: "APPROVED" })).toBe("leave");
    expect(exitStep({ status: "SUBMITTED" })).toBe("awaitingOffice");
  });

  it("opens the actual exit from 我提交过的 only when approved", () => {
    const row = { kind: "EQUIPMENT_MOVEMENT", status: "EXIT" };
    expect(offersEquipmentExit({ ...row, movement_status: "APPROVED" })).toBe(true);
    for (const status of ["PENDING", "SUBMITTED", "RETURNED", "COMPLETED"]) {
      expect(offersEquipmentExit({ ...row, movement_status: status })).toBe(false);
    }
    expect(offersEquipmentExit({ kind: "EQUIPMENT_MOVEMENT", status: "ENTRY", movement_status: "APPROVED" })).toBe(false);
    expect(offersEquipmentExit({ kind: "MATERIAL_OUTGOING", status: "APPROVED" })).toBe(false);
  });
});

describe("the phone's 退场 offers the machines on site and the step each is at", () => {
  const rows = [
    machine(),
    machine({ id: "m-2", code: "EQ-SITE-002", name: "Crane", registration_no: "JKL 1", open_exit: { id: "x-2", status: "PENDING" } }),
    machine({ id: "m-4", code: "EQ-SITE-004", name: "Roller", registration_no: "RRR 4", open_exit: { id: "x-4", status: "APPROVED" } }),
    machine({ id: "m-3", code: "EQ-SITE-003", name: "Lorry", registration_no: "VBN 8", status: "OFF_SITE", quantity_on_site: "0" }),
  ];

  it("lists only what is on site, says where each exit stands, and offers no 新设备", () => {
    reader.search = "direction=EXIT";
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page(rows)],
    ]);
    expect(options(html)).toEqual([
      { value: "m-1", label: "Excavator · WXY 1234" },
      { value: "m-2", label: `Crane · JKL 1 · ${exitWords.status.PENDING}` },
      { value: "m-4", label: `Roller · RRR 4 · ${exitWords.status.APPROVED}` },
    ]);
    expect(html).toContain(words.equipment.chooseOnSiteMachine);
    expect(html).toContain(exitWords.scanToChoose);
    expect(html).not.toContain(words.equipment.newMachine);
    expect(html).not.toMatch(RED_STAR);
  });

  it("a machine with no exit under way is applied for", () => {
    reader.search = "direction=EXIT&machine=m-1";
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page(rows)],
    ]);
    expect(html).toContain('data-testid="field-equipment-next-step"');
    expect(html).toContain(`${exitWords.apply}</button>`);
    expect(html).not.toContain(`${exitWords.handover}</button>`);
  });

  it("an application waiting for the office offers nothing more", () => {
    reader.search = "direction=EXIT&machine=m-2";
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page(rows)],
    ]);
    expect(html).not.toContain(`${exitWords.apply}</button>`);
    expect(html).toContain(`<span class="text-sm text-warning">${exitWords.status.PENDING}</span>`);
  });

  it("an approved exit offers 实际退场", () => {
    reader.search = "direction=EXIT&machine=m-4";
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page(rows)],
    ]);
    expect(html).toContain(`${exitWords.handover}</button>`);
  });

  it("the 进场 side keeps 「新设备」 first and has no red stars (I22)", () => {
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page(rows)],
    ]);
    expect(options(html).map((row) => row.value)).toEqual(["__new__", "m-3"]);
    expect(html).not.toContain("申请");
    expect(html).not.toMatch(RED_STAR);
    expect(html).toContain(words.equipment.chooseMachineHint);
  });

  it("says so when nothing is on site", () => {
    reader.search = "direction=EXIT";
    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page([rows[3]])],
    ]);
    expect(options(html)).toEqual([]);
    expect(html).toContain(words.equipment.noMachineOnSite);
  });
});

describe("applying asks why and a photo, nothing else (I13 step 1)", () => {
  it("asks for the reason and a photo, with no red star, and says what is missing", () => {
    const html = render(
      <EquipmentExitApplyDialog project="p-1" machine={machine()} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(html).toContain(exitWords.reason);
    expect(html).toContain(exitWords.reasonHint);
    expect(html).toContain(exitWords.applyPhotos);
    expect(html).toContain(exitWords.applyPhotosHint);
    expect(html).not.toMatch(RED_STAR);
    const missing = missingFor(html, exitWords.applySubmit);
    expect(missing).toContain(exitWords.reason);
    expect(missing).toContain(exitWords.applyPhotos);
    for (const absent of [words.field.deliveryNoteNo, words.equipment.supplierSignature, "分类", words.field.quantity]) {
      expect(html).not.toContain(absent);
    }
  });
});

describe("the actual exit scans this machine (I13 step 3, ID60)", () => {
  it("asks for the machine's QR, photos, the plate, both signatures and GPS - no DO, no red stars", () => {
    const html = render(
      <EquipmentExitHandoverForm
        movementId="x-4"
        project="p-1"
        machine={machine()}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).toContain(exitWords.scanMachine);
    expect(html).toContain(exitWords.scanMachineHint);
    // No DO number or DO photo at the actual exit (J38-3).
    expect(html).not.toContain(words.field.deliveryNoteNo);
    expect(html).not.toContain(words.equipment.deliveryNotePhoto);
    // A machine with no supplier of its own: scanned or picked (J38-4).
    expect(html).toContain(words.equipment.scanSupplier);
    // J13-4: or picked from the list.
    expect(html).toContain(exitWords.supplierPick);
    // J13-3: the lorry's plate is typed; the register's is only a hint.
    expect(html).toContain(exitWords.vehiclePlate);
    expect(html).toContain('placeholder="WXY 1234"');
    expect(html).not.toContain('value="WXY 1234"');
    expect(html).toContain(words.equipment.siteSignature);
    expect(html).toContain(words.equipment.supplierSignature);
    expect(html).toContain(words.field.location);
    expect(html).not.toMatch(RED_STAR);
    const missing = missingFor(html, exitWords.handoverSubmit);
    for (const needed of [
      exitWords.scanMachine,
      words.field.photos,
      exitWords.vehiclePlate,
      words.equipment.siteSignature,
      words.equipment.supplierSignature,
      words.field.location,
    ]) {
      expect(missing).toContain(needed);
    }
    expect(missing).not.toContain(words.field.deliveryNoteNo);
    // J13-1: on a phone the same list is written above the button, not only
    // in a tooltip the phone never shows.
    expect(html).toContain('data-slot="button-reason"');
  });

  it("brings the machine's own supplier, read-only, with nothing to scan (J38-4)", () => {
    const html = render(
      <EquipmentExitHandoverForm
        movementId="x-5"
        project="p-1"
        machine={machine({ supplier: "s-9", supplier_name: "Crane Hire Sdn Bhd" })}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).toContain(exitWords.supplierFromMachine);
    expect(exitWords.supplierFromMachine).toBe("供应商（从设备带出）");
    expect(html).toContain("Crane Hire Sdn Bhd");
    expect(html).toContain('data-testid="exit-machine-supplier"');
    expect(html).not.toContain(words.equipment.scanSupplier);
    expect(html).not.toContain(exitWords.supplierPick);
  });
});

describe("the entry has no red stars either (I22, ID56)", () => {
  it("still names what is missing on its button", () => {
    const html = render(
      <EquipmentEntryDialog project="p-1" machine={machine({ status: "OFF_SITE" })} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(html).not.toMatch(RED_STAR);
    const missing = missingFor(html, words.equipment.entrySubmit);
    expect(missing).toContain(words.field.deliveryNoteNo);
    expect(missing).toContain(words.equipment.siteSignature);
    expect(html).toContain(words.equipment.photosHint);
  });
});

describe("the office decides the application on its Return Note (I13 step 2)", () => {
  beforeEach(() => {
    reader.fieldStaff = false;
    reader.codes = ["equipment.manage", "equipment.view", "equipment.capture"];
  });

  it("keeps 批准 off until the note is filled, and 退回 behind a switch", () => {
    const html = render(
      <ExitApplicationActions movement={movement({ status: "PENDING" })} onDone={() => {}} />,
    );
    expect(html).toContain(words.returnNote.fill);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*批准/);
    expect(html).toContain(words.returnNote.needNoteFirst);
    expect(html).toContain('role="switch"');
    expect(html).toContain(exitWords.office.armReturn);
    expect(html).not.toContain(`>${exitWords.office.return}<`);
  });

  it("approves once the note is in", () => {
    const html = render(
      <ExitApplicationActions movement={movement({ status: "PENDING", has_return_note: true, return_note_no: "RN-EQ-1" })} onDone={() => {}} />,
    );
    expect(html).toContain(words.returnNote.edit);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*批准/);
  });

  it("an approved exit waits for the site, and nothing else is decided on it", () => {
    const html = render(
      <EquipmentMovementActions movement={movement({ status: "APPROVED" })} onDone={() => {}} onHandover={() => {}} />,
    );
    expect(html).toContain(exitWords.office.waitingForSite);
    // Never handed over directly any more (I13).
    expect(html).not.toContain(words.equipment.directHandover);
  });

  it("a returned or finished application offers nothing", () => {
    for (const status of ["RETURNED", "COMPLETED", "REJECTED"] as const) {
      expect(render(<ExitApplicationActions movement={movement({ status })} onDone={() => {}} />)).toBe("");
    }
  });
});

describe("a broken QR: the number is typed (P-phonefix)", () => {
  it("offers 「二维码坏了 / 还没有贴？输入编号」 under the scan button", () => {
    const html = render(
      <EquipmentExitHandoverForm
        movementId="x-4"
        project="p-1"
        machine={machine()}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(html).toContain(exitWords.brokenQr);
    expect(exitWords.brokenQr).toBe("二维码坏了 / 还没有贴？输入编号");
  });

  it("the office sees that the number was typed, not scanned", () => {
    reader.fieldStaff = false;
    reader.codes = ["equipment.manage"];
    const typed = render(<MovementAcceptance movement={movement({ equipment_typed: true })} onDone={() => {}} />);
    expect(typed).toContain(exitWords.typedNotScanned);
    const scanned = render(<MovementAcceptance movement={movement()} onDone={() => {}} />);
    expect(scanned).not.toContain(exitWords.typedNotScanned);
  });

  it("every language has the typed-number words", () => {
    for (const catalogue of [messages, zhTW, en, ms]) {
      const exit = catalogue.contractorOps.equipmentExit as unknown as Record<string, unknown>;
      for (const key of ["brokenQr", "typeNumber", "useNumber", "typedMatched", "typedWrongMachine", "typedNotScanned"]) {
        expect(exit[key], key).toBeTruthy();
      }
    }
  });
});

describe("a failed submit speaks the phone's language (P-phonefix)", () => {
  it("says the translated sentence of a coded failure, not the server's English field errors", () => {
    const failure = new ApiError("这台设备不在现场。", 409, { equipment: "Not on site." }, "equipment_not_on_site");
    expect(errorText(failure, "fallback")).toBe("这台设备不在现场。");
  });

  it("falls back to the field errors when there is no code", () => {
    const failure = new ApiError("", 400, { delivery_note_no: "请填 DO 号码。" });
    expect(errorText(failure, "fallback")).toBe("请填 DO 号码。");
    expect(errorText(new Error("x"), "fallback")).toBe("fallback");
  });
});

describe("the office confirms the exit recorded on site (I13 step 4)", () => {
  beforeEach(() => {
    reader.fieldStaff = false;
    reader.codes = ["equipment.manage", "equipment.view", "equipment.capture"];
  });

  it("offers 验收通过 and keeps 不通过 behind a switch", () => {
    const html = render(<MovementAcceptance movement={movement()} onDone={() => {}} />);
    const acceptance = words.equipment.acceptance;
    expect(html).toContain(acceptance.exitTitle);
    expect(html).toContain(exitWords.status.SUBMITTED);
    expect(html).toContain(acceptance.accept);
    expect(html).toContain(acceptance.exitHelp);
    expect(html).toContain('role="switch"');
    expect(html).toContain(acceptance.armRejectExit);
    expect(html).not.toContain(`>${acceptance.reject}<`);
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
  });

  it("shows nothing to decide once it is decided", () => {
    for (const status of ["COMPLETED", "REJECTED"] as const) {
      const html = render(<MovementAcceptance movement={movement({ status })} onDone={() => {}} />);
      expect(html).toBe("");
    }
  });

  it("an old entry application is still handed over directly", () => {
    const html = render(
      <EquipmentMovementActions
        movement={movement({ direction: "ENTRY", status: "APPROVED" })}
        onDone={() => {}}
        onHandover={() => {}}
      />,
    );
    expect(html).toContain(words.equipment.directHandover);
  });
});
