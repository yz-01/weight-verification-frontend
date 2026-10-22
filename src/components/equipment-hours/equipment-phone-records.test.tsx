/**
 * 手机端 正常 / 超时 / 总工时 (J37): the driver's 「我的记录」 and the field
 * staff's list show the server's numbers, 24-hour times, blue and orange.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PhoneRecordsList, clockTime, recordMachine } from "@/components/equipment-hours/equipment-phone-records";
import type { EquipmentPhoneRecord } from "@/interfaces/equipment-hours";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const row = (over: Partial<EquipmentPhoneRecord> = {}): EquipmentPhoneRecord => ({
  key: "k1",
  work_date: "2026-10-21",
  equipment_name: "Excavator",
  equipment_code: "EX-1",
  site_no: "12",
  operator_name: "Muthu",
  start_at: "2026-10-21T07:00:00+08:00",
  end_at: "2026-10-21T17:05:00+08:00",
  hours: "10.08",
  normal_hours: "8.00",
  overtime_hours: "2.08",
  missing_end: false,
  ...over,
});

const totals = { normal_hours: "11.00", overtime_hours: "2.08", total_hours: "13.08", session_count: 2 };

function show(rows: EquipmentPhoneRecord[]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <PhoneRecordsList rows={rows} totals={totals} totalsTitle="This month" />
    </NextIntlClientProvider>,
  );
}

/** The element carrying a figure: `<p class="...">value</p>`. */
const classOf = (html: string, value: string) =>
  new RegExp(`<p class="([^"]*)">${value}</p>`).exec(html)?.[1] ?? "";

describe("phone hours records", () => {
  it("shows the server's normal, overtime and total, blue and orange, never gold or red", () => {
    const html = show([row()]);
    expect(classOf(html, "8.00")).toContain("tone-blue");
    expect(classOf(html, "2.08")).toContain("tone-orange");
    expect(classOf(html, "10.08")).not.toMatch(/tone|gold|red|destructive/);
    expect(classOf(html, "11.00")).toContain("tone-blue");
    expect(html).toContain("13.08");
    expect(html).toContain("This month");
  });

  it("writes times in 24 hours on the site's clock and the site number first", () => {
    expect(clockTime("2026-10-21T17:05:00+08:00")).toBe("17:05");
    expect(clockTime("2026-10-21T00:30:00+08:00")).toBe("00:30");
    expect(clockTime(null)).toBe("");
    expect(recordMachine(row())).toBe("12 · Excavator");
    expect(recordMachine(row({ site_no: "" }))).toBe("EX-1 · Excavator");
    const html = show([row()]);
    expect(html).toContain("07:00");
    expect(html).toContain("17:05");
  });

  it("says a session is not stopped yet and leaves its hours blank", () => {
    const html = show([row({ end_at: null, hours: null, normal_hours: null, overtime_hours: null, missing_end: true })]);
    expect(html).toContain(en.equipmentHours.records.running);
    expect(html.match(/>-<\/p>/g)).toHaveLength(3);
  });

  it("says so when there is nothing yet", () => {
    expect(show([])).toContain(en.equipmentHours.records.empty);
  });

  it("has its words in all four languages", () => {
    for (const messages of [en, zh, zhTW, ms]) {
      expect(Object.keys(messages.equipmentHours.records).sort()).toEqual(
        Object.keys(en.equipmentHours.records).sort(),
      );
      expect(messages.driverClock.tabs.records).toBeTruthy();
    }
  });
});
