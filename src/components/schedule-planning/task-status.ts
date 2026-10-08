import type { ScheduleTask, ScheduleTaskStatus } from "@/interfaces/schedule-planning";
import type { StatusTone } from "@/lib/tones";

/**
 * How a task's status is drawn: its words, its colour, and the one sentence
 * that says why.
 *
 * The verdict itself is the server's (`schedule_status`, client spec
 * 7.2.14.10-11). This only decides how it reads, so the list, the Gantt and
 * the 延误 card cannot disagree about which tasks are late:
 *
 * - 已延误 - past the planned finish and not finished. Red.
 * - 延期完成 - finished after the planned finish. Amber, never red: the work
 *   is done; the late days are kept because the spec keeps them.
 *
 * A task at 100% is therefore never 「已延误」, which is what Lucas's
 * screenshot showed on 2026-10-09.
 */
export type TaskStatusKey =
  | "notStarted"
  | "inProgress"
  | "delayed"
  | "completed"
  | "completedLate";

export interface TaskStatusView {
  key: TaskStatusKey;
  tone: StatusTone;
  /** Days late, for 已延误 and 延期完成; zero otherwise. */
  days: number;
  /** Late now or finished late: what the Gantt paints and the reader asks about. */
  late: boolean;
}

const VIEW: Record<ScheduleTaskStatus, Omit<TaskStatusView, "days" | "late">> = {
  NOT_STARTED: { key: "notStarted", tone: "neutral" },
  IN_PROGRESS: { key: "inProgress", tone: "info" },
  DELAYED: { key: "delayed", tone: "danger" },
  COMPLETED: { key: "completed", tone: "positive" },
  COMPLETED_LATE: { key: "completedLate", tone: "warning" },
};

export function taskStatusView(
  task: Pick<ScheduleTask, "schedule_status" | "delay_days">,
): TaskStatusView {
  const view = VIEW[task.schedule_status] ?? VIEW.IN_PROGRESS;
  const late = view.key === "delayed" || view.key === "completedLate";
  return { ...view, days: late ? task.delay_days : 0, late };
}

/** The rows the 延误 card counts and its filter shows. */
export function isDelayed(task: Pick<ScheduleTask, "schedule_status">): boolean {
  return task.schedule_status === "DELAYED";
}

/** The message for a late task's badge, which carries its days. */
export function lateLabelKey(
  view: TaskStatusView,
): "status.delayedDays" | "status.completedLateDays" | null {
  if (view.key === "delayed") return "status.delayedDays";
  if (view.key === "completedLate") return "status.completedLateDays";
  return null;
}
