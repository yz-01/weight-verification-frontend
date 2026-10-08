/**
 * F4 (Fable #10): the office reads a phone consultant submission's type in
 * words, in its own language - never `MATERIAL_CERT_SUBMISSION`.
 */
import { describe, expect, it } from "vitest";

import zh from "@/messages/zh.json";

import { consultantTaskTitle } from "./consultant-task-title";

const options = zh.fieldStaffPwa.consultantCapture.askOption as Record<string, string>;
const label = (code: string) => options[code] ?? null;

describe("consultantTaskTitle", () => {
  it("names the type of an old title that carried the code", () => {
    expect(
      consultantTaskTitle(
        {
          task_type: "CONSULTANT",
          submission_category: "MATERIAL_CERT_SUBMISSION",
          title: "MATERIAL_CERT_SUBMISSION - 2026-10-07 09:30",
        },
        label,
      ),
    ).toBe("材料证书提交 - 2026-10-07 09:30");
  });

  it("reads a title sent in another language in the reader's", () => {
    expect(
      consultantTaskTitle(
        { task_type: "CONSULTANT", submission_category: "RFI", title: "RFI (ask the consultant) - 2026-10-07 09:30" },
        label,
      ),
    ).toBe("RFI（问顾问问题） - 2026-10-07 09:30");
  });

  it("leaves a title somebody wrote, and other tasks, as they are", () => {
    expect(
      consultantTaskTitle({ task_type: "CONSULTANT", submission_category: "RFI", title: "Check rebar at grid C" }, label),
    ).toBe("Check rebar at grid C");
    expect(
      consultantTaskTitle({ task_type: "PHOTO", submission_category: "", title: "WIR - 2026-10-07 09:30" }, label),
    ).toBe("WIR - 2026-10-07 09:30");
    // A type the four do not know (a very old submission) stays as stored.
    expect(
      consultantTaskTitle({ task_type: "CONSULTANT", submission_category: "WIR", title: "WIR - 2026-10-07 09:30" }, label),
    ).toBe("WIR - 2026-10-07 09:30");
  });
});

describe("the consultant inbox", () => {
  it("shows the title through it", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/contractor-ops/operations-workspaces.tsx", "utf8");
    expect(source).toContain("consultantTaskTitle(row");
    expect(source).not.toMatch(/font-medium">\{row\.title\}/);
  });
});
