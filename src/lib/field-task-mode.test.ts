import { describe, expect, it } from "vitest";

import { taskRecordMode } from "@/lib/field-task-mode";

/**
 * JB73 (客户 10-29 晚 事项 1): a task the manager sends is photos, a note and
 * 提交 on the phone - it no longer jumps into 材料进场 and the rest by type.
 */
describe("which screen a field task opens on the phone", () => {
  it("keeps every task the manager sends in its own photo flow, old types included", () => {
    for (const task_type of ["PHOTO", "OTHER", "MATERIAL", "EQUIPMENT", "PROGRESS", "SAFETY"] as const) {
      expect(taskRecordMode({ task_type, submission_category: "" })).toBeNull();
    }
    expect(taskRecordMode({ task_type: "WASTE", submission_category: "OUTGOING" })).toBeNull();
    expect(taskRecordMode({ task_type: "WASTE", submission_category: "RECYCLE" })).toBeNull();
  });

  it("still opens the record the system raised the job for", () => {
    expect(taskRecordMode({ task_type: "CONSULTANT", submission_category: "" })).toBe("consultant");
    expect(
      taskRecordMode({ task_type: "WASTE", submission_category: "SITE_DISPOSAL_EXECUTION" }),
    ).toBe("disposal");
  });
});
