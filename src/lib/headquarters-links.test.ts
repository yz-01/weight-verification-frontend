import { describe, expect, it } from "vitest";

import type { PhotoRecordKind } from "@/interfaces/headquarters";
import type { HeadquartersCounts, HeadquartersProject } from "@/interfaces/headquarters";
import { legacyDashboardTarget } from "@/lib/dashboard-scopes";
import {
  cardHref,
  cardProject,
  type HeadquartersCard,
  photoTarget,
  PHOTO_RECORD_KINDS,
  projectDashboardHref,
} from "@/lib/headquarters-links";

describe("公司总部 Dashboard links", () => {
  it("enters a project at its own dashboard", () => {
    expect(projectDashboardHref("p 1")).toBe("/dashboard/project?project=p%201");
  });

  const date = "2026-10-07";

  it("sends every card straight to the list of what it counts (F8)", () => {
    // Several projects: every project, the same filter.
    const all: Record<HeadquartersCard, string | null> = {
      projects: "/projects",
      today_records: null,
      pending_approvals: "/dashboard?work=approvals#headquarters-work",
      overdue_rectifications: "/hazard-rectifications?overdue=1",
      material_receipts_today: "/receipts?date_from=2026-10-07&date_to=2026-10-07",
      open_tasks: "/field-tasks?open=1",
      overdue_tasks: "/field-tasks?overdue=1",
      on_site_now: "/attendance",
      waste_dispatches: "/waste-clearance?kind=dispatch&counted=1",
      site_disposals: "/waste-clearance?kind=disposal&counted=1",
    };
    for (const [card, href] of Object.entries(all)) {
      expect(cardHref(card as HeadquartersCard, { date }), card).toBe(href);
    }
  });

  it("carries the one project into the list when there is one (F8)", () => {
    const one: Record<HeadquartersCard, string | null> = {
      projects: "/projects",
      today_records: null,
      pending_approvals: "/dashboard?work=approvals&work_project=p1#headquarters-work",
      overdue_rectifications: "/hazard-rectifications?overdue=1&project=p1",
      material_receipts_today:
        "/receipts?date_from=2026-10-07&date_to=2026-10-07&project=p1",
      open_tasks: "/field-tasks?open=1&project=p1",
      overdue_tasks: "/field-tasks?overdue=1&project=p1",
      on_site_now: "/attendance?project=p1",
      waste_dispatches: "/waste-clearance?kind=dispatch&counted=1&project=p1",
      site_disposals: "/waste-clearance?kind=disposal&counted=1&project=p1",
    };
    for (const [card, href] of Object.entries(one)) {
      expect(cardHref(card as HeadquartersCard, { project: "p1", date }), card).toBe(href);
    }
  });

  it("never sends a card to a project's dashboard (Q22)", () => {
    const cards: HeadquartersCard[] = [
      "projects",
      "today_records",
      "pending_approvals",
      "overdue_rectifications",
      "material_receipts_today",
      "open_tasks",
      "overdue_tasks",
      "on_site_now",
      "waste_dispatches",
      "site_disposals",
    ];
    for (const card of cards) {
      const href = cardHref(card, { project: "p1", date }) ?? "";
      expect(href.startsWith("/dashboard/project"), card).toBe(false);
      // `/dashboard?project=` would forward to the project dashboard too.
      if (href.startsWith("/dashboard?")) {
        const search = href.slice(href.indexOf("?") + 1).split("#")[0];
        expect(legacyDashboardTarget(search), card).toBeNull();
      }
    }
  });

  it("narrows to the reader's one project, unless the figure counts a company-wide item", () => {
    const counts = (pending: number): HeadquartersCounts => ({
      today_records: 0,
      on_site_now: 0,
      pending_approvals: pending,
      open_tasks: 0,
      overdue_tasks: 0,
      overdue_rectifications: 0,
      material_receipts_today: 0,
      today_records_by_kind: {},
      waste_dispatches: { records: 0, trips: 0, weighed_kg: "0", weighed_records: 0 },
      site_disposals: { records: 0, completed: 0, trips: 0, weight_kg: "0", with_weight: 0 },
    });
    const project = { id: "p1" } as HeadquartersProject;
    const single = { projects: [project], other: counts(0) };
    expect(cardProject(single, "overdue_tasks")).toBe("p1");
    expect(cardProject(single, "waste_dispatches")).toBe("p1");
    // A company-wide approval is on the card but in no project's list.
    expect(cardProject({ projects: [project], other: counts(1) }, "pending_approvals")).toBeUndefined();
    expect(cardProject({ projects: [project, { id: "p2" } as HeadquartersProject], other: counts(0) }, "open_tasks")).toBeUndefined();
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
