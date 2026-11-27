/**
 * QA295: what the browser walk found when the labour pages first ran against
 * the backend (JB295 / JB295b).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dayToAdd } from "@/components/labour/labour-costs";
import { isInRental } from "@/components/labour/labour-shared";
import { isRouteAllowed } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

describe("old labour addresses (JB295b C1: 「Keep /labour-costs and /labour-statements as redirects」)", () => {
  const features = ["geofences", "attendance", "site_workers"];
  const permissions = ["site_worker.view", "labour.view", "labour.manage", "attendance.view"];

  it("are judged as the 人员名单 page, so the guard lets their redirect run instead of sending the reader to the dashboard", () => {
    for (const address of ["/labour-costs", "/labour-statements"]) {
      expect(isRouteAllowed("MSE_TRACE", features, address, permissions)).toBe(true);
    }
  });

  it("stay closed to a reader who cannot open 人员名单", () => {
    expect(isRouteAllowed("MSE_TRACE", ["geofences", "attendance"], "/labour-costs", ["attendance.view"])).toBe(false);
  });
});

describe("人员名单 › 进出场记录: an app account's stay", () => {
  const source = read("src/components/site-workers/site-workers.tsx");

  it("words an account with no 所属公司 as 本公司, not 「—」", () => {
    expect(source).toContain('row.original.company_key === "self" ? t295("company.self")');
  });
});

describe("【补一天】 (R7: 「It can add a day with no session (worked = true)」)", () => {
  const source = read("src/components/labour/labour-costs.tsx");
  const person = {
    key: "worker:cat",
    name: "Cat",
    group: "roster" as const,
    company_key: "none",
    company_name: "",
    trade_name: "",
    is_active: true,
  };

  it("has a button on 按日 for whoever may adjust, opening 【调整】 for the chosen person and day", () => {
    expect(source).toContain('data-slot="labour-add-day-button"');
    expect(source).toMatch(/canManage \? \(\s*<div className="flex flex-wrap items-center gap-3" data-slot="labour-add-day">/);
  });

  it("starts an empty day (no records, hours to fill in) or reuses the day's own row", () => {
    const fresh = dayToAdd(person, "2026-10-03", []);
    expect(fresh).toMatchObject({ person_key: "worker:cat", date: "2026-10-03", sessions: [], normal_hours: "", worked: false });
    const existing = { ...fresh, date: "2026-10-01", normal_hours: "8.00", sessions: [{ start: "x", end: "y", end_kind: "EXIT", source: "roster", refs: [] }] };
    expect(dayToAdd(person, "2026-10-01", [existing as never])).toBe(existing);
  });

  it("is worded in the four languages", async () => {
    for (const lang of ["zh", "zh-TW", "en", "ms"]) {
      const messages = JSON.parse(read(`src/messages/${lang}.json`));
      for (const key of ["button", "hint", "title", "help", "dateHint", "dateInvalid", "next"]) {
        expect(messages.jb295.addDay[key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});

describe("an operator whose month is only partly inside the equipment rental (JB295b C4)", () => {
  it("is not worded as wholly 「已含在设备租赁费用内」 when one piece is charged", () => {
    const charged = { scope: "COMPANY", method: "DAILY", unit_price: "100.00", overtime_rate: null, from: "2026-10-06", to: "2026-10-06" };
    const rented = { scope: "EQUIPMENT", method: "IN_RENTAL", unit_price: "0.00", overtime_rate: null, from: "2026-10-13", to: "2026-10-14" };
    const mark = { reason: "operator", equipment_no: "EQ0002" };
    expect(isInRental({ in_rental: mark as never, rates: [charged, rented] as never })).toBe(false);
    expect(isInRental({ in_rental: mark as never, rates: [rented] as never })).toBe(true);
    // a day row has no pieces: its own mark decides
    expect(isInRental({ in_rental: mark as never, rate: { method: "IN_RENTAL" } })).toBe(true);
    expect(isInRental({ in_rental: null, rate: { method: "DAILY" } })).toBe(false);
  });

  it("statement lines write each piece with its 超时单价, as the PDF does", () => {
    const source = read("src/components/labour/labour-statements.tsx");
    expect(source).toContain("rate: rateLine(t, rate),");
  });
});

describe("【结算】 for 人工月结单", () => {
  it("asks for the 所属公司, not 「供应商或公司」", () => {
    const source = read("src/components/contractor-ops/return-checks.tsx");
    expect(source).toContain('kind === "LABOUR" ? t295("checkChooseCompany") : tj("chooseParty")');
  });
});

describe("人员进场 (attendance) switched off for the company (R13: labour is under feature attendance)", () => {
  it("hides the two labour tabs, whatever the rights", async () => {
    const { siteWorkerTabs } = await import("@/components/site-workers/site-workers");
    expect(siteWorkerTabs(() => true, false)).toEqual(["roster", "visits"]);
    expect(siteWorkerTabs(() => true, true)).toEqual(["roster", "visits", "labour", "statements"]);
  });

  it("reads the feature from the signed-in user, and the header button does too", () => {
    expect(read("src/components/site-workers/site-workers.tsx")).toContain('user?.features?.includes("attendance") ?? true');
    expect(read("src/components/labour/labour-costs-button.tsx")).toContain('user?.features?.includes("attendance") ?? true');
  });
});
