import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Consultant applications are simple to start (T-373, D-254).
 *
 * The three things that made the module unusable, each held to its fix: the
 * form demanded a workflow nobody had built; nothing on screen said what the
 * steps were; and three settings pages sat in the menu beside the two pages
 * people work in.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("consultant applications are simple to use (T-373)", () => {
  const form = read("src/components/consultant-workflow/application-form.tsx");

  it("does not demand a workflow or a template to save", () => {
    expect(form).not.toMatch(/label=\{t\("field\.workflow"\)\} required/);
    expect(form).not.toMatch(/label=\{t\("field\.template"\)\} required/);
    expect(form).not.toMatch(/\[selectedWorkflow, t\("field\.workflow"\)\]/);
    // They are still there, folded under "advanced".
    expect(form).toMatch(/<details[\s\S]*t\("form\.advanced"\)[\s\S]*field\.workflow[\s\S]*field\.template[\s\S]*<\/details>/);
  });

  it("says how it is used where the work starts", () => {
    expect(read("src/components/consultant-workflow/applications-list.tsx")).toMatch(/<ConsultantHowTo/);
    const howTo = read("src/components/consultant-workflow/consultant-how-to.tsx");
    for (const step of ["create", "submit", "decide"]) expect(howTo).toContain(`"${step}"`);
  });

  it("keeps settings behind one menu entry, pages still reachable", () => {
    const nav = read("src/lib/navigation.ts");
    expect(nav).toContain('"nav.submodule.consultantSettings"');
    for (const key of ["consultantWorkflows", "consultantAccess", "consultantTemplates"]) {
      expect(nav).not.toContain(`"nav.submodule.${key}"`);
    }
    const hub = read("src/components/consultant-workflow/consultant-settings-hub.tsx");
    for (const href of ["/consultant-access", "/consultant-workflows", "/consultant-templates"]) {
      expect(hub).toContain(`"${href}"`);
    }
  });
});
