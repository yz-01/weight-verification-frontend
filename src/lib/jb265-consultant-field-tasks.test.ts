/**
 * JB265 (客户 11-26 事项 6, 图 6): 顾问项目授权's 现场任务 as three ticks -
 * 查看现场任务 / 发起及指派现场任务 / 验收现场任务 - mirroring
 * `accounts.consultant_access` (which decides; this only draws).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CONSULTANT_ITEMS,
  ITEM_MESSAGE_KEYS,
  ITEMS_OF_MODULE,
  consultantHoldsItem,
  moduleItemState,
  normaliseTicks,
  toggleItem,
} from "@/lib/consultant-modules";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

describe("JB265 the three 现场任务 ticks", () => {
  it("are 现场任务's items, in the client's order", () => {
    expect(ITEMS_OF_MODULE.field_tasks).toEqual(["field_tasks.view", "field_tasks.assign", "field_tasks.accept"]);
    expect(CONSULTANT_ITEMS).toContain("field_tasks.assign");
  });

  it("keep a grant from before at 查看 only", () => {
    const ticks = normaliseTicks(["dashboard", "field_tasks"], []);
    expect(ticks.items.filter((item) => item.startsWith("field_tasks."))).toEqual(["field_tasks.view"]);
    expect(moduleItemState(ticks, "field_tasks")).toBe("some");
  });

  it("tick on their own", () => {
    let ticks = normaliseTicks([], []);
    ticks = toggleItem(ticks, "field_tasks.assign", true);
    expect(ticks.modules).toContain("field_tasks");
    expect(ticks.items).toEqual(["field_tasks.assign"]);
    ticks = toggleItem(ticks, "field_tasks.assign", false);
    expect(ticks.modules).not.toContain("field_tasks");
  });

  it("decide the consultant's buttons on the project he is in", () => {
    const consultant = { account_type: "CONSULTANT", active_project: { sub_modules: ["field_tasks.view", "field_tasks.assign"] } };
    expect(consultantHoldsItem(consultant, "field_tasks.assign")).toBe(true);
    expect(consultantHoldsItem(consultant, "field_tasks.accept")).toBe(false);
    expect(consultantHoldsItem({ account_type: "CONTRACTOR", active_project: null }, "field_tasks.assign")).toBe(false);
  });

  it("show 派发任务 to a consultant holding 发起及指派, on his project", () => {
    const source = readFileSync("src/components/contractor-ops/operations-workspaces.tsx", "utf-8");
    expect(source).toContain('can("field_task.manage") || consultantHoldsItem(user, "field_tasks.assign")');
    expect(source).toContain('user?.account_type === "CONSULTANT" ? user.active_project?.project_id');
    // Who started it, when a consultant did.
    expect(source).toContain('tRoot("jb265.startedBy"');
  });

  it("are named in all four languages", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      for (const item of ITEMS_OF_MODULE.field_tasks ?? []) {
        const key = ITEM_MESSAGE_KEYS[item];
        const access = messages.consultantAccess as unknown as Record<string, Record<string, string>>;
        expect(access.item[key]).toBeTruthy();
        expect(access.itemShort[key]).toBeTruthy();
        expect(access.itemHint[key]).toBeTruthy();
      }
      expect(messages.jb265.startedBy).toContain("{name}");
    }
    expect(zh.consultantAccess.item.fieldTasksView).toBe("查看现场任务");
    expect(zh.consultantAccess.item.fieldTasksAssign).toBe("发起及指派现场任务");
    expect(zh.consultantAccess.item.fieldTasksAccept).toBe("验收现场任务");
  });
});
