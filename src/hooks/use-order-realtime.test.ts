import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  backoffFromResponse,
  canUseRealtime,
  shouldRefresh,
} from "./use-order-realtime";

/**
 * The two decisions in the realtime hook that are wrong quietly.
 *
 * Neither shows up as a crash. A missed event family means a screen that simply
 * stays stale; a backoff that ignores the server means a refused client that
 * keeps knocking once a second. Both were real: the `dispatch.` family was
 * being dropped, and every failure — refusals included — retried after one
 * second regardless of what the server asked for.
 */

describe("shouldRefresh", () => {
  /** Every family the backend actually emits that changes what is on screen. */
  const refreshes = [
    // The shared-order channel: written once per company, so this is how a
    // contractor sees the driver's GPS and status at all.
    "waste_dispatch.gps_recorded",
    "waste_dispatch.weighing_confirmed",
    "waste_dispatch.driver_assigned",
    // Its own family. "waste_dispatch." does not prefix-match this, which is
    // exactly how it was missed.
    "dispatch.assigned",
    // No shared-order counterpart exists for these, so nothing else would
    // bring them to the screen before the next poll.
    "weighing.anomaly_detected",
    "weighing.session_settled",
    "gps.position",
    "gps.geofence_exit",
    "driver_task.status_changed",
    "notification.created",
    // The backend has always emitted these from `document_workflow`'s service
    // layer. Nothing listened, so the approvals list was the one screen that
    // still needed a manual refresh to see somebody else's decision.
    "approval.approve",
    "approval.reject",
    "approval.return",
    "approval.submit",
    "safety.status_changed",
    "attendance.clock_in",
    "deduction.responded",
    "partnership.status_changed",
    "receipt.created",
    "field_task.changed",
    "equipment.created",
    "progress.changed",
    "material_outgoing.created",
    "disposal.changed",
  ];

  /** Platform noise. Refreshing an order view for these is pure waste. */
  const ignored = [
    "login.succeeded",
    "login.failed",
    "request.server_error",
    "job.failed",
    "system.monitoring_test",
    "payroll.salary_paid",
    "device.heartbeat_degraded",
  ];

  it.each(refreshes)("refreshes on %s", (eventType) => {
    expect(shouldRefresh(eventType)).toBe(true);
  });

  it.each(ignored)("ignores %s", (eventType) => {
    expect(shouldRefresh(eventType)).toBe(false);
  });

  it("ignores a missing or empty event type instead of throwing", () => {
    expect(shouldRefresh(undefined)).toBe(false);
    expect(shouldRefresh("")).toBe(false);
  });
});

describe("backoffFromResponse", () => {
  const withRetryAfter = (value: string | null) =>
    ({
      headers: { get: (name: string) => (name === "Retry-After" ? value : null) },
    }) as unknown as Response;

  it("waits as long as the server asked", () => {
    // The stream endpoint answers 503 with exactly this when it is at capacity.
    expect(backoffFromResponse(withRetryAfter("15"))).toBe(15_000);
  });

  it("does not retry after one second, which is what caused the storm", () => {
    expect(backoffFromResponse(withRetryAfter("15"))).toBeGreaterThan(1_000);
    expect(backoffFromResponse(withRetryAfter(null))).toBeGreaterThan(1_000);
  });

  it("falls back to fifteen seconds when the server sends no header", () => {
    expect(backoffFromResponse(withRetryAfter(null))).toBe(15_000);
  });

  it("ignores a header it cannot use rather than waiting zero", () => {
    // An HTTP-date form, a negative, or junk: all mean "we learned nothing".
    // Returning 0 from any of them would recreate the storm.
    for (const bad of ["Wed, 21 Oct 2026 07:28:00 GMT", "-5", "0", "soon", ""]) {
      expect(backoffFromResponse(withRetryAfter(bad))).toBe(15_000);
    }
  });

  it("caps a very long Retry-After so the screen is not abandoned", () => {
    expect(backoffFromResponse(withRetryAfter("3600"))).toBe(60_000);
  });
});

describe("canUseRealtime", () => {
  it("admits mapped business and notification permissions", () => {
    expect(canUseRealtime(["notification.view"])).toBe(true);
    expect(canUseRealtime(["document.view"])).toBe(true);
    expect(canUseRealtime(["field_task.view"])).toBe(true);
  });

  it("does not open an empty stream for unrelated permissions", () => {
    expect(canUseRealtime(["project.view"])).toBe(false);
    expect(canUseRealtime([], true)).toBe(true);
  });
});

describe("realtime connection ownership", () => {
  it("opens one global stream in each authenticated application shell", () => {
    const componentsRoot = path.join(process.cwd(), "src/components");
    const hookOwners = readdirSync(componentsRoot, { recursive: true })
      .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".tsx"))
      .filter((entry) =>
        readFileSync(path.join(componentsRoot, entry), "utf8").includes("useOrderRealtime("),
      )
      .map((entry) => entry.replaceAll("\\", "/"))
      .sort();

    expect(hookOwners).toEqual([
      "driver/driver-shell.tsx",
      "field-staff/field-staff-shell.tsx",
      "layout/dashboard-shell.tsx",
    ]);

    for (const owner of hookOwners) {
      const source = readFileSync(path.join(componentsRoot, owner), "utf8");
      expect(source.match(/useOrderRealtime\(/g)).toHaveLength(1);
      expect(source).toContain("canUseRealtime(");
    }
  });
});
