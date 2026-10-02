import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { visibleNavigation } from "@/lib/navigation";

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
    // Asked of the menu as it is built, not of the source text. This used to
    // check that the three label keys were absent from `navigation.ts`, which
    // was satisfied by deleting the pages' routes along with their menu lines
    // - and that left every card on the hub bouncing to the dashboard (B16).
    // The three are in the tree now, marked `menuHidden`; reachability is held
    // in `src/lib/consultant-settings-reachable.test.ts`.
    const listed = visibleNavigation(
      "MSE_TRACE",
      ["consultant_applications"],
      ["consultant.config"],
      true,
    )
      .flatMap((group) => group.items)
      .flatMap((entry) => entry.children ?? [])
      .map((entry) => entry.href);
    expect(listed).toContain("/consultant-settings");
    for (const href of ["/consultant-access", "/consultant-workflows", "/consultant-templates"]) {
      expect(listed).not.toContain(href);
    }
    const hub = read("src/components/consultant-workflow/consultant-settings-hub.tsx");
    for (const href of ["/consultant-access", "/consultant-workflows", "/consultant-templates"]) {
      expect(hub).toContain(`"${href}"`);
    }
  });
});
