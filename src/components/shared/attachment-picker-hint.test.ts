import { describe, expect, it } from "vitest";

import { dropHintKey } from "@/components/shared/attachment-picker";
import en from "@/messages/en.json";
import ms from "@/messages/ms.json";
import zhTW from "@/messages/zh-TW.json";
import zh from "@/messages/zh.json";

describe("the attachment picker's hint", () => {
  it("names the camera only where there is one", () => {
    expect(dropHintKey(true, false)).toBe("dropHint");
    expect(dropHintKey(true, true)).toBe("dropHintPhone");
    expect(dropHintKey(false, false)).toBe("dropHintNoCamera");
    expect(dropHintKey(false, true)).toBe("dropHintPhoneNoCamera");
  });

  it("has the no-camera hint in all four languages, without the camera", () => {
    for (const catalogue of [zh, zhTW, en, ms]) {
      const hints = catalogue.attachmentPicker as Record<string, string>;
      for (const key of ["dropHintNoCamera", "dropHintPhoneNoCamera"]) {
        expect(typeof hints[key], key).toBe("string");
        expect(hints[key]).not.toMatch(/摄像头|攝影機|攝像頭|camera|kamera|拍照/i);
      }
    }
  });
});
