import { describe, expect, it } from "vitest";

import { isHazardAttachment } from "@/lib/hazard-attachments";

const file = (name: string, type = "") => ({ name, type });

describe("hazard attachments (I37)", () => {
  it("takes PDF, Word, Excel and pictures", () => {
    for (const name of ["a.pdf", "b.doc", "c.DOCX", "d.xls", "e.xlsx"]) {
      expect(isHazardAttachment(file(name))).toBe(true);
    }
    expect(isHazardAttachment(file("photo", "image/jpeg"))).toBe(true);
  });

  it("does not offer a program", () => {
    expect(isHazardAttachment(file("virus.exe", "application/x-msdownload"))).toBe(false);
  });
});
