/**
 * J40 (2026-10-22): the phone's 记录进度 is photographs and a note only.
 *
 * 「手机端，只需要拍照和备注 ... 不需要下拉，不需要这个分类在手机端」, and the
 * phone's list page (数字卡, 施工分类 tags, big photo cards) is gone. The desktop
 * keeps 施工分类 and 完成比例 as they were (「电脑后台的施工分类不需要删掉」).
 * The dialog draws into a portal, so this reads the source like its neighbours.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const source = read("src/components/contractor-ops/operations-workspaces.tsx");
const dialog = source.slice(
  source.indexOf("export function ProgressDialog("),
  source.indexOf("export function MaterialOutgoingWorkspace("),
);
const workspace = source.slice(
  source.indexOf("export function SiteProgressWorkspace("),
  source.indexOf("export function PhaseDialog("),
);

describe("the phone's 记录进度 (J40)", () => {
  it("opens the form itself: no list page, no stat cards, no category chips, no big photos", () => {
    expect(workspace).toMatch(/<ProgressDialog/);
    for (const gone of ["progress.summary", "getSiteProgressRecords", "<Image", "phase_name", "addPhase"]) {
      expect(workspace).not.toContain(gone);
    }
  });

  it("hides the 施工分类 dropdown, 「＋新增施工分类」 and 完成比例 for field staff", () => {
    expect(dialog).toContain("const phoneForm = isFieldStaff;");
    expect(dialog).toMatch(/\{!phoneForm && \(\s*<FieldWrapper\s+label=\{t\("field\.phase"\)\}/);
    expect(dialog).toMatch(/\{!phoneForm && \(\s*<FieldWrapper label=\{t\("field\.percentComplete"\)\}/);
    expect(dialog).toContain("addingPhase && !phoneForm");
    expect(dialog).toContain("...(phoneForm ? {} : { phase, percent_complete: percent })");
  });

  it("asks for a photograph and the project only: the 施工分类 is not required on the phone", () => {
    expect(dialog).toContain("[phoneForm || phase, t(\"field.phase\")]");
    expect(dialog).toContain("[submissionPhotos.length >= 1, t(\"field.photos\")]");
  });

  it("the office's dialog is unchanged: still a 施工分类, 「＋新增施工分类」 and the percentage", () => {
    expect(dialog).toContain("NEW_PHASE_OPTION");
    expect(dialog).toContain('t("progress.newPhase.add")');
    expect(dialog).toContain('t("field.percentComplete")');
  });

  it("the office list tags a record without a 施工分类 as 待归类", () => {
    const list = read("src/components/contractor-ops/office-module-lists.tsx");
    expect(list).toContain('t("progress.unclassified")');
  });

  it("says it in four languages", () => {
    const text = (messages: typeof en) => messages.contractorOps.progress;
    expect(text(zh).recordHelpPhone).toBe("拍至少 1 张现场照片，可以写备注，然后提交。");
    expect(text(zhTW).recordHelpPhone).toBe("拍至少 1 張現場照片，可以寫備註，然後提交。");
    for (const messages of [en, ms, zh, zhTW]) {
      expect(text(messages).recordHelpPhone).toBeTruthy();
      expect(text(messages).unclassified).toBeTruthy();
    }
    expect(text(zh).unclassified).toBe("待归类");
  });
});
