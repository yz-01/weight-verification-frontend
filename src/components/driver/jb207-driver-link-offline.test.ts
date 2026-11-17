import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ApiError } from "@/interfaces/api";
import { notRecorded } from "@/lib/driver-not-recorded";

/**
 * JB207-5 (Lucas 11-16 audit): the trip link offline.
 *
 * The link has no queue, yet its header carried the offline sign that says
 * 「记录已存在这台手机上…会自动上传」, and the API client says nothing while
 * the phone is offline - so a press without signal vanished while the driver
 * was told it was kept. The sign is gone from the link and a step or photo
 * that did not go says so in one plain line.
 */
function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
}

const link = read("src/components/driver/driver-task-link.tsx");
const task = read("src/components/driver/driver-task.tsx");
const zh = JSON.parse(read("src/messages/zh.json"));

describe("why a step did not go", () => {
  it("is 'offline' when the request got no answer", () => {
    expect(notRecorded(new ApiError("网络连接失败", 0))).toEqual({ kind: "offline" });
    expect(notRecorded(new ApiError("上传超时", 0, {}, "timeout"))).toEqual({ kind: "offline" });
  });

  it("carries the server's reason when it was refused", () => {
    expect(notRecorded(new ApiError("请先拍装货照片。", 409, {}, "task_photo_required"))).toEqual({
      kind: "refused",
      reason: "请先拍装货照片。",
    });
  });

  it("leaves everything else to its own sentence", () => {
    expect(notRecorded(null)).toBeNull();
    // The photo's missing GPS is worded by driver.photoGpsRequired.
    expect(notRecorded(new Error("driver_photo_gps_required"))).toBeNull();
  });
});

describe("the trip link page", () => {
  it("no longer shows the offline sign that promised an upload", () => {
    expect(link).not.toMatch(/<OfflineStatus/);
    expect(link).not.toMatch(/offline-status/);
  });

  it("says a missed step under the buttons and in the open confirm", () => {
    expect(task).toMatch(/const stepMissed = notRecorded\(advance\.error\)/);
    expect(task).toMatch(/const photoMissed = notRecorded\(upload\.error\)/);
    expect(task).toMatch(/\{!moving && <NotRecordedLine missed=\{stepMissed\} \/>\}/);
    expect(task.match(/<NotRecordedLine missed=\{stepMissed\} \/>/g)).toHaveLength(2);
    expect(task).toMatch(/<NotRecordedLine missed=\{photoMissed\} photo \/>/);
  });

  it("words it plainly, with what to do", () => {
    expect(zh.driver.notRecorded.stepOffline).toBe("没有网络，这一步没有记录，有网络后请再按一次。");
    expect(zh.driver.notRecorded.photoOffline).toContain("没有记录");
    expect(zh.driver.notRecorded.step).toContain("{reason}");
    // Nothing on this page claims the phone kept it.
    expect(JSON.stringify(zh.driver.notRecorded)).not.toContain("自动上传");
  });
});
