import { describe, expect, it } from "vitest";

import { allowedLabel, ATTACHMENT_ACCEPT } from "@/lib/attachment-whitelist";

describe("attachment whitelist", () => {
  it("says the allowed kinds in words", () => {
    expect(allowedLabel(".pdf,.docx,image/*")).toBe("PDF, DOCX, JPG, PNG");
  });
  it("offers documents, drawings and pictures but no program", () => {
    expect(ATTACHMENT_ACCEPT).toContain(".pdf");
    expect(ATTACHMENT_ACCEPT).toContain(".dwg");
    expect(ATTACHMENT_ACCEPT).not.toContain(".exe");
  });
});
