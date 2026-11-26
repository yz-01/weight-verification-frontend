/**
 * QA3 (round 37 audit #4, #6, #7, #8, #10): what the pages say after the fixes.
 *
 * - JB248: the head office counts 垃圾清运 and 废料处理 apart (「分别累计，不混合统计」);
 * - JB255: a machine's own 每天正常工作时数 splits its hours - the help says so;
 * - JB280: 生成月结单 confirms the months not confirmed yet (the preview lists
 *   them), the 按月 row names its 月结单 (第 5 点), and a day inside a checked /
 *   settled statement says it cannot be changed (第 7 点).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cardHref } from "@/lib/headquarters-links";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

describe("JB248 head office: 垃圾清运 and 废料处理 apart", () => {
  it("each card opens its own tab", () => {
    expect(cardHref("site_disposals", { date: "2026-11-27" })).toBe("/waste-clearance?kind=garbage&counted=1");
    expect(cardHref("site_scraps", { date: "2026-11-27" })).toBe("/waste-clearance?kind=scrap&counted=1");
  });

  it("the figures draw a card for each kind, labelled by the menu's own words", () => {
    const source = read("src/components/dashboard/headquarters-figures.tsx");
    expect(source).toContain('label={kinds("GARBAGE")}');
    expect(source).toContain('label={kinds("SCRAP")}');
    expect(source).toContain("totals.site_scraps");
  });
});

describe("JB255 the machine's own normal hours", () => {
  it("the help says a machine's 每天正常工作时数 splits its hours, in four languages", () => {
    expect(zh.equipmentRental.formula.common).toContain("按这台设备自己的时数分开");
    expect(zhTW.equipmentRental.formula.common).toContain("按這台設備自己的時數分開");
    expect(en.equipmentRental.formula.common).toContain("is split by that number");
    expect(ms.equipmentRental.formula.common).toContain("dibahagi mengikut angka itu");
    expect(zh.equipmentRental.formula.common).not.toContain("请把本页的设定也改好");
    // The machine's terms line says its own normal hours.
    expect(read("src/components/equipment-hours/rental-fees.tsx")).toContain('t("summary.normalHours"');
    for (const messages of [zh, zhTW, en, ms]) expect(messages.equipmentRental.summary.normalHours).toContain("{hours}");
  });
});

describe("JB280 statements", () => {
  it("the preview lists the months 生成月结单 confirms in the same step", () => {
    const source = read("src/components/equipment-hours/rental-statements.tsx");
    expect(source).toContain('data-slot="statement-will-confirm"');
    expect(source).toContain("shown.will_confirm");
    expect(zh.jb280.generateHelp).toContain("生成时会一起确认");
    expect(zh.jb280.generateHelp).not.toContain("只能用已经");
  });

  it("the 按月 row names its statement and opens it for those who may", () => {
    const source = read("src/components/equipment-hours/equipment-operator-hours.tsx");
    expect(source).toContain('data-slot="month-row-statement"');
    expect(source).toContain("/equipment-rental-statements?tab=all&statement=");
    expect(zh.jb280.onStatement).toBe("月结单 {number}（{state}）");
  });

  it("a locked day says why and offers no change", () => {
    const source = read("src/components/equipment-hours/equipment-operator-hours.tsx");
    expect(source).toContain('data-slot="hours-locked"');
    expect(source).toContain("canAdjust && !row.locked_statement_no");
    expect(zh.jb280.hoursLocked).toContain("不能再改");
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.errors.api.rental_statement_hours_locked).toContain("{statement_no}");
    }
  });
});
