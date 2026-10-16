import { describe, expect, it } from "vitest";

import type { CorrectionField, RecordCorrectionEntry } from "@/interfaces/record-correction";
import {
  badNumber,
  changeDraft,
  isShown,
  lockedValue,
  offeredOptions,
  correctionChanges,
  fromLocalInput,
  groupCorrections,
  initialDraft,
  missingRequired,
  toLocalInput,
} from "@/lib/record-correction";

function field(overrides: Partial<CorrectionField>): CorrectionField {
  return {
    name: "vehicle_plate",
    type: "text",
    required: false,
    max_length: 50,
    value: "",
    display: "",
    options: null,
    ...overrides,
  };
}

describe("correctionChanges (I30)", () => {
  it("sends only what changed, with what the dialog showed for each", () => {
    const fields = [
      field({ name: "vehicle_plate", value: "WXY 1" }),
      field({ name: "supplier", type: "choice", value: "a", options: [] }),
      field({ name: "quantity", type: "decimal", value: "2.000" }),
    ];
    const draft = { ...initialDraft(fields), supplier: "b", quantity: "2" };

    expect(correctionChanges(fields, draft)).toEqual({
      changes: { supplier: "b" },
      expected: { supplier: "a" },
    });
  });

  it("an untouched date and time is not a change", () => {
    const fields = [field({ name: "due_at", type: "datetime", value: "2026-11-01T01:00:30+00:00" })];

    expect(correctionChanges(fields, initialDraft(fields)).changes).toEqual({});
  });

  it("a changed time goes back as an ISO time", () => {
    const fields = [field({ name: "due_at", type: "datetime", value: "" })];
    const { changes } = correctionChanges(fields, { due_at: "2026-11-01T09:00" });

    expect(new Date(changes.due_at).getTime()).toBe(new Date("2026-11-01T09:00").getTime());
  });

  it("trims what was typed", () => {
    const fields = [field({ value: "WXY 1" })];

    expect(correctionChanges(fields, { vehicle_plate: " WXY 1 " }).changes).toEqual({});
  });
});

describe("the dialog's own checks", () => {
  it("names the first required field left empty", () => {
    const fields = [field({ name: "operator_name", required: true, value: "Ah Seng" })];

    expect(missingRequired(fields, { operator_name: "  " })?.name).toBe("operator_name");
    expect(missingRequired(fields, { operator_name: "Ah Kow" })).toBeNull();
  });

  it("refuses zero and words in a number", () => {
    const fields = [field({ name: "quantity", type: "decimal", value: "1" })];

    expect(badNumber(fields, { quantity: "0" })?.name).toBe("quantity");
    expect(badNumber(fields, { quantity: "abc" })?.name).toBe("quantity");
    expect(badNumber(fields, { quantity: "1.5" })).toBeNull();
  });

  it("round-trips a local time", () => {
    expect(fromLocalInput(toLocalInput("2026-11-01T01:00:00Z"))).toBe("2026-11-01T01:00:00.000Z");
    expect(toLocalInput("")).toBe("");
  });
});

describe("groupCorrections", () => {
  it("keeps one save together, newest save first", () => {
    const row = (id: string, batch: string, at: string): RecordCorrectionEntry => ({
      id,
      batch,
      source: "CORRECTION",
      field: "supplier",
      item_label: "",
      value_from: "A",
      value_to: "B",
      reason: "typo",
      corrected_by_name: "Office",
      created_at: at,
    });
    const groups = groupCorrections([
      row("1", "x", "2026-10-01T00:00:00Z"),
      row("2", "x", "2026-10-01T00:00:00Z"),
      row("3", "y", "2026-10-02T00:00:00Z"),
    ]);

    expect(groups.map((group) => group.map((entry) => entry.id))).toEqual([["3"], ["1", "2"]]);
  });
});

describe("material → specification (I19, ID46)", () => {
  const fields = [
    field({
      name: "material",
      type: "choice",
      required: true,
      value: "rebar",
      options: [
        { value: "rebar", label: "Rebar" },
        { value: "cement", label: "Cement" },
      ],
    }),
    field({
      name: "specification",
      type: "choice",
      value: "y10",
      depends_on: "material",
      options: [
        { value: "y10", label: "Y10", parent: "rebar", unit: "TONNE" },
        { value: "other", label: "Other", parent: "rebar", is_other: true, unit: "" },
        { value: "bag", label: "50kg", parent: "cement", unit: "BAG" },
      ],
    }),
    field({ name: "material_specification", value: "Y10", only_for_other: "specification" }),
    field({ name: "unit", type: "choice", required: true, value: "TONNE", follows: "specification", options: [] }),
  ];

  it("offers only the chosen material's specifications", () => {
    const values = initialDraft(fields);
    expect(offeredOptions(fields[1], values).map((o) => o.value)).toEqual(["y10", "other"]);
  });

  it("another material clears the specification and asks for one", () => {
    const draft = changeDraft(fields, initialDraft(fields), "material", "cement");
    expect(draft.specification).toBe("");
    expect(missingRequired(fields, draft)?.name).toBe("specification");
  });

  it("a specification with a unit sets and locks the unit", () => {
    let draft = changeDraft(fields, initialDraft(fields), "material", "cement");
    draft = changeDraft(fields, draft, "specification", "bag");
    expect(draft.unit).toBe("BAG");
    expect(lockedValue(fields, fields[3], draft)).toBe("BAG");
    expect(correctionChanges(fields, draft).changes).toEqual({
      material: "cement",
      specification: "bag",
      unit: "BAG",
    });
  });

  it("the typed specification shows only for 「其他」, and must then be filled", () => {
    const values = initialDraft(fields);
    expect(isShown(fields, fields[2], values)).toBe(false);
    const other = changeDraft(fields, { ...values, material_specification: "" }, "specification", "other");
    expect(isShown(fields, fields[2], other)).toBe(true);
    expect(lockedValue(fields, fields[3], other)).toBeNull();
    expect(missingRequired(fields, other)?.name).toBe("material_specification");
  });
});
