import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { keptEventId } from "./kept-event-id";

/**
 * A second tap after a 502 / 504 / 413 is the same submission (P-phonefix):
 * the id is kept with the draft, so the server answers the replay with the
 * record it already has instead of making a second one.
 */
describe("one submission, one client_event_id", () => {
  it("keeps the id the draft holds", () => {
    const mint = vi.fn(() => "fresh");
    expect(keptEventId("kept-1", mint)).toBe("kept-1");
    expect(mint).not.toHaveBeenCalled();
  });

  it("mints one only when the draft has none", () => {
    expect(keptEventId("", () => "fresh")).toBe("fresh");
    expect(keptEventId(undefined, () => "fresh")).toBe("fresh");
  });

  const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

  it.each([
    ["src/components/field-staff/field-records-panel.tsx", 'useDraftEventId("material-receipt")'],
    ["src/components/field-staff/sundry-claim-capture.tsx", 'useDraftEventId("sundry-claim")'],
  ])("%s keeps its id in the draft", (file, hook) => {
    expect(source(file)).toContain(hook);
  });

  it("the hazard report keeps its id in its draft, not a new one per tap", () => {
    const code = source("src/components/site-operations/safety.tsx");
    expect(code).toContain("draft.clientEventId || newClientEventId(\"safety-incident\")");
    expect(code).toContain("client_event_id: eventId,");
  });

  it("the sundry claim and the receipt no longer mint an id per tap", () => {
    expect(source("src/components/field-staff/sundry-claim-capture.tsx")).not.toContain("crypto.randomUUID()");
    const receipt = source("src/components/field-staff/field-records-panel.tsx");
    expect(receipt).not.toContain("const eventId = crypto.randomUUID();");
  });
});
