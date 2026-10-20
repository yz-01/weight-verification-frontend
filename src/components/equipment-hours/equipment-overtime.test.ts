/**
 * 正常工时 / 超时工时 (J31, Q27-1): two columns beside the total, blue and
 * orange - never gold (已修改) nor red - on the rows, the totals, the month,
 * the files and the session; the office sets the daily normal hours.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NORMAL_CLASS, OVERTIME_CLASS, sumHours } from "@/components/equipment-hours/equipment-operator-hours";
import zh from "@/messages/zh.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("normal and overtime hours", () => {
  it("have their own colours, never gold or red", () => {
    expect(NORMAL_CLASS).toContain("tone-blue");
    expect(OVERTIME_CLASS).toContain("tone-orange");
    for (const tone of [NORMAL_CLASS, OVERTIME_CLASS]) {
      expect(tone).not.toMatch(/gold|red|destructive/);
    }
  });

  it("add up to two decimals, blank when nothing has ended", () => {
    expect(sumHours([{ normal_hours: "8.00" }, { normal_hours: "3.25" }], "normal_hours")).toBe("11.25");
    expect(sumHours([{ normal_hours: null }], "normal_hours")).toBe("");
  });

  it("are on the rows, the month, the files and the session, and set in the office", () => {
    const page = read("src/components/equipment-hours/equipment-operator-hours.tsx");
    expect(page.match(/t\("field\.normalHours"\)/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(page.match(/key: "overtime_hours"/g)?.length).toBe(2);
    expect(page).toContain("<EquipmentNormalHoursButton project={projectFilterValue(project)} />");
    expect(zh.equipmentHours.field.overtimeHours).toBe("超时工时（小时）");
    // 累计 in two, coloured as their columns (J31-5), with the total (J31-6).
    expect(page).toContain("{row.cumulative_normal_hours ?? \"\"}");
    expect(page).toContain("{row.cumulative_overtime_hours ?? \"\"}");
    expect(zh.equipmentHours.field.cumulativeOvertime).toBe("超时工时累计（小时）");
  });
});
