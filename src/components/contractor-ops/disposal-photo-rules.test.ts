import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * General waste photographs follow the 10-02 confirmation (L6 / B24).
 *
 * 「一次最多 4 张，不要求拍满，不规定每阶段几张」; on the driver's link
 * 「取消装车 / 卸货 / DO / 其他四类强制模板」; and 「没有最终处理证明不能算完成」.
 * The server holds the same numbers (`core/tests/test_field_photo_rules.py`,
 * `test_the_external_link_takes_*`); this holds the screens to them, because a
 * screen that still demands four kinds is a button that never lights.
 */

const code = readFileSync(
  path.join(process.cwd(), "src/components/contractor-ops/site-disposal-workspaces.tsx"),
  "utf8",
);

function componentBody(name: string): string {
  const start = code.search(new RegExp(`^(?:export )?function ${name}\\b`, "m"));
  if (start === -1) throw new Error(`${name} not found`);
  const rest = code.slice(start + 1);
  const end = rest.search(/^(?:export )?function \w/m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("general waste photographs (L6 / B24)", () => {
  it("allows four per submission", () => {
    expect(code).toMatch(/const DISPOSAL_PHOTO_MAX = 4;/);
  });

  it("asks the phone for none on the request, and stops at four", () => {
    expect(code).toMatch(/maxFiles=\{DISPOSAL_PHOTO_MAX\}/);
    expect(code).toMatch(/\[isFieldStaff \|\| submissionPhotos\.length >= 1, t\("field\.photos"\)\]/);
  });

  for (const screen of ["ExternalDisposalWorkspace", "InternalDisposalWorkspace"]) {
    it(`${screen} submits on one photo of any kind, and no more than four`, () => {
      const body = componentBody(screen);
      expect(body).toMatch(/const evidenceComplete = sent\.length > 0;/);
      expect(body).toMatch(/const full = sent\.length >= DISPOSAL_PHOTO_MAX;/);
      expect(body).not.toMatch(/EXECUTION_EVIDENCE\.every/);
    });
  }

  it("gives the driver one photo field, not four kinds", () => {
    const body = componentBody("ExternalDisposalWorkspace");
    expect(body).not.toMatch(/EXECUTION_EVIDENCE\.map/);
    expect(body).toMatch(/upload\("OTHER", file\)/);
  });
});
