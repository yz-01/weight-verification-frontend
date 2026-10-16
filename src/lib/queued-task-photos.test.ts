import { describe, expect, it } from "vitest";

import type { OfflineJob } from "@/lib/offline-db";

import { queuedTaskPhotoCount } from "./queued-task-photos";

const file = { blob: new Blob(["jpg"]), name: "a.jpg", type: "image/jpeg", lastModified: 0 };

function photo(taskId: string, id: string): OfflineJob {
  return {
    id,
    ownerId: "w",
    kind: "FIELD_TASK_PHOTO",
    queuedAt: "2026-10-16T01:00:00Z",
    attempts: 0,
    lastError: "",
    payload: { taskId, caption: "", capturedAt: "2026-10-16T01:00:00Z", clientEventId: id, file },
  } as OfflineJob;
}

/** P-phonefix: a task's photos taken with no signal count towards 提交完成. */
describe("this task's photos waiting on the phone", () => {
  it("counts only this task's queued photos", () => {
    const jobs = [
      photo("t-1", "a"),
      photo("t-1", "b"),
      photo("t-2", "c"),
      { ...photo("t-1", "d"), kind: "FIELD_TASK_TRANSITION" } as OfflineJob,
    ];
    expect(queuedTaskPhotoCount(jobs, "t-1")).toBe(2);
    expect(queuedTaskPhotoCount(jobs, "t-3")).toBe(0);
  });

  it("the task screen adds them to the server's photos", async () => {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync("src/components/field-staff/my-tasks-panel.tsx", "utf8");
    expect(code).toContain("const photos = row.photos.length + waitingPhotos;");
    expect(code).toContain('t("photosQueued", { count: waitingPhotos })');
  });
});
