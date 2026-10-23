import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone takes its own position; the worker does not press for it (T-355).
 *
 * 客户开工前第 4 问：「现场工作人员的 GPS 是自动获取的，他们申请任何东西都是自动
 * 获取，**不需要自己点获取 GPS 定位**」, confirmed three times since (D-226,
 * D-237, D-246): 「常态路径上不出现『获取定位』按钮；只有在自动定位失败时才露出
 * 重试」.
 *
 * Every field form shares this one component, which is why it is guarded here
 * rather than form by form: a button put back in this file is a button put back
 * on every screen at once.
 *
 * Source-level, because this repository's unit tests run without a DOM. The
 * assertions are about structure that decides behaviour - where the request is
 * made from, and under what condition a button renders at all.
 */
const code = readFileSync(
  path.join(process.cwd(), "src", "components", "field-staff", "location-field.tsx"),
  "utf8",
);

function componentBody() {
  const start = code.indexOf("export function LocationField");
  expect(start, "LocationField not found - was it renamed?").toBeGreaterThan(-1);
  return code.slice(start);
}

describe("location is taken automatically (T-355, D-246)", () => {
  it("asks for a fix from an effect, not only from a press", () => {
    const body = componentBody();
    const effect = body.slice(body.indexOf("useEffect("));
    expect(body).toContain("useEffect(");
    expect(effect.slice(0, effect.indexOf("}, ["))).toContain("void ask()");
  });

  it("asks straight away, with no one-time explanation first (Lucas 2026-10-24)", () => {
    // 「把这个出现一次的直接删除掉，如果他们允许定位权限的话直接自动获取GPS就好
    // 了，不需要问多一次」. The app's tracker has already asked on opening.
    const body = componentBody();
    const effect = body.slice(body.indexOf("useEffect("));
    expect(effect.slice(0, effect.indexOf("}, ["))).toContain("if (value || attempted.current) return;");
    expect(code).not.toMatch(/primer/i);
    expect(code).not.toContain('t("why.');
  });

  it("renders no locate button on the normal path", () => {
    // Every button in the field is a retry after a failure. A locate button
    // on the normal path puts the worker back to pressing it on every form.
    const body = componentBody();
    expect(body).not.toContain("actionLabel");
    const labels = body.match(/\{t\("[^"]+"\)\}\s*<\/Button>/g) ?? [];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toContain('t("retry")');
  });

  it("refusing location still blocks the whole phone app", () => {
    // 「如果不允许就不能使用手机端」: the tracker on every field page asks on
    // opening and puts up a dialog that cannot be closed while refused.
    const read = (file: string) =>
      readFileSync(path.join(process.cwd(), "src", "components", "field-staff", file), "utf8");
    expect(read("field-staff-shell.tsx")).toContain("<FieldLocationTracker />");
    const tracker = read("field-location-tracker.tsx");
    expect(tracker).toContain("onEscapeKeyDown={(event) => event.preventDefault()}");
    expect(tracker).toContain("onPointerDownOutside={(event) => event.preventDefault()}");
    expect(tracker).toContain('if (state === "active") return null;');
  });

  it("still offers a retry when the automatic attempt fails", () => {
    expect(componentBody()).toContain('t("retry")');
  });
});

/**
 * Offline with no GPS fix (Lucas 2026-10-23, choice A): wait longer, then let
 * the record go without a position, marked 「没有定位」. Only forms that opt in,
 * only offline, and never past a refusal.
 */
describe("offline with no fix, a record may go without a position", () => {
  it("waits longer for a fix without network", () => {
    const body = componentBody();
    expect(body).toContain("const offline = isOffline();");
    expect(body).toMatch(/offline\s*\?\s*\{ enableHighAccuracy: true, timeout: OFFLINE_LOCATION_TIMEOUT_MS/);
  });

  it("accepts no position only when allowed, offline, and not refused", () => {
    const body = componentBody();
    expect(body).toMatch(
      /allowMissingOffline &&\s*problem !== "denied" &&\s*\(offline \|\| \(await serverUnreachable\(\)\)\)/,
    );
    expect(code).toContain("allowMissingOffline = false,");
  });

  it("never shows coordinates or 'GPS captured' for a missing position", () => {
    const body = componentBody();
    expect(body).toContain("{value && !missing && !problem ? (");
    expect(body).toContain('t("missingOffline.title")');
  });

  it("clock-in and equipment hours still need a real fix", () => {
    for (const file of [
      ["field-staff", "field-staff-workspace.tsx"],
      ["equipment-hours", "equipment-hours-capture.tsx"],
    ]) {
      const source = readFileSync(path.join(process.cwd(), "src", "components", ...file), "utf8");
      expect(source).toContain("onChange={(next) => setFix(asFix(next))}");
      expect(source).not.toContain("allowMissingOffline");
    }
  });
});

describe("every photo-record form lets a record go without a position offline", () => {
  const forms = [
    ["contractor-ops", "equipment-exit.tsx"],
    ["contractor-ops", "operations-workspaces.tsx"],
    ["contractor-ops", "site-disposal-workspaces.tsx"],
    ["field-staff", "field-records-panel.tsx"],
    ["field-staff", "sundry-claim-capture.tsx"],
    ["site-operations", "safety.tsx"],
  ];
  it.each(forms)("%s/%s: one allowMissingOffline per LocationField", (folder, file) => {
    const source = readFileSync(path.join(process.cwd(), "src", "components", folder, file), "utf8");
    const fields = source.match(/<LocationField\b/g)?.length ?? 0;
    expect(fields).toBeGreaterThan(0);
    expect(source.match(/\ballowMissingOffline\b/g)?.length ?? 0).toBe(fields);
  });
});
