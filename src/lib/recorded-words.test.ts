/**
 * JB164 (screens 11-10 rounds 1 and 2): English the app writes into records,
 * and English words left in Chinese labels.
 *
 * - The office's field-task sheet showed a disposal's 「GPS captured site
 *   location」 as its 工作位置; the phone's task list and the consultant's
 *   inbox show the same field.
 * - A receipt's photos carry 「Arriving vehicle」「Unloading process」「Empty
 *   vehicle after unloading」 (written by `submitMaterialReceipt`).
 * - 材料管理's tabs read 「Material In 进场」「Material Out 退场」「Reject 不合格」.
 * - 用户管理 showed phone accounts' field+…@mse.invalid and offered 编辑 on a
 *   deleted account; 发送项目通知 offered an invited (not activated) account.
 *
 * Stored data is not changed: the words are said where they are shown.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";
import { GPS_SITE_LOCATION, RECEIPT_PHOTO_CAPTIONS, photoCaptionText, siteLocationText } from "@/lib/recorded-words";
import { isPlaceholderEmail, noticeRecipients } from "@/lib/team-contact";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const words = (messages: typeof zh) => (key: keyof typeof zh.recordedWords) => messages.recordedWords[key];

describe("a receipt's photo captions", () => {
  it("are said in the reader's language; a typed caption stays as typed", () => {
    const zhWords = words(zh);
    expect(photoCaptionText("Arriving vehicle", zhWords)).toBe("车辆到场");
    expect(photoCaptionText("Unloading process", zhWords)).toBe("材料卸货");
    expect(photoCaptionText("Empty vehicle after unloading", zhWords)).toBe("卸货后的空车");
    expect(photoCaptionText("Other site photo", zhWords)).toBe("其他现场照片");
    expect(photoCaptionText("Delivery Order", zhWords)).toBe("送货单 DO");
    expect(photoCaptionText("车尾有裂痕", zhWords)).toBe("车尾有裂痕");
    expect(photoCaptionText("", zhWords)).toBe("");
    expect(photoCaptionText(null, zhWords)).toBeNull();
    expect(photoCaptionText("Arriving vehicle", words(zhTW))).toBe("車輛到場");
    expect(photoCaptionText("Arriving vehicle", words(ms))).toBe("Kenderaan tiba");
    expect(photoCaptionText("Arriving vehicle", words(en))).toBe("Arriving vehicle");
  });

  it("are exactly what the receipt form writes, so old and new rows match", () => {
    const service = read("src/services/contractor.service.ts");
    for (const caption of Object.keys(RECEIPT_PHOTO_CAPTIONS)) {
      expect(service).toContain(`"${caption}"`);
    }
    for (const messages of [zh, zhTW, en, ms]) {
      for (const key of Object.values(RECEIPT_PHOTO_CAPTIONS)) {
        expect(messages.recordedWords[key]).toBeTruthy();
      }
    }
  });
});

describe("a disposal's GPS site location copied onto a task", () => {
  it("is worded on the office's task sheet, the phone's task list and the consultant's inbox", () => {
    expect(siteLocationText(GPS_SITE_LOCATION, zh.siteDisposal.gpsSiteLocation)).toBe("GPS 定位的工地位置");
    const sheet = read("src/components/dashboard/field-task-sheet.tsx");
    expect(sheet).toContain('value: siteLocationText(row.work_location, site("gpsSiteLocation"))');
    expect(sheet).toContain("label: photoCaptionText(photo.caption, recorded) || row.title,");
    expect(sheet).toContain("label: photoCaptionText(photo.caption, recorded) || row.linked_record_reference || row.title,");
    expect(read("src/components/field-staff/my-tasks-panel.tsx")).toContain(
      'value: siteLocationText(row.work_location, site("gpsSiteLocation"))',
    );
    expect(read("src/components/consultant-workflow/field-inbox.tsx")).toContain(
      'siteLocationText(task.work_location, site("gpsSiteLocation"))',
    );
  });
});

describe("材料管理's tabs", () => {
  it("read in one language", () => {
    expect(zh.receipts.tabs).toMatchObject({ in: "材料进场", out: "材料退场", reject: "验收不合格" });
    expect(zhTW.receipts.tabs).toMatchObject({ in: "材料進場", out: "材料退場", reject: "驗收不合格" });
    for (const messages of [zh, zhTW]) {
      for (const key of ["in", "out", "reject"] as const) {
        expect(messages.receipts.tabs[key]).not.toMatch(/[A-Za-z]/);
      }
    }
    expect(ms.receipts.tabs).toMatchObject({ in: "Bahan masuk", out: "Bahan keluar" });
    expect(en.receipts.tabs).toMatchObject({ in: "Material In", out: "Material Out" });
  });
});

describe("用户管理 and 发送项目通知", () => {
  it("never shows a phone account's placeholder email", () => {
    expect(isPlaceholderEmail("field+e65d0c@mse.invalid")).toBe(true);
    const users = read("src/components/users/users.tsx");
    expect(users).toContain("{!isPlaceholderEmail(row.original.email) && (");
    expect(read("src/components/users/view-user.tsx")).toContain(
      '{!isPlaceholderEmail(data.email) && <ReadField label={t("users.field.email")} value={data.email} />}',
    );
  });

  it("offers 查看 but not 编辑 on a deleted account", () => {
    expect(read("src/components/users/users.tsx")).toContain('{can("user.update") && !removed && (');
    expect(read("src/components/users/view-user.tsx")).toContain('can("user.update") && data.status !== "REMOVED" ?');
  });

  it("leaves invited accounts out of a notice's recipients", () => {
    const rows = [
      { user: "a", user_status: "ACTIVE" as const },
      { user: "b", user_status: "INVITED" as const },
      { user: "c", user_status: "SUSPENDED" as const },
      { user: "d" },
    ];
    expect(noticeRecipients(rows).map((row) => row.user)).toEqual(["a", "c", "d"]);
    expect(read("src/components/notifications/notifications.tsx")).toContain(
      "const memberRows = noticeRecipients(members.data?.results ?? []);",
    );
  });
});
