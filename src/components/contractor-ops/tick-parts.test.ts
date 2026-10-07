import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The package's tick dialog offers every part of the record (T-363).
 *
 * It used to build its boxes from the member row, which carries only the parts
 * already ticked - so a photograph unticked once could never be ticked again,
 * and a group deliberately emptied reopened fully ticked (D-162 says an empty
 * list is none). The conversation used to be a group of its own (D-233); since
 * E7 / Q25 no PDF prints the chat, so it is not offered at all.
 */
const source = readFileSync(path.join(process.cwd(), "src/components/contractor-ops/multi-engine.tsx"), "utf8");
const dialog = source.slice(source.indexOf("function TickPartsDialog("));

describe("ticking parts of a packaged record", () => {
  it("reads the record's full parts, not the ticked subset", () => {
    expect(dialog).toMatch(/getPackageRecordParts\(item\.record_kind, item\.record_id\)/);
    expect(dialog).not.toMatch(/\{item\.photos\.map/);
  });

  it("keeps an emptied group empty", () => {
    expect(dialog).toMatch(/group in item\.selection/);
  });

  it("never offers the record's conversation (E7)", () => {
    expect(dialog).not.toMatch(/toggle\("messages"/);
    expect(dialog).not.toMatch(/all\.messages/);
    expect(source).not.toMatch(/\["photos", "documents", "files", "messages"\]/);
    expect(source).toMatch(/\["photos", "documents", "files"\] as const/);
  });

  it("can preview a confirmed package without downloading it", () => {
    expect(source).toMatch(/previewEvidencePackage\(data\.id, data\.name\)/);
  });
});
