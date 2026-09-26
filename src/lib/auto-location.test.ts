import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every capture form takes its GPS fix by itself (T-355, D-246).
 *
 * 客户：「他们申请任何东西都是自动获取，不需要自己点获取 GPS 定位」. Lucas,
 * 2026-09-26, after finding 设备进退场 still behind a 【获取当前 GPS】 button:
 * 「确保每个模块都是自动获取GPS」. These forms had each grown their own
 * button-only helper instead of the shared, automatic `LocationField`.
 *
 * Not covered, on purpose: setting a project's, a geofence's or a site's own
 * coordinates. Those record where a place is, not where the person is, and an
 * automatic fix would write the office's position into them.
 */
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("capture forms locate automatically", () => {
  it.each([
    "src/components/contractor-ops/operations-workspaces.tsx",
    "src/components/contractor-ops/site-disposal-workspaces.tsx",
    "src/components/contractor-ops/waste-outgoing-workspace.tsx",
    "src/components/site-operations/safety.tsx",
  ])("%s uses the automatic LocationField, not a button-only helper", (file) => {
    const source = read(file);
    expect(source).toMatch(/<LocationField/);
    expect(source).not.toMatch(/onClick=\{\(\) => void locate\(\)\}|onClick=\{getLocation\}/);
  });

  it.each([
    ["src/components/site-operations/safety.tsx", /useEffect\(\(\) => \{\s*if \(!navigator\.geolocation\) return;/],
    ["src/components/site-operations/attendance.tsx", /setOpen\(true\);[\s\S]{0,300}locate\(\);/],
    ["src/components/incident-reporting/create-incident-dialog.tsx", /autoLocated\.current = true;\s*captureLocation\(\);/],
    ["src/components/qrcodes/qr-mobile-scan.tsx", /autoLocated\.current = true;\s*locate\(\);/],
    ["src/components/site-access/site-access-workspace.tsx", /autoLocated\.current = true;\s*getGps\(\);/],
  ])("%s asks for a fix on opening, keeping its button as the retry", (file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });
});
