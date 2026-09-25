import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("field form draft integration", () => {
  const cases = [
    {
      file: "src/components/site-operations/hazard-conversation.tsx",
      scope: "hazard-conversation:${incidentId}",
      fields: ['useDraftState("body"', 'useDraftState<File | null>("file"'],
    },
    {
      file: "src/components/field-staff/photo-approvals.tsx",
      scope: "photo-approvals",
      fields: ['useDraftState("returningId"', 'useDraftState("note"'],
    },
    {
      file: "src/components/field-staff/field-access-management.tsx",
      scope: "field-access:${initialUser?.id ?? \"new\"}",
      fields: ['useDraftState<AccessMode>("mode"', 'useDraftState("fullName"', 'useDraftState<string[] | null>("projectIds"'],
    },
  ] as const;

  for (const item of cases) {
    it(`protects and clears ${item.file}`, () => {
      const code = source(item.file);
      expect(code).toContain("<FieldDraft");
      expect(code).toContain(item.scope);
      for (const field of item.fields) expect(code).toContain(field);
      expect(code).toContain("const clearDraft = useClearDraft()");
      expect(code).toContain("clearDraft()");
    });
  }

  it("keeps the mobile navigation grid aligned with however many buttons it has", () => {
    // Derived, not pinned to a number. The count changed once already when
    // 「位置」 was removed (T-321), and a hard-coded 5 turns that into a false
    // red while saying nothing about the invariant that actually matters:
    // the column count and the button count must agree, or the icons bunch to
    // one side of an empty cell.
    const code = source("src/components/field-staff/field-staff-workspace.tsx");
    const buttons = (code.match(/<MobileNavButton\b/g) ?? []).length;
    expect(buttons).toBeGreaterThan(0);
    expect(code).toContain(`grid-cols-${buttons}`);
  });

  it("keeps a task id in the URL so a refreshed workflow uses the same draft", () => {
    const code = source("src/components/field-staff/field-staff-workspace.tsx");
    expect(code).toContain("getFieldTask(requestedTaskId)");
    expect(code).toContain("if (nextTaskId) url.searchParams.set(\"task\", nextTaskId)");
    expect(code).toContain('replaceFieldUrl("records", mode, task.id)');
  });
});
