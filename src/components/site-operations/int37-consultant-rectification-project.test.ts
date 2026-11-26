/**
 * qa2 observation (JB274, 客户 11-26 事项 15): the consultant's 整改 form started
 * with 项目 empty while his top bar had a project - one more pick. It starts
 * with the top bar's project now, still changeable.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createStartProject } from "@/components/site-operations/safety";

const consultant = (projectId: string | null) => ({
  account_type: "CONSULTANT" as const,
  active_project: projectId ? ({ project_id: projectId } as never) : null,
});

describe("the consultant's 整改 form starts on his top bar's project", () => {
  it("takes the top bar's project", () => {
    expect(createStartProject("", consultant("p-7"))).toBe("p-7");
  });

  it("stays empty when the top bar has none", () => {
    expect(createStartProject("", consultant(null))).toBe("");
  });

  it("keeps a project the page names itself (the phone's task)", () => {
    expect(createStartProject("p-task", consultant("p-7"))).toBe("p-task");
  });

  it("leaves the office form as it was", () => {
    expect(createStartProject("", { account_type: "TENANT", active_project: null })).toBe("");
  });

  it("is what the create dialog starts with, and the project stays a choice", () => {
    const source = readFileSync("src/components/site-operations/safety.tsx", "utf-8");
    expect(source).toContain("initialProject={createStartProject(initialProject, user)}");
    expect(source).toContain("project: initialProject,");
  });
});
