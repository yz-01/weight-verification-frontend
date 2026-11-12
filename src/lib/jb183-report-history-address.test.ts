import { describe, expect, it } from "vitest";

import {
  OPEN_ID,
  OPEN_KIND,
  historyQuery,
  openRecordIn,
  readHistoryAddress,
  scrollKey,
  withOpenRecord,
  withoutOpenRecord,
  type HistoryAddressState,
} from "@/lib/report-history-address";

/**
 * JB183 做法 5 (客户 11-13 事项 1): 「返回后保留原来的项目选择、筛选条件及列表
 * 位置」. The page's tab, filters, project and pages live in its address, so
 * the back arrow, the browser's back and a reload come back to the same list.
 */

const fresh: HistoryAddressState = {
  tab: "reports",
  date: "",
  operator: "",
  action: "",
  name: "",
  recipient: "",
  project: "all",
  page: 1,
  logPage: 1,
};

describe("JB183-3: the list's place is in its address", () => {
  it("a fresh page keeps a bare address", () => {
    expect(historyQuery(new URLSearchParams(), fresh)).toBe("");
    expect(readHistoryAddress(new URLSearchParams())).toEqual(fresh);
  });

  it("操作记录, filtered, on page 3, comes back as it was", () => {
    const state: HistoryAddressState = {
      ...fresh,
      tab: "log",
      date: "2026-11-08",
      operator: "steven",
      action: "SEND",
      name: "日报告",
      recipient: "mr ong",
      project: "p4",
      logPage: 3,
    };
    const query = historyQuery(new URLSearchParams(), state);
    expect(query).toContain("tab=log");
    expect(query).toContain("log_page=3");
    expect(readHistoryAddress(new URLSearchParams(query))).toEqual(state);
  });

  it("the top bar's `project` and the open record are left alone", () => {
    const current = new URLSearchParams("project=p9&open_kind=FIELD_TASK&open_id=t1&page=2");
    const query = new URLSearchParams(historyQuery(current, { ...fresh, project: "p4" }));
    expect(query.get("project")).toBe("p9");
    expect(query.get("project_filter")).toBe("p4");
    expect(query.get(OPEN_KIND)).toBe("FIELD_TASK");
    expect(query.get(OPEN_ID)).toBe("t1");
    // Page 1 is the default: taken out, not written.
    expect(query.has("page")).toBe(false);
  });

  it("nonsense in the address reads as a fresh page", () => {
    expect(readHistoryAddress(new URLSearchParams("tab=zzz&page=-4&log_page=abc"))).toEqual(fresh);
  });
});

describe("JB183-2: the record window is its own history entry", () => {
  it("open and close add and take away only the window", () => {
    const list = new URLSearchParams("tab=log&log_page=2");
    const opened = new URLSearchParams(withOpenRecord(list, "DAILY_REPORT", "d1"));
    expect(openRecordIn(opened)).toEqual({ kind: "DAILY_REPORT", id: "d1" });
    expect(opened.get("log_page")).toBe("2");
    const closed = new URLSearchParams(withoutOpenRecord(opened));
    expect(openRecordIn(closed)).toBeNull();
    expect(closed.toString()).toBe(list.toString());
  });

  it("the scroll place belongs to the list, whether or not a window is open over it", () => {
    const path = "/reports/contractor/history";
    const list = new URLSearchParams("tab=log&log_page=2");
    const opened = new URLSearchParams(withOpenRecord(list, "FIELD_TASK", "t1"));
    expect(scrollKey(path, opened)).toBe(scrollKey(path, list));
    // The same list whichever order its parameters were written in.
    expect(scrollKey(path, new URLSearchParams("log_page=2&tab=log"))).toBe(scrollKey(path, list));
    // Another page of the list is another place.
    expect(scrollKey(path, new URLSearchParams("tab=log&log_page=3"))).not.toBe(scrollKey(path, list));
  });
});
