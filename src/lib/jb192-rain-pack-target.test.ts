/**
 * JB192 (客户 11-13 第 22、23 点): 「直接使用现有 Multi Engine 勾选打包功能。用户可以
 * 按日期或月份筛选 Rainy Weather 记录，再勾选需要的雨天记录进行打包」.
 *
 * A package's 「添加资料」 offers the rain records' own list directly - the
 * 雨天记录 tab, which has the month and the date range - beside 工程进度. A rain
 * record is a progress record, so it is the same kind in the package.
 */
import { describe, expect, it } from "vitest";

import { PACK_TARGETS, collectHref } from "@/lib/pack-collect";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

describe("JB192-14: 「添加资料」 goes straight to the rain records", () => {
  const rain = PACK_TARGETS.find((target) => target.key === "rain");

  it("is offered right after 工程进度, as progress records", () => {
    expect(rain).toBeDefined();
    expect(rain?.kind).toBe("PROGRESS");
    const keys = PACK_TARGETS.map((target) => target.key);
    expect(keys.indexOf("rain")).toBe(keys.indexOf("progress") + 1);
  });

  it("opens the 雨天记录 tab on the package's project, collecting into it", () => {
    const href = collectHref(rain!, { id: "pk1", project: "p1" });
    const url = new URL(href, "https://office.local");
    expect(url.pathname).toBe("/progress");
    expect(url.searchParams.get("tab")).toBe("rain");
    expect(url.searchParams.get("project")).toBe("p1");
    expect(url.searchParams.get("pack")).toBe("pk1");
  });

  it("is named in all four languages", () => {
    expect(rain?.labelKey).toBe("nav.submodule.rainRecords");
    expect(zh.nav.submodule.rainRecords).toBe("雨天记录（Rainy Weather）");
    for (const catalogue of [zhTW, en, ms]) expect(catalogue.nav.submodule.rainRecords).toContain("Rainy Weather");
  });
});
