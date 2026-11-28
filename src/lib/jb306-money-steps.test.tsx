/**
 * JB306 (客户 11-28i): 「是否有独立的「金额审批」「费用核对」及「结算确认」权限开关？」 - yes,
 * one each in 权限开关 › 审批; a button whose switch is off says which.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MONEY_STEP_CODES } from "@/lib/money-steps";
import catalogue from "@/lib/permission-catalogue.json";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the three switches", () => {
  it("are in the catalogue and named in every language", () => {
    const text = JSON.stringify(catalogue);
    for (const code of Object.values(MONEY_STEP_CODES)) expect(text).toContain(code);
    for (const messages of [zh, zhTW, en, ms]) {
      expect(messages.permissions.code.finance.approve_amounts).toBeTruthy();
      expect(messages.permissions.code.finance.check_costs).toBeTruthy();
      expect(messages.permissions.code.finance.confirm_settlement).toBeTruthy();
      for (const step of ["approve", "check", "settle"] as const) expect(messages.jb306.off[step]).toBeTruthy();
      expect(messages.errors.api.finance_check_costs_off).toBeTruthy();
      expect(messages.errors.api.finance_confirm_settlement_off).toBeTruthy();
      expect(messages.errors.api.finance_approve_amounts_off).toBeTruthy();
    }
    expect(zh.permissions.code.finance.check_costs).toContain("费用核对");
  });

  it("gate the 核对 / 结算 / 审批 buttons", () => {
    expect(read("src/components/contractor-ops/return-checks.tsx")).toContain('useMoneyStep("check")');
    expect(read("src/components/contractor-ops/return-checks.tsx")).toContain('useMoneyStep("settle")');
    expect(read("src/components/contractor-ops/disposal-settlements.tsx")).toContain('useMoneyStep("check")');
    expect(read("src/components/contractor-ops/disposal-settlements.tsx")).toContain('useMoneyStep("settle")');
    expect(read("src/components/contractor-ops/disposal-payment.tsx")).toContain('useMoneyStep("settle")');
    expect(read("src/components/sundry-claims/sundry-claims-office.tsx")).toContain('useMoneyStep("approve")');
  });
});
