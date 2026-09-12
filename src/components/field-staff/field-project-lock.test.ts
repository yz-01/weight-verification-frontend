import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

const PANEL = "src/components/field-staff/field-records-panel.tsx";

/**
 * A material record belongs to one project, and when the record is opened from
 * a field task that project is already decided - the task carries it in. Left
 * editable, a mis-tap on a phone files the delivery against the wrong site,
 * and nothing downstream can tell that happened.
 *
 * Locking is only right when something upstream actually supplied the project.
 * Opened straight from the record chooser there is no task, so the picker has
 * to stay open or field staff cannot raise a record at all - which is why the
 * condition is the prop, not a flat `true`.
 */
describe("field capture panels lock a project that was handed to them", () => {
  const picker = /<ProjectPicker\b[\s\S]*?\/>/g;

  function pickerFor(panelName: string): string {
    const code = source(PANEL);
    const start = code.indexOf(`function ${panelName}(`);
    expect(start, `${panelName} is defined`).toBeGreaterThan(-1);
    const nextPanel = code.indexOf("\nfunction ", start + 1);
    const body = code.slice(start, nextPanel === -1 ? undefined : nextPanel);
    const found = body.match(picker);
    expect(found, `${panelName} renders a ProjectPicker`).toBeTruthy();
    return found![0];
  }

  it("locks the material picker once a task supplied the project", () => {
    expect(pickerFor("MaterialCapturePanel")).toContain(
      "disabled={Boolean(initialProject)}",
    );
  });

  it("keeps the waste outgoing picker on the same rule", () => {
    expect(pickerFor("WasteOutgoingCapturePanel")).toContain(
      "disabled={Boolean(initialProject)}",
    );
  });

  it("still hands the task's project to the material panel", () => {
    const code = source(PANEL);
    expect(code).toContain(
      '<MaterialCapturePanel initialSupplierToken={initialSupplierToken} initialProject={task?.project}',
    );
  });

  it("leaves the picker open when nothing supplied a project", () => {
    // `Boolean("")` is false, so a panel reached without a task keeps its
    // picker usable. A flat `disabled` or `disabled={true}` would strand
    // field staff who open the record straight from the chooser.
    const material = pickerFor("MaterialCapturePanel");
    expect(material).not.toMatch(/disabled=\{true\}/);
    expect(material).not.toMatch(/\bdisabled\s*\/>/);
    expect(material).not.toMatch(/\bdisabled\s+/);
  });
});
