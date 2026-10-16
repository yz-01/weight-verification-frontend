import type { OfflineJob } from "@/lib/offline-db";

/**
 * This task's photos still waiting in the phone's offline queue (P-phonefix).
 *
 * Taken with no signal, they are not on the server yet, but they will go
 * before the task's 提交完成 (the same chain, in order). So they count
 * towards the photos the task needs - else 提交完成 stayed blocked offline -
 * and the screen shows them as 「等待上传」.
 */
export function queuedTaskPhotoCount(jobs: readonly OfflineJob[], taskId: string): number {
  return jobs.filter((job) => job.kind === "FIELD_TASK_PHOTO" && job.payload.taskId === taskId).length;
}
