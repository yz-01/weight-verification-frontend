import type { FieldRecordMode } from "@/components/field-staff/field-records-panel";
import type { FieldTask } from "@/interfaces/contractor-ops";

/**
 * Which record screen a task opens instead of its own photo flow, or `null`.
 *
 * JB73 (客户 10-29 晚 事项 1): 「现场任务是项目经理向员工分配工作、检查事项及拍照
 * 反馈」. A task the manager sends is always that - photos, a note, 提交 - and
 * no longer jumps into 材料进场, 设备, 工程进度, 整改 or 废料 by its type; the
 * office does not choose a type any more, and one sent before opens the same
 * way. Only the jobs the system raises for a record keep their screen: the
 * consultant's 待整理现场资料 and the disposal run (清运执行).
 */
export function taskRecordMode(
  task: Pick<FieldTask, "task_type" | "submission_category">,
): FieldRecordMode | null {
  if (task.task_type === "CONSULTANT") return "consultant";
  if (
    task.task_type === "WASTE" &&
    task.submission_category.toUpperCase() === "SITE_DISPOSAL_EXECUTION"
  ) {
    return "disposal";
  }
  return null;
}
