import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const FILE = "src/components/contractor-ops/waste-outgoing-workspace.tsx";

/**
 * A count is not a check (L7).
 *
 * The capture control reported 「已拍摄 N 张」 and showed nothing, so the person
 * about to submit could not tell whether the lorry, the plate, or their own
 * thumb was in the frame - and this is the request the customer asked to keep
 * the fuller evidence for, so a reshoot has to be possible before sending.
 *
 * `FieldCamera` previews one file; this screen holds a list. The strip is its
 * own thing for that reason, which is also why it needs guarding: the obvious
 * tidy-up later is to "simplify" it back to the count.
 */
describe("the outgoing request shows what was photographed", () => {
  it("renders a thumbnail for every captured photo", () => {
    const source = read(FILE);
    expect(source).toContain("photoPreviews.map(");
    expect(source).toMatch(/<img[\s\S]{0,200}src=\{url\}/);
  });

  it("builds the previews from the captured files", () => {
    expect(read(FILE)).toContain("photos.map((photo) => URL.createObjectURL(photo))");
  });

  it("revokes them again", () => {
    // Without this the phone keeps one full-size bitmap per shot taken, for
    // as long as the screen is open.
    expect(read(FILE)).toContain("URL.revokeObjectURL(url)");
  });
});
