import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SITE_ENTRY_FIELDS, missingSiteEntry, siteEntryRequired } from "./material-site-entry";

/**
 * A phone delivery states its plate, DO number and both signatures (T-401, D-280).
 *
 * The server refuses an ENTRY photographed on site without them
 * (`receiving/views.py`, `site_entry_missing`); a return is not asked. The
 * phone used to keep all four under 「补充资料（选填）」, so a worker who had
 * filled in everything visible met a refusal they could not explain.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const signature = new File(["ink"], "sig.png", { type: "image/png" });
const complete = {
  vehiclePlate: "WXY 1234",
  deliveryNoteNo: "DO-88",
  receiverSignature: signature,
  supplierSignature: signature,
};

describe("which fields a delivery needs", () => {
  // The server's are `SITE_ENTRY_TEXT_FIELDS = ("vehicle_plate",
  // "delivery_note_no")` and `SITE_ENTRY_SIGNATURES = ("signature",
  // "supplier_signature")`; the frontend CI has no backend checkout to read.
  it("mirrors the server's four", () => {
    expect(SITE_ENTRY_FIELDS).toEqual(["vehiclePlate", "deliveryNoteNo", "receiverSignature", "supplierSignature"]);
  });

  it("an entry asks for each one that is missing, blank plate included", () => {
    expect(missingSiteEntry("ENTRY", complete)).toEqual([]);
    expect(missingSiteEntry("ENTRY", { ...complete, vehiclePlate: "   " })).toEqual(["vehiclePlate"]);
    expect(missingSiteEntry("ENTRY", { ...complete, deliveryNoteNo: "", supplierSignature: undefined })).toEqual([
      "deliveryNoteNo",
      "supplierSignature",
    ]);
    expect(missingSiteEntry("ENTRY", { vehiclePlate: "", deliveryNoteNo: "" })).toEqual([...SITE_ENTRY_FIELDS]);
  });

  it("a return asks for none of them", () => {
    expect(siteEntryRequired("RETURN")).toBe(false);
    expect(missingSiteEntry("RETURN", { vehiclePlate: "", deliveryNoteNo: "" })).toEqual([]);
  });

  it("no direction counts as an entry, as on the server", () => {
    expect(siteEntryRequired("")).toBe(true);
    expect(siteEntryRequired(undefined)).toBe(true);
  });
});

describe("the phone's material form", () => {
  const code = read("src/components/field-staff/field-records-panel.tsx");
  const start = code.indexOf("function MaterialCapturePanel(");
  const body = code.slice(start, code.indexOf("\nfunction ", start + 1));
  // The 补充资料 block, not the add-a-column one above it.
  const summary = body.indexOf('t("material.additionalDetails")');
  const details = body.slice(body.lastIndexOf("<details", summary), body.indexOf("</details>", summary));

  it("keeps only specification and total weight under 补充资料", () => {
    expect(details).toMatch(/t\("material\.additionalDetails"\)/);
    expect(details).toMatch(/t\("material\.specification"\)/);
    expect(details).toMatch(/t\("material\.totalWeightKg"\)/);
    expect(details).not.toMatch(/material\.vehicle|material\.doNo|FieldSignaturePad/);
  });

  it("shows the four on the form, starred for an entry", () => {
    expect(body).toMatch(/const siteEntry = siteEntryRequired\(draft\.movementType\)/);
    expect(body).toMatch(/<FieldWrapper label=\{t\("material\.vehicle"\)\} required=\{siteEntry\}>/);
    expect(body).toMatch(/<FieldWrapper label=\{t\("material\.doNo"\)\} required=\{siteEntry\}>/);
    expect(body).toMatch(/<FieldSignaturePad label=\{t\("material\.receiverSignature"\)\}[^>]*required=\{siteEntry\}/);
    expect(body).toMatch(/<FieldSignaturePad label=\{t\("material\.supplierSignature"\)\}[^>]*required=\{siteEntry\}/);
  });

  it("will not submit an entry without them", () => {
    for (const [field, label] of [
      ["vehiclePlate", "material.vehicle"],
      ["deliveryNoteNo", "material.doNo"],
      ["receiverSignature", "material.receiverSignature"],
      ["supplierSignature", "material.supplierSignature"],
    ]) {
      expect(body).toContain(`[!missingEntry.includes("${field}"), t("${label}")]`);
    }
    expect(body).toMatch(/const missingEntry = missingSiteEntry\(draft\.movementType, \{[\s\S]{0,200}receiverSignature,\s*supplierSignature,/);
  });

  it("sends both signatures with the delivery", () => {
    expect(body).toMatch(/signature: receiverSignature,\s*supplierSignature,/);
  });
});
