import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";

import { roleDescription, roleLabel, roleName } from "./role-labels";

const tEn = createTranslator({ locale: "en", messages: en });
const tZh = createTranslator({ locale: "zh", messages: zh });

describe("roleLabel", () => {
  it("shows a preset role by its code in the reader's language", () => {
    expect(roleLabel("company_admin", "Company Administrator", tEn)).toBe("Company Administrator");
    expect(roleLabel("company_admin", "Company Administrator", tZh)).toBe(
      zh.roles.system_.company_admin,
    );
    expect(zh.roles.system_.company_admin).not.toBe("Company Administrator");
  });

  it("recognises a preset by its seeded name when only the name travels", () => {
    expect(roleLabel(null, "Company Administrator", tZh)).toBe(zh.roles.system_.company_admin);
    expect(roleLabel(undefined, "Site Staff", tZh)).toBe(zh.roles.system_.site_staff);
  });

  it("keeps a custom role's own name", () => {
    expect(roleLabel(null, "Lorry Marshal", tZh)).toBe("Lorry Marshal");
    expect(roleLabel("custom_1", "Lorry Marshal", tZh)).toBe("Lorry Marshal");
    expect(roleLabel(null, null, tZh)).toBe("");
  });
});

describe("a preset the company renamed is its own (JB219, 客户 11-18 事项 4)", () => {
  it("shows the company's own name and description, not the preset's", () => {
    const renamed = { code: "project_manager", name: "工程部主管", description: "管工地" };
    expect(roleName(renamed, tZh)).toBe("工程部主管");
    expect(roleDescription(renamed, tZh)).toBe("管工地");
    expect(roleLabel("project_manager", "工程部主管", tZh)).toBe("工程部主管");
  });

  it("still shows an untouched preset in the reader's language", () => {
    const untouched = { code: "project_manager", name: "Project Manager", description: "Runs projects" };
    expect(roleName(untouched, tZh)).toBe(zh.roles.system_.project_manager);
    expect(roleDescription(untouched, tZh)).toBe(zh.roles.systemDescription.project_manager);
  });
});
