/**
 * PDF 统一操作规则 (Lucas, 2026-10-10): 「所有栏目采用相同操作方式」. Every file
 * the system exports offers 预览 · 打印 · 导出 · 发送 through the one shared
 * component, so no screen keeps a bare 「PDF」/「Excel」 download button of its
 * own that skips the preview.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.join(process.cwd(), "src", "components");
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

function screens(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return screens(full);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [full] : [];
  });
}

describe("one way to handle an exported file", () => {
  it("leaves no bare PDF / Excel download button on any screen", () => {
    const bare = /<FileDown\s*\/>|>\s*(?:PDF|XLSX|Excel)\s*<\/Button>/;
    const offenders = screens(ROOT)
      .filter((file) => bare.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it("offers preview, print, export and send under each format of the export menu", () => {
    const menu = read("src/components/shared/export-button.tsx");
    expect(menu).toMatch(/captureDownload\(\(\) => onExport\(format\)\)/);
    expect(menu).toMatch(/fileActionsFor\(format === "pdf" \? "pdf" : "sheet", allowSave\)/);
    const actions = read("src/components/shared/file-actions.tsx");
    expect(actions).toMatch(/format === "pdf" \? \["preview", "print", "save", "share"\] : \["preview", "save", "share"\]/);
  });

  it("says beside 发送 that sending a file is not an approval or a receipt", () => {
    const zh = JSON.parse(read("src/messages/zh.json"));
    expect(zh.fileActions.shareHint).toMatch(/不是系统内的审批或签收确认/);
    for (const file of ["src/components/shared/export-button.tsx", "src/components/shared/file-actions.tsx"]) {
      expect(read(file)).toMatch(/shareHint/);
    }
  });
});
