/**
 * 设备清单今日状态 (J27, Q27-2..Q27-4): only on the equipment list - working,
 * stopped, not started, left - with the operator and CIDB, and the day's
 * count of the machines on site (left ones not counted).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import zh from "@/messages/zh.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("today on the equipment list", () => {
  it("has a column and a line of counts", () => {
    const list = read("src/components/contractor-ops/office-module-lists.tsx");
    expect(list).toContain('id: "today",');
    expect(list).toContain("getEquipmentToday(list.filters.project || undefined)");
    expect(list).toContain('data-testid="equipment-today-summary"');
    expect(zh.contractorOps.equipmentToday.status).toEqual({
      WORKING: "工作中",
      FINISHED: "已收工",
      IDLE: "未开工",
      LEFT: "已离场",
    });
    expect(zh.contractorOps.equipmentToday.summary).not.toContain("{left}");
  });

  it("is nowhere else (Q27-2)", () => {
    expect(read("src/components/equipment-hours/equipment-operator-hours.tsx")).not.toContain("getEquipmentToday");
  });
});
