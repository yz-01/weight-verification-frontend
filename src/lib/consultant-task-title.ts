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
