import { describe, expect, it } from "vitest";

import {
  CONSULTANT_ITEMS,
  CONSULTANT_MODULES,
  allTicks,
  foldLegacyCodes,
  moduleItemState,
  normaliseTicks,
  orderedModules,
  startingGrant,
  toggleItem,
  toggleModule,
  toggleModuleTicks,
  toggleOption,
} from "./consultant-modules";

// JB210 (客户 11-16 顾问权限): 11 ticks per project, the original 7 kept.
describe("consultant modules", () => {
  it("are the client's eleven in the client's order", () => {
    expect(CONSULTANT_MODULES).toEqual([
      "dashboard",
      "projects",
      "field_tasks",
      "materials",
      "progress",
      "safety",
      "documents",
      "record_centre",
      "reports",
      "notifications",
      "conversations",
    ]);
  });

  it("keeps the client's order and drops unknown keys", () => {
    expect(orderedModules(["reports", "nonsense", "dashboard", "reports"])).toEqual(["dashboard", "reports"]);
  });

  it("folds the original seven into ticks and options (原有7项…统一关联)", () => {
    expect(
      foldLegacyCodes([
        "project.view",
        "approval.view",
        "approval.review",
        "notification.view",
        "safety.view",
        "report.view",
        "report.export",
      ]),
    ).toEqual({
      modules: ["projects", "safety", "reports", "notifications"],
      options: ["approval.view", "approval.review", "report.export"],
    });
  });

  it("starts a new grant from the company default, else the usual one", () => {
    expect(startingGrant(["materials"], ["report.export"])).toEqual({
      modules: ["materials"],
      options: ["report.export"],
      // JB225: a module saved without items opens all of them.
      items: ["materials.in", "materials.returns", "materials.issues", "materials.supplier_totals", "materials.targets"],
    });
    // A default saved as the seven codes counts as its ticks.
    expect(startingGrant([], ["safety.view", "approval.view"])).toEqual({
      modules: ["safety"],
      options: ["approval.view"],
      items: [],
    });
    expect(startingGrant(null, null)).toEqual({
      modules: ["dashboard", "projects", "safety", "notifications"],
      options: ["approval.view", "approval.review"],
      items: [],
    });
    expect(startingGrant(["progress"], [], ["progress.schedule"]).items).toEqual(["progress.schedule"]);
  });

  it("ticks 查看 with 审批 and drops 审批 with 查看", () => {
    expect(toggleOption([], "approval.review", true)).toEqual(["approval.view", "approval.review"]);
    expect(toggleOption(["approval.view", "approval.review"], "approval.view", false)).toEqual([]);
    expect(toggleOption(["approval.view", "approval.review", "report.export"], "approval.review", false)).toEqual([
      "approval.view",
      "report.export",
    ]);
  });

  it("toggles one module and keeps the order", () => {
    expect(toggleModule(["reports"], "dashboard", true)).toEqual(["dashboard", "reports"]);
    expect(toggleModule(["dashboard", "reports"], "reports", false)).toEqual(["dashboard"]);
  });
});

// JB225 (客户 11-19 事项 5): 「以上各项请设置独立的勾选权限，由建筑商总部自行决定开放哪些内容给顾问」.
describe("consultant items", () => {
  const MATERIALS = ["materials.in", "materials.returns", "materials.issues", "materials.supplier_totals", "materials.targets"];

  it("are the client's nine in the client's order", () => {
    expect(CONSULTANT_ITEMS).toEqual([
      ...MATERIALS, "progress.records", "progress.daily_reports", "progress.rain", "progress.schedule",
      // JB265 (客户 11-26 事项 6): 现场任务's three.
      "field_tasks.view", "field_tasks.assign", "field_tasks.accept",
    ]);
  });

  it("follow the backend's rule between a module and its items", () => {
    // A module alone (a grant from before JB225) holds all its items.
    expect(normaliseTicks(["dashboard", "materials"], [])).toEqual({ modules: ["dashboard", "materials"], items: MATERIALS });
    // An item sent brings its module.
    expect(normaliseTicks(["dashboard"], ["progress.schedule"], true)).toEqual({
      modules: ["dashboard", "progress"],
      items: ["progress.schedule"],
    });
    // Items of a module not ticked go.
    expect(normaliseTicks(["dashboard"], MATERIALS)).toEqual({ modules: ["dashboard"], items: [] });
  });

  it("ticks a parent's items with it and shows some / all / none", () => {
    let ticks = toggleModuleTicks({ modules: [], items: [] }, "materials", true);
    expect(ticks.items).toEqual(MATERIALS);
    expect(moduleItemState(ticks, "materials")).toBe("all");
    ticks = toggleItem(ticks, "materials.returns", false);
    expect(moduleItemState(ticks, "materials")).toBe("some");
    expect(ticks.modules).toEqual(["materials"]);
    for (const item of ["materials.in", "materials.issues", "materials.supplier_totals", "materials.targets"] as const) {
      ticks = toggleItem(ticks, item, false);
    }
    // The last item off takes the module off.
    expect(ticks).toEqual({ modules: [], items: [] });
    expect(moduleItemState(ticks, "materials")).toBe("none");
    // One item on brings the module back.
    expect(toggleItem(ticks, "materials.targets", true)).toEqual({ modules: ["materials"], items: ["materials.targets"] });
    // Unticking the parent unticks every item.
    expect(toggleModuleTicks(allTicks(), "progress", false).items).toEqual([
      ...MATERIALS, "field_tasks.view", "field_tasks.assign", "field_tasks.accept",
    ]);
  });

  it("「全选」 includes every item", () => {
    expect(allTicks().items).toEqual([...CONSULTANT_ITEMS]);
  });
});
