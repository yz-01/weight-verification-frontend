import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

/**
 * JB153 (客户 11-10 第二批事项 2): in an iPhone Safari tab 「什么通知都没有」.
 * The iPhone only notifies the app opened from its Home Screen icon, so the
 * 「加到主屏幕」 banner has to say that, in every language - not only that the
 * icon is "more reliable".
 */
describe("加到主屏幕 banner wording (JB153)", () => {
  it("says notifications need the Home Screen icon", () => {
    expect(zh.fieldAccess.installBannerBody).toContain("通知");
    expect(zh.fieldAccess.installBannerBody).toContain("主屏幕图标");
    expect(zhTW.fieldAccess.installBannerBody).toContain("通知");
    expect(en.fieldAccess.installBannerBody.toLowerCase()).toContain("notification");
    expect(ms.fieldAccess.installBannerBody.toLowerCase()).toContain("pemberitahuan");
  });
});
