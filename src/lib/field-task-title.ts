/**
 * What the office reads as a site disposal task's title (JB215, walk 11-16).
 *
 * A site disposal handed to a field worker is a task the server titles in
 * English - 「Execute site disposal DR-…」. The phone has called it 「执行清运
 * DR-…」 since JB204-6 (`disposalTaskReference`); the office's task list and
 * task window now say the same, in the reader's language, by the same rule:
 * a task for a site disposal is named by the request's number. `null` for
 * any other task, which keeps its own title (`consultantTaskTitle`).
 */
export function disposalTaskTitle(
  task: { linked_record_type?: string; linked_record_reference?: string },
  words: (reference: string) => string,
): string | null {
  return task.linked_record_type === "DISPOSAL_EXECUTION" && task.linked_record_reference
    ? words(task.linked_record_reference)
    : null;
}
