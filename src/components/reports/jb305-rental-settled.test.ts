/**
 * JB305 (客户 11-28h): 「设备租赁费用报表可以显示全部费用及结算状态，项目现场费用总览只累计
 * 已结算金额，与垃圾清运及 Progress Claim 的结算统计规则保持一致，避免提前累计及重复计算。」
 *
 * The server counts only 已结算 月结单 (`rental_statements.settled_amount`) and
 * returns the rest as `not_counted_amount`; the card says both.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const source = readFileSync(join(process.cwd(), "src/components/reports/site-cost-overview.tsx"), "utf8");

describe("设备租赁 card on 项目现场费用总览", () => {
  it("says 「还有 RM x 未结算，不算在内」 like Progress Claim, and what it counts", () => {
    expect(source).toContain('key === "progress_claim" || key === "equipment_rental"');
    expect(source).toContain('data-slot="cost-rental-basis"');
    expect(zh.jb298.cost.notCounted).toContain("未结算");
  });

  it("every language has the basis line", () => {
    for (const messages of [zh, zhTW, en, ms]) expect(messages.jb305.cost.basis).toBeTruthy();
  });
});
