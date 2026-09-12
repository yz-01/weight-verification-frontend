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

  it("keeps the mobile navigation grid aligned with its five buttons", () => {
    const code = source("src/components/field-staff/field-staff-workspace.tsx");
    expect(code).toContain("grid-cols-5");
    expect(code).not.toContain("grid-cols-6");
  });

  it("keeps a task id in the URL so a refreshed workflow uses the same draft", () => {
    const code = source("src/components/field-staff/field-staff-workspace.tsx");
    expect(code).toContain("getFieldTask(requestedTaskId)");
    expect(code).toContain("if (nextTaskId) url.searchParams.set(\"task\", nextTaskId)");
    expect(code).toContain('replaceFieldUrl("records", mode, task.id)');
  });
});
