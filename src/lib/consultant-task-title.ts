/**
 * What the office reads as the title of a phone's consultant submission (F4).
 *
 * The phone's 「这次要顾问看什么」 sends one of four types, and the server
 * titles the task `<type> - <date time>`. Before Fable #10 the type was the
 * code (`MATERIAL_CERT_SUBMISSION - 2026-10-07 09:30`); since, it is the
 * sender's words, in the sender's language. Either way the office reads it
 * in its own language: a title of that shape is rebuilt from the task's type.
 * A title somebody wrote (an office-set task) is left as written.
 */

const PHONE_TITLE = /^.+ - (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/;

export function consultantTaskTitle(
  task: { task_type: string; title: string; submission_category?: string | null },
  typeLabel: (code: string) => string | null,
): string {
  if (task.task_type !== "CONSULTANT" || !task.submission_category) return task.title;
  const label = typeLabel(task.submission_category);
  const match = PHONE_TITLE.exec(task.title);
  if (!label || !match) return task.title;
  return `${label} - ${match[1]}`;
}

/**
 * The phone's four 「这次要顾问看什么」 answers (`contractor_ops/views.py`
 * CONSULTANT_SUBMISSION_TYPES).
 */
export const CONSULTANT_ASK_TYPES = ["MATERIAL_APPROVAL", "MATERIAL_CERT_SUBMISSION", "RFI", "OTHER"] as const;
export type ConsultantAskType = (typeof CONSULTANT_ASK_TYPES)[number];

/**
 * What a task asks the consultant to look at, as one of the four - or `null`
 * when the task is not a consultant submission (JB215B, walk 11-17).
 *
 * `submission_category` holds other things on other tasks: a site disposal's
 * task carries `SITE_DISPOSAL_EXECUTION`, a photo filed into a site column the
 * column's code. Those are not a question for the consultant, and the task
 * window printed them as raw codes under 「这次要顾问看什么」. An older or
 * unknown value on a consultant submission is read the way the server files
 * a new one (`consultant_submission_type`): 「MATERIAL」 is 材料申请, anything
 * else 其他 - words, never a code.
 */
export function consultantAskType(
  task: { task_type: string; submission_category?: string | null },
): ConsultantAskType | null {
  if (task.task_type !== "CONSULTANT") return null;
  const value = (task.submission_category ?? "").trim().toUpperCase();
  if (!value) return null;
  if ((CONSULTANT_ASK_TYPES as readonly string[]).includes(value)) return value as ConsultantAskType;
  return value === "MATERIAL" ? "MATERIAL_APPROVAL" : "OTHER";
}
