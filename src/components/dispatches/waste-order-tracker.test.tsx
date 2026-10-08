/**
 * 废料订单 / 环保材料出场 after Lucas's decisions of 2026-10-09.
 *
 * - The contractor's 废料订单 is a read-only tracker that lines up with the
 *   applications: the application's number (opening it) and status, its
 *   category under the same name, and old direct orders marked 「旧订单」.
 * - The direct 新增废料订单 / 新建出场 is gone - button, route and form.
 * - 安排回收商 is announced: 「批准后才能安排回收商」 on a pending application,
 *   「待安排回收商」 on an approved one.
 * - System categories are shown as the server names them for the reader
 *   (`label`, `category_name`), never the stored English preset name.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { WasteDispatch } from "@/interfaces/contractor";
import type { WasteOutgoingRecord } from "@/interfaces/waste-outgoing";
import messages from "@/messages/zh.json";

const data: { dispatches: unknown; records: unknown; options: unknown } = {
  dispatches: undefined,
  records: undefined,
  options: undefined,
};
let selected: string | null = null;

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    // Every list reads straight from here, keyed by what it asks for.
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
      const [scope, part] = queryKey as string[];
      const value =
        scope === "dispatches"
          ? data.dispatches
          : scope === "waste-outgoing" && part === "records"
            ? data.records
            : scope === "waste-outgoing" && part === "options"
              ? data.options
              : undefined;
      return {
        data: value,
        isLoading: false,
        isError: false,
        isSuccess: value !== undefined,
        refetch: () => {},
      };
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/waste-clearance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "u1", portal: "MSE_TRACE", features: [] }, can: () => true }),
}));
vi.mock("@/hooks/use-url-selection", () => ({
  useUrlSelection: () => [selected, () => {}],
}));
vi.mock("@/components/ui/dialog", async () =>
  (await import("@/components/shared/record-detail-test-kit")).inlineDialogModule(),
);
vi.mock("@/components/shared/record-conversation", () => ({
  RecordConversationPanel: () => <div data-stub="conversation" />,
}));
vi.mock("@/components/shared/record-attachments", () => ({
  RecordAttachmentsPanel: () => <div data-stub="attachments" />,
}));
vi.mock("@/components/shared/record-export-button", () => ({
  RecordExportButton: () => <div data-stub="export" />,
}));

const { Dispatches, dispatchCategoryText } = await import("@/components/dispatches/dispatches");
const { WasteOutgoingWorkspace } = await import(
  "@/components/contractor-ops/waste-outgoing-workspace"
);

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={messages} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const source = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8");

function order(overrides: Partial<WasteDispatch>): WasteDispatch {
  return {
    id: "d1",
    dispatch_no: "DS-P1-261009-004",
    contractor_name: "Builder",
    project: "p1",
    project_code: "P1",
    project_name: "Tower A",
    recycler: "r1",
    recycler_name: "Green Metal Sdn Bhd",
    waste_type: "METAL",
    estimated_weight_kg: null,
    pickup_address: "",
    pickup_address_source: "",
    vehicle_plate: "",
    driver_name: "",
    state: "ACCEPTED",
    accepted_at: null,
    proposed_collection_at: null,
    proposed_collection_note: "",
    confirmed_collection_at: null,
    confirmed_collection_note: "",
    collection_plan_confirmed_at: null,
    collection_plan_confirmed_by: null,
    driver_assigned_at: null,
    released_at: null,
    is_editable: false,
    has_location: false,
    source_record_id: "w1",
    source_reference_no: "WO-P1-261009-012",
    source_status: "ORDERED",
    source_category_name: "废铁",
    is_legacy: false,
    created_at: "2026-10-09T02:00:00Z",
    ...overrides,
  };
}

describe("the 废料订单 tracker", () => {
  data.dispatches = {
    count: 2,
    results: [
      order({}),
      order({
        id: "d0",
        dispatch_no: "DS-P1-260801-001",
        waste_type: "MIXED",
        state: "RELEASED",
        source_record_id: null,
        source_reference_no: null,
        source_status: null,
        source_category_name: null,
        is_legacy: true,
      }),
    ],
  };
  const html = render(<Dispatches />);

  it("says where orders come from, under the title", () => {
    expect(html).toContain("data-tracker-note");
    expect(html).toContain(messages.dispatches.tracker.note);
    expect(html).toContain(messages.dispatches.title);
  });

  it("shows the application's short number, opening it, with its status", () => {
    expect(html).toContain(messages.dispatches.tracker.applicationNo);
    expect(html).toContain('href="/waste-outgoing?record=w1&amp;project=p1"');
    expect(html).toContain("WO-012");
    expect(html).toContain(messages.wasteOutgoing.status.ORDERED);
  });

  it("shows the order number short, the whole one a hover away", () => {
    expect(html).toContain(messages.dispatches.tracker.orderNo);
    expect(html).toContain("DS-004");
    expect(html).toContain('title="DS-P1-261009-004"');
  });

  it("names the category as the application list does, and marks an old order", () => {
    expect(html).toContain("废铁");
    expect(html).toContain(messages.dispatches.wasteType.MIXED);
    expect(html).toContain(messages.dispatches.tracker.legacy);
  });

  it("is read-only: no new order, no edit, no remove", () => {
    expect(html).not.toContain("/dispatches/create");
    expect(html).not.toContain("/edit");
    expect(html).not.toContain(messages.common.remove);
    expect(html).toContain('href="/dispatches/d1"');
  });

  it("words a merged-list row the same way", () => {
    const t = (key: string) =>
      key === "dispatches.tracker.legacy" ? "旧订单" : key === "dispatches.wasteType.MIXED" ? "混合建筑废料" : key;
    expect(dispatchCategoryText(order({}), t)).toBe("废铁");
    expect(
      dispatchCategoryText(
        order({ source_category_name: null, waste_type: "MIXED", is_legacy: true }),
        t,
      ),
    ).toBe("混合建筑废料 · 旧订单");
  });
});

describe("the direct 新增废料订单 is retired", () => {
  it("has no route, no form and no button left", () => {
    const app = path.join(process.cwd(), "src", "app", "(dashboard)");
    expect(existsSync(path.join(app, "dispatches", "create"))).toBe(false);
    expect(existsSync(path.join(app, "dispatches", "[id]", "edit"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "src", "components", "dispatches", "create-dispatch.tsx"))).toBe(false);
    for (const file of [
      "components/contractor-ops/waste-clearance.tsx",
      "components/dispatches/dispatches.tsx",
      "lib/navigation.ts",
      "services/contractor.service.ts",
    ]) {
      expect(source(file), file).not.toContain("/dispatches/create");
      expect(source(file), file).not.toContain("create_dispatch");
    }
    expect(source("components/contractor-ops/waste-clearance.tsx")).not.toContain("newDispatch");
    expect(JSON.stringify(messages)).not.toContain("新增废料订单");
  });

  it("names the head-office card 废料订单, as both sides do", () => {
    expect(messages.headquarters.figures.wasteDispatches).toBe("废料订单");
    expect(messages.dispatches.title).toBe("废料订单");
    expect(JSON.stringify(messages)).not.toContain("原废料订单");
  });
});

function application(overrides: Partial<WasteOutgoingRecord>): WasteOutgoingRecord {
  return {
    id: "w1",
    reference_no: "WO-P1-261009-012",
    project: "p1",
    project_name: "Tower A",
    category: "c1",
    category_name: "废金属（旧）",
    category_code: "SCRAP_METAL",
    raised_by_office: false,
    quantity: null,
    unit: "",
    note: "",
    status: "PENDING_APPROVAL",
    captured_at: "2026-10-09T02:00:00Z",
    latitude: null,
    longitude: null,
    pickup_address: "",
    pickup_address_source: "",
    photos: [],
    recycler: null,
    recycler_name: null,
    dispatch: null,
    dispatch_no: null,
    dispatch_state: null,
    review_note: "",
    ...overrides,
  } as unknown as WasteOutgoingRecord;
}

describe("the application list announces 安排回收商", () => {
  data.options = {
    categories: [
      {
        id: "c2",
        code: "SCRAP_IRON",
        name: "废铁",
        label: "废铁",
        is_system: true,
        is_active: true,
        is_retired: false,
      },
    ],
    units: [],
    dispatch_types: [],
  };

  it("says 「待安排回收商」 on an approved row", () => {
    data.records = {
      count: 1,
      results: [application({ status: "APPROVED", category_name: "废铁" })],
    };
    selected = null;
    const html = render(<WasteOutgoingWorkspace />);
    expect(html).toContain(messages.wasteOutgoing.hint.awaitingRecycler);
    // The category exactly as the server named it for this reader.
    expect(html).toContain("废铁");
  });

  it("says 「批准后才能安排回收商」 on a pending application's detail", () => {
    data.records = { count: 1, results: [application({})] };
    selected = "w1";
    const html = render(<WasteOutgoingWorkspace />);
    expect(html).toContain('data-hint="approve-first"');
    expect(html).toContain(messages.wasteOutgoing.hint.approveFirst);
    // An old preset reads as the server words it, marked old.
    expect(html).toContain("废金属（旧）");
    expect(html).not.toContain("Scrap Metal");
    selected = null;
  });

  it("says an office-raised application has no phone location", () => {
    data.records = {
      count: 1,
      results: [application({ raised_by_office: true, status: "APPROVED" })],
    };
    selected = "w1";
    const html = render(<WasteOutgoingWorkspace />);
    expect(html).toContain(messages.wasteOutgoing.office.raisedNote);
    expect(html).toContain('data-hint="awaiting-recycler"');
    selected = null;
  });
});

describe("system categories are shown as the server names them", () => {
  it("every picker and category list reads `label`, not the stored name", () => {
    expect(source("components/field-staff/field-records-panel.tsx")).toContain(
      "{row.label || row.name}",
    );
    const workspace = source("components/contractor-ops/waste-outgoing-workspace.tsx");
    expect(workspace).toContain("label: row.label");
    expect(workspace).toContain("{row.label}");
    expect(source("components/contractor-ops/category-management.tsx")).toContain(
      "name: row.label",
    );
  });

  it("marks an old preset in 分类管理 and keeps it off", () => {
    const management = source("components/contractor-ops/category-management.tsx");
    expect(management).toContain('waste("category.retired")');
    expect(management).toContain("disabled={category.is_retired}");
    expect(messages.wasteOutgoing.category.retired).toBe("旧分类");
  });
});
