import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every field form that shows the draft banner must actually save its fields.
 *
 * F-282: all nine field record modes are wrapped in `<FieldDraft>`, which
 * renders "草稿已保存" unconditionally, but only three of them called
 * `useDraftState`. The other six kept their values in plain `useState`, so a
 * worker who mis-tapped lost everything they had typed *while the banner told
 * them it was saved*. A banner that lies is worse than no banner, and it is
 * the exact "shell that looks finished" the customer keeps asking us to avoid.
 *
 * Why this is asserted per *function body* rather than per file: three of the
 * six forms live in one 3000-line module alongside office-only dialogs. A
 * file-level `toContain` would pass as soon as any one form in the file was
 * wired, which is how a six-form gap hides behind a one-form fix.
 *
 * This is a source-level guard and it is deliberately not the whole story: it
 * proves the hook is named in the right function, not that the value survives
 * a real page close. The runtime half is `e2e/field-draft.spec.ts`, which
 * types into the form, closes the page and reopens it. Both are required —
 * see the reasoning in `field-draft-integration.test.ts` for why a source
 * assertion alone was what let F-282 through in the first place.
 */

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

/**
 * Slice one component out of a module.
 *
 * Anchors on the declaration and stops at the next top-level `function` /
 * `export function`, which is the shape every module here uses. Throws rather
 * than returning an empty string when the anchor is gone: a renamed component
 * must fail loudly, not silently assert against nothing.
 */
function componentBody(file: string, name: string): string {
  const code = source(file);
  const start = code.search(new RegExp(`^(?:export )?function ${name}\\b`, "m"));
  if (start === -1) {
    throw new Error(`${name} not found in ${file} - was it renamed?`);
  }
  const rest = code.slice(start + 1);
  const end = rest.search(/^(?:export )?function \w/m);
  return end === -1 ? rest : rest.slice(0, end);
}

interface FormCase {
  /** Which record mode the worker opens on the phone. */
  mode: string;
  file: string;
  component: string;
  /** Exact `useDraftState` calls this form must make, one per saved field. */
  fields: string[];
}

const FORMS: FormCase[] = [
  {
    mode: "equipment",
    file: "src/components/contractor-ops/operations-workspaces.tsx",
    component: "MovementDialog",
    // Namespaced by `row.id`: this dialog opens per equipment row, while the
    // draft store is scoped per *task*. Without the suffix, typing against
    // excavator A and then opening excavator B would show A's numbers under
    // B's name - a draft that reports the wrong machine is worse than none.
    fields: [
      'useDraftState(`operator:${row.id}`',
      'useDraftState(`vehicle:${row.id}`',
      'useDraftState(`deliveryNote:${row.id}`',
      'useDraftState(`quantity:${row.id}`',
      'useDraftState<EquipmentUnit>(`unit:${row.id}`',
      'useDraftState(`notes:${row.id}`',
      'useDraftState<File[]>(`photos:${row.id}`',
      'useDraftState(`fieldEvidence:${row.id}`',
      'useDraftState<File | undefined>(`deliveryNotePhoto:${row.id}`',
    ],
  },
  {
    mode: "progress",
    file: "src/components/contractor-ops/operations-workspaces.tsx",
    component: "ProgressDialog",
    fields: [
      'useDraftState("project"',
      'useDraftState("phase"',
      'useDraftState("percent"',
      'useDraftState("description"',
      'useDraftState<File[]>("photos"',
      'useDraftState("fieldEvidence"',
    ],
  },
  {
    mode: "outgoing",
    file: "src/components/contractor-ops/operations-workspaces.tsx",
    component: "OutgoingDialog",
    fields: [
      'useDraftState("project"',
      'useDraftState("form"',
      'useDraftState("photos"',
    ],
  },
  {
    mode: "disposal",
    file: "src/components/contractor-ops/site-disposal-workspaces.tsx",
    component: "CreateDisposalDialog",
    fields: [
      'useDraftState("project"',
      'useDraftState("description"',
      'useDraftState("locationDescription"',
      'useDraftState("volume"',
      'useDraftState("weight"',
      'useDraftState("preferred"',
      'useDraftState("note"',
      'useDraftState<File[]>("photos"',
      'useDraftState("fieldEvidence"',
    ],
  },
  {
    mode: "waste",
    file: "src/components/field-staff/field-records-panel.tsx",
    component: "WasteOutgoingCapturePanel",
    fields: [
      'useDraftState("project"',
      'useDraftState("category"',
      'useDraftState("quantity"',
      'useDraftState("unit"',
      'useDraftState("note"',
      'useDraftState("evidence"',
    ],
  },
  {
    mode: "consultant",
    file: "src/components/field-staff/field-records-panel.tsx",
    component: "ConsultantCapturePanel",
    fields: [
      'useDraftState("project"',
      'useDraftState("evidence"',
      'useDraftState("category"',
      'useDraftState("note"',
    ],
  },
];

describe("every field form that shows the draft banner actually saves (F-282)", () => {
  for (const form of FORMS) {
    describe(`${form.mode} (${form.component})`, () => {
      for (const field of form.fields) {
        it(`saves ${field.replace(/^useDraftState(<.*?>)?\(/, "").replace(/[`"']/g, "")}`, () => {
          expect(componentBody(form.file, form.component)).toContain(field);
        });
      }

      it("clears the draft once the submission is accepted", () => {
        const body = componentBody(form.file, form.component);
        expect(body).toContain("const clearDraft = useClearDraft()");
        expect(body).toContain("clearDraft()");
      });
    });
  }

  it("imports the draft hooks in each module that uses them", () => {
    for (const file of new Set(FORMS.map((form) => form.file))) {
      expect(source(file)).toContain(
        'from "@/components/field-staff/field-draft"',
      );
    }
  });
});

/**
 * The waste form's collection address was removed, not forgotten (T-227).
 *
 * The customer moved the order address to the office: site staff no longer
 * type it, the server falls back to the project address, and the office can
 * name a gate when it raises the order. Nothing on the screen shows that this
 * was a decision, so without this guard the field comes back the first time
 * somebody reads the office form and thinks the phone should match it - and
 * two people typing the same address is the problem the removal solved.
 *
 * Asserted against the component body, not the file: `field-records-panel.tsx`
 * is one module holding several forms, and the address label is still legitimately
 * used by the office workspace in another file.
 */
describe("the field waste form no longer asks for the collection address (T-227)", () => {
  /**
   * The component's body with its comments taken out.
   *
   * These three assertions are the only ones here that read "this must be
   * absent", and the comment left in place of the removed field names the
   * server helper `set_pickup_address` - which tripped the check on its own
   * explanation. A note about why a field is gone is exactly what should stay;
   * the thing that must not come back is code.
   *
   * Block comments go wholesale; line comments only when the whole line is
   * one, so a `//` inside a string stays put.
   */
  const code = () =>
    componentBody(
      "src/components/field-staff/field-records-panel.tsx",
      "WasteOutgoingCapturePanel",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

  it("still finds the form, so these absences mean something", () => {
    // Without this, a rename would make all three pass by asserting nothing.
    expect(code()).toContain('useDraftState("category"');
  });

  it("has no address input", () => {
    expect(code()).not.toContain("field.pickupAddress");
  });

  it("keeps no draft slot for one", () => {
    expect(code()).not.toContain("pickupAddress");
  });

  it("sends no address with the submission", () => {
    expect(code()).not.toContain("pickup_address");
  });
});
