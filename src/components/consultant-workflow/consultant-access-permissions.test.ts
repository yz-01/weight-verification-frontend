import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/components/consultant-workflow/consultant-access-management.tsx"),
  "utf8",
);

/**
 * Each query asks for the permission its endpoint actually checks (B16).
 *
 * 「新增顾问的页面打不开」 was this: the screen opens on `consultant.config`,
 * but its project list was gated on `project.assign` - the permission for
 * *granting* a project, not for reading the list. Somebody holding 顾问设定
 * without assignment rights got a page whose project picker could never fill,
 * so the form could not be completed and the page looked broken.
 *
 * The server's answers, from the two `permission_map`s:
 *   get_organizations / get_consultants  USER_VIEW
 *   get_grants                           PROJECT_ASSIGN
 *   get_projects                         PROJECT_VIEW
 *
 * Asserted as pairs so that a gate tightened later has to be a decision
 * somebody makes on purpose rather than a copy of the line above it.
 */
describe("consultant access gates match the endpoints behind them", () => {
  const gateFor = (queryKey: string) => {
    const block = source.slice(source.indexOf(`"consultant-access", "${queryKey}"`));
    const match = block.slice(0, 600).match(/enabled: can\("([a-z_.]+)"\)/);
    expect(match, `${queryKey} declares an enabled gate`).toBeTruthy();
    return match![1];
  };

  it.each([
    ["organizations", "user.view"],
    ["members", "user.view"],
    ["grants", "project.assign"],
    ["projects", "project.view"],
  ])("%s is gated on %s", (queryKey, permission) => {
    expect(gateFor(queryKey)).toBe(permission);
  });
});
