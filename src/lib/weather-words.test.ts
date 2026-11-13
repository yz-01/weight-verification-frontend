/**
 * JB186 (客户 11-13): 「图1-图3 日报名称改为日报天气，右上角报告上面能否页面的
 * 天气局气象报告」.
 *
 * In 图1 he had typed 「2026-11-13 日报告 天气：雨天」 into the report's name by
 * hand. Lucas 11-13 chose: the box is named 日报天气; a new report's starts
 * with 「<日期> 日报告 天气：27°C 毛毛雨」 - the weather the dashboard shows,
 * read at the report's own project - and can still be changed; the PDF goes
 * on printing that line at its top right.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { reportTakesWeather, weatherWordKey } from "@/lib/weather-words";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const SRC = path.resolve(__dirname, "..");
const read = (relative: string) =>
  readFileSync(path.join(SRC, relative), "utf8").replace(/\r\n/g, "\n");

describe("the word for a weather reading", () => {
  it("is one rule for the dashboard and the daily report", () => {
    expect(weatherWordKey(0)).toBe("clear");
    expect(weatherWordKey(2)).toBe("partly");
    expect(weatherWordKey(3)).toBe("cloudy");
    expect(weatherWordKey(45)).toBe("fog");
    expect(weatherWordKey(51)).toBe("drizzle");
    expect(weatherWordKey(63)).toBe("rain");
    expect(weatherWordKey(81)).toBe("rain");
    expect(weatherWordKey(73)).toBe("snow");
    expect(weatherWordKey(95)).toBe("storm");
    // A code the list does not know reads as 阴, as it always did.
    expect(weatherWordKey(4)).toBe("cloudy");
    const dashboard = read("components/dashboard/headquarters-reference.tsx");
    expect(dashboard).toContain("const key = weatherWordKey(code);");
    const form = read("components/progress/daily-reports.tsx");
    expect(form).toContain("weatherWordKey(weather.data.weather_code)");
  });

  it("has a word in every language for each of them", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      const words = messages.headquarters.reference.weather as Record<string, string>;
      for (const key of ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "snow", "storm"]) {
        expect(words[key], key).toBeTruthy();
      }
    }
  });
});

describe("which report starts with the weather", () => {
  it("a new report of today", () => {
    expect(reportTakesWeather({ editing: false, firstDay: "2026-11-13", today: "2026-11-13" })).toBe(true);
  });

  it("not a day already past being written up late: the reading is the weather now", () => {
    expect(reportTakesWeather({ editing: false, firstDay: "2026-11-12", today: "2026-11-13" })).toBe(false);
  });

  it("not a saved report being changed: its line is what was saved", () => {
    expect(reportTakesWeather({ editing: true, firstDay: "2026-11-13", today: "2026-11-13" })).toBe(false);
  });
});

describe("日报天气: the box, the list, the report centre", () => {
  it("is named 日报天气 where it was 日报名称, in four languages", () => {
    expect(zh.progressPage.reports.name).toBe("日报天气");
    expect(zhTW.progressPage.reports.name).toBe("日報天氣");
    expect(en.progressPage.reports.name).toBe("Report weather");
    expect(ms.progressPage.reports.name).toBe("Cuaca laporan");
    // 报表中心 › 工程进度 › 日报告's column, and what its keyword box says it searches.
    expect(zh.contractorReports.column.name).toBe("日报天气");
    expect(zhTW.contractorReports.column.name).toBe("日報天氣");
    expect(zh.contractorReports.filter.keywordPlaceholder.daily_report).toBe("日报天气、内容或撰写人");
    expect(JSON.stringify([zh.progressPage, zh.contractorReports])).not.toContain("日报名称");
    expect(JSON.stringify([zhTW.progressPage, zhTW.contractorReports])).not.toContain("日報名稱");
  });

  it("offers 「<日期> 日报告 天气：27°C 毛毛雨」, as he had typed it by hand", () => {
    const weather = `${zh.headquarters.reference.temperature.replace("{value}", "27")} ${zh.headquarters.reference.weather.drizzle}`;
    expect(weather).toBe("27°C 毛毛雨");
    expect(
      zh.progressPage.reports.defaultNameWeather.replace("{date}", "2026-11-13").replace("{weather}", weather),
    ).toBe("2026-11-13 日报告 天气：27°C 毛毛雨");
    for (const messages of [zh, zhTW, en, ms]) {
      const line = messages.progressPage.reports.defaultNameWeather;
      expect(line).toContain("{date}");
      expect(line).toContain("{weather}");
      // The line without a weather is still there, for when none is read.
      expect(messages.progressPage.reports.defaultName).toContain("{date}");
      expect(messages.progressPage.reports.weatherFilled).toBeTruthy();
      expect(messages.progressPage.reports.weatherMissing).toBeTruthy();
    }
  });
});

describe("the form", () => {
  const form = read("components/progress/daily-reports.tsx");

  it("reads the weather at the report's own project, only for a new report of today", () => {
    expect(form).toContain(
      "const takesWeather = reportTakesWeather({ editing: Boolean(report), firstDay: startDay, today });",
    );
    expect(form).toContain('queryKey: ["daily-reports", "weather", project],');
    expect(form).toContain("enabled: takesWeather && Boolean(project),");
  });

  it("shows the line offered until the writer types, then leaves the box to him", () => {
    expect(form).toContain("const [typedName, setName] = useState<string | null>(report?.name ?? null);");
    expect(form).toContain("const name = typedName ?? offeredName;");
  });

  it("says where the weather came from, or that none could be read", () => {
    expect(form).toContain('{weatherWords ? t("reports.weatherFilled") : t("reports.weatherMissing")}');
  });
});
