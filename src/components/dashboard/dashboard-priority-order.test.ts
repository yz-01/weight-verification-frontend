import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * What each console shows before anything else.
 *
 * 客户：「所有待审批和通知和重要的东西是放在最上面，确保他们可以一登录就直接
 * 看到」. Four consoles were checked against that and three already complied;
 * the consultant's led with a four-step lifecycle diagram, so a consultant
 * logged in and read an explanation while applications waited past the fold
 * (F-283).
 *
 * Two of the four were also unguarded. The recycler's pending block happened
 * to be first and nothing said it had to be - the marker and this file are
 * what stop it drifting down later (T-213).
 *
 * Asserted on source order rather than rendered geometry because that is what
 * this file can see cheaply and check for every console at once. The rendered
 * half - that the priority block is genuinely above the fold on a real screen
 * - is `e2e/dashboard-priority.spec.ts`, and it is a different claim: source
 * order says which comes first, not whether the first one is reachable
 * without scrolling.
 */

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("dashboard first-screen priorities", () => {
  it("renders contractor priorities before the project overview", () => {
    const code = source("src/components/dashboard/contractor-dashboard.tsx");
    const placement = code.indexOf("{priorityGrid}");
    const overview = code.indexOf("{data.overview &&", placement);
    expect(placement).toBeGreaterThan(-1);
    expect(overview).toBeGreaterThan(placement);
    expect(code).toContain('data-dashboard-priority');
    expect(code).toContain('data-dashboard-overview');
  });

  it("renders admin pending work and notifications before the map", () => {
    const code = source("src/components/dashboard/admin-dashboard.tsx");
    const priority = code.indexOf('data-dashboard-priority');
    const map = code.indexOf('{show("map") &&', priority);
    expect(priority).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(priority);
    expect(code).toContain('href={adminNotificationHref(notification)}');
    expect(code).toContain('return typeof rawHref === "string" && rawHref.startsWith("/")');
  });

  it("renders the recycler's pending work before the metric tiles", () => {
    const code = source(
      "src/components/recycler-business/recycler-dashboard.tsx",
    );

    // Both blocks are marked...
    expect(code).toContain("data-dashboard-priority");
    expect(code).toContain("data-dashboard-overview");

    /*
     * ...but the order is read off the *call sites*, not the marker offsets.
     *
     * The first version of this compared marker positions and failed on a
     * correct screen: `PendingActions` is a helper defined at the bottom of
     * the file and called near the top, so its marker sits 20,000 characters
     * *after* the metrics section it renders above. Source order is not
     * render order the moment a block lives in its own component - which is
     * worth keeping in mind for the two consoles above, where the comparison
     * only works because their markers are inline.
     */
    const pending = code.indexOf("<PendingActions");
    const metrics = code.indexOf('aria-labelledby="recycler-today-title"');
    expect(pending).toBeGreaterThan(-1);
    expect(metrics).toBeGreaterThan(pending);
  });

  it("renders the consultant's pending work before the lifecycle flow", () => {
    // The one that did not comply. `PendingActions` equivalents here are the
    // 待审批 and 即将到期 lists plus the notification panel; the flow diagram
    // is the overview that used to be first.
    const code = source(
      "src/components/consultant-workflow/consultant-dashboard.tsx",
    );
    const priority = code.indexOf("data-dashboard-priority");
    const overview = code.indexOf("data-dashboard-overview");
    const history = code.indexOf('t("history.title")');

    expect(priority).toBeGreaterThan(-1);
    expect(overview).toBeGreaterThan(priority);
    // Past decisions are neither pending nor an overview, and the customer
    // asked for what needs attention first - not for everything first.
    expect(history).toBeGreaterThan(overview);
  });

  it("renders the driver's job in hand before the three-number summary", () => {
    /*
     * The driver's 待办 is not an approval queue. The customer named the
     * driver app alongside the consoles - 「包括现场工作人员，司机，superadmin
     * 后台，consultant也是一样」 - and the thing that needs attention there is
     * the run they are on, so that is what leads. What used to lead was a row
     * of three counts, which tells a driver how the day is going rather than
     * what to do next.
     */
    const code = source("src/components/driver/driver-dashboard.tsx");
    const priority = code.indexOf("data-dashboard-priority");
    const overview = code.indexOf("data-dashboard-overview");

    expect(priority).toBeGreaterThan(-1);
    expect(overview).toBeGreaterThan(priority);

    // Notifications above the summary too, for the same reason: they are
    // something new to know, not a recap.
    const notices = code.indexOf('aria-labelledby="driver-latest-notices"');
    expect(notices).toBeGreaterThan(-1);
    expect(overview).toBeGreaterThan(notices);
  });

  it("marks every console, so none of them can drift unguarded", () => {
    // The gap this closes: two of the four complied by accident. A console
    // added later with no marker would have slipped past this whole file.
    for (const file of [
      "src/components/dashboard/contractor-dashboard.tsx",
      "src/components/dashboard/admin-dashboard.tsx",
      "src/components/recycler-business/recycler-dashboard.tsx",
      "src/components/consultant-workflow/consultant-dashboard.tsx",
      "src/components/driver/driver-dashboard.tsx",
    ]) {
      expect(source(file), file).toContain("data-dashboard-priority");
    }
  });
});
