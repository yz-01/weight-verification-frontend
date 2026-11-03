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

  it("the list, the sticker, the number list and the phone say 设备号码", () => {
    expect(zh.contractorOps.equipmentQr.siteNo).toBe("设备号码");
    expect(zh.contractorOps.equipment.number).toBe("设备号码");
    expect(zh.equipmentHours.siteNo.title).toBe("设备号码一览");
    expect(zh.equipmentHours.phone.machine).toBe("设备号码");
    expect(JSON.stringify(zh.equipmentHours)).not.toContain("现场编号");
  });
});

describe("the register form (J21-1, J21-2; JB96)", () => {
  it("shows the system's number and has no box for it", () => {
    // 客户 11-03 第 3、5 点: 「不需要人工填写，也不允许人工修改」「打开『登记设备』
    // 页面时，系统自动显示该项目下一个可用编号。正式保存时确认编号」.
    const form = read("src/components/contractor-ops/operations-workspaces.tsx");
    expect(form).toContain('t("equipment.numberNext", { no: nextNumber.data })');
    expect(form).toContain("equipment.site_no || equipment.code");
    expect(form).not.toMatch(/set\("site_no"/);
    expect(form).not.toMatch(/set\("code"/);
    expect(form).not.toContain('t("equipment.systemNo")');
    expect(zh.contractorOps.equipment.numberNext.replace("{no}", "EQ0007")).toBe("EQ0007（保存时确认）");
  });

  it("the number list only shows numbers; nobody changes one by hand", () => {
    const manager = read("src/components/equipment-hours/equipment-site-numbers.tsx");
    expect(manager).not.toContain("useMutation");
    expect(manager).not.toContain("setEquipmentSiteNo");
    expect(read("src/services/equipment-hours.service.ts")).not.toContain("set_site_no");
  });
});
