/**
 * Fable's batch-4 audit, equipment part (#2, #4, #5, #15, #22) on screen.
 *
 * Rendered to static markup where the screen is the point, read from source
 * where the point is which component a click reaches.
 */
import { readFileSync } from "node:fs";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { EquipmentMovement } from "@/interfaces/contractor-ops";
import messages from "@/messages/zh.json";

const reader: { codes: string[]; search: string } = { codes: [], search: "" };

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u-1", full_name: "Ah Meng", is_field_staff: true },
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

const { MovementAcceptance } = await import("@/components/contractor-ops/equipment-applications");
const { APPROVAL_PAGE_LINKS } = await import("@/components/dashboard/approval-opener");
const { MySubmissions } = await import("@/components/field-staff/my-submissions");

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

function entry(overrides: Partial<EquipmentMovement> = {}): EquipmentMovement {
  return {
    id: "mv-1", project: "p-1", project_name: "Site", equipment: "m-1",
    equipment_code: "OLD-1", equipment_name: "Old loader", equipment_registration_no: "",
    equipment_needs_profile: false, equipment_profile_missing: [],
    direction: "ENTRY", status: "SUBMITTED",
    occurred_at: "2026-10-08T01:00:00Z", original_occurred_at: "2026-10-08T01:00:00Z",
    uploaded_at: "2026-10-08T01:00:00Z", quantity: "1.000", unit: "UNIT",
    supplier_name: null, delivery_note_no: "DO-1", vehicle_plate: "", operator_name: "Ah Meng",
    latitude: null, longitude: null, accuracy_m: null, notes: "", ocr_status: "MANUAL",
    ocr_result: {}, ocr_confirmed_by: null, ocr_confirmed_at: null, client_event_id: "", photos: [],
    ...overrides,
  };
}

const source = (file: string) => readFileSync(file, "utf8");

beforeEach(() => {
  reader.codes = ["equipment.manage", "equipment.view"];
  reader.search = "";
});

describe("#2: a machine from before B2 can be filed at acceptance", () => {
  it("offers 「补齐档案」 whenever the sub class is missing, not only for a 新设备", () => {
    const html = render(
      <MovementAcceptance
        movement={entry({ equipment_profile_missing: ["category"] })}
        onDone={() => {}}
        onCompleteProfile={() => {}}
      />,
    );
    const words = messages.contractorOps.equipment.acceptance;
    expect(html).toContain("先补齐档案：小类");
    expect(html).toContain(words.completeProfile);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*验收通过/);
  });
});

describe("#4: the 待审批 card opens an equipment movement on its own page", () => {
  it("links to the module's detail, with both signatures and the supplier in view", () => {
    expect(APPROVAL_PAGE_LINKS.EQUIPMENT_MOVEMENT("mv-9")).toBe("/site-equipment?movement=mv-9");
    const opener = source("src/components/dashboard/approval-opener.tsx");
    expect(opener).not.toMatch(/EQUIPMENT_MOVEMENT: "EQUIPMENT_MOVEMENT"/);
    expect(opener).not.toMatch(/MovementDecision/);
  });
});

describe("#5: category management opens the editable machine dialog only for managers", () => {
  it("falls back to the read-only sheet without equipment.manage", () => {
    const code = source("src/components/contractor-ops/category-management.tsx");
    expect(code).toMatch(
      /if \(!isEquipment \|\| row\.kind !== "SITE_EQUIPMENT" \|\| !can\("equipment\.manage"\)\) \{\s*setOpen\(row\);/,
    );
  });
});

describe("#15: the office's decision opens the movement on the phone", () => {
  const row = {
    id: "mv-7",
    kind: "EQUIPMENT_MOVEMENT" as const,
    reference: "EQ-SITE-007",
    detail: "Excavator",
    project_id: "p-1",
    project_name: "Site",
    submitted_at: "2026-10-08T01:00:00Z",
    status: "EXIT",
    status_label: "Exit",
    photo: null,
  };

  it("opens the linked entry or exit under 我提交过的", () => {
    reader.search = "tab=home&movement=mv-7";
    const html = render(<MySubmissions />, [
      [["my-submissions"], { results: [row], count: 1 }],
      [["my-submissions", "detail", "EQUIPMENT_MOVEMENT", "mv-7"], {
        ...row,
        fields: [{ key: "delivery_note_no", value: "DO-OUT-7" }],
        photos: [],
      }],
    ]);
    expect(html).toContain("data-dialog");
    expect(html).toContain("DO-OUT-7");
  });

  it("opens nothing without the link", () => {
    const html = render(<MySubmissions />, [[["my-submissions"], { results: [row], count: 1 }]]);
    expect(html).not.toContain("data-dialog");
  });

  it("a movement link lands on home, not on the capture form", () => {
    const code = source("src/components/field-staff/field-staff-workspace.tsx");
    expect(code).toMatch(/requestedMovement \? "home" : requestedTab/);
    expect(code).toMatch(/requestedIncidentId \|\| requestedMovement \? null : requestedRecord/);
  });
});

describe("#22: a class made inline shows its name, and the movements link closes the dialog", () => {
  it("hands the new class's name back with its id", () => {
    const classes = source("src/components/contractor-ops/equipment-classes.tsx");
    expect(classes).toMatch(/onCreated\(\{ id: row\.id, name: row\.name \}\)/);
    const workspaces = source("src/components/contractor-ops/operations-workspaces.tsx");
    expect(workspaces).toMatch(/currentName=\{createdClassName \?\? equipment\?\.category_name\}/);
    expect(workspaces).toMatch(
      /href=\{`\/site-equipment\?equipment=\$\{equipment\.id\}`\}\s*\/\/[^\n]*\n[^\n]*\n\s*onClick=\{onClose\}/,
    );
  });
});
