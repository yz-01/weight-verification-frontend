/**
 * 工地清运: which company and which lorry took each clearance (I27, ID65).
 *
 * The client, 2026-10-15 事项 6: 「table增加清运车牌和把执行人改为供应商…因为
 * 建筑公司不止一家清运公司，为了要打包结算。增加筛选日期和供应商筛选」.
 *
 * Checked here: the 供应商 / 清运车牌 cells, the optional plate on the phone
 * (no star), the plate on each lorry and its correction history, the supplier
 * and date filters held in the address (so Multi Engine's 「添加资料」 visit
 * keeps them), the header totals and the export following them, and the
 * words in all four languages. The runner has no DOM, so screens are rendered
 * to static markup.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { DisposalRequest, DisposalTrip } from "@/interfaces/contractor-ops";
import {
  DISPOSAL_SUPPLIER_FILTERS,
  NO_SUPPLIER,
  canSetSupplier,
  changedPlate,
  disposalPlatesText,
  disposalSupplierText,
  normalisePlate,
  offersSupplierButton,
  supplierChangeNeedsReason,
} from "@/lib/disposal-supplier";
import { clearanceFigureFilters } from "@/lib/waste-clearance-figures";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null, can: () => true }),
}));

const { DisposalTripsPanel, ExternalDisposalWorkspace, InternalDisposalWorkspace } = await import(
  "@/components/contractor-ops/site-disposal-workspaces"
);
const { NO_SUPPLIER_VALUE, supplierOptions } = await import("@/components/shared/supplier-date-filter");

const words = { internal: zh.siteDisposal.supplier.internal, none: zh.siteDisposal.notAssigned };

function trip(seq: number, status: DisposalTrip["status"], extra: Partial<DisposalTrip> = {}): DisposalTrip {
  return {
    id: `t${seq}`,
    seq,
    status,
    weight_kg: status === "PLANNED" ? null : "900.00",
    do_no: status === "PLANNED" ? "" : `DO-${seq}`,
    vehicle_plate: "",
    note: "",
    submitted_at: status === "PLANNED" ? null : "2026-10-07T02:30:00Z",
    submitted_by_name: status === "PLANNED" ? "" : "Ali Driver",
    accepted_by_name: null,
    accepted_at: null,
    corrections: [],
    evidence: [],
    ...extra,
  };
}

function job(trips: DisposalTrip[], extra: Partial<DisposalRequest> = {}): DisposalRequest {
  return {
    id: "d1",
    reference_no: "DISP-OPS-0001",
    project: "p1",
    project_name: "Ops Site",
    category: null,
    category_name: null,
    category_code: null,
    waste_description: "Hacked concrete",
    location_description: "Block A",
    estimated_volume_m3: null,
    estimated_weight_kg: null,
    preferred_at: null,
    request_note: "",
    client_event_id: "",
    status: "IN_PROGRESS",
    requested_by_name: "Site",
    reviewed_by_name: "Ong Office",
    reviewed_at: "2026-10-07T01:00:00Z",
    review_note: "",
    assignment_type: "EXTERNAL",
    assigned_staff: null,
    assigned_staff_name: null,
    execution_task: null,
    collector_supplier: null,
    supplier_name: "",
    supplier_label: "",
    vehicle_plates: [],
    vehicle_plates_text: "",
    collector_company_name: "",
    collector_contact_name: "",
    collector_phone: "",
    collector_email: "",
    external_token_hint: "",
    external_expires_at: null,
    external_revoked_at: null,
    external_last_used_at: null,
    external_link_is_valid: true,
    disposal_evidence_is_overdue: false,
    planned_trips: trips.length,
    trips,
    trips_accepted: 0,
    trips_total: trips.length,
    trips_closed_at: null,
    execution_started_at: null,
    submitted_at: null,
    actual_weight_kg: null,
    trip_count: 0,
    disposal_do_no: "",
    execution_note: "",
    ocr_status: "MANUAL",
    ocr_result: {},
    confirmed_by_name: null,
    confirmed_at: null,
    confirmation_note: "",
    evidence: [],
    timeline: [],
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...extra,
  };
}

function render(node: React.ReactNode, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh} timeZone="Asia/Kuala_Lumpur">
        <TooltipProvider>{node}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const source = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const noop = () => undefined;

// -- I27-2: 「执行人」 becomes 「供应商」 -------------------------------------------

describe("the 供应商 cell (I27-2)", () => {
  it("names the clearance company, or the site's own staff as 内部清运 · 负责人", () => {
    expect(disposalSupplierText(job([], { supplier_name: "Lori Bersih Sdn Bhd" }), words)).toBe("Lori Bersih Sdn Bhd");
    expect(
      disposalSupplierText(job([], { assignment_type: "INTERNAL", assigned_staff_name: "Ah Seng", supplier_name: "" }), words),
    ).toBe("内部清运 · Ah Seng");
    expect(disposalSupplierText(job([], { assignment_type: "INTERNAL", assigned_staff_name: null }), words)).toBe("内部清运");
    // Nobody named yet - approved and forwarded to a driver, say.
    expect(disposalSupplierText(job([], { assignment_type: "" }), words)).toBe(zh.siteDisposal.notAssigned);
  });

  it("is what the office list, the detail and the phone card show - 执行人 is gone", () => {
    expect(source).toMatch(/id: "supplier",\s*meta: \{ label: t\("field\.supplier"\) \}/);
    expect(source).not.toMatch(/t\("field\.executor"\)/);
    expect(source.match(/disposalSupplierText\(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("chooses an outside company from the supplier list, adding one in place", () => {
    const assign = source.slice(source.indexOf("function AssignExecutorDialog"), source.indexOf("function SetSupplierDialog"));
    expect(assign).toMatch(/<SupplierPicker/);
    expect(assign).toMatch(/<QuickAddSupplierButton/);
    expect(assign).toMatch(/collector_supplier: supplier/);
    expect(assign).toMatch(/\[supplier, t\("field\.supplier"\)\]/);
    expect(assign).not.toMatch(/field\.collectorCompany/);
  });

  it("can name the company later, asking why only when one is replaced", () => {
    expect(supplierChangeNeedsReason(job([]))).toBe(false);
    expect(supplierChangeNeedsReason(job([], { collector_supplier: "s1", supplier_name: "A" }))).toBe(true);
    // A name typed before I27 is a company already named.
    expect(supplierChangeNeedsReason(job([], { supplier_name: "Typed Lorry Co" }))).toBe(true);

    expect(canSetSupplier(job([], { status: "IN_PROGRESS" }))).toBe(true);
    expect(canSetSupplier(job([], { status: "COMPLETED" }))).toBe(true);
    expect(canSetSupplier(job([], { status: "REQUESTED" }))).toBe(false);
    expect(canSetSupplier(job([], { status: "CANCELLED" }))).toBe(false);
    expect(canSetSupplier(job([], { status: "IN_PROGRESS", assignment_type: "INTERNAL" }))).toBe(false);

    // Not beside the assign dialog, which chooses the company itself.
    expect(offersSupplierButton(job([], { status: "APPROVED" }), { manage: true, confirm: true })).toBe(false);
    expect(offersSupplierButton(job([], { status: "APPROVED" }), { manage: false, confirm: true })).toBe(true);
    expect(offersSupplierButton(job([], { status: "IN_PROGRESS" }), { manage: true, confirm: false })).toBe(true);
    expect(offersSupplierButton(job([], { status: "COMPLETED" }), { manage: false, confirm: false })).toBe(false);
    expect(source).toMatch(/case "supplier":\s*return <SetSupplierDialog/);
  });
});

// -- I27-1 / I27-4: the plate of each lorry -------------------------------------------

describe("the lorry's plate (I27-1, I27-4)", () => {
  it("lists each lorry once in 清运车牌", () => {
    expect(disposalPlatesText(job([], { vehicle_plates: ["WXY 1234", "BKL 88"] }))).toBe("WXY 1234, BKL 88");
    expect(disposalPlatesText(job([]))).toBe("—");
    expect(source).toMatch(/id: "vehicle_plates",\s*meta: \{ label: t\("field\.vehiclePlates"\) \}/);
  });

  it("is kept the way the server keeps it, so retyping the same plate is no change", () => {
    expect(normalisePlate("  wxy   1234 ")).toBe("WXY 1234");
    expect(changedPlate("wxy 1234", { vehicle_plate: "WXY 1234" })).toBeNull();
    expect(changedPlate("  ", { vehicle_plate: "WXY 1234" })).toBeNull();
    expect(changedPlate("wxy 1243", { vehicle_plate: "WXY 1234" })).toBe("WXY 1243");
    expect(changedPlate("JKL 5", { vehicle_plate: "" })).toBe("JKL 5");
  });

  it("shows on its lorry, and its correction on the history", () => {
    const corrected = trip(1, "SUBMITTED", {
      vehicle_plate: "WXY 1234",
      corrections: [
        { id: "c1", field: "vehicle_plate", from: "WXY 1243", to: "WXY 1234", reason: "Gate photo", by_name: "Ong Office", at: "2026-10-07T05:00:00Z" },
      ],
    });
    const html = render(<DisposalTripsPanel row={job([corrected])} canCheck onChanged={noop} />);
    expect(html).toContain("WXY 1234");
    expect(html).toContain("车牌 WXY 1243 → WXY 1234");
    expect(source).toMatch(/vehicle_plate: plateChanged \?\? undefined/);
  });

  it("is an optional box with no star on the driver's link", () => {
    const client = new QueryClient();
    client.setQueryData(["external-disposal", "tok"], {
      id: "d1",
      reference_no: "DISP-OPS-0001",
      company_name: "MSE Builders",
      project_name: "Ops Site",
      waste_description: "Hacked concrete",
      location_description: "Block A",
      status: "IN_PROGRESS",
      evidence: [],
      trips: [{ id: "t1", seq: 1, status: "PLANNED", submitted_at: null }],
      trips_total: 1,
      trips_accepted: 0,
      current_trip: { id: "t1", seq: 1 },
    });
    const html = render(<ExternalDisposalWorkspace token="tok" />, client);
    expect(html).toContain(`>${zh.siteDisposal.external.field.vehiclePlate}</label>`);
    expect(html).toContain(zh.siteDisposal.external.field.vehiclePlateHint);
    expect(source).toMatch(/submitExternalDisposalTask\(token, \{ note, vehicle_plate: normalisePlate\(plate\) \}\)/);
  });

  it("is an optional box with no star on the field form, beside the weight and DO", () => {
    const client = new QueryClient();
    client.setQueryData(["internal-disposal", "d1"], job([trip(1, "PLANNED")], { assignment_type: "INTERNAL", status: "IN_PROGRESS" }));
    const html = render(<InternalDisposalWorkspace disposalId="d1" onSubmitted={noop} />, client);
    expect(html).toContain(`>${zh.siteDisposal.internal.field.vehiclePlate}</label>`);
    // The weight and DO keep their stars.
    expect(html).toMatch(new RegExp(`${zh.siteDisposal.internal.field.weight.replace(/[()（）]/g, ".")}<span[^>]*>\\*</span>`));
  });
});

// -- I27-3 / I27-5: the filters, the totals, the export, Multi Engine ------------------

describe("filtering by company and by date (I27-3, I27-5)", () => {
  it("offers 「未填供应商」 under the company filter", () => {
    expect(NO_SUPPLIER).toBe(NO_SUPPLIER_VALUE);
    expect(supplierOptions([{ id: "s1", name: "Alpha" }], "全部供应商", "未填供应商").map((o) => [o.value, o.label])).toEqual([
      ["__all__", "全部供应商"],
      [NO_SUPPLIER, "未填供应商"],
      ["s1", "Alpha"],
    ]);
    // A list that does not read `none` is not offered it.
    expect(supplierOptions([], "全部供应商").map((o) => o.label)).toEqual(["全部供应商"]);
  });

  it("holds the company and the dates in the address, so collecting for a package keeps them", () => {
    expect(DISPOSAL_SUPPLIER_FILTERS).toEqual(["supplier", "date_from", "date_to"]);
    expect(source).toMatch(/useListQuery\(\["project", "status", "counted", \.\.\.DISPOSAL_SUPPLIER_FILTERS\]\)/);
    expect(source).toMatch(/pack="DISPOSAL_REQUEST"/);
    expect(source).toMatch(/noneLabel=\{t\("supplier\.none"\)\}/);
  });

  it("reads the header's 数量 / 车次 / 重量 with the same company and dates", () => {
    const params = new URLSearchParams("kind=disposal&supplier=s1&date_from=2026-10-01&date_to=2026-10-15&state=SETTLED");
    expect(clearanceFigureFilters("disposal", params)).toEqual({
      disposal: { supplier: "s1", date_from: "2026-10-01", date_to: "2026-10-15" },
      dispatch: {},
    });
    // 全部 has no filters.
    expect(clearanceFigureFilters("all", params)).toEqual({ disposal: {}, dispatch: {} });
  });

  it("exports with the list's query, with the company and the lorries", () => {
    const exported = source.slice(source.indexOf("exportDisposalRequests({"), source.indexOf("rowClassName={(row) => (row.disposal_evidence_is_overdue"));
    expect(exported).toMatch(/query: list\.query/);
    expect(exported).toMatch(/key: "supplier_label", label: t\("field\.supplier"\)/);
    expect(exported).toMatch(/key: "vehicle_plates_text", label: t\("field\.vehiclePlates"\)/);
    expect(exported).toMatch(/key: "created_at", label: t\("field\.createdAt"\)/);
  });
});

describe("worded in all four languages", () => {
  it("has every new sentence", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const sd = messages.siteDisposal;
      for (const text of [
        sd.field.supplier,
        sd.field.vehiclePlates,
        sd.field.vehiclePlate,
        sd.field.createdAt,
        sd.supplier.internal,
        sd.supplier.none,
        ...Object.values(sd.supplierPick),
        sd.action.setSupplier,
        sd.action.changeSupplier,
        sd.trips.historyPlate,
        sd.toast.supplierSet,
        sd.timelineEvent.SUPPLIER_SET,
        sd.external.field.vehiclePlate,
        sd.external.field.vehiclePlateHint,
        sd.internal.field.vehiclePlate,
        sd.internal.field.vehiclePlateHint,
        ...Object.values(messages.suppliers.quickAdd),
      ]) {
        expect(text.trim()).not.toBe("");
      }
    }
    expect(zh.siteDisposal.field.supplier).toBe("供应商");
    expect(zh.siteDisposal.field.vehiclePlates).toBe("清运车牌");
  });

  it("says 内部清运 with the same words the server prints in a file", () => {
    // `contractor_ops.serializers.INTERNAL_CLEARANCE_WORDS`
    expect([en, ms, zh, zhTW].map((messages) => messages.siteDisposal.supplier.internal)).toEqual([
      "Internal clearance",
      "Pembersihan dalaman",
      "内部清运",
      "內部清運",
    ]);
  });
});
