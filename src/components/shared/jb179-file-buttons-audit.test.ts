import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * JB179-5 guard (客户 11-12 下午追加 2, last line): 「请同时检查其他业务模块的
 * 报表及结账单，确保预览、打印、下载、发送功能一致。」
 *
 * Every report, statement and list file in the back office is offered through
 * the one shared set - `ExportButton` (a list or report: 导出 ▾ with 预览 ·
 * 打印 · 导出 · 发送 under each format), `FileActionButtons` /
 * `RecordExportButton` (one document's PDF), `ArchivedReportActions`
 * (报表导出历史), or `useFileActions` itself (材料领用结账单, JB179). This test
 * pins the few places that print, save or leave out a button on their own,
 * each with its reason, so a new screen cannot quietly do it differently.
 * Read from the source, the way the other layout guards are.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
  });
}

const COMPONENTS = walk("src/components");
const uses = (pattern: RegExp) => COMPONENTS.filter((file) => pattern.test(read(file))).sort();

describe("report, statement and list files share one set of buttons (JB179-5)", () => {
  it("prints or saves a file by itself only where it is not a report", () => {
    expect(uses(/\b(saveFile|printFile|printPage)\(/)).toEqual([
      // A permit's uploaded file (not a report): its own 预览 / 打印 / 下载.
      "src/components/permits/permit-parts.tsx",
      // QR labels and posters, printed as the image they are.
      "src/components/projects/project-qr-panel.tsx",
      "src/components/qrcodes/admin-qr-workspace.tsx",
      "src/components/recycler-business/recycler-customers-workspace.tsx",
      // The machinery itself.
      "src/components/shared/file-actions.tsx",
      // 紧急在场名单 (C21): its 打印 is the list as it stands, signed with
      // the PIN and logged (JB27); 预览 · 导出 · 发送 are ExportButton's Excel.
      "src/components/site-access/emergency-list-workspace.tsx",
      "src/components/suppliers/supplier-qr-panel.tsx",
    ]);
  });

  it("leaves 发送 out only where the file has its own 发送 beside it", () => {
    // Evidence packages (JB51): 「对外分享（WhatsApp / 电邮）」 writes the
    // send into the package's 发送记录, next to the three buttons.
    expect(uses(/omit=\{\["share"\]\}/)).toEqual([
      "src/components/contractor-ops/multi-engine.tsx",
      "src/components/contractor-ops/package-exchange.tsx",
    ]);
  });

  it("offers one format only where the server makes one", () => {
    const lines = COMPONENTS.flatMap((file) =>
      read(file)
        .split("\n")
        .filter((line) => /formats=\{\["(xlsx|pdf)"\]\}/.test(line))
        .map(() => file),
    );
    // A one-PDF document (a final report, a package item, a weigh ticket) or
    // the emergency list's Excel - each still with its 预览 · 导出 · 发送.
    expect([...new Set(lines)].sort()).toEqual([
      "src/components/consultant-workflow/application-detail.tsx",
      "src/components/contractor-ops/multi-engine.tsx",
      "src/components/site-access/emergency-list-workspace.tsx",
      "src/components/weighing/print-ticket-button.tsx",
    ]);
  });

  it("leaves 导出 out only for someone without the export permission", () => {
    // (file-actions.tsx is the machinery, whose comment names the prop.)
    expect(uses(/allowSave=\{(?!true)/).filter((file) => file !== "src/components/shared/file-actions.tsx")).toEqual([
      "src/components/suppliers/supplier-return-badge.tsx",
    ]);
    expect(read("src/components/suppliers/supplier-return-badge.tsx")).toContain('allowSave={can("report.export")}');
  });

  it("gives the 材料领用结账单 the same four as every other file (JB179-1..3)", () => {
    const statement = read("src/components/contractor-ops/issue-statement.tsx");
    expect(statement).toContain('fileActionsFor("pdf").map((action)');
    expect(statement).toContain("useFileActions()");
  });
});
