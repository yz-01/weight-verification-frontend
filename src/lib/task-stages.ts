/**
 * The three words 现场任务 and 隐患整改 / EHS show for where an item stands
 * (I1, I2, ID10): 待处理 - with the person doing it; 待验收 - handed in,
 * waiting for its check; 已完成 - confirmed, and so in the 历史档案 rather
 * than the working list.
 *
 * The stored statuses do not change (the server keeps seven for a hazard and
 * six for a task); this is only how they read and how the lists filter. The
 * server answers the same question for its exports (`stage` on each row, the
 * `stage` list filter), and the two are kept in step by the tests on both
 * sides.
 */

import type { FieldTaskStatus } from "@/interfaces/contractor-ops";
import type { IncidentStatus } from "@/interfaces/site-operations";
import type { StatusTone } from "@/lib/tones";

export type TaskStage = "PENDING" | "AWAITING" | "DONE";

/** The status filter's choices, in the order the screens offer them. */
export const TASK_STAGES: readonly TaskStage[] = ["PENDING", "AWAITING", "DONE"];

/**
 * What a list asks the server for: the working list (待处理 + 待验收) unless
 * one stage is chosen. 「已完成事项自动移出待处理主列表」.
 */
export const ACTIVE_STAGE = "ACTIVE";

const HAZARD_STAGE: Record<IncidentStatus, TaskStage> = {
  OPEN: "PENDING",
  // 「调查中」 is not a step any more; an old item in it simply waits.
  INVESTIGATING: "PENDING",
  ASSIGNED: "PENDING",
  RETURNED: "PENDING",
  RECTIFICATION_SUBMITTED: "AWAITING",
  VERIFIED: "DONE",
  RESOLVED: "DONE",
};

const FIELD_TASK_STAGE: Record<FieldTaskStatus, TaskStage> = {
  OPEN: "PENDING",
  IN_PROGRESS: "PENDING",
  RETURNED: "PENDING",
  SUBMITTED: "AWAITING",
  ACCEPTED: "DONE",
  CANCELLED: "DONE",
};

export function hazardStage(status: IncidentStatus): TaskStage {
  return HAZARD_STAGE[status] ?? "PENDING";
}

export function fieldTaskStage(status: FieldTaskStatus): TaskStage {
  return FIELD_TASK_STAGE[status] ?? "PENDING";
}

export const STAGE_TONE: Record<TaskStage, StatusTone> = {
  PENDING: "warning",
  AWAITING: "info",
  DONE: "positive",
};

/** A `?stage=` from the address, if it is one of the three; otherwise none. */
export function stageFromParam(value: string | null | undefined): TaskStage | null {
  const upper = String(value ?? "").toUpperCase();
  return (TASK_STAGES as readonly string[]).includes(upper) ? (upper as TaskStage) : null;
}

/**
 * The `stage` a list sends: the chosen one, or the working list. The 历史档案
 * view is always `DONE`.
 */
export function stageQuery(chosen: TaskStage | null, history: boolean): string {
  if (history) return "DONE";
  return chosen ?? ACTIVE_STAGE;
}

/**
 * A field task's label: one of the three - except a cancelled one, which is
 * finished but was never confirmed, and says so.
 */
export function fieldTaskStageKey(status: FieldTaskStatus): TaskStage | "CANCELLED" {
  return status === "CANCELLED" ? "CANCELLED" : fieldTaskStage(status);
}
