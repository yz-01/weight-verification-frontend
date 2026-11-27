/**
 * JB246 / JB247 (客户 11-23 事项 18、19): one phone number, one active person;
 * one running machine per driver; a stopped link dies at once.
 *
 * The server decides (backend `site_operations.tests.test_jb246_one_identity`);
 * here: its refusals read in all four languages, the office lists name the
 * other identity on a number that has two, and an open driver page asks again
 * whether its link is still on.
 *
 * Rendered to static markup (the runner has no DOM).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OtherIdentitiesNote, type OtherIdentity } from "@/components/field-staff/other-identities-note";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const CATALOGUES = { zh, "zh-TW": zhTW, en, ms } as const;
const CODES = ["phone_identity_in_use", "phone_device_in_use", "equipment_hours_driver_busy"] as const;

function note(others: OtherIdentity[], locale: keyof typeof CATALOGUES = "zh") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]} timeZone="Asia/Kuala_Lumpur">
      <OtherIdentitiesNote others={others} />
    </NextIntlClientProvider>,
  );
}

function source(file: string) {
  return readFileSync(path.join(process.cwd(), "src", file), "utf8");
}

describe("JB246 / JB247 refusals read in every language", () => {
  it.each(Object.entries(CATALOGUES))("%s words each refusal with its values", (locale, messages) => {
    const t = createTranslator({ locale, messages });
    for (const kind of ["driver", "site_staff", "equipment_operator", "gate_guard", "other"]) {
      const line = t("errors.api.phone_identity_in_use", { name: "asa", kind });
      expect(line).toContain("asa");
      expect(line).not.toContain("{");
    }
    expect(t("errors.api.phone_device_in_use", { name: "asa", kind: "driver" })).toContain("asa");
    const busy = t("errors.api.equipment_hours_driver_busy", { equipment: "EQ0001", since: "10:28" });
    expect(busy).toContain("EQ0001");
    expect(busy).toContain("10:28");
    for (const code of CODES) {
      expect(String((messages.errors.api as Record<string, string>)[code])).not.toContain("您");
    }
  });

  it("says in Chinese what the client asked, with the product's own words", () => {
    const t = createTranslator({ locale: "zh", messages: zh });
    expect(t("errors.api.phone_identity_in_use", { name: "asa", kind: "driver" })).toBe(
      "这个手机号码已经是「asa」（司机打卡链接）的有效身份。一个号码只能有一个有效身份：请先停用原来的，再建立新的。",
    );
    expect(t("errors.api.phone_identity_in_use", { name: "kk", kind: "gate_guard" })).toContain("门岗保安");
    expect(t("errors.api.equipment_hours_driver_busy", { equipment: "EQ0001", since: "10:28" })).toBe(
      "你的设备 EQ0001 还没有收工（10:28 开工）。一个司机同一时间只能开一台设备：请先为它拍收工，再为这台开工。",
    );
    // The office list's own name for the links.
    expect(zh.jb246.kind.driver).toBe(zh.driverClock.office.title);
    expect(zhTW.jb246.kind.driver).toBe(zhTW.driverClock.office.title);
  });
});

describe("the office lists mark a number with two live identities", () => {
  it("names the other identity and its kind", () => {
    const html = note([{ kind: "driver", name: "kk" }]);
    expect(html).toContain("这个号码还有别的有效身份：kk（司机打卡链接）。");
    expect(html).toContain("请停用不要的那一个");
    expect(note([{ kind: "site_staff", name: "ali" }, { kind: "driver", name: "kk" }])).toContain(
      "ali（工地人员）、kk（司机打卡链接）",
    );
    expect(note([{ kind: "driver", name: "kk" }], "en")).toContain("kk (driver link)");
  });

  it("says nothing when the number has one identity", () => {
    expect(note([])).toBe("");
  });

  it("is shown on the driver links and on 现场人员管理", () => {
    expect(source("components/equipment-hours/driver-clock-links.tsx")).toContain(
      "<OtherIdentitiesNote others={row.other_identities} />",
    );
    expect(source("components/field-staff/field-staff-management.tsx")).toContain(
      "<OtherIdentitiesNote others={person.other_identities} />",
    );
  });
});

describe("a stopped link ends an open driver page", () => {
  it("asks again every minute and on a refusal that ends the link", () => {
    // Read as text: importing the whole page is slow on a busy machine.
    const page = source("components/equipment-hours/driver-clock-link.tsx");
    expect(page).toContain("export const DRIVER_LINK_RECHECK_MS = 60_000;");
    expect(page).toContain("refetchInterval: DRIVER_LINK_RECHECK_MS");
    expect(page).toContain('if (code === "driver_link_closed") return "closed";');
    // The phone step says whose identity this phone already holds (JB247).
    expect(source("components/equipment-hours/driver-clock-link.tsx")).toMatch(
      /failure\.code === "phone_device_in_use"\s*\? failure\.message/,
    );
    const capture = source("components/equipment-hours/equipment-hours-capture.tsx");
    expect(capture).toMatch(
      /reason\.code === "driver_link_closed" \|\| reason\.code === "driver_link_invalid"[\s\S]{0,120}queryKey: \["driver-clock-link", driver\.token\]/,
    );
  });
});
