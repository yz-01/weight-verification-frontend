/**
 * MSE's request for access lands on the customer's 「MSE 查看权限」 (JB220,
 * contract §5: `data.href` = `/company-settings#mse-access`). The office link
 * kept the path and the query but dropped the `#…`, so the notice opened the
 * top of a long settings page; and the bell called any kind with `ACCESS` in it
 * 「工地门禁」.
 */
import { describe, expect, it } from "vitest";

import { notificationKindKey } from "@/components/notifications/notifications";
import { officeNotificationHref } from "@/lib/office-notification";
import en from "@/messages/en.json";
import zh from "@/messages/zh.json";

describe("MSE's request notice (JB220)", () => {
  it("opens 公司设置 at the section", () => {
    expect(officeNotificationHref({ href: "/company-settings#mse-access" })).toBe("/company-settings#mse-access");
  });

  it("leaves every other link as it was", () => {
    expect(officeNotificationHref({ href: "/approvals?approval=a1" })).toBe("/approvals?approval=a1");
    expect(officeNotificationHref({ href: "/weighing", session_id: "s1" })).toBe("/weighing/s1");
  });

  it("is labelled 「MSE 查看权限」 in the bell, not 「工地门禁」", () => {
    expect(notificationKindKey("PLATFORM_ACCESS")).toBe("PLATFORM_ACCESS");
    expect(zh.notifications.kind.PLATFORM_ACCESS).toBe("MSE 查看权限");
    expect(en.notifications.kind.PLATFORM_ACCESS).toBeTruthy();
    // The gate's own notices keep their label.
    expect(notificationKindKey("SITE_ACCESS")).toBe("ACCESS");
  });
});
