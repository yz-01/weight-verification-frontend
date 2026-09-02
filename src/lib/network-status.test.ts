import { describe, expect, it } from "vitest";

import { networkStatus, type SyncSnapshot } from "./network-status";

/**
 * Requirement 1.2.7: the driver must be able to see whether their work has
 * actually left the phone.
 *
 * The rule was written out inline, twice, in two screens, and had no test at
 * all. What it guards is a driver who finishes a shift believing their
 * photographs are filed when some of them are sitting in a failed queue.
 */

function sync(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    ...overrides,
  };
}

describe("what the driver is told about their connection", () => {
  it("says synced when there is nothing left to send", () => {
    expect(networkStatus(sync())).toBe("online");
  });

  it("says offline with no connection", () => {
    expect(networkStatus(sync({ isOnline: false }))).toBe("offline");
  });

  it("says syncing while the queue is draining", () => {
    expect(networkStatus(sync({ isSyncing: true, pendingCount: 4 }))).toBe(
      "syncing",
    );
  });

  it("says pending when work is queued but not yet moving", () => {
    expect(networkStatus(sync({ pendingCount: 2 }))).toBe("pending");
  });

  it("puts a failed upload ahead of a merely pending one", () => {
    // The important one. A driver with one failure and nine successes must be
    // told about the failure, not shown a count that reads as progress.
    expect(networkStatus(sync({ pendingCount: 9, failedCount: 1 }))).toBe(
      "failed",
    );
  });

  it("says offline even when the queue still claims to be syncing", () => {
    // The radio going off does not stop a sync flag that was already set.
    // Reporting "syncing" then would be telling the driver their work is on
    // its way while nothing can leave the phone.
    expect(
      networkStatus(sync({ isOnline: false, isSyncing: true, failedCount: 3 })),
    ).toBe("offline");
  });

  it("never reports plain online while anything is unsent", () => {
    const unsent: Array<Partial<SyncSnapshot>> = [
      { pendingCount: 1 },
      { failedCount: 1 },
      { isSyncing: true },
      { pendingCount: 5, failedCount: 2 },
    ];
    for (const state of unsent) {
      expect(networkStatus(sync(state))).not.toBe("online");
    }
  });
});
