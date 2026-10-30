import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATEGORY_MODULE_KEYS,
  categoryManagementAddress,
  parseAlertAmounts,
  parseAlertPercentages,
} from "@/lib/category-modules";

/**
 * Category Management is one page that does everything (T-384, T-385).
 *
 * Lucas 2026-09-25: 「全部栏目都可以直接在同个页面新增，不需要跳转到其他页面，
 * 就是会有弹窗表格，也不需要打开该模块，不然页面一直跳来跳去太乱了」, 「我觉得
 * 这页不需要了 /material-columns」, 「全部的上级栏目也不需要」 and 「图1也不需要，
 * 全部人都是可以上传的」 (D-263 - D-266).
 *
 * Asserted by source, because the way this drifts is a quiet `<Link>` coming
 * back for one module, or a parent picker reappearing in the column form.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

const MANAGEMENT = "src/components/contractor-ops/category-management.tsx";
const WORKSPACES = "src/components/contractor-ops/operations-workspaces.tsx";

/** The body of one top-level function, up to the next top-level function. */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} exists`).toBeGreaterThan(-1);
  const next = source.slice(start + signature.length).search(/\n(export )?function /);
  return next === -1
    ? source.slice(start)
    : source.slice(start, start + signature.length + next);
}

function modulesBlock(): string {
  const source = read(MANAGEMENT);
  const block = source.match(/const MODULES: Module\[\] = \[([\s\S]*?)\n\];/)?.[1];
  expect(block, "MODULES is declared").toBeTruthy();
  return block as string;
}

describe("every module is managed on this one page (D-264)", () => {
  it("lists the modules a 分类组 can belong to (2026-10 B1; I10 adds Progress Claim)", () => {
    const block = modulesBlock();
    const keys = [
      ...[...block.matchAll(/columnModule\("([a-z]+)"/g)].map((m) => m[1]),
      ...[...block.matchAll(/\bkey: "([a-z]+)"/g)].map((m) => m[1]),
    ];
    expect(keys.sort()).toEqual([...CATEGORY_MODULE_KEYS].sort());
    // 材料、设备、隐患整改、环保材料出场 (Q5, X5) and, since I10 (ID6),
    // Progress Claim. The groups on the left are the project's (I11).
    expect([...CATEGORY_MODULE_KEYS].sort()).toEqual([
      "claim", "ehs", "equipment", "material", "recycle",
    ]);
    // 现场资料分类 was never a business module (D-285); Claim 分类
    // duplicated 杂费报销分类 (D-286); 文件分类 lives on 文档档案, 施工阶段 on
    // 施工进度, and progress, clearance, consultant and sundry have none.
    for (const gone of [
      "field", "document", "phase", "progress", "debris", "consultant", "sundry",
    ]) {
      expect(keys).not.toContain(gone);
    }
  });

  it("lets 隐患整改分类 be added, edited and removed (H18, HD4)", () => {
    const source = read(MANAGEMENT);
    expect(modulesBlock()).toContain('columnModule("ehs", "EHS"),');
    expect(source).not.toMatch(/readOnly/);
    // Every create, edit, delete and reorder button hangs off canManage.
    expect(source).toMatch(/const canManage = can\(active\.manage\);/);
    expect(source).toMatch(/const createButton = canManage &&/);
    expect(source).toMatch(/const canReorder =\s+Boolean\(active\.columnKind\) && canManage/);
    // 施工准证申请 is the system's: marked, and offers no removal.
    expect(source).toMatch(/row\.column\?\.kind === "EHS" && row\.code === PERMIT_COLUMN_CODE/);
    // I35: a preset with no records can be deleted; only the permit column,
    // a fixed 「其他」 and a category holding records offer no switch.
    // No switch where removing is blocked; a spacer keeps the bin in line (Lucas 10-30).
    expect(source).toMatch(/removeBlock\(row\) \? \(\s*\/\/[^\n]*\n\s*<span aria-hidden className="w-11 shrink-0" \/>\s*\) : \(\s*<Switch/);
    expect(source).not.toMatch(/row\.waste\?\.is_system \|\|/);
    const block = functionBody(source, "const removeBlock");
    expect(block).toMatch(/return "permit"/);
    expect(block).toMatch(/row\.column\?\.is_fixed \|\| row\.waste\?\.is_other/);
    expect(block).toMatch(/row\.recordCount > 0 \? "records" : null/);
  });

  it("gives every module a delete", () => {
    const source = read(MANAGEMENT);
    const block = modulesBlock();
    // The column modules get theirs from the shared helper.
    expect(functionBody(source, "const columnModule")).toMatch(
      /remove: deleteProjectCategory/,
    );
    for (const [key, remove] of [["recycle", "deleteWasteCategory"]]) {
      const entry = block.slice(block.indexOf(`key: "${key}"`));
      expect(entry, `${key} deletes`).toMatch(
        new RegExp(`^[\\s\\S]*?remove: ${remove},`),
      );
    }
  });

  it("opens an editor in place for every module, never another screen", () => {
    const editor = functionBody(read(MANAGEMENT), "function CategoryEditor(");
    expect(editor).toMatch(/if \(module\.columnKind\)[\s\S]*?<CategoryDialog/);
    expect(editor).toMatch(/<WasteCategoryDialog/);
    // 文件分类 and 施工阶段 are managed on their own pages now (Q5).
    expect(editor).not.toMatch(/DocumentCategoryDialog|PhaseDialog/);
  });

  it("has no link, 「打开该模块」 or 「到该模块新增」 left", () => {
    const source = read(MANAGEMENT);
    expect(source).not.toMatch(/from "next\/link"/);
    expect(source).not.toMatch(/<Link\b/);
    expect(source).not.toMatch(/\bhref[:=]/);
    expect(source).not.toMatch(/router\.push/);
    expect(source).not.toMatch(/t\("manage"\)/);
    expect(source).not.toMatch(/createElsewhere/);
    // Creating is a dialog on this page.
    expect(source).toMatch(/setEditing\("new"\)/);
    // And deleting is armed by a switch, never a confirm dialog (rule 8,
    // HD4), with the server's refusal shown when it says no.
    expect(source).not.toMatch(/ConfirmDialog/);
    expect(source).toMatch(/removeBlock\(row\) !== null \|\| armed !== row\.id \|\| removal\.isPending\}/);
    expect(source).toMatch(/t\("removeFailed", refusal\)/);
  });

  it("shows the material money in the material table (D-263)", () => {
    const source = read(MANAGEMENT);
    for (const field of [
      "archived_deliveries",
      // Per unit, not tonnes only (D-281): concrete is cubic metres.
      "quantities",
      "budget_used_percent",
      "spend_uncounted_deliveries",
    ]) {
      expect(source, field).toContain(field);
    }
  });
});

describe("the column form (D-265, D-266; X1 for equipment)", () => {
  const dialog = functionBody(read(WORKSPACES), "export function CategoryDialog(");

  it("offers a major class to equipment only (2026-10 B2, X1)", () => {
    // The picker hangs off the kind, and every other kind's payload drops it.
    expect(dialog).toMatch(/const isEquipment = form\.kind === "EQUIPMENT";/);
    expect(dialog).toMatch(/const equipmentParentField = \(\s*<FieldWrapper\s+label=\{modules\("equipment\.majorClassOf"\)\}/);
    expect(dialog).toMatch(/\{!simpleNew && isEquipment && equipmentParentField\}/);
    expect(dialog).toMatch(/\{ \.\.\.form, parent: undefined \}/);
  });

  it("numbers every new category on the server and shows the code read-only (J28)", () => {
    // No code to type: 「保存后自动生成」 on a new one, read-only once made.
    expect(dialog).toMatch(/const simpleNew = !row;/);
    expect(dialog).toMatch(/if \(!row\) payload\.code = "";/);
    expect(dialog).toMatch(/placeholder=\{modules\("codeAutoPlaceholder"\)\} disabled/);
    expect(dialog).not.toMatch(/set\("code"/);
    expect(dialog).not.toMatch(/\[autoCode \|\| form\.code/);
  });

  it("has no upload or edit lists", () => {
    for (const gone of [
      /parentOptions/,
      /upload_roles|upload_users/,
      /edit_roles|edit_users/,
      /categories\.uploadTitle/,
      /categories\.editPermissionTitle/,
    ]) {
      expect(dialog).not.toMatch(gone);
    }
  });

  it("keeps who can see the column, and the material budget", () => {
    expect(dialog).toMatch(/access_mode/);
    expect(dialog).toMatch(/tracks_spend: tracksSpend/);
    expect(dialog).toMatch(/budget_alert_percentages/);
  });

  it("no longer writes those fields at all", () => {
    const payload = read("src/interfaces/contractor-ops.ts").match(
      /export interface ProjectCategoryPayload \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(payload).toBeTruthy();
    expect(payload).not.toMatch(/upload_|edit_/);
    // `parent` only for equipment (X1); the server ignores it on other kinds.
    expect(payload).toMatch(/parent\?: string \| null;/);
  });
});

describe("the retired screens (D-263)", () => {
  it("deletes the material columns screen", () => {
    expect(existsSync(path.join(ROOT, "src/components/receipts/material-columns.tsx"))).toBe(false);
  });

  it("turns both old routes into redirects", () => {
    for (const page of [
      "src/app/(dashboard)/material-columns/page.tsx",
      "src/app/(dashboard)/project-categories/page.tsx",
    ]) {
      const source = read(page);
      expect(source, page).toMatch(/redirect\(categoryManagementAddress\(/);
      expect(source, page).not.toMatch(/components\//);
    }
  });

  it("carries the project, module and create request across", () => {
    expect(
      categoryManagementAddress({ kind: "equipment", project: "p1", create: "1" }),
    ).toBe("/category-management?project=p1&module=equipment&create=1");
    // A retired module's old address lands on the first module (2026-10 B1).
    expect(
      categoryManagementAddress({ kind: "CONSTRUCTION_WASTE" }),
    ).toBe("/category-management?module=material");
    expect(categoryManagementAddress({ module: "document" })).toBe(
      "/category-management?module=material",
    );
    expect(categoryManagementAddress({ module: "material" })).toBe(
      "/category-management?module=material",
    );
    // A hand-typed, unknown or retired kind lands on the first module.
    expect(categoryManagementAddress({ kind: "nope" })).toBe(
      "/category-management?module=material",
    );
    expect(categoryManagementAddress({ kind: "FIELD" })).toBe(
      "/category-management?module=material",
    );
  });

  it("leaves no link in the app pointing at them", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          const relative = path.relative(ROOT, full).split(path.sep).join("/");
          // The registry keeps them as route aliases so the redirect is reached.
          if (relative === "src/lib/navigation.ts") continue;
          const source = readFileSync(full, "utf8");
          // Only real destinations - an href or a push - not prose that
          // names the old routes in a comment.
          if (
            /(href\s*[:=]\s*\{?\s*|router\.(push|replace)\()["'`]\/(material-columns|project-categories)\b/.test(
              source,
            )
          ) {
            offenders.push(relative);
          }
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});

describe("what the retired screen did still has a place", () => {
  it("moves a delivery to another material column from the delivery itself", () => {
    // The material-columns page was the only caller of `refileReceipt`. The
    // server refuses to remove a column that holds deliveries, so without a
    // way to move them that refusal would name an action nobody can take.
    const receipt = read("src/components/receipts/view-receipt.tsx");
    expect(receipt).toContain("<FileIntoColumnDialog");
    expect(receipt).toMatch(/kind="MATERIAL"/);
    expect(receipt).toMatch(/refileReceipt\(data\.id/);
  });
});

describe("the phone's column list is flat (D-265)", () => {
  it("does not walk a parent tree", () => {
    const filing = read("src/components/contractor-ops/file-into-column.tsx");
    expect(filing).not.toMatch(/\.parent\b/);
  });
});

describe("the budget warning lines", () => {
  it("reads them the way the retired screen did", () => {
    expect(parseAlertPercentages("")).toEqual([]);
    expect(parseAlertPercentages("100, 80, 80")).toEqual([80, 100]);
    expect(parseAlertPercentages("80, ninety")).toBeNull();
    expect(parseAlertPercentages("0")).toBeNull();
    // FE and BE agree on 1-1000 (2026-10 A6).
    expect(parseAlertPercentages("1000")).toEqual([1000]);
    expect(parseAlertPercentages("1001")).toBeNull();
    expect(parseAlertPercentages("80,")).toBeNull();
  });

  it("reads absolute warning lines as positive figures (2026-10 A6)", () => {
    expect(parseAlertAmounts("")).toEqual([]);
    expect(parseAlertAmounts("450000, 400000, 400000")).toEqual([400000, 450000]);
    expect(parseAlertAmounts("12.5")).toEqual([12.5]);
    expect(parseAlertAmounts("0")).toBeNull();
    expect(parseAlertAmounts("lots")).toBeNull();
    expect(parseAlertAmounts("400000,")).toBeNull();
  });
});

/**
 * Lucas 2026-10-27 (图2): 「什么情况这个变得这么难看」 - the material table,
 * fitted to the page (JB24), squeezed the name to a word a line and split
 * every 「263.000 吨 (Ton)」 over three lines.
 */
describe("the material table stays readable in the page width (JB38-2)", () => {
  it("drops 所属模块, the same words on every row", () => {
    const source = read(MANAGEMENT);
    expect(source).not.toContain('t("column.module")');
  });

  it("keeps the name from being squeezed", () => {
    expect(read(MANAGEMENT)).toMatch(/"flex min-w-36 items-center gap-1"/);
  });

  it("puts 退场 on a line of its own in the column, beside the figure inline", () => {
    const body = functionBody(read(MANAGEMENT), "export function QuantityCell(");
    expect(body).toContain('inline ? "text-xs text-muted-foreground" : "block text-xs text-muted-foreground"');
  });

  it("keeps the quantity a right-aligned number cell, which never splits a line", () => {
    expect(read(MANAGEMENT)).toMatch(
      /<TableCell className="text-right tabular-nums">\s*<QuantityCell quantities=\{row\.column\.quantities/,
    );
  });
});
