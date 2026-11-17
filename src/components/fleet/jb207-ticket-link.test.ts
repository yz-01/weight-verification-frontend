import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isRouteAllowed } from "@/lib/navigation";

/**
 * JB207-7 (Lucas 11-16 audit): 车辆 / 司机 history's ticket number opened
 * `/weigh-sessions/<id>`, which is no route, so the guard sent the click to
 * the dashboard. The ticket's page is `/weighing/<id>`.
 */
const source = readFileSync(
  path.join(process.cwd(), "src/components/fleet/fleet-detail.tsx"),
  "utf8",
);

describe("the ticket link in fleet history", () => {
  it("opens the weighing ticket", () => {
    expect(source).toContain("href={`/weighing/${row.weigh_session_id}`}");
    expect(source).not.toContain("href={`/weigh-sessions/");
  });

  it("is a page the recycler opens", () => {
    expect(isRouteAllowed("MSE_SCRAP", ["weighing_records"], "/weighing/abc")).toBe(true);
  });
});
