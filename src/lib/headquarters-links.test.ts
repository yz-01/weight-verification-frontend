import { describe, expect, it } from "vitest";

import type { PhotoRecordKind } from "@/interfaces/headquarters";
import {
  drillHref,
  photoTarget,
  PHOTO_RECORD_KINDS,
  projectDashboardHref,
} from "@/lib/headquarters-links";

describe("公司总部 Dashboard links", () => {
  it("enters a project at its own dashboard", () => {
    expect(projectDashboardHref("p 1")).toBe("/dashboard/project?project=p%201");
  });

  it("drills a figure into the list counted with the same filter", () => {
    expect(drillHref("overdue_tasks", "p1")).toBe("/field-tasks?overdue=1&project=p1");
    expect(drillHref("open_tasks", "p1")).toBe("/field-tasks?open=1&project=p1");
    expect(drillHref("overdue_rectifications", "p1")).toBe(
      "/hazard-rectifications?overdue=1&project=p1",
    );
    expect(drillHref("on_site_now", "p1")).toBe("/emergency-list?project=p1");
    expect(drillHref("today_records", "p1")).toBe("/dashboard/project?project=p1");
  });

  it("opens every kind of photo's record somewhere", () => {
    const kinds: PhotoRecordKind[] = [
      "MATERIAL_RECEIPT",
      "DELIVERY_NOTE",
      "MATERIAL_OUTGOING",
      "EQUIPMENT_MOVEMENT",
      "EQUIPMENT",
      "SITE_PROGRESS",
      "FIELD_TASK",
      "DISPOSAL",
      "WASTE_OUTGOING",
      "WASTE_DISPATCH",
      "SAFETY_INCIDENT",
      "GATE_INCIDENT",
    ];
    expect([...PHOTO_RECORD_KINDS].sort()).toEqual([...kinds].sort());
    for (const kind of kinds) {
      expect(photoTarget({ record_kind: kind, record_id: "r1" })).not.toBeNull();
    }
  });

  it("opens a photo's record on its business page, not the record centre (F9)", () => {
    expect(photoTarget({ record_kind: "MATERIAL_RECEIPT", record_id: "r1" })).toEqual({
      href: "/receipts/r1",
    });
    expect(photoTarget({ record_kind: "SAFETY_INCIDENT", record_id: "r1" })).toEqual({
      href: "/hazard-rectifications?incident=r1",
    });
    expect(photoTarget({ record_kind: "GATE_INCIDENT", record_id: "g1" })).toEqual({
      href: "/site-access?tab=gate-records&gate_incident=g1",
    });
    // No detail page of its own yet: the read-only sheet.
    expect(photoTarget({ record_kind: "SITE_PROGRESS", record_id: "p1" })).toEqual({
      sheet: "PROGRESS",
      id: "p1",
    });
    expect(photoTarget({ record_kind: "DISPOSAL", record_id: null })).toBeNull();
  });
});
