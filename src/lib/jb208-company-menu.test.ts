/**
 * JB208-3 (Lucas 11-16 audit): a Support Agent's 公司管理 opened 新增公司 - its
 * first child, shown to everyone - and the route rule (company.create) sent
 * them straight back to the dashboard. The child is now listed only for who
 * may create a company, so the entry opens 公司目录 for them.
 */
import { describe, expect, it } from "vitest";

import { visibleNavigation } from "@/lib/navigation";

function companyEntry(permissions: string[]) {
  const groups = visibleNavigation(
    "MSE_ADMIN",
    ["dashboard", "company_management"],
    permissions,
  );
  return groups
    .flatMap((group) => group.items)
    .find((entry) => entry.feature === "company_management");
}

describe("JB208-3 company menu", () => {
  it("opens 公司目录 for an account that cannot create a company", () => {
    const entry = companyEntry(["company.view"]);
    expect(entry?.href).toBe("/companies/admin/directory");
    expect(entry?.children?.map((child) => child.href)).not.toContain(
      "/companies/create",
    );
  });

  it("still opens 新增公司 first for who may create one", () => {
    const entry = companyEntry(["company.view", "company.create"]);
    expect(entry?.href).toBe("/companies/create");
    expect(entry?.children?.[0]?.href).toBe("/companies/create");
  });
});
