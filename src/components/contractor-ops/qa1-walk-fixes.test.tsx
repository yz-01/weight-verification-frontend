/**
 * QA1 browser walk (round 37, materials) - small defects found on screen:
 * - the 材料退场 window's subtitle showed the unit code 「TONNE」 instead of 「吨（Ton）」 (中英文统一);
 * - an archived 材料退场 still showed 【改正】 under 「任何人都不能再修改」 (JB276 archived_final);
 * - the 改正 window named the new 所属公司 field by its code 「equipment_company」 (QA1 #23);
 * - the 材料出场 page still described the old four steps, not 事项 22's order.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("QA1 walk fixes", () => {
  it("names the unit in the 材料退场 window's subtitle, never the code", () => {
    const source = read("src/components/contractor-ops/operations-workspaces.tsx");
    expect(source).not.toContain("`${row.material_name} · ${row.quantity} ${row.unit}`");
    expect(source).toContain("`${row.material_name} · ${row.quantity} ${unitNameDetail(row.unit, row.unit_label)}`");
  });

  it("offers no 【改正】 on a record the server calls archived_final", () => {
    const source = read("src/components/shared/record-correction.tsx");
    expect(source).toMatch(/fillable\.data\?\.blocked\?\.reason === "archived_final"\) return null/);
  });

  it("names 所属公司 in the 改正 window in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.recordCorrection.field.equipment_company).toBe(messages.mySubmissions.field.equipment_company);
    }
  });

  it("describes 材料退场 in 事项 22's order: 出门条, 门岗, 确认正式退场, 归档", () => {
    expect(zh.contractorOps.outgoing.subtitle).toContain("出门条");
    expect(zh.contractorOps.outgoing.subtitle).toContain("门岗");
    expect(zh.contractorOps.outgoing.subtitle).toContain("确认正式退场");
    for (const messages of [zhTW, en, ms]) expect(messages.contractorOps.outgoing.subtitle.length).toBeGreaterThan(60);
  });
});
