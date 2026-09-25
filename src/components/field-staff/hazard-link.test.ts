import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A hazard notification opens that hazard on the phone (T-302, 客户第 24 条).
 *
 * The server's link has always carried it - `site_operations/views.py` builds
 * `/field-staff?tab=records&record=safety&incident=<id>` - and the phone never
 * read `incident`. The worker landed on an empty "report a hazard" form, which
 * is the screenshot the customer sent.
 *
 * The second assertion matters as much as the first: the same link also names
 * `record=safety`, and if that wins the worker is back on the report form even
 * though the hazard was fetched.
 */
const code = readFileSync(
  path.join(process.cwd(), "src", "components", "field-staff", "field-staff-workspace.tsx"),
  "utf8",
);

describe("the phone opens the hazard a notification names (T-302)", () => {
  it("reads the incident from the link", () => {
    expect(code).toContain('searchParams.get("incident")');
  });

  it("lets the named hazard win over the report form the link also names", () => {
    expect(code).toContain("requestedRecord={requestedIncidentId ? null : requestedRecord}");
    expect(code).toContain('requestedTab={requestedIncidentId ? "incidents" : requestedTab}');
  });

  it("fetches that hazard and opens its room", () => {
    expect(code).toContain("getSafetyIncident(requestedIncidentId)");
    // Derived rather than copied into state, and it is what the room renders.
    expect(code).toContain("const shownHazard = openedHazard ?? linkedHazard;");
    expect(code).toContain("hazard={shownHazard}");
  });
});
