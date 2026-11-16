/**
 * JB204-1 (Lucas 11-16 audit): a machine's printed QR, scanned with the
 * phone's own camera, opens 设备进退场 on that machine.
 *
 * `/scan/equipment` reads the office sign-in. A phone signed in to the field
 * app only holds none, so the page sent it to the field sign-in, which came
 * back to the page, which sent it to sign in again - round and round, and the
 * machine never opened. With a field session it now goes to the field app
 * with the machine named; the field app picks 退场 for a machine on site and
 * 进场 for one that is not.
 *
 * Rendered to static markup (the runner has no DOM): the redirect itself runs
 * in an effect, so what is read is the link the page shows while it goes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { SiteEquipment } from "@/interfaces/contractor-ops";
import messages from "@/messages/zh.json";

const state = vi.hoisted(() => ({
  signedIn: false,
  fieldSession: false,
  search: "",
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () =>
    state.signedIn
      ? {
          user: { id: "u-1", full_name: "Ah Meng", is_field_staff: true, active_project: null },
          isLoading: false,
          can: (code: string) => ["equipment.capture", "equipment.view"].includes(code),
        }
      : { user: null, isLoading: false, can: () => false },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/scan/equipment",
}));
vi.mock("@/lib/auth-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-token")>()),
  hasFieldSession: () => state.fieldSession,
  getFieldBootstrapToken: () => (state.fieldSession ? "kept-hand-off" : null),
}));

const { EquipmentScanLanding, fieldScanHref } = await import("@/components/contractor-ops/equipment-scan-landing");
const { SiteEquipmentWorkspace, linkedDirection } = await import("@/components/contractor-ops/operations-workspaces");

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
    category: null,
    category_name: null,
    description: "",
    status: "ON_SITE",
    is_active: true,
    needs_profile: false,
    movement_count: 0,
    quantity_on_site: "1",
    created_at: "2026-10-07T01:00:00Z",
    updated_at: "2026-10-07T01:00:00Z",
    ...overrides,
  } as SiteEquipment;
}

/** The words on the 进场 / 退场 button that is pressed. */
function pressedWay(html: string): string {
  const match = html.match(/<button[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/);
  return match ? match[1].replace(/<[^>]+>/g, "") : "";
}

const page = <T,>(results: T[]) => ({ results, count: results.length, page: 1, page_size: 200, total_pages: 1 });
const words = messages.contractorOps;

beforeEach(() => {
  state.signedIn = false;
  state.fieldSession = false;
  state.search = "";
});

describe("the printed QR on a phone signed in to the field app only", () => {
  it("goes to 设备进退场 in the field app with the machine, not to sign in again", () => {
    state.fieldSession = true;
    state.search = "equipment=m-1";

    const html = render(<EquipmentScanLanding />);

    expect(fieldScanHref("m-1")).toBe("/field-staff?record=equipment&machine=m-1");
    expect(html).toContain('href="/field-staff?record=equipment&amp;machine=m-1"');
    expect(html).toContain(words.equipmentScan.open);
    // Not the sign-in choices that sent it round in a circle.
    expect(html).not.toContain(words.equipmentScan.fieldLogin);
    expect(html).not.toContain("/trace/field-login");
  });

  it("still offers the sign-in to a phone with no field session", () => {
    state.search = "equipment=m-1";

    const html = render(<EquipmentScanLanding />);

    expect(html).toContain(words.equipmentScan.fieldLogin);
    expect(html).not.toContain("/field-staff?record=equipment");
  });
});

describe("the field app opened on a scanned machine with no way named", () => {
  it("takes the way from where the machine is", () => {
    expect(linkedDirection(null, { status: "ON_SITE" })).toBe("EXIT");
    expect(linkedDirection(null, { status: "OFF_SITE" })).toBe("ENTRY");
    expect(linkedDirection(null, undefined)).toBe("ENTRY");
    // A link that names the way keeps it (the office's own link, the in-app scan).
    expect(linkedDirection("ENTRY", { status: "ON_SITE" })).toBe("ENTRY");
    expect(linkedDirection("EXIT", undefined)).toBe("EXIT");
  });

  it("opens 退场 with the machine found for a machine on site", () => {
    state.signedIn = true;
    state.search = "record=equipment&machine=m-1";

    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page([machine({ status: "ON_SITE" })])],
    ]);

    expect(html).toContain('data-testid="field-equipment-found"');
    expect(pressedWay(html)).toBe(words.direction.EXIT);
  });

  it("opens 进场 on the machine for one that is not on site", () => {
    state.signedIn = true;
    state.search = "record=equipment&machine=m-1";

    const html = render(<SiteEquipmentWorkspace initialProject="p-1" />, [
      [["site-equipment", "field", "p-1"], page([machine({ status: "OFF_SITE" })])],
    ]);

    expect(html).not.toContain('data-testid="field-equipment-found"');
    expect(html).toContain('data-testid="field-equipment-next-step"');
    expect(pressedWay(html)).toBe(words.direction.ENTRY);
  });
});
