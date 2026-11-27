/**
 * JB274 (客户 11-26 事项 15, 图 18–22): 「顾问第一次建立整改事项时，虽然已经选择
 * 整改人员，系统仍然显示「待分配」」.
 *
 * Cause: the office / consultant form had two people pickers - the
 * 「整改人」 dropdown (which assigns) and a checkbox list called
 * 「负责人及工地人员」 (which only notifies). The rectifier ticked in the list
 * could talk in the room (图 22) but was never assigned. At a desk the
 * dropdown is now 「整改负责人」 - the word of the 指派 window and the detail -
 * the list says it only notifies, and an empty dropdown says the item will be
 * 待分配. The phone's own report keeps its words.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

const source = readFileSync("src/components/site-operations/safety.tsx", "utf-8");

describe("JB274 the desk form names who fixes it", () => {
  it("calls the dropdown 整改负责人 at a desk and keeps the phone's word", () => {
    expect(source).toContain(
      'label={fieldMode ? t("ehs.form.rectifier") : t("safety.field.responsible")}',
    );
    expect(zh.safety.field.responsible).toBe("整改负责人");
  });

  it("says the second list only notifies, at a desk", () => {
    expect(source).toContain(
      'label={fieldMode ? t("safety.fieldReport.notifyPeople") : t("jb274.notifyOnly")}',
    );
    expect(source).toContain('t("jb274.notifyOnlyHint")');
    expect(zh.jb274.notifyOnly).toBe("另外通知（不会指派）");
    expect(zh.jb274.notifyOnlyHint).toContain("不会成为整改负责人");
  });

  it("says an item raised with nobody chosen will be 待分配", () => {
    expect(source).toContain('{!fieldMode && !draft.rectifier && draft.project && (');
    expect(source).toContain('t("jb274.notChosenYet")');
    expect(zh.jb274.notChosenYet).toContain("待分配");
  });

  it("asks once, before saving, to assign a person ticked only in 另外通知 (QA2)", () => {
    // 「避免重复指派」: nobody in 整改负责人, somebody ticked below -> one tap.
    expect(source).toContain(
      "!fieldMode && !draft.rectifier && tickedPeople.length > 0 && !notifyOnlyChosen",
    );
    expect(source).toContain("onClick={submitCreate}");
    expect(source).toMatch(/data-jb274="ask-assign"[\s\S]{0,1200}rectifier: row\.id[\s\S]{0,800}t\("jb274\.notifyOnlyGo"\)/);
    expect(zh.jb274.assignTo).toBe("指派给 {name}");
    expect(zh.jb274.askAssignTitle).toContain("整改负责人");
    expect(zh.jb274.askAssignHint).toContain("待分配");
  });

  it("has the words in all four languages, the UI's 你 only", () => {
    for (const messages of [zh, zhTW, en, ms]) {
      expect(Object.keys(messages.jb274).sort()).toEqual(
        ["askAssignHint", "askAssignTitle", "assignTo", "notChosenYet", "notifyOnly", "notifyOnlyGo", "notifyOnlyHint"],
      );
    }
    expect(JSON.stringify(zh.jb274)).not.toContain("您");
    expect(JSON.stringify(zhTW.jb274)).not.toContain("您");
  });
});
