/**
 * JB213 (Lucas 11-16 「要站在老人家的角度去思考」): every limit refusal says
 * what the limit is and whom to contact, in all four languages.
 */
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;

describe("JB213 refusals", () => {
  it("name the number and the existing count for 场地上限 / 地磅上限", () => {
    for (const messages of Object.values(CATALOGUES)) {
      for (const code of ["site_limit_reached", "scale_limit_reached"] as const) {
        const sentence = messages.errors.api[code];
        expect(sentence).toContain("{limit}");
        expect(sentence).toContain("{used}");
      }
    }
  });

  it("say whom to contact", () => {
    for (const messages of Object.values(CATALOGUES)) {
      expect(messages.errors.api.site_limit_reached).toContain("MSE");
      expect(messages.errors.api.external_integration_not_in_plan).toContain("MSE");
    }
    expect(zh.errors.api.scale_limit_reached).toContain("自定义地磅上限");
    expect(zh.errors.api.scale_limit_reached).toContain(zh.companies.field.scaleLimitOverride);
  });

  it("say what one bill is on a package not billed monthly (walk 11-17)", () => {
    for (const messages of Object.values(CATALOGUES)) {
      for (const sentence of [messages.subscriptions.fee.perBill, messages.companies.planTerms.standardCycle]) {
        for (const slot of ["{cycle}", "{months}", "{currency}", "{amount}"]) {
          expect(sentence).toContain(slot);
        }
      }
      expect(messages.companies.planTerms.standardCycle).toContain("{fee}");
    }
    expect(zh.subscriptions.fee.perBill).toBe("（{cycle}：每 {months} 个月一张账单 {currency} {amount}）");
  });

  it("explain the trial the way Lucas decided it (Q5 = A)", () => {
    for (const messages of Object.values(CATALOGUES)) {
      expect(messages.subscriptions.hint.trialDays).toBeTruthy();
      expect(messages.companies.trialNote).toBeTruthy();
    }
    expect(zh.subscriptions.hint.trialDays).toContain("不出账单");
  });

  it("name the menu item that renews, as it reads on 订阅管理 (walk 11-17)", () => {
    // 「续期」 is no button: the ⋮ menu says 「延长或续费」, and an older reader
    // looks for the words they are told to press.
    for (const messages of Object.values(CATALOGUES)) {
      const menu = messages.subscriptions.action.extend.menu;
      for (const sentence of [
        messages.subscriptions.hint.trialDays,
        messages.subscriptions.hint.trialPlanChange,
        messages.companies.trialDaysHint,
        messages.companies.trialNote,
        messages.companies.subscriptionMonthsTrialHint,
        messages.errors.api.invoice_in_trial,
      ]) {
        expect(sentence).toContain(menu);
      }
    }
    expect(zh.subscriptions.action.extend.menu).toBe("延长或续费");
  });

  it("say a trial company is on its trial when 生成账单 has nothing to bill (walk 11-17)", () => {
    for (const messages of Object.values(CATALOGUES)) {
      expect(messages.errors.api.invoice_in_trial).toContain("{date}");
      expect(messages.errors.api.invoice_in_trial).not.toBe(messages.errors.api.invoice_nothing_to_charge);
    }
    expect(zh.errors.api.invoice_in_trial).toContain("免费试用");
    expect(zh.errors.api.invoice_in_trial).not.toContain("套餐费用");
  });

  it("say when a lapsed renewal starts, and when a trial's paid term does (walk 11-17)", () => {
    for (const messages of Object.values(CATALOGUES)) {
      expect(messages.subscriptions.hint.lapsedRenew).toBeTruthy();
      expect(messages.companies.subscriptionMonthsTrialHint).toContain("{date}");
    }
    expect(zh.subscriptions.hint.lapsedRenew).toBe("这家公司已经过期，续期从今天开始算，停掉的那段时间不收钱。");
    expect(zh.companies.subscriptionMonthsTrialHint).toContain("免费试用到 {date}");
  });
});
