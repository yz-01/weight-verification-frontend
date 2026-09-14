/**
 * Every photograph taken when a hazard is raised reaches the conversation.
 *
 * The customer took four photographs and saw one in the room (2026-09-12). The
 * backend was never the problem - it writes one `IncidentReportMessage` per
 * upload and a Django test has pinned four-in-four-out since August. The office
 * form was: a single camera whose capture handler wrote `photos: [photo]`, so
 * each shot replaced the one before it and only the last was ever uploaded
 * (F-379).
 *
 * There is no DOM in this runner, so the wiring is checked by reading the
 * screen rather than by clicking it. That is the weaker of the two halves, and
 * it is paired with the array semantics below on purpose: the source check
 * proves the office branch no longer collapses the list, and the semantics
 * check proves that not collapsing it is enough.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  FIELD_EVIDENCE_PHOTO_COUNT,
  completedFieldEvidence,
  createEmptyFieldEvidence,
  hasRequiredFieldEvidence,
} from "@/components/field-staff/field-evidence-grid";

const SAFETY = "src/components/site-operations/safety.tsx";
const source = readFileSync(SAFETY, "utf8");
/**
 * The same file with its comments removed.
 *
 * The first version of the test below searched the raw source for the defect's
 * literal shape and failed on the comment that explains the defect - a check
 * that cannot tell an explanation from the thing it explains is worse than no
 * check, because the only way to make it pass is to delete the explanation.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** The block that renders the hazard form's photo field. */
function photoField(): string {
  const start = code.indexOf('label={t("safety.field.photo")} required');
  expect(start, "the hazard form's photo field").toBeGreaterThan(-1);
  return code.slice(start, code.indexOf("</FieldWrapper>", start));
}

describe("the hazard form's photographs", () => {
  it("uses translated legacy status options without bypassing rectification", () => {
    const options = code.match(/const MANUAL_STATUSES[^=]*=\s*(\[[^\]]+\])/);
    expect(options).toBeTruthy();
    const states: string[] = JSON.parse(options![1]);
    expect(states).toEqual(["OPEN", "INVESTIGATING", "RESOLVED"]);
    for (const locale of ["en", "zh", "zh-TW", "ms"]) {
      const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"));
      for (const status of states) expect(messages.safetyRectification.status[status]).toBeTruthy();
    }
    const dialog = code.slice(code.indexOf("function SafetyStatusDialog("));
    expect(dialog).toContain("MANUAL_STATUSES.map");
    expect(dialog).toContain("safetyRectification.status.${option}");
    expect(code).toContain('!row.original.responsible_person && ["OPEN", "INVESTIGATING"].includes');
  });

  it("never replaces one photograph with the next", () => {
    // The exact shape of the defect. Kept as a literal because that is what a
    // reader would otherwise reintroduce while "simplifying" the office case.
    expect(code).not.toContain("photos: [photo]");
  });

  it("uses the same multi-photo grid in the office as on site", () => {
    const field = photoField();
    expect(field).toContain("<FieldEvidenceGrid");
    expect(
      field,
      "a single camera here is how the office lost three photographs",
    ).not.toContain("<FieldCamera");
  });

  it("still asks the office for one and the site for four", () => {
    // D-171: what changed is how many *can* be taken, not how many must be.
    // Somebody filing a hazard after the fact may hold only one photograph.
    const submit = code.slice(code.indexOf("<Button requires={fieldMode"));
    expect(submit).toContain(
      "completedPhotos.length >= FIELD_EVIDENCE_PHOTO_COUNT",
    );
    expect(submit).toContain("completedPhotos.length >= 1");
  });
});

describe("four slots keep four photographs", () => {
  it("collects every filled slot, not just the last", () => {
    const slots = createEmptyFieldEvidence();
    const taken = ["a", "b", "c", "d"].map(
      (name) => new File([name], `${name}.jpg`, { type: "image/jpeg" }),
    );
    taken.forEach((file, index) => {
      slots[index] = file;
    });

    expect(slots).toHaveLength(FIELD_EVIDENCE_PHOTO_COUNT);
    expect(completedFieldEvidence(slots).map((file) => file.name)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
      "d.jpg",
    ]);
    expect(hasRequiredFieldEvidence(slots)).toBe(true);
  });

  it("counts a partly filled set without losing what is there", () => {
    const slots = createEmptyFieldEvidence();
    slots[0] = new File(["a"], "a.jpg", { type: "image/jpeg" });
    slots[2] = new File(["c"], "c.jpg", { type: "image/jpeg" });

    // The office case: two taken, both uploaded, and the site's four-photo
    // rule correctly not satisfied.
    expect(completedFieldEvidence(slots)).toHaveLength(2);
    expect(hasRequiredFieldEvidence(slots)).toBe(false);
  });
});
