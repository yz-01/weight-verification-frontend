import { describe, expect, it } from "vitest";

import {
  CONSULTANT_MODULES,
  foldLegacyCodes,
  orderedModules,
  startingGrant,
  toggleModule,
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
    });
    // A default saved as the seven codes counts as its ticks.
    expect(startingGrant([], ["safety.view", "approval.view"])).toEqual({
      modules: ["safety"],
      options: ["approval.view"],
    });
    expect(startingGrant(null, null)).toEqual({
      modules: ["dashboard", "projects", "safety", "notifications"],
      options: ["approval.view", "approval.review"],
    });
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
