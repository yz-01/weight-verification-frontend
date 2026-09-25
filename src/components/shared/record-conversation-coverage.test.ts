import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every module's own screen can open its records' conversation (T-360).
 *
 * C-014 / D-233: each module has Record Communication, bound to one Record ID.
 * It was reachable from three screens only, so four modules had no way in
 * except the archive queue - the feature existed and nobody working in those
 * modules could reach it, which is the shape this project calls a shell.
 *
 * Asserted by kind, not by the presence of the component: a panel opened for
 * the wrong kind would talk into another module's record.
 */
const SCREENS: Array<[string, string]> = [
  ["src/components/receipts/view-receipt.tsx", "MATERIAL_RECEIPT"],
  ["src/components/contractor-ops/operations-workspaces.tsx", "MATERIAL_OUTGOING"],
  // The phone's 设备进退场 lists no movements any more (D-273, T-393): the
  // office list's movement detail is where they are read and talked about.
  // The worker's own movements keep theirs under 我的提交 (my-submissions).
  ["src/components/contractor-ops/office-module-lists.tsx", "EQUIPMENT_MOVEMENT"],
  ["src/components/contractor-ops/operations-workspaces.tsx", "PROGRESS"],
  ["src/components/contractor-ops/waste-outgoing-workspace.tsx", "WASTE_OUTGOING"],
  ["src/components/contractor-ops/site-disposal-workspaces.tsx", "DISPOSAL_REQUEST"],
];

function read(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("each module screen opens its own records' conversation (T-360)", () => {
  for (const [file, kind] of SCREENS) {
    it(`${kind} in ${path.basename(file)}`, () => {
      const code = read(file);
      // Either the panel or button directly, or through the shared detail
      // shell's `conversation` prop (T-368), which mounts the same panel.
      const mounted = new RegExp(
        String.raw`(?:<RecordConversation(?:Panel|Button)[\s\S]{0,80}?kind="` +
          kind +
          String.raw`"|conversation=\{\{\s*kind:\s*"` +
          kind +
          '")',
      );
      expect(code).toMatch(mounted);
    });
  }
});
