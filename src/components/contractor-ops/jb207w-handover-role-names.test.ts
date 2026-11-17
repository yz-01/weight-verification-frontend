import { readFileSync } from "node:fs";
import path from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { roleLabel } from "@/lib/role-labels";
import zh from "@/messages/zh.json";

/**
 * JB207W round 2 (walk 11-17, JB206 6): 环保材料出场 【转交】 listed
 * 「王经理（总部） · Headquarters」 on a zh screen - the stored English role
 * name. The picker words a seeded role through the catalogue by its code, as
 * the project team picker does; a role the company named itself stays as typed.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const t = createTranslator({ locale: "zh", messages: zh as never }) as unknown as Parameters<
  typeof roleLabel
>[2];

describe("转交 picker role names", () => {
  it("goes through roleLabel with the code the server now sends", () => {
    const page = read("src/components/contractor-ops/waste-outgoing-workspace.tsx");
    const dialog = page.slice(page.indexOf("function HandOverDialog"));
    expect(dialog).toContain("roleLabel(row.role_code, row.role, tRoot)");
    expect(dialog).not.toContain("`${row.name} · ${row.role}`");
    expect(read("src/services/waste-outgoing.service.ts")).toContain("role_code?: string");
  });

  it("reads 总部 / 公司管理员 / 项目经理 in Chinese, a custom name as typed", () => {
    expect(roleLabel("headquarters", "Headquarters", t)).toBe("总部");
    expect(roleLabel("company_admin", "Company Administrator", t)).toBe("公司管理员");
    expect(roleLabel("project_manager", "Project Manager", t)).toBe("项目经理");
    expect(roleLabel("scoped_pm", "工地主管（自定）", t)).toBe("工地主管（自定）");
  });
});
