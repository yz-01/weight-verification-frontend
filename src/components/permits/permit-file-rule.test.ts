import { describe, expect, it } from "vitest";

import { PERMIT_FILE_ACCEPT, PERMIT_FILE_RULE } from "@/components/permits/permit-parts";
import { acceptFiles, matchesAccept } from "@/lib/attachment-picker";

const file = (name: string, type: string) => ({ name, type });

describe("the permit picker takes what the server takes", () => {
  it("is exactly the server's suffixes", () => {
    expect(PERMIT_FILE_ACCEPT).toBe(".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.heif");
    expect(PERMIT_FILE_RULE.accept).toBe(PERMIT_FILE_ACCEPT);
  });

  it("takes a form and a photo of it", () => {
    for (const [name, type] of [
      ["permit.pdf", "application/pdf"],
      ["permit.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["permit.xlsx", ""],
      ["photo.JPG", "image/jpeg"],
      ["photo.heic", "image/heic"],
    ]) {
      expect(matchesAccept(file(name, type), PERMIT_FILE_ACCEPT), name).toBe(true);
    }
  });

  it("refuses an image the server does not take, and a PDF without its suffix", () => {
    for (const [name, type] of [
      ["anim.gif", "image/gif"],
      ["scan.bmp", "image/bmp"],
      ["photo.avif", "image/avif"],
      ["permit", "application/pdf"],
    ]) {
      expect(matchesAccept(file(name, type), PERMIT_FILE_ACCEPT), name).toBe(false);
    }
    const gif = new File(["x"], "anim.gif", { type: "image/gif" });
    expect(acceptFiles([], [gif], PERMIT_FILE_RULE).refused).toEqual([{ kind: "type", name: "anim.gif" }]);
  });
});
