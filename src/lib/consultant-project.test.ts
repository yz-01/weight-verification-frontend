import { describe, expect, it } from "vitest";

import type { ConsultantProjectAccess } from "@/interfaces/auth";
import { consultantProjectToAutoSelect } from "@/lib/consultant-project";

/** A consultant with one project lands on it without choosing (C2). */
function grant(projectId: string, isCurrent = true): ConsultantProjectAccess {
  return {
    grant_id: `grant-${projectId}`,
    project_id: projectId,
    project_code: projectId.toUpperCase(),
    project_name: `Project ${projectId}`,
    company_id: "company",
    company_name: "Contractor",
    organization_name: "Consultants",
    permissions: ["approval.view"],
    valid_from: "2026-01-01T00:00:00Z",
    valid_until: null,
    is_current: isCurrent,
  };
}

function consultant(projects: ConsultantProjectAccess[], active: string | null = null) {
  return {
    account_type: "CONSULTANT" as const,
    consultant_projects: projects,
    active_project: active
      ? { project_id: active, project_name: "", company_id: "company", company_name: "" }
      : null,
  };
}

describe("consultant project auto-select (C2)", () => {
  it("selects the only current project when none is active", () => {
    expect(consultantProjectToAutoSelect(consultant([grant("a")]))).toBe("a");
  });

  it("does nothing once that project is active", () => {
    expect(consultantProjectToAutoSelect(consultant([grant("a")], "a"))).toBeNull();
  });

  it("moves off a project whose grant is no longer current", () => {
    expect(consultantProjectToAutoSelect(consultant([grant("a"), grant("b", false)], "b"))).toBe("a");
  });

  it("leaves the choice to the consultant when there are several", () => {
    expect(consultantProjectToAutoSelect(consultant([grant("a"), grant("b")]))).toBeNull();
  });

  it("has nothing to select without a current project", () => {
    expect(consultantProjectToAutoSelect(consultant([grant("a", false)]))).toBeNull();
    expect(consultantProjectToAutoSelect(consultant([]))).toBeNull();
  });

  it("never touches anybody who is not a consultant", () => {
    expect(
      consultantProjectToAutoSelect({ ...consultant([grant("a")]), account_type: "TENANT" }),
    ).toBeNull();
    expect(consultantProjectToAutoSelect(null)).toBeNull();
  });
});
