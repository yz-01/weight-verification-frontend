import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 「项目编号、分类编号及其他系统内部编号全部自动生成，不允许要求客户手动编号」
 * (JB100, 客户 11-05 事项 4 第 3 点): a new role, document category or
 * subcategory and consultant template asks for no code - the server numbers
 * it (ROLE-, DOC-, SUB-, TPL-) - and an existing one shows its code read-only.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), "src/components", file), "utf8");

describe("system codes are not typed on a new record", () => {
  it("role: code only when editing, and not editable", () => {
    const form = read("roles/create-role.tsx");
    expect(form).toMatch(/\{isEdit && \(\s*<form\.Field name="code">/);
    expect(form).not.toMatch(/name="code"\s*validators=/);
    expect(form).toMatch(/label=\{t\("roles\.field\.code"\)\}\s*disabled\b/);
  });

  it("document category and subcategory: code only when editing, read-only", () => {
    const form = read("document-workflow/documents.tsx");
    expect(form).toMatch(/\{category !== null && \(\s*<FieldWrapper label=\{t\("documents\.field\.code"\)\}/);
    expect(form).toMatch(/\{subcategory !== null && \(\s*<FieldWrapper label=\{t\("documents\.field\.code"\)\}/);
    expect(form).toMatch(/\.\.\.\(category \? \[\[code, t\("documents\.field\.code"\)\] as const\] : \[\]\)/);
    expect(form).toMatch(/\.\.\.\(subcategory \? \[\[code, t\("documents\.field\.code"\)\] as const\] : \[\]\)/);
  });

  it("consultant template: no code on the new-template form", () => {
    const form = read("consultant-workflow/application-template-workspace.tsx");
    expect(form).not.toMatch(/<FieldWrapper label=\{t\("code"\)\} required>/);
    expect(form).not.toMatch(/requires=\{\[\[code, t\("code"\)\]/);
  });
});
