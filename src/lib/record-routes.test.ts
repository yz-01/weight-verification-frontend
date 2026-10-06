import { describe, expect, it } from "vitest";

import { recordTarget, ROUTED_RECORD_KINDS } from "@/lib/record-routes";

describe("record → business detail (F9)", () => {
  it.each([
    ["MATERIAL_RECEIPT", "/receipts/r1"],
    ["MATERIAL_OUTGOING", "/material-outgoing?record=r1"],
    ["WASTE_OUTGOING", "/waste-outgoing?record=r1"],
    ["DISPOSAL_REQUEST", "/waste-clearance?kind=disposal&record=r1"],
    ["DISPOSAL", "/waste-clearance?kind=disposal&record=r1"],
    ["WASTE_DISPATCH", "/dispatches/r1"],
    ["HAZARD", "/hazard-rectifications?incident=r1"],
    ["SAFETY_INCIDENT", "/hazard-rectifications?incident=r1"],
    ["FIELD_TASK", "/field-tasks?task=r1"],
    ["GATE_INCIDENT", "/site-access?tab=gate-records&gate_incident=r1"],
    ["CONSULTANT_APPLICATION", "/consultant-applications/r1"],
    ["SUNDRY_CLAIM", "/sundry-claims?record=r1"],
    ["MATERIAL_REQUEST", "/material-requests?record=r1"],
  ])("opens %s on its own page", (kind, href) => {
    expect(recordTarget(kind, "r1")).toEqual({ href });
  });

  it.each([
    ["EQUIPMENT_MOVEMENT", "EQUIPMENT_MOVEMENT"],
    ["EQUIPMENT", "SITE_EQUIPMENT"],
    ["SITE_EQUIPMENT", "SITE_EQUIPMENT"],
    ["PROGRESS", "PROGRESS"],
    ["SITE_PROGRESS", "PROGRESS"],
    ["DELIVERY_NOTE", "DELIVERY_NOTE"],
  ])("opens %s, which has no detail page, in the read-only sheet", (kind, sheet) => {
    expect(recordTarget(kind, "r1")).toEqual({ sheet, id: "r1" });
  });

  it("never sends a photo of a delivery to the record centre", () => {
    // The customer's report: a material receipt photo opened 确认归档.
    expect(recordTarget("MATERIAL_RECEIPT", "r1")).not.toHaveProperty("sheet");
  });

  it("escapes the id and opens nothing without one", () => {
    expect(recordTarget("MATERIAL_RECEIPT", "a b")).toEqual({ href: "/receipts/a%20b" });
    expect(recordTarget("MATERIAL_RECEIPT", null)).toBeNull();
    expect(recordTarget("SOMETHING_NEW", "r1")).toBeNull();
  });

  it("covers every kind the 等你处理 list can hold", () => {
    for (const kind of [
      "MATERIAL_RECEIPT",
      "MATERIAL_OUTGOING",
      "EQUIPMENT_MOVEMENT",
      "WASTE_OUTGOING",
      "DISPOSAL_REQUEST",
      "PROGRESS",
      "CONSULTANT_APPLICATION",
      "SUNDRY_CLAIM",
    ]) {
      expect(ROUTED_RECORD_KINDS).toContain(kind);
    }
  });
});
