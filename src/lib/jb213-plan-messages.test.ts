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

  it("explain the trial the way Lucas decided it (Q5 = A)", () => {
    for (const messages of Object.values(CATALOGUES)) {
      expect(messages.subscriptions.hint.trialDays).toBeTruthy();
      expect(messages.companies.trialNote).toBeTruthy();
    }
    expect(zh.subscriptions.hint.trialDays).toContain("不出账单");
    expect(zh.subscriptions.hint.trialDays).toContain("续期");
  });
});
