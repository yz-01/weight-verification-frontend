import { describe, expect, it } from "vitest";

import type { FieldTaskStatus } from "@/interfaces/contractor-ops";
import type { IncidentStatus } from "@/interfaces/site-operations";
import {
  ACTIVE_STAGE,
  TASK_STAGES,
  fieldTaskStage,
  fieldTaskStageKey,
  hazardStage,
  stageFromParam,
  stageQuery,
} from "@/lib/task-stages";

/**
 * ID10: the EHS screens show three states - 待处理, 待验收, 已完成 - for the
 * seven the server stores, and 现场任务 uses the same three (I1). The server
 * maps them the same way (`site_operations.models.HAZARD_STAGES`,
 * `contractor_ops.models.FIELD_TASK_STAGES`, pinned by
 * `test_every_status_reads_as_one_of_three` / `test_the_stage_names_every_status`).
 */
describe("task stages", () => {
  it("reads every hazard status as one of three", () => {
    const expected: Record<IncidentStatus, string> = {
      OPEN: "PENDING",
      INVESTIGATING: "PENDING",
      ASSIGNED: "PENDING",
      RETURNED: "PENDING",
      RECTIFICATION_SUBMITTED: "AWAITING",
      VERIFIED: "DONE",
      RESOLVED: "DONE",
    };
    for (const [status, stage] of Object.entries(expected)) {
      expect(hazardStage(status as IncidentStatus)).toBe(stage);
    }
  });

  it("reads every field-task status as one of three, and says cancelled", () => {
    const expected: Record<FieldTaskStatus, string> = {
      OPEN: "PENDING",
      IN_PROGRESS: "PENDING",
      RETURNED: "PENDING",
      SUBMITTED: "AWAITING",
      ACCEPTED: "DONE",
      CANCELLED: "DONE",
    };
    for (const [status, stage] of Object.entries(expected)) {
      expect(fieldTaskStage(status as FieldTaskStatus)).toBe(stage);
    }
    expect(fieldTaskStageKey("CANCELLED")).toBe("CANCELLED");
    expect(fieldTaskStageKey("RETURNED")).toBe("PENDING");
  });

  it("offers exactly three status choices", () => {
    expect(TASK_STAGES).toEqual(["PENDING", "AWAITING", "DONE"]);
  });

  it("takes only a real stage from the address", () => {
    expect(stageFromParam("AWAITING")).toBe("AWAITING");
    expect(stageFromParam("awaiting")).toBe("AWAITING");
    expect(stageFromParam("ACTIVE")).toBeNull();
    expect(stageFromParam("photos")).toBeNull();
    expect(stageFromParam(null)).toBeNull();
  });

  it("asks for the working list unless a stage or the history is chosen", () => {
    expect(stageQuery(null, false)).toBe(ACTIVE_STAGE);
    expect(stageQuery("AWAITING", false)).toBe("AWAITING");
    expect(stageQuery(null, true)).toBe("DONE");
    expect(stageQuery("PENDING", true)).toBe("DONE");
  });
});
