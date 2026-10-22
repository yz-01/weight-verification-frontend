/**
 * 设备号码 (J21, JB8, Q21): given by the system with the QR code, shown on
 * the register form - never typed there - and called one thing everywhere:
 * `site_no` is 「设备号码」, `code` is 「系统编号」.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import zhTW from "@/messages/zh-TW.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("one name for each number (J21-3, JB8)", () => {
  it("the hours detail no longer has two lines both called 设备编号", () => {
    expect(zh.equipmentHours.field.machineNo).toBe("设备号码");
    expect(zh.equipmentHours.field.code).toBe("系统编号");
    expect(zhTW.equipmentHours.field.machineNo).toBe("設備號碼");
    expect(en.equipmentHours.field.code).toBe("System no.");
  });

  it("the list, the sticker, the manager and the phone say 设备号码", () => {
    expect(zh.contractorOps.equipmentQr.siteNo).toBe("设备号码");
    expect(zh.equipmentHours.siteNo.title).toBe("设备号码管理");
    expect(zh.equipmentHours.phone.machine).toBe("设备号码");
    expect(JSON.stringify(zh.equipmentHours)).not.toContain("现场编号");
  });
});

describe("the register form (J21-1, J21-2)", () => {
  it("shows the number the system gave, and has no box for it", () => {
    const form = read("src/components/contractor-ops/operations-workspaces.tsx");
    expect(form).toContain('t("equipment.siteNoAuto", { no: equipment.site_no })');
    expect(form).not.toMatch(/set\("site_no"/);
    expect(zh.contractorOps.equipment.siteNoAuto.replace("{no}", "12")).toBe("12（系统自动生成）");
  });

  it("a number is put right in the manager, never cleared", () => {
    const manager = read("src/components/equipment-hours/equipment-site-numbers.tsx");
    expect(manager).toContain('setError(t("siteNo.keep"))');
  });
});
