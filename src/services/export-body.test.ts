import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every module export sends the shared body, so the per-unit totals arrive.
 *
 * Lucas asked for them in so many words: 「每个单位不一样所以要在 pdf 里面写清楚
 * 对应单位的累计数量」. The equipment and waste screens built the totals, and
 * their export functions each assembled their own request body without the
 * `summary` field - so the server never saw it and the PDF printed no totals.
 * Only receipts, whose body came from the shared function, ever had them.
 *
 * Asserted as "no hand-built body" rather than "summary present", because the
 * failure was a copy that forgot a field, and the next copy will forget a
 * different one.
 */
const SERVICES = [
  "src/services/contractor-ops.service.ts",
  "src/services/waste-outgoing.service.ts",
];

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("module exports use the shared request body", () => {
  for (const file of SERVICES) {
    it(`${path.basename(file)} builds no export body by hand`, () => {
      // The hand-built bodies all started the same way.
      expect(read(file)).not.toMatch(/body:\s*\{\s*format:\s*request\.format/);
    });
  }

  it("the shared body forwards the summary", () => {
    const code = read("src/services/contractor.service.ts");
    const body = code.slice(code.indexOf("export function exportBody"));
    expect(body.slice(0, body.indexOf("\n}\n"))).toContain("summary:");
  });

  it("the equipment, waste and material-outgoing exports go through it", () => {
    const ops = read("src/services/contractor-ops.service.ts");
    const waste = read("src/services/waste-outgoing.service.ts");
    for (const [code, name] of [
      [ops, "exportEquipmentMovements"],
      [ops, "exportMaterialOutgoing"],
      [waste, "exportWasteOutgoingRecords"],
    ] as const) {
      const start = code.indexOf(`export function ${name}`);
      expect(start, `${name} not found`).toBeGreaterThan(-1);
      expect(code.slice(start, start + 400)).toContain("body: exportBody(request)");
    }
  });
});
