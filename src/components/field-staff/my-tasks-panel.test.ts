import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 我的任务 on the phone (I1, ID13, IB6).
 *
 * IB6: `submitFieldTaskTransitionOfflineAware` always had a `note` parameter
 * and nothing ever passed it, so a worker's 备注 never reached the office.
 * ID13: no 开始 step - 提交完成 takes the GPS itself. There is no DOM in this
 * runner, so the wiring is read from the screen, as the other phone tests do.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const PANEL = read("src/components/field-staff/my-tasks-panel.tsx");
const WORKSPACE = read("src/components/field-staff/field-staff-workspace.tsx");

describe("My Tasks hands a field task in with its note and GPS", () => {
  it("passes the note to the offline-aware submit (IB6)", () => {
    expect(PANEL).toMatch(
      /submitFieldTaskTransitionOfflineAware\(\s*user\.id,\s*taskId,\s*"SUBMITTED",\s*\{[^}]*latitude: fix\.latitude[^}]*\},\s*note\.trim\(\),\s*\)/,
    );
  });

  it("has no 开始 step any more (ID13)", () => {
    expect(PANEL).not.toContain('"IN_PROGRESS"');
    expect(WORKSPACE).not.toContain('onTransition("IN_PROGRESS")');
    expect(WORKSPACE).not.toContain("action.start");
  });

  it("lists both kinds from one server list and opens a hazard in its own room (ID14)", () => {
    expect(PANEL).toContain("getMyTasks()");
    expect(PANEL).toContain('row.kind === "HAZARD"');
    expect(PANEL).toContain("onOpenHazard(");
    expect(PANEL).toContain('<RecordConversationPanel kind="FIELD_TASK"');
  });

  it("offers nothing that sets, assigns or passes on work", () => {
    for (const forbidden of ["createFieldTask", "updateFieldTask", "assignSafetyRectification", "reassignSafetyRectification"]) {
      expect(PANEL).not.toContain(forbidden);
    }
  });
});
